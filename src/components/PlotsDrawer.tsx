"use client";
import { useMemo, useRef, useState } from "react";
import WatermarkBackground from "./WatermarkBackground";
import foalyPng from "@/../public/foaly.png";
import foaly2Png from "@/../public/foaly_2.png";
import { groupWeeksByMonth } from "@/lib/dateUtils";
import { PILLAR_COLORS, PILLAR_ORDER } from "@/lib/pillarColors";
import { FOCUS_AREA_COLORS, FOCUS_AREA_LABELS, FOCUS_AREA_ORDER } from "@/lib/focusAreaColors";
import { LEVEL_COLORS, LEVEL_ORDER } from "@/lib/levelColors";
import { ROLE_COLORS, ROLE_ORDER } from "@/lib/roleColors";
import StackedBarChart, { StackedBarDatum } from "./charts/StackedBarChart";
import GroupedBarChart, { BarSeries } from "./charts/GroupedBarChart";

type Teammate = { id: string; name: string };

type TeammateWithLevelRole = {
  id: string;
  name: string;
  role: string | null;
  level: string | null;
};

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
  teammates: TeammateWithLevelRole[];
  allocations: Allocation[];
  weekStarts: string[];
  disabled?: boolean;
}

export default function PlotsDrawer({ open, onClose, onOpen, onFlushed, projects, teammates, allocations, weekStarts, disabled }: Props) {
  const [closing, setClosing] = useState(false);
  const pendingRef = useRef<Set<Promise<unknown>>>(new Set());
  const [plotsView, setPlotsView] = useState<"project" | "teammate">("project");

  const monthGroups = useMemo(() => groupWeeksByMonth(weekStarts), [weekStarts]);

  // Per-month breakdowns for the pillar/focus-area stacked bar charts. A
  // project counts toward a month if it has any nonzero allocation on a week
  // within that month — the same rule for both the project-count charts and
  // the allocation-% charts, so the two stay comparable.
  const buildProjectMonthlyBreakdown = useMemo(() => {
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

  const pillarCountData = useMemo(() => buildProjectMonthlyBreakdown("pillar", "count"), [buildProjectMonthlyBreakdown]);
  const pillarAllocationData = useMemo(() => buildProjectMonthlyBreakdown("pillar", "allocation"), [buildProjectMonthlyBreakdown]);
  const focusAreaCountData = useMemo(() => buildProjectMonthlyBreakdown("focusArea", "count"), [buildProjectMonthlyBreakdown]);
  const focusAreaAllocationData = useMemo(() => buildProjectMonthlyBreakdown("focusArea", "allocation"), [buildProjectMonthlyBreakdown]);

  // Per-month mean +/- std of per-teammate project count and allocation %,
  // grouped by level or role. A teammate only contributes to a month if
  // they have some nonzero allocation that month, so people not staffed
  // that month don't drag the average down; teammates with no level/role
  // set are excluded from the corresponding chart rather than bucketed.
  const buildTeammateMonthlySeries = useMemo(() => {
    return (dimension: "level" | "role", metric: "count" | "allocation", order: string[]): BarSeries[] => {
      const categoryByTeammateId = new Map<string, string>();
      for (const t of teammates) {
        const category = t[dimension];
        if (category) categoryByTeammateId.set(t.id, category);
      }

      const pointsByCategory = new Map<string, { label: string; mean: number; std: number }[]>();
      for (const category of order) pointsByCategory.set(category, []);

      for (const mg of monthGroups) {
        const weekSet = new Set(mg.weeks);
        const monthAllocations = allocations.filter((a) => a.fraction > 0 && weekSet.has(a.weekStart));

        // Per-teammate metric for this month.
        const valueByTeammateId = new Map<string, number>();
        if (metric === "count") {
          // Distinct-project count per week per teammate, then averaged
          // across the weeks in the month (mirrors the allocation branch
          // below) so a teammate rotating across many projects mid-month
          // doesn't get credited with their full-month union count.
          const projectIdsByTeammateByWeek = new Map<string, Map<string, Set<string>>>();
          for (const a of monthAllocations) {
            if (!projectIdsByTeammateByWeek.has(a.teammateId)) projectIdsByTeammateByWeek.set(a.teammateId, new Map());
            const byWeek = projectIdsByTeammateByWeek.get(a.teammateId)!;
            if (!byWeek.has(a.weekStart)) byWeek.set(a.weekStart, new Set());
            byWeek.get(a.weekStart)!.add(a.projectId);
          }
          const weekCount = mg.weeks.length || 1;
          for (const [teammateId, byWeek] of projectIdsByTeammateByWeek) {
            const total = Array.from(byWeek.values()).reduce((sum, ids) => sum + ids.size, 0);
            valueByTeammateId.set(teammateId, total / weekCount);
          }
        } else {
          // allocation %: sum fraction per week per teammate, then average
          // across the weeks in the month so months with more weeks don't
          // read artificially higher.
          const sumByTeammateByWeek = new Map<string, Map<string, number>>();
          for (const a of monthAllocations) {
            if (!sumByTeammateByWeek.has(a.teammateId)) sumByTeammateByWeek.set(a.teammateId, new Map());
            const byWeek = sumByTeammateByWeek.get(a.teammateId)!;
            byWeek.set(a.weekStart, (byWeek.get(a.weekStart) ?? 0) + a.fraction);
          }
          const weekCount = mg.weeks.length || 1;
          for (const [teammateId, byWeek] of sumByTeammateByWeek) {
            const total = Array.from(byWeek.values()).reduce((sum, v) => sum + v, 0);
            valueByTeammateId.set(teammateId, total / weekCount);
          }
        }

        // Group per-teammate values by category, then compute mean/std.
        const valuesByCategory = new Map<string, number[]>();
        for (const [teammateId, value] of valueByTeammateId) {
          const category = categoryByTeammateId.get(teammateId);
          if (!category) continue;
          if (!valuesByCategory.has(category)) valuesByCategory.set(category, []);
          valuesByCategory.get(category)!.push(value);
        }

        for (const category of order) {
          const values = valuesByCategory.get(category);
          if (!values || values.length === 0) continue;
          const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
          const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
          pointsByCategory.get(category)!.push({ label: mg.label, mean, std: Math.sqrt(variance) });
        }
      }

      return order.map((category) => ({ key: category, points: pointsByCategory.get(category) ?? [] }));
    };
  }, [teammates, allocations, monthGroups]);

  const levelCountData = useMemo(() => buildTeammateMonthlySeries("level", "count", LEVEL_ORDER), [buildTeammateMonthlySeries]);
  const levelAllocationData = useMemo(() => buildTeammateMonthlySeries("level", "allocation", LEVEL_ORDER), [buildTeammateMonthlySeries]);
  const roleCountData = useMemo(() => buildTeammateMonthlySeries("role", "count", ROLE_ORDER), [buildTeammateMonthlySeries]);
  const roleAllocationData = useMemo(() => buildTeammateMonthlySeries("role", "allocation", ROLE_ORDER), [buildTeammateMonthlySeries]);

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
      {/* Handle — when drawer is closed */}
      {!open && (
        <div className="fixed left-1/3 -translate-x-1/2 -bottom-2 z-[51]">
          <button
            onClick={onOpen}
            disabled={disabled}
            className={`btn-chunky flex flex-col items-center rounded-b-none rounded-t-lg border-b-0 bg-blue-100 px-4 py-1.5 pb-4 text-md font-bold leading-none text-zinc-800 ${disabled ? "opacity-30 pointer-events-none" : ""}`}
          >
            <span>{"^"}</span>
            📊
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
          className={`fixed inset-x-0 bottom-0 z-50 flex h-[82%] max-h-[900px] flex-col border-t-3 border-zinc-900 bg-white shadow-2xl ${closing ? "slide-out-bottom" : "slide-in-bottom"}`}
        >
          <WatermarkBackground
            text="G R A P H S P L O T S"
            className="-z-10"
            color={plotsView === "project" ? "purple" : "emerald"}
            opacity={0.3}
            rotation={plotsView === "project" ? -26 : 32}
          />

          {/* Handle — attached to top edge of panel */}
          <div className="absolute left-1/3 -translate-x-1/2 top-2 -translate-y-full z-[51]">
            <button
              onClick={handleClose}
              className="btn-chunky flex flex-col items-center rounded-b-none rounded-t-lg border-b-0 bg-blue-100 px-4 py-1.5 pb-4 text-md font-bold leading-none text-zinc-800"
            >
              {/* Same caret as the closed handle, flipped to point down */}
              <span className="rotate-180 pt-2">{"^"}</span>
              📊
            </button>
          </div>

          {/* Toggle header */}
          <div className="flex items-center justify-center gap-6 px-8 pt-8 pb-6">
            <button
              onClick={() => setPlotsView("project")}
              className={`btn-chunky px-5 py-1 text-sm font-bold rounded-lg shrink-0 ${plotsView === "project"
                ? "btn-chunky-pressed bg-purple-800 text-zinc-100"
                : "bg-white text-zinc-800"
                }`}
            >
              PROJECT PLOTS
            </button>
            <button
              onClick={() => setPlotsView("teammate")}
              className={`btn-chunky px-5 py-1 text-sm font-bold rounded-lg shrink-0 ${plotsView === "teammate"
                ? "btn-chunky-pressed bg-emerald-800 text-zinc-100"
                : "bg-white text-zinc-800"
                }`}
            >
              TEAMMATE PLOTS
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto mx-8 mb-10 border-2 border-zinc-900 bg-white">
            {plotsView === "project" ? (
              <>
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
              </>
            ) : (
              <>
                <GroupedBarChart
                  title="Projects per Teammate by Level by Month"
                  series={levelCountData}
                  order={LEVEL_ORDER}
                  colors={LEVEL_COLORS}
                />
                <GroupedBarChart
                  title="Staff Allocation % per Teammate by Level by Month"
                  series={levelAllocationData}
                  order={LEVEL_ORDER}
                  colors={LEVEL_COLORS}
                  valueFormatter={(v) => `${Math.round(v)}%`}
                />
                <GroupedBarChart
                  title="Projects per Teammate by Role by Month"
                  series={roleCountData}
                  order={ROLE_ORDER}
                  colors={ROLE_COLORS}
                />
                <GroupedBarChart
                  title="Staff Allocation % per Teammate by Role by Month"
                  series={roleAllocationData}
                  order={ROLE_ORDER}
                  colors={ROLE_COLORS}
                  valueFormatter={(v) => `${Math.round(v)}%`}
                />
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
