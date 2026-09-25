import { describe, expect, it } from "vitest";
import { generateWeekStarts, getYearStartMonday, groupWeeksByMonth, isIsoDate, isMonday } from "@/lib/dateUtils";

// The grid's week columns must land on Mondays: allocations are keyed by a
// Monday weekStart, so a column on any other day would never match a row.
const dayOfWeek = (ymd: string) => new Date(`${ymd}T00:00:00`).getDay();

describe("getYearStartMonday", () => {
  it.each([
    [2024, "2024-01-01"], // Jan 1 is a Monday
    [2025, "2024-12-30"], // Wednesday
    [2026, "2025-12-29"], // Thursday
    [2021, "2020-12-28"], // Friday
    [2022, "2021-12-27"], // Saturday
    [2023, "2022-12-26"], // Sunday
    [2028, "2027-12-27"], // Saturday (leap year)
    [2034, "2033-12-26"], // Sunday
  ])("returns the Monday of the week containing Jan 1, %i", (year, expected) => {
    expect(getYearStartMonday(year)).toBe(expected);
    expect(dayOfWeek(expected)).toBe(1);
  });
});

describe("generateWeekStarts", () => {
  it("steps a week at a time across month and year boundaries", () => {
    expect(generateWeekStarts("2025-12-22", 3)).toEqual(["2025-12-22", "2025-12-29", "2026-01-05"]);
  });

  it("stays on Mondays for a full year", () => {
    const weeks = generateWeekStarts(getYearStartMonday(2026), 53);
    expect(weeks).toHaveLength(53);
    expect(weeks.every((w) => dayOfWeek(w) === 1)).toBe(true);
  });
});

describe("groupWeeksByMonth", () => {
  it("groups weeks under the month they start in", () => {
    const groups = groupWeeksByMonth(["2026-09-21", "2026-09-28", "2026-10-05"]);
    expect(groups.map((g) => [g.label, g.weeks.length])).toEqual([
      ["Sep 2026", 2],
      ["Oct 2026", 1],
    ]);
  });
});

describe("isIsoDate / isMonday", () => {
  it("accepts real YYYY-MM-DD dates only", () => {
    expect(isIsoDate("2026-09-21")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true); // leap day
    for (const bad of ["notadate", "2026-02-30", "2026-13-01", "2026-9-21", "2026-09-21T00:00:00Z", "", 20260921, null]) {
      expect(isIsoDate(bad)).toBe(false);
    }
  });

  it("accepts Mondays only", () => {
    expect(isMonday("2026-09-21")).toBe(true);
    expect(isMonday("2026-10-01")).toBe(false); // a Thursday
    expect(isMonday("notadate")).toBe(false);
  });
});
