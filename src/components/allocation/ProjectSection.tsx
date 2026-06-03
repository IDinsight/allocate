"use client";

import { useState, useRef, useEffect } from "react";
import type { Project } from "@/components/ProjectsSidebar";
import type { Teammate } from "@/components/TeammatesSidebar";
import AllocationCell from "./AllocationCell";
import TotalsCell from "./TotalsCell";
import useDragToFill from "@/hooks/useDragToFill";
import { STATUS_COLORS } from "@/lib/statusColors";
import { Plus } from "lucide-react";

const CELL_WIDTH = 56;

export const PROJECT_INFO_WIDTH = 200;
export const TEAMMATE_NAME_WIDTH = 90;
const ROW_HEIGHT = 28;

export type Allocation = {
  id: string;
  teammateId: string;
  projectId: string;
  weekStart: string;
  fraction: number;
  isHidden: boolean;
};

interface Props {
  project: Project;
  teammates: Teammate[];
  weekStarts: string[];
  allocationMap: Map<string, Allocation>;
  teammateTotals: Map<string, number>;
  bgColor: string;
  monthBoundaries: Set<string>;
  teammateStatusFilter?: Set<string>;
  teammateIdFilter?: Set<string>;
  teammateRoleFilter?: Set<string>;
  teammateLevelFilter?: Set<string>;
  showProjectDetails?: boolean;
  showTotals?: boolean;
  totalsOnly?: boolean;
  projectTotals?: Map<string, number>;
  addedPairs?: Set<string>;
  onCellEdit: (
    projectId: string,
    teammateId: string,
    weekStart: string,
    fraction: number | null,
    existingId: string | undefined
  ) => void;
  onAddTeammate?: (projectId: string, teammateId: string) => void;
  onRemovePair?: (projectId: string, teammateId: string) => void;
}

