import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Input checks on the allocation write routes. They mirror what the grid cell
// accepts (AllocationCell): whole percentages from 0 up, with 0 meaning
// "clear", on Monday week starts. Prisma is mocked; every test that expects a
// 400 also checks that nothing was written.
const allocation = {
  updateMany: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  findMany: vi.fn(),
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    allocation,
    teammate: { findMany: async () => [] },
    project: { findMany: async () => [] },
  },
}));

const collection = await import("@/app/api/allocations/route");
const item = await import("@/app/api/allocations/[id]/route");

const saved = {
  id: "a1", teammateId: "t1", projectId: "p1",
  weekStart: new Date("2026-09-21T00:00:00Z"), fraction: 50, isHidden: false,
};

const json = (method: string, path: string, body: unknown) =>
  new NextRequest(new URL(path, "http://localhost:3000"), {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const post = (body: unknown) => collection.POST(json("POST", "/api/allocations", body));
const put = (body: unknown) =>
  item.PUT(json("PUT", "/api/allocations/a1", body), { params: Promise.resolve({ id: "a1" }) });

const nothingWritten = () => {
  for (const fn of [allocation.updateMany, allocation.upsert, allocation.update, allocation.delete]) {
    expect(fn).not.toHaveBeenCalled();
  }
};

beforeEach(() => {
  for (const fn of Object.values(allocation)) fn.mockReset();
  allocation.upsert.mockResolvedValue(saved);
  allocation.update.mockResolvedValue(saved);
  allocation.findMany.mockResolvedValue([]);
});

const valid = { teammateId: "t1", projectId: "p1", weekStart: "2026-09-21", fraction: 50 };

describe("POST /api/allocations", () => {
  it("creates a valid allocation, including one over 100%", async () => {
    expect((await post(valid)).status).toBe(201);
    expect((await post({ ...valid, fraction: 150 })).status).toBe(201);
  });

  it.each([
    ["a negative fraction", { ...valid, fraction: -40 }],
    ["a zero fraction", { ...valid, fraction: 0 }],
    ["a fractional percent", { ...valid, fraction: 12.5 }],
    ["a string fraction", { ...valid, fraction: "50" }],
    ["a missing fraction", { ...valid, fraction: undefined }],
    ["a Thursday week start", { ...valid, weekStart: "2026-10-01" }],
    ["an invalid date", { ...valid, weekStart: "2026-02-30" }],
    ["a missing teammateId", { ...valid, teammateId: undefined }],
    ["a missing projectId", { ...valid, projectId: "" }],
    ["a non-JSON body", "not json"],
  ])("rejects %s with 400", async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
    nothingWritten();
  });
});

describe("PUT /api/allocations/[id]", () => {
  it("updates the fraction", async () => {
    expect((await put({ fraction: 80 })).status).toBe(200);
    expect(allocation.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { fraction: 80 } });
  });

  it("deletes when the fraction is 0, like clearing the cell", async () => {
    expect(await (await put({ fraction: 0 })).json()).toEqual({ deleted: true });
    expect(allocation.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
  });

  it.each([
    ["a missing fraction", {}],
    ["a null fraction", { fraction: null }],
    ["a negative fraction", { fraction: -40 }],
    ["a fractional percent", { fraction: 0.5 }],
  ])("rejects %s with 400 instead of deleting", async (_label, body) => {
    expect((await put(body)).status).toBe(400);
    nothingWritten();
  });
});

describe("GET /api/allocations", () => {
  it.each(["notadate", "2026-02-30"])("rejects from=%s with 400", async (from) => {
    const res = await collection.GET(new NextRequest(`http://localhost:3000/api/allocations?from=${from}`));
    expect(res.status).toBe(400);
    expect(allocation.findMany).not.toHaveBeenCalled();
  });

  it("accepts a valid range", async () => {
    const res = await collection.GET(
      new NextRequest("http://localhost:3000/api/allocations?from=2026-09-01&to=2026-09-30")
    );
    expect(res.status).toBe(200);
  });
});
