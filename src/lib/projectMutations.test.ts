import { beforeEach, describe, expect, it, vi } from "vitest";

// Shared project writes behind PATCH /api/projects/[id] and the MCP
// update_project tool. The contract that matters: a patch only touches the
// keys it names, and bare dates are stored as UTC midnight.
const create = vi.fn();
const update = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { project: { create: (...a: unknown[]) => create(...a), update: (...a: unknown[]) => update(...a) } },
}));

const { createProject, updateProject } = await import("@/lib/projectMutations");

beforeEach(() => {
  create.mockReset();
  update.mockReset();
});

describe("updateProject", () => {
  it("only sends the fields present in the patch", async () => {
    await updateProject("p1", { blurb: "hello", pillar: undefined });
    expect(update.mock.calls[0][0].data).toEqual({ blurb: "hello" });
  });

  it("passes null through so a field can be cleared", async () => {
    await updateProject("p1", { leadId: null, endDate: null });
    expect(update.mock.calls[0][0].data).toEqual({ leadId: null, endDate: null });
  });

  it("stores YYYY-MM-DD as UTC midnight", async () => {
    await updateProject("p1", { startDate: "2026-09-25" });
    expect(update.mock.calls[0][0].data.startDate.toISOString()).toBe("2026-09-25T00:00:00.000Z");
  });
});

describe("createProject", () => {
  it("fills the required columns with defaults", async () => {
    await createProject({});
    expect(create.mock.calls[0][0].data).toEqual({ name: "New Project", status: "Upcoming", billable: false });
  });

  it("keeps caller-supplied values", async () => {
    await createProject({ name: "Pilot", status: "Active", billable: true });
    expect(create.mock.calls[0][0].data).toMatchObject({ name: "Pilot", status: "Active", billable: true });
  });
});
