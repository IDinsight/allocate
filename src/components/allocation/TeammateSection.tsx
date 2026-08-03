"use client";

import { useState, useRef, useEffect } from "react";
import type { Project } from "@/components/ProjectsSidebar";
import type { Teammate } from "@/components/TeammatesSidebar";
import type { Allocation } from "./ProjectSection";
import AllocationCell from "./AllocationCell";
import TotalsCell from "./TotalsCell";
import useDragToFill from "@/hooks/useDragToFill";
import { useCanEdit } from "@/lib/access";
import { Plus } from "lucide-react";

export const TEAMMATE_INFO_WIDTH = 140;
export const PROJECT_NAME_WIDTH = 240;
const ROW_HEIGHT = 28;
const CELL_WIDTH = 56;

interface Props {
  teammate: Teammate;
  projects: Project[];
  weekStarts: string[];
  allocationMap: Map<string, Allocation>;
  teammateTotals: Map<string, number>;
  bgColor: string;
  monthBoundaries: Set<string>;
  projectStatusFilter?: Set<string>;
  projectLeadIdFilter?: Set<string>;
  projectNameFilter?: string;
  addedPairs?: Set<string>;
  showTotals?: boolean;
  totalsOnly?: boolean;
  onCellEdit: (
    projectId: string,
    teammateId: string,
    weekStart: string,
    fraction: number | null,
    existingId: string | undefined
  ) => void;
  onAddProject?: (teammateId: string, projectId: string) => void;
  onRemovePair?: (projectId: string, teammateId: string) => void;
}

