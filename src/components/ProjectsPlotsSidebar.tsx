"use client";
import { useMemo, useRef, useState } from "react";
import WatermarkBackground from "./WatermarkBackground";
import foalyPng from "@/../public/foaly.png";
import { groupWeeksByMonth } from "@/lib/dateUtils";
import { PILLAR_COLORS, PILLAR_ORDER } from "@/lib/pillarColors";
import { FOCUS_AREA_COLORS, FOCUS_AREA_LABELS, FOCUS_AREA_ORDER } from "@/lib/focusAreaColors";
import StackedBarChart, { StackedBarDatum } from "./charts/StackedBarChart";

type Teammate = { id: string; name: string };

type Allocation = {
  id: string;
  teammateId: string;
  projectId: string;
  weekStart: string;
  fraction: number;
  isHidden: boolean;
};

export type Project = {
  id: string;
  name: string;
  pillar: string | null;
  focusArea: string | null;
  region: string | null;
  billingRate: string | null;
  status: string;
  conversionProbability: number | null;
  billable: boolean;
  unit4Code: string | null;
  startDate: string | null;
  endDate: string | null;
  blurb: string | null;
  leadId: string | null;
  lead: Teammate | null;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  onFlushed?: () => void;
  projects: Project[];
  allocations: Allocation[];
  weekStarts: string[];
  disabled?: boolean;
  /** Whether the sibling ProjectsSidebar panel is currently open — hides
   * this sidebar's closed-state tab so it doesn't float above that panel. */
  siblingOpen?: boolean;
}

