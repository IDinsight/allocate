"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import type { Project } from "@/components/ProjectsSidebar";
import type { Teammate } from "@/components/TeammatesSidebar";
import type { Allocation } from "./ProjectSection";
import { groupWeeksByMonth, generateWeekStarts, getYearStartMonday } from "@/lib/dateUtils";
import { getProjectBg } from "@/lib/projectColors";
import DateHeader from "./DateHeader";
import ProjectSection from "./ProjectSection";
import TeammateSection from "./TeammateSection";
import { PROJECT_INFO_WIDTH, TEAMMATE_NAME_WIDTH } from "./ProjectSection";
import { TEAMMATE_INFO_WIDTH, PROJECT_NAME_WIDTH } from "./TeammateSection";

const CELL_WIDTH = 56;

export type AllocationFilters = {
  projectStatus: Set<string>;
  projectLeadId: Set<string>;
  projectName: string;
  teammateStatus: Set<string>;
  teammateId: Set<string>;
  teammateLevel: Set<string>;
  teammateRole: Set<string>;
};

function defaultFilters(): AllocationFilters {
  return {
    projectStatus: new Set(),
    projectLeadId: new Set(),
    projectName: "",
    teammateStatus: new Set(),
    teammateId: new Set(),
    teammateRole: new Set(),
    teammateLevel: new Set(),
  };
}

// Filter <-> URL serialization. Defaults are all empty, so a missing key
// unambiguously means "no filter" — no sentinel needed.
const FILTER_PARAM_KEYS = [
  "projectStatus",
  "projectLead",
  "projectName",
  "teamStatus",
  "team",
  "teamLevel",
  "teamRole",
] as const;

function parseFiltersFromSearch(search: string): AllocationFilters {
  const params = new URLSearchParams(search);
  const setFromParam = (key: string) => {
    const v = params.get(key);
    return new Set(v ? v.split(",").filter(Boolean) : []);
  };
  return {
    projectStatus: setFromParam("projectStatus"),
    projectLeadId: setFromParam("projectLead"),
    projectName: params.get("projectName") ?? "",
    teammateStatus: setFromParam("teamStatus"),
    teammateId: setFromParam("team"),
    teammateLevel: setFromParam("teamLevel"),
    teammateRole: setFromParam("teamRole"),
  };
}

function writeFiltersToUrl(filters: AllocationFilters) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  for (const k of FILTER_PARAM_KEYS) params.delete(k);
  const setParam = (key: string, s: Set<string>) => {
    if (s.size > 0) params.set(key, Array.from(s).join(","));
  };
  setParam("projectStatus", filters.projectStatus);
  setParam("projectLead", filters.projectLeadId);
  setParam("teamStatus", filters.teammateStatus);
  setParam("team", filters.teammateId);
  setParam("teamLevel", filters.teammateLevel);
  setParam("teamRole", filters.teammateRole);
  if (filters.projectName) params.set("projectName", filters.projectName);
  const qs = params.toString();
  const next = window.location.pathname + (qs ? "?" + qs : "") + window.location.hash;
  if (next !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.replaceState(null, "", next);
  }
}

// View-option toggles. Each key is omitted when its value matches the
// default; presence with "1"/"0" overrides the default. Defaults differ per
// option (notably `tt` is on by default), so we keep both directions.
type ViewOptions = {
  showProjectDetails: boolean;
  showProjectTotals: boolean;
  projectTotalsOnly: boolean;
  showTotals: boolean;
  totalsOnly: boolean;
};

const VIEW_OPTION_KEYS = [
  "showDetails",
  "showProjectTotals",
  "projectTotalsOnly",
  "showTeamTotals",
  "teamTotalsOnly",
] as const;

const VIEW_OPTION_DEFAULTS: ViewOptions = {
  showProjectDetails: false,
  showProjectTotals: false,
  projectTotalsOnly: false,
  showTotals: true,
  totalsOnly: false,
};

