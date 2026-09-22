"use client";
import { useMemo, useRef, useState } from "react";
import WatermarkBackground from "./WatermarkBackground";
import foaly2Png from "@/../public/foaly_2.png";
import { groupWeeksByMonth } from "@/lib/dateUtils";
import { LEVEL_COLORS, LEVEL_ORDER } from "@/lib/levelColors";
import { ROLE_COLORS, ROLE_ORDER } from "@/lib/roleColors";
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
  allocations: Allocation[];
  teammates: TeammateWithLevelRole[];
  weekStarts: string[];
  disabled?: boolean;
  /** Whether the sibling TeammatesSidebar panel is currently open — hides
   * this sidebar's closed-state tab so it doesn't float above that panel. */
  siblingOpen?: boolean;
}

export default function TeammatePlotsSidebar({ open, onClose, onOpen, onFlushed, allocations, teammates, weekStarts, disabled, siblingOpen }: Props) {
  const [closing, setClosing] = useState(false);
  const pendingRef = useRef<Set<Promise<unknown>>>(new Set());

  // Per-month mean +/- std of per-teammate project count and allocation %,
  // grouped by level or role. A teammate only contributes to a month if
  // they have some nonzero allocation that month, so people not staffed
  // that month don't drag the average down; teammates with no level/role
  // set are excluded from the corresponding chart rather than bucketed.
  const monthGroups = useMemo(() => groupWeeksByMonth(weekStarts), [weekStarts]);

  const buildMonthlySeries = useMemo(() => {
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

  const levelCountData = useMemo(() => buildMonthlySeries("level", "count", LEVEL_ORDER), [buildMonthlySeries]);
  const levelAllocationData = useMemo(() => buildMonthlySeries("level", "allocation", LEVEL_ORDER), [buildMonthlySeries]);
  const roleCountData = useMemo(() => buildMonthlySeries("role", "count", ROLE_ORDER), [buildMonthlySeries]);
  const roleAllocationData = useMemo(() => buildMonthlySeries("role", "allocation", ROLE_ORDER), [buildMonthlySeries]);

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
        <div className="fixed -right-0.5 top-1/2 -translate-y-1/2 z-[51]">
          <button
            onClick={onOpen}
            disabled={disabled}
            className={`sidebar-tab sidebar-tab-right group bg-white/100 text-green-700 ${disabled ? "opacity-30 pointer-events-none" : ""}`}
          >
            <span className="px-1.5">
              {"‹"}
            </span>
            <span className="pr-2.5 pl-0.5 text-xl transition-all w-0 min-w-0 overflow-hidden whitespace-nowrap group-hover:w-8">
              ⚕️
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
          className={`fixed inset-y-0 right-0 z-50 flex w-[82%] max-w-[1200px] flex-col border-l-3 border-zinc-900 bg-white shadow-2xl ${closing ? "slide-out-right" : "slide-in-right"}`}
        >
          <WatermarkBackground
          text=""
          imageSrc={foaly2Png.src}
          imgTileWidth={foaly2Png.width * .25}
          imgTileHeight={foaly2Png.height * .25}
          className="-z-10"
          color="purple"
          opacity={0.3}
          rotation={32}/>

          {/* Handle — attached to left edge of panel */}
          <div className="absolute left-2 top-1/2 -translate-y-1/2 -translate-x-full z-[51]">
            <button
              onClick={handleClose}
              className="sidebar-tab sidebar-tab-right bg-white/100 text-green-700"
            >
              <span className="px-1.5">
                {"›"}
              </span>
              <span className="pr-3 pl-1 text-xl whitespace-nowrap">
                ⚕️
              </span>
            </button>
          </div>
          {/* Header */}
          <div className="flex items-end justify-end gap-3 px-8 pt-8 pb-6">

          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto mx-8 mb-10 border-2 border-zinc-900 bg-white">
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
          </div>
        </div>
      )}
    </>
  );
}
