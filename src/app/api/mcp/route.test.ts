import { beforeEach, describe, expect, it, vi } from "vitest";

// /api/mcp is the one route the proxy does not guard, so its write tools must
// enforce the edit tier themselves via requireEdit(). These tests drive the
// real MCP handler with JSON-RPC and check that read-tier callers are refused
// before anything reaches the database. OAuth itself is mocked out: the fake
// withMcpAuth hands every request a session for user "u1".
vi.mock("better-auth/plugins", () => ({
  withMcpAuth:
    (_auth: unknown, fn: (req: Request, session: { userId: string }) => Promise<Response>) =>
    (req: Request) =>
      fn(req, { userId: "u1" }),
}));

const resolveAccess = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: {},
  resolveAccess: (...a: unknown[]) => resolveAccess(...a),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: async () => ({ email: "user@idinsight.org" }) } },
}));

const createProject = vi.fn();
const updateProject = vi.fn();
vi.mock("@/lib/projectMutations", () => ({
  createProject: (...a: unknown[]) => createProject(...a),
  updateProject: (...a: unknown[]) => updateProject(...a),
}));

// Every name resolves to itself, except "Dup", which two rows share.
const resolveFilterIds = async (_kind: string, terms: string[]) =>
  terms[0] === "Dup"
    ? { ids: ["x1", "x2"], unmatched: [], ambiguous: [{ term: "Dup", ids: ["x1", "x2"] }] }
    : { ids: terms, unmatched: [], ambiguous: [] };

vi.mock("@/lib/queries", async (importOriginal) => ({
  ambiguityError: (await importOriginal<typeof import("@/lib/queries")>()).ambiguityError,
  listProjects: async () => [],
  listTeammates: async () => [],
  getGroupedAllocations: async () => ({ unit: "", byTeammate: {} }),
  resolveFilterIds: (kind: string, terms: string[]) => resolveFilterIds(kind, terms),
}));

const { POST } = await import("@/app/api/mcp/route");

const project = {
  id: "p1", name: "Demo", status: "Upcoming", pillar: null, region: null,
  billingRate: null, billable: false, conversionProbability: null,
  unit4Code: null, startDate: null, endDate: null, blurb: null, lead: null,
};

async function callTool(name: string, args: Record<string, unknown>, headers: Record<string, string> = {}) {
  const res = await POST(
    new Request("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    })
  );
  const text = await res.text();
  // Streamable HTTP may answer as SSE; pull the JSON out of the data line.
  const payload = text.startsWith("{") ? text : text.split("\n").find((l) => l.startsWith("data:"))?.slice(5);
  return { status: res.status, body: payload ? JSON.parse(payload) : null };
}

beforeEach(() => {
  resolveAccess.mockReset();
  createProject.mockReset().mockResolvedValue(project);
  updateProject.mockReset().mockResolvedValue(project);
});

describe("MCP write tools", () => {
  it.each([
    ["create_project", { name: "New" }],
    ["update_project", { project: "p1", name: "Renamed" }],
  ])("refuse %s for read-tier callers without writing", async (tool, args) => {
    resolveAccess.mockResolvedValue("read");
    const { body } = await callTool(tool, args);
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/read-only access/);
    expect(createProject).not.toHaveBeenCalled();
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("let edit-tier callers create a project", async () => {
    resolveAccess.mockResolvedValue("edit");
    const { body } = await callTool("create_project", { name: "New" });
    expect(body.result.isError).toBeFalsy();
    expect(createProject).toHaveBeenCalledWith({ name: "New" });
  });

  it("let edit-tier callers update a project", async () => {
    resolveAccess.mockResolvedValue("edit");
    const { body } = await callTool("update_project", { project: "p1", blurb: null });
    expect(body.result.isError).toBeFalsy();
    expect(updateProject).toHaveBeenCalledWith("p1", { blurb: null });
  });
});

describe("MCP writes with a shared name", () => {
  it("refuse to update when the project name matches several projects", async () => {
    resolveAccess.mockResolvedValue("edit");
    const { body } = await callTool("update_project", { project: "Dup", blurb: "x" });
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/matches 2 projects \(ids: x1, x2\)/);
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("refuse to set a lead whose name matches several teammates", async () => {
    resolveAccess.mockResolvedValue("edit");
    const { body } = await callTool("create_project", { name: "New", lead: "Dup" });
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/matches 2 teammates/);
    expect(createProject).not.toHaveBeenCalled();
  });
});

describe("MCP request gate", () => {
  it("rejects callers whose access was revoked", async () => {
    resolveAccess.mockResolvedValue("none");
    const { status } = await callTool("list_projects", {});
    expect(status).toBe(403);
  });

  it("rejects browser requests from a foreign Origin", async () => {
    resolveAccess.mockResolvedValue("edit");
    const { status } = await callTool("list_projects", {}, { origin: "https://evil.example" });
    expect(status).toBe(403);
  });

  it("lets read-tier callers use read tools", async () => {
    resolveAccess.mockResolvedValue("read");
    const { status, body } = await callTool("list_projects", {});
    expect(status).toBe(200);
    expect(body.result.isError).toBeFalsy();
  });
});
