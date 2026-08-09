"use client";

import { useMemo } from "react";
import type { Project } from "@/components/ProjectsSidebar";
import type { Teammate } from "@/components/TeammatesSidebar";
import type { Allocation } from "@/components/allocation/ProjectSection";
import { getCurrentMonday } from "@/lib/dateUtils";
import {
  matchesProjectFilters,
  matchesTeammateFilters,
  type AllocationFilters,
} from "@/components/allocation/AllocationView";

// The grouped/summed shapes in src/lib/queries.ts are server-only, so the cube
// re-derives what it needs from the flat arrays already in page.tsx state —
// the same thing AllocationView/TotalsCell do.

// How much of the timeline the cube covers, relative to the current week.
const MONTHS_BACK = 4;
const MONTHS_AHEAD = 2;

export type Voxel = {
  /** index on the project axis */
  x: number;
  /** index on the teammate axis */
  y: number;
  /** index on the time axis */
  z: number;
  fraction: number;
};

export type CubeData = {
  voxels: Voxel[];
  projectNames: string[];
  teammateNames: string[];
  weekLabels: string[];
  dims: { x: number; y: number; z: number };
};


function shortWeekLabel(weekStart: string): string {
  // weekStart is a plain YYYY-MM-DD Monday; parse as local noon to dodge TZ drift.
  const d = new Date(weekStart + "T12:00:00");
  return `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}`;
}

/** Weeks from MONTHS_BACK before the current Monday to MONTHS_AHEAD after it. */
function windowWeeks(weekStarts: string[]): string[] {
  const anchor = new Date(getCurrentMonday() + "T12:00:00");
  const shifted = (months: number) => {
    const d = new Date(anchor);
    d.setMonth(d.getMonth() + months);
    // Compare as YYYY-MM-DD strings, which sort chronologically.
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  };
  const from = shifted(-MONTHS_BACK);
  const to = shifted(MONTHS_AHEAD);
  return [...new Set(weekStarts)].filter((w) => w >= from && w <= to).sort();
}

export default function useCubeData(
  projects: Project[],
  teammates: Teammate[],
  allocations: Allocation[],
  weekStarts: string[],
  filters: AllocationFilters
): CubeData {
  return useMemo(() => {
    const weeks = windowWeeks(weekStarts);
    const weekIndex = new Map(weeks.map((w, i) => [w, i]));

    // An axis entry only earns its slice if something lands on it inside the
    // window — otherwise the cube fills with empty planes for archived projects
    // and teammates who are not booked. This replaces an earlier hardcoded
    // status rule, which would have fought an explicit status filter.
    const seenProjects = new Set<string>();
    const seenTeammates = new Set<string>();
    for (const a of allocations) {
      if (a.isHidden || a.fraction <= 0 || !weekIndex.has(a.weekStart)) continue;
      seenProjects.add(a.projectId);
      seenTeammates.add(a.teammateId);
    }

    const liveProjects = projects
      .filter((p) => seenProjects.has(p.id) && matchesProjectFilters(p, filters))
      .sort((a, b) => a.name.localeCompare(b.name));
    const activeTeammates = teammates
      .filter((t) => seenTeammates.has(t.id) && matchesTeammateFilters(t, filters))
      .sort((a, b) => (a.role ?? "zz").localeCompare(b.role ?? "zz") || a.name.localeCompare(b.name));

    const projectIndex = new Map(liveProjects.map((p, i) => [p.id, i]));
    const teammateIndex = new Map(activeTeammates.map((t, i) => [t.id, i]));

    const voxels: Voxel[] = [];
    for (const a of allocations) {
      if (a.isHidden || a.fraction <= 0) continue;
      const x = projectIndex.get(a.projectId);
      const y = teammateIndex.get(a.teammateId);
      const z = weekIndex.get(a.weekStart);
      if (x === undefined || y === undefined || z === undefined) continue;
      voxels.push({ x, y, z, fraction: a.fraction });
    }

    return {
      voxels,
      projectNames: liveProjects.map((p) => p.name),
      teammateNames: activeTeammates.map((t) => t.name),
      weekLabels: weeks.map(shortWeekLabel),
      dims: { x: liveProjects.length, y: activeTeammates.length, z: weeks.length },
    };
  }, [projects, teammates, allocations, weekStarts, filters]);
}
