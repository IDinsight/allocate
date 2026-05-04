"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import type { MonthGroup } from "@/lib/dateUtils";
import { isCurrentWeek, formatWeekLabel } from "@/lib/dateUtils";
import { PROJECT_INFO_WIDTH, TEAMMATE_NAME_WIDTH } from "./ProjectSection";
import { TEAMMATE_INFO_WIDTH, PROJECT_NAME_WIDTH } from "./TeammateSection";
import type { AllocationFilters } from "./AllocationView";
import type { Project } from "@/components/ProjectsSidebar";
import type { Teammate } from "@/components/TeammatesSidebar";
import { STATUS_ORDER } from "@/lib/statusColors";
import ColumnFilterPopover from "@/components/ColumnFilterPopover";
import MultiSelectFilter from "@/components/filters/MultiSelectFilter";

const CELL_WIDTH = 56;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Chip helper ─────────────────────────────────────────
// Shared base classes for all filter chips
const CHIP_BASE = "chip-filter border-2 border-zinc-900 flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md select-none";

function Chip({
  active,
  activeColor,
  activeTextColor,
  onClick,
  children,
}: {
  active: boolean;
  activeColor: string;
  activeTextColor?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${CHIP_BASE} ${active ? `chip-filter-active ${activeColor} ${activeTextColor ?? "text-zinc-800"}` : "bg-white text-zinc-800"}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <span
      className="text-zinc-400 hover:text-red-900 ml-0.5 cursor-pointer"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      ×
    </span>
  );
}

// ─── Types ───────────────────────────────────────────────

type SetFilterKey = {
  [K in keyof AllocationFilters]: AllocationFilters[K] extends Set<string> ? K : never;
}[keyof AllocationFilters];

type FilterDef = {
  key: SetFilterKey;
  label: string;
  options: { value: string; label: string }[];
  searchable?: boolean;
  activeColor?: string;
  activeTextColor?: string;
};

interface Props {
  monthGroups: MonthGroup[];
  filters: AllocationFilters;
  onFilterChange: <K extends keyof AllocationFilters>(key: K, value: AllocationFilters[K]) => void;
  projects: Project[];
  teammates: Teammate[];
  showProjectDetails: boolean;
  onToggleProjectDetails: () => void;
  activeView?: "project" | "teammate";
  showTotals?: boolean;
  onToggleShowTotals?: () => void;
  totalsOnly?: boolean;
  onToggleTotalsOnly?: () => void;
}

// ─── Component ───────────────────────────────────────────