function parseViewOptionsFromSearch(search: string): ViewOptions {
  const params = new URLSearchParams(search);
  const flag = (key: string, def: boolean): boolean => {
    const v = params.get(key);
    if (v === "1") return true;
    if (v === "0") return false;
    return def;
  };
  return {
    showProjectDetails: flag("showDetails", VIEW_OPTION_DEFAULTS.showProjectDetails),
    showProjectTotals: flag("showProjectTotals", VIEW_OPTION_DEFAULTS.showProjectTotals),
    projectTotalsOnly: flag("projectTotalsOnly", VIEW_OPTION_DEFAULTS.projectTotalsOnly),
    showTotals: flag("showTeamTotals", VIEW_OPTION_DEFAULTS.showTotals),
    totalsOnly: flag("teamTotalsOnly", VIEW_OPTION_DEFAULTS.totalsOnly),
  };
}

function writeViewOptionsToUrl(opts: ViewOptions) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  for (const k of VIEW_OPTION_KEYS) params.delete(k);
  if (opts.showProjectDetails !== VIEW_OPTION_DEFAULTS.showProjectDetails) {
    params.set("showDetails", opts.showProjectDetails ? "1" : "0");
  }
  if (opts.showProjectTotals !== VIEW_OPTION_DEFAULTS.showProjectTotals) {
    params.set("showProjectTotals", opts.showProjectTotals ? "1" : "0");
  }
  if (opts.projectTotalsOnly !== VIEW_OPTION_DEFAULTS.projectTotalsOnly) {
    params.set("projectTotalsOnly", opts.projectTotalsOnly ? "1" : "0");
  }
  if (opts.showTotals !== VIEW_OPTION_DEFAULTS.showTotals) {
    params.set("showTeamTotals", opts.showTotals ? "1" : "0");
  }
  if (opts.totalsOnly !== VIEW_OPTION_DEFAULTS.totalsOnly) {
    params.set("teamTotalsOnly", opts.totalsOnly ? "1" : "0");
  }
  const qs = params.toString();
  const next = window.location.pathname + (qs ? "?" + qs : "") + window.location.hash;
  if (next !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.replaceState(null, "", next);
  }
}

interface Props {
  projects: Project[];
  teammates: Teammate[];
  allocations: Allocation[];
  weekStarts: string[];
  activeView: "project" | "teammate";
  onCellEdit: (
    projectId: string,
    teammateId: string,
    weekStart: string,
    fraction: number | null,
    existingId: string | undefined
  ) => void;
}