export default function TeammateSection({
  teammate,
  projects,
  weekStarts,
  allocationMap,
  teammateTotals,
  bgColor,
  monthBoundaries,
  projectStatusFilter,
  projectLeadIdFilter,
  projectNameFilter,
  showTotals = true,
  totalsOnly = false,
  addedPairs,
  onCellEdit,
  onAddProject,
  onRemovePair,
}: Props) {
  const canEdit = useCanEdit();
  const [hovering, setHovering] = useState(false);
  const [adding, setAdding] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const drag = useDragToFill({ weekStarts, cellWidth: CELL_WIDTH });

  useEffect(() => {
    if (adding && selectRef.current) {
      selectRef.current.focus();
    }
  }, [adding]);

  // Collect projects this teammate is allocated to
  const projectIds = new Set<string>();
  for (const ws of weekStarts) {
    for (const p of projects) {
      if (allocationMap.has(`${p.id}|${teammate.id}|${ws}`)) {
        projectIds.add(p.id);
      }
    }
  }

  // Include projects added manually via the + button
  if (addedPairs) {
    for (const p of projects) {
      if (addedPairs.has(`${p.id}|${teammate.id}`)) {
        projectIds.add(p.id);
      }
    }
  }

  let teammateProjects = projects.filter((p) => projectIds.has(p.id));
  if (projectStatusFilter && projectStatusFilter.size > 0) {
    teammateProjects = teammateProjects.filter((p) => projectStatusFilter.has(p.status));
  }
  if (projectLeadIdFilter && projectLeadIdFilter.size > 0) {
    teammateProjects = teammateProjects.filter((p) => projectLeadIdFilter.has(p.leadId ?? ""));
  }
  if (projectNameFilter) {
    const search = projectNameFilter.toLowerCase();
    teammateProjects = teammateProjects.filter((p) => p.name.toLowerCase().includes(search));
  }
  if (teammateProjects.length === 0 && !adding) return null;

  // Projects available to add (not already assigned, Active status)
  const availableProjects = projects
    .filter((p) => !projectIds.has(p.id) && p.status === "Active")
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleSelectProject = (projectId: string) => {
    setAdding(false);
    if (projectId && onAddProject) {
      onAddProject(teammate.id, projectId);
    }
  };

  return (
    <div
      data-alloc-section
      className={`${totalsOnly ? "mt-0" : "mt-5"} border-t-2 border-zinc-200 flex`}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Teammate info — sticky left, spans full height */}
      <div
        className="sticky left-0 z-10 shrink-0 border-r border-zinc-200 px-3 py-1 relative"
        style={{ width: TEAMMATE_INFO_WIDTH, minWidth: TEAMMATE_INFO_WIDTH, minHeight: ROW_HEIGHT, backgroundColor: "white" }}
        onMouseEnter={() => setHovering(true)}
      >
        <div className="flex flex-row items-end gap-1">
          <span className="text-md font-semibold text-zinc-900 leading-tight">
            {teammate.name}
          </span>
          <span className="text-sm font-semibold text-zinc-400 leading-tight">
            {[teammate.role, teammate.level].filter(Boolean).join(" ")}
          </span>
        </div>

        {/* Add project button — appears on hover */}
        {canEdit && hovering && !adding && !totalsOnly && availableProjects.length > 0 && (
          <button
            onClick={() => setAdding(true)}
            className="btn-chunky btn-chunky-muted absolute bottom-9 right-2 rounded"
            title="Add project"
          >
            <Plus size={12} />
          </button>
        )}
      </div>

      {/* Rows: TOTAL + project rows + add row */}
      <div className="flex flex-col flex-1">

        {/* Project rows (hidden when totalsOnly) */}
        {!totalsOnly && teammateProjects.map((project) => {
          const isUnsaved = addedPairs?.has(`${project.id}|${teammate.id}`) &&
            !weekStarts.some((ws) => allocationMap.has(`${project.id}|${teammate.id}|${ws}`));

          return (
            <div key={project.id} data-alloc-row className="flex" style={{ height: ROW_HEIGHT }}>
              <div
                className={`group/name sticky z-10 shrink-0 flex items-center px-2 text-sm font-medium truncate text-zinc-700 border-r-2 border-r-zinc-900 ${isUnsaved ? "italic" : ""}`}
                style={{
                  left: TEAMMATE_INFO_WIDTH,
                  width: PROJECT_NAME_WIDTH,
                  minWidth: PROJECT_NAME_WIDTH,
                  background: isUnsaved ? "rgb(229, 229, 229)" : "white",
                  borderBottomWidth: isUnsaved ? 2 : 1,
                  borderBottomStyle: isUnsaved ? "dashed" : "solid",
                  borderBottomColor: isUnsaved ? "rgb(106, 106, 106)" : "#e4e4e7",
                }}
                onMouseEnter={() => setHovering(true)}
              >
                <span className="truncate">{project.name}</span>
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
                  if (!canEdit) return;
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

        {/* Add project row — appears when adding (not in totals-only mode) */}
        {!totalsOnly && adding && (
          <div className="flex" style={{ height: ROW_HEIGHT }}>
            <div
              className="sticky z-10 shrink-0 flex items-center border-b border-zinc-200 border-r-2 border-r-zinc-900"
              style={{ left: TEAMMATE_INFO_WIDTH, width: PROJECT_NAME_WIDTH, minWidth: PROJECT_NAME_WIDTH, background: "white" }}
            >
              <select
                ref={selectRef}
                className="w-full h-full text-sm px-1 outline-none bg-violet-50 cursor-pointer"
                defaultValue=""
                onChange={(e) => handleSelectProject(e.target.value)}
                onBlur={() => setAdding(false)}
              >
                <option value="" disabled>Select</option>
                {availableProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="flex" style={{ backgroundColor: "rgb(248, 248, 248)" }} onMouseEnter={() => setHovering(false)}>
              {weekStarts.map((ws) => (
                <div
                  key={ws}
                  className={`box-border border-b border-b-zinc-200 ${monthBoundaries.has(ws) ? "border-l-2 border-l-zinc-300" : "border-l border-l-zinc-200"}`}
                  style={{ width: 56, minWidth: 56, height: ROW_HEIGHT }}
                />
              ))}
            </div>
          </div>
        )}

        {/* TOTAL row */}
        {showTotals && (
          <div className="flex" style={{ height: ROW_HEIGHT }}>
            <div
              className={`sticky z-10 shrink-0 flex items-center justify-end px-2 text-xs font-bold text-zinc-500 uppercase tracking-wide border-r-2 border-r-zinc-900 ${totalsOnly ? "" : "border-b-2 border-b-zinc-200"}`}
              style={{ left: TEAMMATE_INFO_WIDTH, width: PROJECT_NAME_WIDTH, minWidth: PROJECT_NAME_WIDTH, background: "white" }}
              onMouseEnter={() => setHovering(true)}
            >
              {!totalsOnly && `${teammate.name} Total`}
            </div>
            <div className="flex" onMouseEnter={() => setHovering(false)}>
              {weekStarts.map((ws) => (
                <TotalsCell
                  key={ws}
                  fraction={teammateTotals.get(`${teammate.id}|${ws}`)}
                  isMonthStart={monthBoundaries.has(ws)}
                  noBorder={totalsOnly}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