export default function ProjectsPlotsSidebar({ open, onClose, onOpen, onFlushed, projects, allocations, weekStarts, disabled, siblingOpen }: Props) {
  const [closing, setClosing] = useState(false);
  const pendingRef = useRef<Set<Promise<unknown>>>(new Set());

  // Per-month breakdowns for the pillar/focus-area stacked bar charts. A
  // project counts toward a month if it has any nonzero allocation on a week
  // within that month — the same rule for both the project-count charts and
  // the allocation-% charts, so the two stay comparable.
  const monthGroups = useMemo(() => groupWeeksByMonth(weekStarts), [weekStarts]);

  const buildMonthlyBreakdown = useMemo(() => {
    return (dimension: "pillar" | "focusArea", metric: "count" | "allocation"): StackedBarDatum[] => {
      const projectById = new Map(projects.map((p) => [p.id, p]));

      return monthGroups.map((mg) => {
        const weekSet = new Set(mg.weeks);
        const monthAllocations = allocations.filter((a) => a.fraction > 0 && weekSet.has(a.weekStart));

        if (metric === "count") {
          const projectIdsByCategory = new Map<string, Set<string>>();
          for (const a of monthAllocations) {
            const project = projectById.get(a.projectId);
            const category = (project?.[dimension] ?? "Uncategorized") || "Uncategorized";
            if (!projectIdsByCategory.has(category)) projectIdsByCategory.set(category, new Set());
            projectIdsByCategory.get(category)!.add(a.projectId);
          }
          return {
            label: mg.label,
            segments: Array.from(projectIdsByCategory.entries()).map(([key, ids]) => ({ key, value: ids.size })),
          };
        }

        // allocation %: sum fraction per week per category, then average
        // across the weeks in the month so months with more weeks don't
        // read artificially higher.
        const sumByCategoryByWeek = new Map<string, Map<string, number>>();
        for (const a of monthAllocations) {
          const project = projectById.get(a.projectId);
          const category = (project?.[dimension] ?? "Uncategorized") || "Uncategorized";
          if (!sumByCategoryByWeek.has(category)) sumByCategoryByWeek.set(category, new Map());
          const byWeek = sumByCategoryByWeek.get(category)!;
          byWeek.set(a.weekStart, (byWeek.get(a.weekStart) ?? 0) + a.fraction);
        }
        const weekCount = mg.weeks.length || 1;
        return {
          label: mg.label,
          segments: Array.from(sumByCategoryByWeek.entries()).map(([key, byWeek]) => {
            const total = Array.from(byWeek.values()).reduce((sum, v) => sum + v, 0);
            return { key, value: total / weekCount };
          }),
        };
      });
    };
  }, [projects, allocations, monthGroups]);

  const pillarCountData = useMemo(() => buildMonthlyBreakdown("pillar", "count"), [buildMonthlyBreakdown]);
  const pillarAllocationData = useMemo(() => buildMonthlyBreakdown("pillar", "allocation"), [buildMonthlyBreakdown]);
  const focusAreaCountData = useMemo(() => buildMonthlyBreakdown("focusArea", "count"), [buildMonthlyBreakdown]);
  const focusAreaAllocationData = useMemo(() => buildMonthlyBreakdown("focusArea", "allocation"), [buildMonthlyBreakdown]);

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose();
      Promise.allSettled(Array.from(pendingRef.current)).then(() => {
        onFlushed?.();
      });
    }, 250);
  };


  return (
    <>
      {/* Handle — when sidebar is closed */}
      {!open && !siblingOpen && (
        <div className="fixed -left-0.5 top-1/2 -translate-y-1/2 z-[51]">
          <button
            onClick={onOpen}
            disabled={disabled}
            className={`sidebar-tab group bg-white/100 text-violet-700 ${disabled ? "opacity-30 pointer-events-none" : ""}`}
          >
            <span className="pr-2.5 pl-0.5 text-xl transition-all w-0 overflow-hidden whitespace-nowrap group-hover:w-18 group-hover:px-2">
              🩺
            </span>
            <span className="px-1.5">
              {"\u203A"}
            </span>
          </button>
        </div>
      )}

      {/* Backdrop */}
      {open && (
        <div
          className={`fixed inset-0 z-40 bg-black/20 ${closing ? "fade-out" : "fade-in"}`}
          onClick={handleClose}
        />
      )}

      {/* Panel + attached handle */}
      {open && (
        <div
          className={`fixed inset-y-0 left-0 z-50 flex w-[82%] max-w-[1200px] flex-col border-r-3 border-zinc-900 bg-white shadow-2xl ${closing ? "slide-out-left" : "slide-in-left"}`}
        >
          <WatermarkBackground 
          text="" 
          imageSrc={foalyPng.src}
          imgTileWidth={foalyPng.width * .5}
          imgTileHeight={foalyPng.height * .5}
          className="-z-10" 
          color="purple" 
          opacity={0.3} 
          rotation={-26}/>

          {/* Handle — attached to right edge of panel */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 translate-x-full z-[51]">
            <button
              onClick={handleClose}
              className="sidebar-tab bg-white/100 text-violet-700"
            >
              <span className="pl-3 pr-1 text-xl whitespace-nowrap">
                🩺
              </span>
              <span className="px-1.5">
                {"\u2039"}
              </span>
            </button>
          </div>
          {/* Header */}
          <div className="flex items-end justify-end gap-3 px-8 pt-8 pb-6">
            
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto mx-8 mb-10 border-2 border-zinc-900 bg-white">
            <StackedBarChart
              title="Projects per Pillar by Month"
              data={pillarCountData}
              order={PILLAR_ORDER}
              colors={PILLAR_COLORS}
            />
            <StackedBarChart
              title="Staff Allocation % per Pillar by Month"
              data={pillarAllocationData}
              order={PILLAR_ORDER}
              colors={PILLAR_COLORS}
              valueFormatter={(v) => `${Math.round(v)}%`}
            />
            <StackedBarChart
              title="Projects per Focus Area by Month"
              data={focusAreaCountData}
              order={FOCUS_AREA_ORDER}
              colors={FOCUS_AREA_COLORS}
              labels={FOCUS_AREA_LABELS}
            />
            <StackedBarChart
              title="Staff Allocation % per Focus Area by Month"
              data={focusAreaAllocationData}
              order={FOCUS_AREA_ORDER}
              colors={FOCUS_AREA_COLORS}
              labels={FOCUS_AREA_LABELS}
              valueFormatter={(v) => `${Math.round(v)}%`}
            />
          </div>
        </div>
      )}
    </>
  );
}
