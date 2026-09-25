import { beforeEach, describe, expect, it, vi } from "vitest";

// getGroupedAllocations does the grouping and summing the REST ?groupBy= view
// and the MCP get_allocations tool both hand to agents, so its arithmetic and
// labelling are pinned down here. Prisma is mocked.
const allocationFindMany = vi.fn();
const teammateFindMany = vi.fn();
const projectFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    allocation: { findMany: (...a: unknown[]) => allocationFindMany(...a) },
    teammate: { findMany: (...a: unknown[]) => teammateFindMany(...a) },
    project: { findMany: (...a: unknown[]) => projectFindMany(...a) },
  },
}));

const { getGroupedAllocations, resolveFilterIds } = await import("@/lib/queries");

const row = (week: string, fraction: number, teammate: [string, string], project: [string, string]) => ({
  weekStart: new Date(`${week}T00:00:00Z`),
  fraction,
  teammate: { id: teammate[0], name: teammate[1] },
  project: { id: project[0], name: project[1] },
});

const ada: [string, string] = ["t1", "Ada"];
const ben: [string, string] = ["t2", "Ben"];
const chat: [string, string] = ["p1", "Chatbot"];
const dash: [string, string] = ["p2", "Dashboard"];

beforeEach(() => {
  allocationFindMany.mockReset();
  teammateFindMany.mockReset();
  projectFindMany.mockReset();
});

describe("getGroupedAllocations", () => {
  it("pivots by teammate with a per-week TOTAL", async () => {
    allocationFindMany.mockResolvedValue([
      row("2026-09-21", 60, ada, chat),
      row("2026-09-21", 50, ada, dash),
      row("2026-09-21", 100, ben, chat),
      row("2026-09-28", 60, ada, chat), // Prisma returns rows sorted by weekStart
    ]);
    const out = await getGroupedAllocations({}, "teammate");
    expect(out.byTeammate).toEqual({
      Ada: {
        TOTAL: { "2026-09-21": 110, "2026-09-28": 60 },
        Chatbot: { "2026-09-21": 60, "2026-09-28": 60 },
        Dashboard: { "2026-09-21": 50 },
      },
      Ben: { TOTAL: { "2026-09-21": 100 }, Chatbot: { "2026-09-21": 100 } },
    });
    expect(out.from).toBe("2026-09-21");
    expect(out.to).toBe("2026-09-28");
  });

  it("pivots by project as the mirror image", async () => {
    allocationFindMany.mockResolvedValue([
      row("2026-09-21", 60, ada, chat),
      row("2026-09-21", 100, ben, chat),
    ]);
    const out = await getGroupedAllocations({}, "project");
    expect(out.byProject).toEqual({
      Chatbot: { TOTAL: { "2026-09-21": 160 }, Ada: { "2026-09-21": 60 }, Ben: { "2026-09-21": 100 } },
    });
  });

  it("excludes hidden rows and applies the filters", async () => {
    allocationFindMany.mockResolvedValue([]);
    await getGroupedAllocations(
      { from: "2026-09-01", to: "2026-09-30", teammateIds: ["t1"], projectIds: ["p1", "p2"] },
      "teammate"
    );
    expect(allocationFindMany.mock.calls[0][0].where).toEqual({
      isHidden: false,
      weekStart: { gte: new Date("2026-09-01"), lte: new Date("2026-09-30") },
      teammateId: { in: ["t1"] },
      projectId: { in: ["p1", "p2"] },
    });
  });

  it("disambiguates duplicate names and a project literally called TOTAL", async () => {
    allocationFindMany.mockResolvedValue([
      row("2026-09-21", 20, ["t1abcd", "Sam"], ["pTOTAL", "TOTAL"]),
      row("2026-09-21", 30, ["t2wxyz", "Sam"], chat),
    ]);
    const out = await getGroupedAllocations({}, "teammate");
    expect(Object.keys(out.byTeammate!)).toEqual(["Sam (abcd)", "Sam (wxyz)"]);
    // The real sum row stays intact; the project named TOTAL gets a suffix.
    expect(out.byTeammate!["Sam (abcd)"]).toEqual({
      TOTAL: { "2026-09-21": 20 },
      "TOTAL (OTAL)": { "2026-09-21": 20 },
    });
  });
});

describe("resolveFilterIds", () => {
  it("matches ids exactly and names case-insensitively, reporting misses", async () => {
    teammateFindMany.mockResolvedValue([
      { id: "t1", name: "Ada Demo" },
      { id: "t2", name: "Ben Sample" },
    ]);
    expect(await resolveFilterIds("teammate", ["t2", " ada demo ", "Nobody", ""])).toEqual({
      ids: ["t2", "t1"],
      unmatched: ["Nobody"],
      ambiguous: [],
    });
  });

  it("returns every row for a shared name and flags it as ambiguous", async () => {
    projectFindMany.mockResolvedValue([
      { id: "p1", name: "Education Dashboard" },
      { id: "p2", name: "education dashboard" },
      { id: "p3", name: "Other" },
    ]);
    expect(await resolveFilterIds("project", ["Education Dashboard"])).toEqual({
      ids: ["p1", "p2"],
      unmatched: [],
      ambiguous: [{ term: "Education Dashboard", ids: ["p1", "p2"] }],
    });
  });

  it("lets an exact id win over a name, so an id is never ambiguous", async () => {
    projectFindMany.mockResolvedValue([
      { id: "p1", name: "Dup" },
      { id: "p2", name: "Dup" },
    ]);
    expect(await resolveFilterIds("project", ["p2"])).toEqual({ ids: ["p2"], unmatched: [], ambiguous: [] });
  });

  it("skips the database when there is nothing to resolve", async () => {
    expect(await resolveFilterIds("project", ["  "])).toEqual({ ids: [], unmatched: [], ambiguous: [] });
    expect(projectFindMany).not.toHaveBeenCalled();
  });
});