export default function DateHeader({
  monthGroups,
  filters,
  onFilterChange,
  projects,
  teammates,
  showProjectDetails,
  onToggleProjectDetails,
  activeView = "project",
  showTotals,
  onToggleShowTotals,
  totalsOnly,
  onToggleTotalsOnly,
}: Props) {
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  const leftPanelWidth = activeView === "teammate"
    ? TEAMMATE_INFO_WIDTH + PROJECT_NAME_WIDTH
    : PROJECT_INFO_WIDTH + TEAMMATE_NAME_WIDTH;

  // ─── Filter definitions (view-dependent) ─────────────────
  const filterDefs: FilterDef[] = activeView === "teammate"
    ? [
        {
          key: "projectStatus",
          label: "Status",
          options: STATUS_ORDER.map((s) => ({ value: s, label: s })),
        },
        {
          key: "teammateId",
          label: "Team",
          options: teammates
            .map((t) => ({ value: t.id, label: t.name }))
            .sort((a, b) => a.label.localeCompare(b.label)),
          searchable: true,
        },
        {
          key: "teammateRole",
          label: "Role",
          options: [
            { value: "DS", label: "DS" },
            { value: "DE", label: "DE" },
            { value: "FSE", label: "FSE" },
            { value: "PM", label: "PM" },
          ],
        },
        {
          key: "teammateLevel",
          label: "Level",
          options: [
            { value: "INT", label: "INT" },
            { value: "I", label: "I" },
            { value: "II", label: "II" },
            { value: "III", label: "III" },
            { value: "IV", label: "IV" },
            { value: "AD", label: "AD" },
            { value: "D", label: "D" },
          ],
        },
      ]
    : [
        {
          key: "projectStatus",
          label: "Status",
          options: STATUS_ORDER.map((s) => ({ value: s, label: s })),
        },
        {
          key: "projectLeadId",
          label: "Lead",
          options: Object.values(
            Object.fromEntries(
              projects
                .filter((p) => p.lead)
                .map((p) => [p.lead!.id, { value: p.lead!.id, label: p.lead!.name }])
            )
          ).sort((a, b) => a.label.localeCompare(b.label)),
          searchable: true,
        },
        {
          key: "teammateId",
          label: "Team",
          options: teammates
            .map((t) => ({ value: t.id, label: t.name }))
            .sort((a, b) => a.label.localeCompare(b.label)),
          searchable: true,
        },
      ];

  function getChipLabel(def: FilterDef): string | null {
    const selected = filters[def.key];
    if (selected.size === 0) return null;
    if (selected.size === 1) {
      return def.options.find((o) => selected.has(o.value))?.label ?? "1";
    }
    return `${selected.size}`;
  }

  // ─── Search helpers ─────────────────────────────────────
  const searchActive = openFilter === "projectName" || !!filters.projectName;

  const closeSearch = () => {
    setSearchFocused(false);
    if (!filters.projectName.trim()) {
      onFilterChange("projectName", "");
      setOpenFilter(null);
    }
  };

  const clearSearch = () => {
    onFilterChange("projectName", "");
    setOpenFilter(null);
    setSearchFocused(false);
  };

  // ─── Date helpers ───────────────────────────────────────
  const totalDateWidth = monthGroups.reduce((sum, m) => sum + m.weeks.length * CELL_WIDTH, 0);
  const totalWeeks = monthGroups.reduce((sum, m) => sum + m.weeks.length, 0);

  return (
    <div className="sticky top-0 z-20 flex items-stretch bg-white">
      {/* Corner — filter controls */}
      <div
        className="sticky left-0 z-30 bg-white shrink-0 border-b-2 border-r-2 px-2 pb-2"
        style={{ width: leftPanelWidth, minWidth: leftPanelWidth }}
      >
        <div className="text-sm font-bold mb-1 overflow-hidden whitespace-nowrap">controls controls controls controls controls controls controls</div>
        <div className="flex flex-wrap gap-1">
          {/* Toggle: show project details (project view only) */}
          {activeView !== "teammate" && (
            <Chip active={showProjectDetails} activeColor="bg-blue-100" activeTextColor="text-blue-800" onClick={onToggleProjectDetails}>
              Show details
              {showProjectDetails && <ClearButton onClick={onToggleProjectDetails} />}
            </Chip>
          )}

          {/* Search: project name (project view only) */}
          {activeView !== "teammate" && (searchActive ? (
            <div className={`${CHIP_BASE} chip-filter-active bg-orange-100 text-orange-900`}>
              <Search size={12} strokeWidth={4} />
              {searchFocused ? (
                <input
                  className="bg-transparent outline-none w-20 text-xs"
                  value={filters.projectName}
                  onChange={(e) => onFilterChange("projectName", e.target.value)}
                  onBlur={closeSearch}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") {
                      closeSearch();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  autoFocus
                />
              ) : (
                <span className="max-w-[80px] truncate cursor-pointer" onClick={() => setSearchFocused(true)}>
                  {filters.projectName}
                </span>
              )}
              <ClearButton onClick={clearSearch} />
            </div>
          ) : (
            <div className={`${CHIP_BASE} bg-white text-zinc-800`} onClick={() => { setOpenFilter("projectName"); setSearchFocused(true); }}>
              <Search size={12} strokeWidth={4} />
            </div>
          ))}

          {/* Multi-select filters */}
          {filterDefs.map((def) => {
            const label = getChipLabel(def);
            const isOpen = openFilter === def.key;
            return (
              <div key={def.key} className="relative">
                <Chip
                  active={!!label}
                  activeColor={def.activeColor ?? "bg-purple-100"}
                  activeTextColor={def.activeTextColor ?? "text-purple-800"}
                  onClick={() => setOpenFilter(isOpen ? null : def.key)}
                >
                  {label ? (
                    <>
                      <span className="max-w-[120px] truncate">{def.label}: {label}</span>
                      <ClearButton onClick={() => onFilterChange(def.key, new Set<string>())} />
                    </>
                  ) : (
                    def.label
                  )}
                </Chip>
                {isOpen && (
                  <ColumnFilterPopover onClose={() => setOpenFilter(null)} align="left">
                    <MultiSelectFilter
                      options={def.options}
                      selected={filters[def.key]}
                      onChange={(v) => onFilterChange(def.key, v)}
                      searchable={def.searchable}
                    />
                  </ColumnFilterPopover>
                )}
              </div>
            );
          })}

          {/* Toggle: hide alumni (active = filtering teammate status to Active only) */}
          <Chip
            active={filters.teammateStatus.has("Active") && filters.teammateStatus.size === 1}
            activeColor="bg-green-100"
            activeTextColor="text-green-800"
            onClick={() =>
              onFilterChange(
                "teammateStatus",
                filters.teammateStatus.has("Active") && filters.teammateStatus.size === 1
                  ? new Set()
                  : new Set(["Active"])
              )
            }
          >
            Hide alumni
            {filters.teammateStatus.has("Active") && filters.teammateStatus.size === 1 && (
              <ClearButton onClick={() => onFilterChange("teammateStatus", new Set())} />
            )}
          </Chip>

          {/* Totals toggle (both views) */}
          {onToggleShowTotals && (
            <Chip active={!!showTotals} activeColor="bg-blue-100" activeTextColor="text-blue-800" onClick={onToggleShowTotals}>
              Show totals
              {showTotals && <ClearButton onClick={onToggleShowTotals} />}
            </Chip>
          )}
          {/* Totals only toggle */}
          {onToggleTotalsOnly && (
            <Chip active={!!totalsOnly} activeColor="bg-blue-100" activeTextColor="text-blue-800" onClick={onToggleTotalsOnly}>
              Totals only
              {totalsOnly && <ClearButton onClick={onToggleTotalsOnly} />}
            </Chip>
          )}
        </div>
      </div>

      {/* Date columns */}
      <div className="flex flex-col justify-between">
        <div
          className="text-sm font-bold overflow-hidden whitespace-nowrap px-2 pb-2 h-[25px]"
          style={{ width: totalDateWidth }}
        >
          {Array(Math.ceil(totalWeeks * 1.33)).fill("dates").join(" ")}
        </div>
        <div className="flex">
          {monthGroups.map((month) => (
            <div key={month.label} className="overflow-clip" style={{ width: month.weeks.length * CELL_WIDTH }}>
              <div
                className="sticky text-sm font-bold text-left px-2 py-1.5 border-l-2 border-zinc-300 w-fit"
                style={{ left: leftPanelWidth }}
              >
                {month.month === 0 ? `${MONTH_NAMES[0]} ${month.year}` : MONTH_NAMES[month.month]}
              </div>
              <div className="flex">
                {month.weeks.map((ws, wi) => (
                  <div
                    key={ws}
                    className={`text-sm text-center py-1.5 box-border border-b-2 border-b-zinc-400 relative ${
                      wi === 0 ? "border-l-2 border-l-zinc-300" : "border-l border-l-zinc-200"
                    } text-zinc-700`}
                    style={{ width: CELL_WIDTH }}
                  >
                    {isCurrentWeek(ws) && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className={`w-6 h-6 rounded-full ${activeView === "teammate" ? "bg-emerald-700" : "bg-purple-800"}`} />
                      </span>
                    )}
                    <span className={`relative ${isCurrentWeek(ws) ? "text-white font-bold" : ""}`}>
                      {formatWeekLabel(ws)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
