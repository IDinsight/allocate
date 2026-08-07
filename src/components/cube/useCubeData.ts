"use client";

import { useMemo } from "react";
import type { Project } from "@/components/ProjectsSidebar";
import type { Teammate } from "@/components/TeammatesSidebar";
import type { Allocation } from "@/components/allocation/ProjectSection";
import { getCurrentMonday } from "@/lib/dateUtils";

// The grouped/summed shapes in src/lib/queries.ts are server-only, so the cube
// re-derives what it needs from the flat arrays already in page.tsx state —
// the same thing AllocationView/TotalsCell do.

const WEEK_WINDOW = 26; // weeks on the time axis, centred on this week

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

const LIVE_PROJECT_STATUSES = new Set(["Active", "Upcoming"]);

function shortWeekLabel(weekStart: string): string {
  // weekStart is a plain YYYY-MM-DD Monday; parse as local noon to dodge TZ drift.
  const d = new Date(weekStart + "T12:00:00");
  return `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}`;
}

/** Pick WEEK_WINDOW weeks centred on the current Monday, clamped to what exists. */
function windowWeeks(weekStarts: string[]): string[] {
  const sorted = [...new Set(weekStarts)].sort();
  if (sorted.length <= WEEK_WINDOW) return sorted;
  const today = getCurrentMonday();
  // First week at or after today; -1 if every week is in the past.
  let pivot = sorted.findIndex((w) => w >= today);
  if (pivot < 0) pivot = sorted.length - 1;
  let start = pivot - Math.floor(WEEK_WINDOW / 2);
  start = Math.max(0, Math.min(start, sorted.length - WEEK_WINDOW));
  return sorted.slice(start, start + WEEK_WINDOW);
}

export default function useCubeData(
  projects: Project[],
  teammates: Teammate[],
  allocations: Allocation[],
  weekStarts: string[]
): CubeData {
  return useMemo(() => {
    const weeks = windowWeeks(weekStarts);
    const weekIndex = new Map(weeks.map((w, i) => [w, i]));

    const liveProjects = projects
      .filter((p) => LIVE_PROJECT_STATUSES.has(p.status))
      .sort((a, b) => a.name.localeCompare(b.name));
    const activeTeammates = teammates
      .filter((t) => t.status === "Active")
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
  }, [projects, teammates, allocations, weekStarts]);
}
