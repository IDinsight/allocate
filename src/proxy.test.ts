import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// src/proxy.ts is the enforcement boundary for every route except /api/mcp.
// These tests pin down who gets through, who is redirected, and who is blocked
// from writing. Session lookup and tier resolution are mocked.
const getSession = vi.fn();
const resolveAccess = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
  resolveAccess: (...a: unknown[]) => resolveAccess(...a),
}));

const { proxy } = await import("@/proxy");

const req = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(new URL(path, "http://localhost:3000"), init);

// NextResponse.next() marks the response with this header; anything else is a
// redirect or an error response.
const passed = (res: Response) => res.headers.get("x-middleware-next") === "1";

const signedInAs = (access: "edit" | "read" | "none") => {
  getSession.mockResolvedValue({ user: { email: "user@idinsight.org" } });
  resolveAccess.mockResolvedValue(access);
};

beforeEach(() => {
  getSession.mockReset();
  resolveAccess.mockReset();
});

describe("public paths", () => {
  it.each(["/login", "/api/auth/sign-in/social", "/.well-known/oauth-authorization-server", "/api/mcp"])(
    "lets %s through without a session",
    async (path) => {
      expect(passed(await proxy(req(path, { method: "POST" })))).toBe(true);
      expect(getSession).not.toHaveBeenCalled();
    }
  );

  it("does not treat /api/mcp sub-paths as public", async () => {
    getSession.mockResolvedValue(null);
    const res = await proxy(req("/api/mcp/other"));
    expect(res.status).toBe(401);
  });
});

describe("read-only API keys", () => {
  it("allow GET on /api/*, via Bearer or x-api-key", async () => {
    const bearer = await proxy(req("/api/projects", { headers: { authorization: "Bearer test-readonly-key" } }));
    const header = await proxy(req("/api/projects", { headers: { "x-api-key": "test-readonly-key" } }));
    expect(passed(bearer)).toBe(true);
    expect(passed(header)).toBe(true);
    expect(getSession).not.toHaveBeenCalled();
  });

  it.each(["POST", "PATCH", "PUT", "DELETE"])("reject %s with 403", async (method) => {
    const res = await proxy(
      req("/api/projects", { method, headers: { authorization: "Bearer test-readonly-key" } })
    );
    expect(res.status).toBe(403);
  });

  it("do not open pages outside /api", async () => {
    const res = await proxy(req("/", { headers: { authorization: "Bearer test-readonly-key" } }));
    expect(res.status).toBe(403);
  });

  it("fall through to session auth when the key is unknown", async () => {
    getSession.mockResolvedValue(null);
    const res = await proxy(req("/api/projects", { headers: { authorization: "Bearer wrong" } }));
    expect(res.status).toBe(401);
  });
});

describe("browser sessions", () => {
  it("401s API calls and redirects pages when signed out", async () => {
    getSession.mockResolvedValue(null);
    expect((await proxy(req("/api/projects"))).status).toBe(401);
    const page = await proxy(req("/"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("treats a revoked (none-tier) account as signed out", async () => {
    signedInAs("none");
    expect((await proxy(req("/api/projects"))).status).toBe(401);
    expect((await proxy(req("/"))).headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("lets read-tier accounts read but not write", async () => {
    signedInAs("read");
    expect(passed(await proxy(req("/api/projects")))).toBe(true);
    expect(passed(await proxy(req("/api/projects", { method: "HEAD" })))).toBe(true);
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect((await proxy(req("/api/allocations", { method }))).status).toBe(403);
    }
  });

  it("lets edit-tier accounts write", async () => {
    signedInAs("edit");
    expect(passed(await proxy(req("/api/allocations", { method: "POST" })))).toBe(true);
    expect(passed(await proxy(req("/api/projects/p1", { method: "DELETE" })))).toBe(true);
  });
});