export default function AllocationView({
  projects,
  teammates,
  allocations,
  weekStarts: rawWeekStarts,
  activeView,
  onCellEdit,
}: Props) {
  const weekStarts = useMemo(() => {
    const yearWeeks = generateWeekStarts(getYearStartMonday(), 52);
    const merged = new Set<string>(yearWeeks);
    for (const ws of rawWeekStarts) merged.add(ws);
    return Array.from(merged).sort();
  }, [rawWeekStarts]);
  // Lazy init from URL. AllocationView only mounts after data has loaded
  // (see page.tsx), which is past initial hydration, so reading window here
  // doesn't risk a hydration mismatch.
  const [filters, setFilters] = useState<AllocationFilters>(() =>
    typeof window === "undefined"
      ? defaultFilters()
      : parseFiltersFromSearch(window.location.search)
  );

  useEffect(() => {
    writeFiltersToUrl(filters);
  }, [filters]);

  // Lazy init view options from URL once on mount (mirrors filters above).
  const [viewOptionsInit] = useState<ViewOptions>(() =>
    typeof window === "undefined"
      ? VIEW_OPTION_DEFAULTS
      : parseViewOptionsFromSearch(window.location.search)
  );
  const [showProjectDetails, setShowProjectDetails] = useState(viewOptionsInit.showProjectDetails);
  const [showTotals, setShowTotals] = useState(viewOptionsInit.showTotals);
  const [showProjectTotals, setShowProjectTotals] = useState(viewOptionsInit.showProjectTotals);
  const [totalsOnly, setTotalsOnly] = useState(viewOptionsInit.totalsOnly);
  const [projectTotalsOnly, setProjectTotalsOnly] = useState(viewOptionsInit.projectTotalsOnly);

  useEffect(() => {
    writeViewOptionsToUrl({
      showProjectDetails,
      showProjectTotals,
      projectTotalsOnly,
      showTotals,
      totalsOnly,
    });
  }, [showProjectDetails, showProjectTotals, projectTotalsOnly, showTotals, totalsOnly]);
  const [addedPairs, setAddedPairs] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToCurrentMonth = useCallback((smooth = true) => {
    if (!scrollRef.current || weekStarts.length === 0) return;
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
    // Find the first week that belongs to the current month
    const targetIndex = weekStarts.findIndex((ws) => {
      const d = new Date(ws + "T00:00:00");
      return `${d.getFullYear()}-${d.getMonth()}` === currentMonthKey;
    });
    if (targetIndex >= 0) {
      scrollRef.current.scrollTo({
        left: targetIndex * CELL_WIDTH,
        behavior: smooth ? "smooth" : "instant",
      });
    }
  }, [weekStarts]);

  const updateFilter = useCallback(
    <K extends keyof AllocationFilters>(key: K, value: AllocationFilters[K]) => {
      setFilters((prev) => {
        const next = { ...prev, [key]: value };
        // If teammate filter has any alumni selected, auto-show alumni
        if (key === "teammateId" && value instanceof Set && value.size > 0) {
          const hasAlumni = teammates.some(
            (t) => (value as Set<string>).has(t.id) && t.status === "Alumni"
          );
          if (hasAlumni) {
            next.teammateStatus = new Set();
          }
        }
        return next;
      });
    },
    [teammates]
  );

  const allocationMap = useMemo(() => {
    const map = new Map<string, Allocation>();
    for (const a of allocations) {
      if (!a.isHidden) {
        map.set(`${a.projectId}|${a.teammateId}|${a.weekStart}`, a);
      }
    }
    return map;
  }, [allocations]);

  const monthGroups = useMemo(() => groupWeeksByMonth(weekStarts), [weekStarts]);

  // Set of weekStart strings that are the first week of a month (for vertical month lines)
  const monthBoundaries = useMemo(() => {
    const set = new Set<string>();
    for (const mg of monthGroups) {
      if (mg.weeks.length > 0) set.add(mg.weeks[0]);
    }
    return set;
  }, [monthGroups]);

  // Teammate totals: sum of fractions per teammate per week
  const teammateTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const a of allocations) {
      if (a.isHidden) continue;
      const key = `${a.teammateId}|${a.weekStart}`;
      totals.set(key, (totals.get(key) ?? 0) + a.fraction);
    }
    return totals;
  }, [allocations]);

  // Project totals: sum of fractions per project per week
  const projectTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const a of allocations) {
      if (a.isHidden) continue;
      const key = `${a.projectId}|${a.weekStart}`;
      totals.set(key, (totals.get(key) ?? 0) + a.fraction);
    }
    return totals;
  }, [allocations]);

  // Filter projects matching active filters (includes projects with no allocations)
  const activeProjects = useMemo(() => {
    return projects.filter((p) => {
      if (filters.projectStatus.size > 0 && !filters.projectStatus.has(p.status)) return false;
      if (filters.projectLeadId.size > 0 && !filters.projectLeadId.has(p.leadId ?? "")) return false;
      if (filters.projectName && !p.name.toLowerCase().includes(filters.projectName.toLowerCase())) return false;
      return true;
    });
  }, [projects, filters]);

  // Filter to teammates that have allocations + match active filters
  const activeTeammates = useMemo(() => {
    const teammatesWithAllocations = new Set<string>();
    for (const a of allocations) {
      if (!a.isHidden) teammatesWithAllocations.add(a.teammateId);
    }
    return teammates.filter((t) => {
      if (!teammatesWithAllocations.has(t.id)) return false;
      if (filters.teammateStatus.size > 0 && !filters.teammateStatus.has(t.status)) return false;
      if (filters.teammateId.size > 0 && !filters.teammateId.has(t.id)) return false;
      if (filters.teammateLevel.size > 0 && !filters.teammateLevel.has(t.level ?? "")) return false;
      if (filters.teammateRole.size > 0 && !filters.teammateRole.has(t.role ?? "")) return false;
      return true;
    });
  }, [teammates, allocations, filters]);

  const leftPanelWidth = activeView === "project"
    ? PROJECT_INFO_WIDTH + TEAMMATE_NAME_WIDTH
    : TEAMMATE_INFO_WIDTH + PROJECT_NAME_WIDTH;
  const totalWidth = leftPanelWidth + weekStarts.length * CELL_WIDTH;

  // Scroll to current month on mount
  useEffect(() => {
    scrollToCurrentMonth(false);
  }, [scrollToCurrentMonth]);

  return (
    <div className="flex flex-col h-full w-full max-w-6xl mx-auto px-12">
      {/* Scroll container */}
      <div ref={scrollRef} data-alloc-scroll data-alloc-left-width={leftPanelWidth} className="flex-1 overflow-auto mb-10 border-t-4 border-2 border-zinc-900  bg-white">
        {activeView === "project" && (
          <div style={{ minWidth: totalWidth }}>
            <DateHeader
              monthGroups={monthGroups}
              filters={filters}
              onFilterChange={updateFilter}
              projects={projects}
              teammates={teammates}
              showProjectDetails={showProjectDetails}
              onToggleProjectDetails={() => setShowProjectDetails((v) => !v)}
              activeView={activeView}
              showTotals={showProjectTotals}
              onToggleShowTotals={() => setShowProjectTotals((v) => {
                if (v) setProjectTotalsOnly(false);
                return !v;
              })}
              totalsOnly={projectTotalsOnly}
              onToggleTotalsOnly={() => setProjectTotalsOnly((v) => {
                if (!v) setShowProjectTotals(true);
                return !v;
              })}
            />
            {activeProjects.map((project, idx) => (
              <ProjectSection
                key={project.id}
                project={project}
                teammates={teammates}
                weekStarts={weekStarts}
                allocationMap={allocationMap}
                teammateTotals={teammateTotals}
                bgColor={getProjectBg(idx)}
                monthBoundaries={monthBoundaries}
                teammateStatusFilter={filters.teammateStatus}
                teammateIdFilter={filters.teammateId}
                showProjectDetails={showProjectDetails}
                showTotals={showProjectTotals}
                totalsOnly={projectTotalsOnly}
                projectTotals={projectTotals}
                onCellEdit={onCellEdit}
                addedPairs={addedPairs}
                onAddTeammate={(projectId, teammateId) => {
                  setAddedPairs((prev) => new Set(prev).add(`${projectId}|${teammateId}`));
                }}
                onRemovePair={(projectId, teammateId) => {
                  setAddedPairs((prev) => {
                    const next = new Set(prev);
                    next.delete(`${projectId}|${teammateId}`);
                    return next;
                  });
                }}
              />
            ))}
          </div>
        )}

        {activeView === "teammate" && (
          <div style={{ minWidth: totalWidth }}>
            <DateHeader
              monthGroups={monthGroups}
              filters={filters}
              onFilterChange={updateFilter}
              projects={projects}
              teammates={teammates}
              showProjectDetails={false}
              onToggleProjectDetails={() => {}}
              activeView={activeView}
              showTotals={showTotals}
              onToggleShowTotals={() => setShowTotals((v) => {
                if (v) setTotalsOnly(false); // turning off showTotals also turns off totalsOnly
                return !v;
              })}
              totalsOnly={totalsOnly}
              onToggleTotalsOnly={() => {
                setTotalsOnly((v) => {
                  if (!v) setShowTotals(true); // turning on totalsOnly forces showTotals on
                  return !v;
                });
              }}
            />
            {activeTeammates.map((teammate, idx) => (
              <TeammateSection
                key={teammate.id}
                teammate={teammate}
                projects={projects}
                weekStarts={weekStarts}
                allocationMap={allocationMap}
                teammateTotals={teammateTotals}
                bgColor={getProjectBg(idx)}
                monthBoundaries={monthBoundaries}
                projectStatusFilter={filters.projectStatus}
                projectLeadIdFilter={filters.projectLeadId}
                projectNameFilter={filters.projectName}
                showTotals={showTotals}
                totalsOnly={totalsOnly}
                onCellEdit={onCellEdit}
                addedPairs={addedPairs}
                onAddProject={(teammateId, projectId) => {
                  setAddedPairs((prev) => new Set(prev).add(`${projectId}|${teammateId}`));
                }}
                onRemovePair={(projectId, teammateId) => {
                  setAddedPairs((prev) => {
                    const next = new Set(prev);
                    next.delete(`${projectId}|${teammateId}`);
                    return next;
                  });
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