export default function ProjectSection({
  project,
  teammates,
  weekStarts,
  allocationMap,
  teammateTotals,
  bgColor,
  monthBoundaries,
  teammateStatusFilter,
  teammateIdFilter,
  teammateRoleFilter,
  teammateLevelFilter,
  showProjectDetails,
  showTotals,
  totalsOnly,
  projectTotals,
  addedPairs,
  onCellEdit,
  onAddTeammate,
  onRemovePair,
}: Props) {
  const [hovering, setHovering] = useState(false);
  const [adding, setAdding] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const drag = useDragToFill({ weekStarts, cellWidth: CELL_WIDTH });

  useEffect(() => {
    if (adding && selectRef.current) {
      selectRef.current.focus();
    }
  }, [adding]);

  const teammateIds = new Set<string>();
  for (const ws of weekStarts) {
    for (const t of teammates) {
      if (allocationMap.has(`${project.id}|${t.id}|${ws}`)) {
        teammateIds.add(t.id);
      }
    }
  }

  // Include teammates added manually via the + button
  if (addedPairs) {
    for (const t of teammates) {
      if (addedPairs.has(`${project.id}|${t.id}`)) {
        teammateIds.add(t.id);
      }
    }
  }

  let projectTeammates = teammates.filter((t) => teammateIds.has(t.id));
  if (teammateStatusFilter && teammateStatusFilter.size > 0) {
    projectTeammates = projectTeammates.filter((t) => teammateStatusFilter.has(t.status));
  }
  if (teammateIdFilter && teammateIdFilter.size > 0) {
    projectTeammates = projectTeammates.filter((t) => teammateIdFilter.has(t.id));
  }
  if (teammateRoleFilter && teammateRoleFilter.size > 0) {
    projectTeammates = projectTeammates.filter((t) => teammateRoleFilter.has(t.role ?? ""));
  }
  if (teammateLevelFilter && teammateLevelFilter.size > 0) {
    projectTeammates = projectTeammates.filter((t) => teammateLevelFilter.has(t.level ?? ""));
  }
  // When an explicit team filter (Team/Role/Level) is active, hide projects with
  // no matching teammate (mirrors TeammateSection hiding teammates with no
  // matching projects). Status is excluded on purpose: "Hide alumni" is a
  // row-level toggle and must not collapse projects that have nobody assigned.
  const hasTeammateFilter =
    (teammateIdFilter?.size ?? 0) > 0 ||
    (teammateRoleFilter?.size ?? 0) > 0 ||
    (teammateLevelFilter?.size ?? 0) > 0;
  if (hasTeammateFilter && projectTeammates.length === 0 && !adding) return null;
  const statusColors = STATUS_COLORS[project.status as keyof typeof STATUS_COLORS];

  // Teammates available to add (not already on this project)
  const availableTeammates = teammates
    .filter((t) => !teammateIds.has(t.id) && t.status === "Active")
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleSelectTeammate = (teammateId: string) => {
    setAdding(false);
    if (teammateId && onAddTeammate) {
      onAddTeammate(project.id, teammateId);
    }
  };

  return (
    <div
      data-alloc-section
      className={`${totalsOnly ? "mt-0" : "mt-5"} border-t-2 border-zinc-200 flex`}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Project info — sticky left, spans full height of this section */}
      <div
        className="sticky left-0 z-10 shrink-0 border-r border-zinc-200 px-3 py-1 relative"
        style={{ width: PROJECT_INFO_WIDTH, minWidth: PROJECT_INFO_WIDTH, minHeight: ROW_HEIGHT, backgroundColor: "white" }}
        onMouseEnter={() => setHovering(true)}
      >
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-md text-zinc-900 leading-tight">
            {project.name}
          </span>
          {showProjectDetails && (
            <>
              <span className="text-sm text-zinc-500 leading-tight">
                {[project.region, project.billingRate].filter(Boolean).join(", ")}
              </span>
              {project.lead && (
                <span className="text-sm font-bold text-violet-700 leading-tight">
                  ★ {project.lead.name}
                </span>
              )}
              {statusColors && (
                <span className={`self-start text-sm font-bold px-2 py-0.5 rounded-md border mt-1 ${statusColors.chip}`}>
                  {project.status}
                </span>
              )}
            </>
          )}
        </div>

        {/* Add teammate button — appears on hover, aligned with last row */}
        {hovering && !adding && !totalsOnly && availableTeammates.length > 0 && (
          <button
            onClick={() => setAdding(true)}
            className="btn-chunky btn-chunky-muted absolute bottom-2 right-2 rounded"
            title="Add teammate"
          >
            <Plus size={12} />
          </button>
        )}
      </div>

      {/* Teammate rows + allocation grid */}
      <div className="flex flex-col flex-1">
        {!totalsOnly && projectTeammates.map((teammate) => {
          const isUnsaved = addedPairs?.has(`${project.id}|${teammate.id}`) &&
            !weekStarts.some((ws) => allocationMap.has(`${project.id}|${teammate.id}|${ws}`));

          return (
            <div key={teammate.id} data-alloc-row className="flex" style={{ height: ROW_HEIGHT }}>
              <div
                className={`group/name sticky z-10 shrink-0 flex items-center px-2 text-sm font-medium truncate text-zinc-700 border-r-2 border-r-zinc-900 ${isUnsaved ? "italic" : ""
                  }`}
                style={{
                  left: PROJECT_INFO_WIDTH,
                  width: TEAMMATE_NAME_WIDTH,
                  minWidth: TEAMMATE_NAME_WIDTH,
                  background: isUnsaved ? "rgb(229, 229, 229)" : "white",
                  borderBottomWidth: isUnsaved ? 2 : 1,
                  borderBottomStyle: isUnsaved ? "dashed" : "solid",
                  borderBottomColor: isUnsaved ? "rgb(106, 106, 106)" : "#e4e4e7",
                }}
                onMouseEnter={() => setHovering(true)}
              >
                <span className="truncate">{teammate.name}</span>
                {isUnsaved && onRemovePair && (
                  <button
                    className="hidden group-hover/name:flex items-center justify-center ml-auto shrink-0 w-4 h-4 rounded text-zinc-500 hover:text-red-600 hover:bg-red-100"
                    onClick={() => onRemovePair(project.id, teammate.id)}
                    title="Remove"
                  >
                    ×
                  </button>
                )}
              </div>

              <div
                className="flex"
                style={{ backgroundColor: bgColor }}
                onMouseEnter={() => setHovering(false)}
                onMouseDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const idx = Math.floor((e.clientX - rect.left) / CELL_WIDTH);
                  const ws = weekStarts[idx];
                  if (!ws) return;
                  const alloc = allocationMap.get(`${project.id}|${teammate.id}|${ws}`);
                  drag.onMouseDown(e, idx, alloc?.fraction, `${project.id}|${teammate.id}`);
                }}
                onMouseMove={drag.onMouseMove}
                onMouseUp={() => {
                  const fills = drag.onMouseUp();
                  if (!fills) return;
                  for (const { index, fraction: frac } of fills) {
                    const ws = weekStarts[index];
                    const existing = allocationMap.get(`${project.id}|${teammate.id}|${ws}`);
                    if (existing?.fraction === frac) continue;
                    onCellEdit(project.id, teammate.id, ws, frac, existing?.id);
                  }
                }}
                onClickCapture={drag.onClickCapture}
              >
                {weekStarts.map((ws, idx) => {
                  const key = `${project.id}|${teammate.id}|${ws}`;
                  const rowKey = `${project.id}|${teammate.id}`;
                  const alloc = allocationMap.get(key);
                  return (
                    <AllocationCell
                      key={ws}
                      colIndex={idx}
                      fraction={alloc?.fraction}
                      teammateTotal={teammateTotals.get(`${teammate.id}|${ws}`)}
                      isMonthStart={monthBoundaries.has(ws)}
                      unsaved={isUnsaved}
                      previewFraction={drag.dragRowKey === rowKey ? drag.previewMap.get(idx) : undefined}
                      onEdit={(val) =>
                        onCellEdit(project.id, teammate.id, ws, val, alloc?.id)
                      }
                    />
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Add teammate row — appears when adding */}
        {!totalsOnly && adding && (
          <div className="flex" style={{ height: ROW_HEIGHT }}>
            <div
              className="sticky z-10 shrink-0 flex items-center border-b border-zinc-200 border-r-2 border-r-zinc-900"
              style={{ left: PROJECT_INFO_WIDTH, width: TEAMMATE_NAME_WIDTH, minWidth: TEAMMATE_NAME_WIDTH, background: "white" }}
            >
              <select
                ref={selectRef}
                className="w-full h-full text-sm px-1 outline-none bg-violet-50 cursor-pointer"
                defaultValue=""
                onChange={(e) => handleSelectTeammate(e.target.value)}
                onBlur={() => setAdding(false)}
              >
                <option value="" disabled>
                  Select
                </option>
                {availableTeammates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Empty cells for the new row */}
            <div className="flex" style={{ backgroundColor: "rgb(248, 248, 248)" }} onMouseEnter={() => setHovering(false)}>
              {weekStarts.map((ws) => (
                <div
                  key={ws}
                  className={`box-border border-b border-b-zinc-200 ${monthBoundaries.has(ws) ? "border-l-2 border-l-zinc-300" : "border-l border-l-zinc-200"
                    }`}
                  style={{ width: 56, minWidth: 56, height: ROW_HEIGHT }}
                />
              ))}
            </div>
          </div>
        )}

        {/* TOTAL row */}
        {showTotals && projectTotals && (
          <div className="flex" style={{ height: ROW_HEIGHT }}>
            <div
              className={`sticky z-10 shrink-0 flex items-center justify-end px-2 text-xs font-bold text-zinc-500 uppercase tracking-wide border-r-2 border-r-zinc-900 ${totalsOnly ? "" : "border-b-2 border-b-zinc-200"}`}
              style={{ left: PROJECT_INFO_WIDTH, width: TEAMMATE_NAME_WIDTH, minWidth: TEAMMATE_NAME_WIDTH, background: "white" }}
              onMouseEnter={() => setHovering(true)}
            >
              {!totalsOnly && "Total"}
            </div>
            <div className="flex" onMouseEnter={() => setHovering(false)}>
              {weekStarts.map((ws) => (
                <TotalsCell
                  key={ws}
                  fraction={projectTotals.get(`${project.id}|${ws}`)}
                  isMonthStart={monthBoundaries.has(ws)}
                  noBorder={totalsOnly}
                  variant="intensity"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
