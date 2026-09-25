import { beforeEach, describe, expect, it, vi } from "vitest";

// resolveAccess is the single source of truth for the edit / read / none tiers
// used by the proxy, /api/me and the MCP route. Prisma is mocked so the only
// thing under test is the tier logic itself.
const findFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { teammate: { findFirst: (...a: unknown[]) => findFirst(...a) } },
}));

const { resolveAccess } = await import("@/lib/auth");

// Env (see vitest.config.ts): ALLOWED_EMAIL_DOMAINS=idinsight.org,
// EXTRA_ALLOWED_EMAILS=admin@example.com.
describe("resolveAccess", () => {
  beforeEach(() => findFirst.mockReset());

  it("gives edit to EXTRA_ALLOWED_EMAILS without touching the database", async () => {
    expect(await resolveAccess("Admin@Example.com")).toBe("edit");
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("gives edit to an Active teammate", async () => {
    findFirst.mockResolvedValue({ status: "Active" });
    expect(await resolveAccess("someone@idinsight.org")).toBe("edit");
  });

  it("gives read to an Alumni teammate", async () => {
    findFirst.mockResolvedValue({ status: "Alumni" });
    expect(await resolveAccess("former@idinsight.org")).toBe("read");
  });

  it("gives read to any other address on an allowed domain", async () => {
    findFirst.mockResolvedValue(null);
    expect(await resolveAccess("new.person@IDinsight.org")).toBe("read");
  });

  it("gives none to addresses off the allowed domains", async () => {
    findFirst.mockResolvedValue(null);
    expect(await resolveAccess("someone@gmail.com")).toBe("none");
    // A lookalike domain must not match by suffix.
    expect(await resolveAccess("someone@notidinsight.org")).toBe("none");
    expect(await resolveAccess("someone@idinsight.org.evil.com")).toBe("none");
  });

  it("matches the teammate email case-insensitively", async () => {
    findFirst.mockResolvedValue(null);
    await resolveAccess("Mixed.Case@IDinsight.org");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "mixed.case@idinsight.org", mode: "insensitive" } },
      })
    );
  });
});
