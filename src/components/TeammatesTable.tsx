"use client";
import { useCanEdit } from "@/lib/access";

import { useRef, useState, useCallback, useEffect } from "react";
import type { Teammate } from "./TeammatesSidebar";
import InlineSelect from "./InlineSelect";
import InlineText from "./InlineText";
import {
  TEAMMATE_STATUS_COLORS,
  TEAMMATE_STATUS_ORDER,
} from "@/lib/teammateStatusColors";
import ColumnFilterPopover from "./ColumnFilterPopover";
import TextFilter from "./filters/TextFilter";
import MultiSelectFilter from "./filters/MultiSelectFilter";

type TeammateFilters = {
  name: string;
  email: string;
  role: Set<string>;
  level: Set<string>;
  region: Set<string>;
  status: Set<string>;
};

const EMPTY_FILTERS: TeammateFilters = {
  name: "",
  email: "",
  role: new Set(),
  level: new Set(),
  region: new Set(),
  status: new Set(),
};

function isFilterActive(filters: TeammateFilters): boolean {
  return (
    filters.name !== "" ||
    filters.email !== "" ||
    filters.role.size > 0 ||
    filters.level.size > 0 ||
    filters.region.size > 0 ||
    filters.status.size > 0
  );
}

function isFieldActive(
  filters: TeammateFilters,
  field: keyof TeammateFilters
): boolean {
  const v = filters[field];
  if (v instanceof Set) return v.size > 0;
  return v !== "";
}

const ROLE_OPTIONS = [
  { value: "", label: "—" },
  { value: "DS", label: "DS" },
  { value: "DE", label: "DE" },
  { value: "FSE", label: "FSE" },
  { value: "PM", label: "PM" },
];

const LEVEL_OPTIONS = [
  { value: "", label: "—" },
  { value: "INT", label: "INT" },
  { value: "I", label: "I" },
  { value: "II", label: "II" },
  { value: "III", label: "III" },
  { value: "IV", label: "IV" },
  { value: "AD", label: "AD" },
  { value: "D", label: "D" },
];

const REGION_OPTIONS = [
  { value: "", label: "—" },
  { value: "Global", label: "Global" },
  { value: "IND", label: "IND" },
  { value: "WNA", label: "WNA" },
  { value: "ESA", label: "ESA" },
  { value: "SEA", label: "SEA" },
];

const TEAMMATE_STATUS_OPTIONS = TEAMMATE_STATUS_ORDER.map((s) => ({
  value: s,
  label: s,
}));

const GRID_COLS =
  "grid-cols-[1fr_220px_80px_80px_80px_80px_40px]";

interface Props {
  teammates: Teammate[];
  onUpdate: (id: string, field: string, value: unknown) => void;
  onDelete: (id: string) => void;
  onFilterChange?: (active: boolean, clearFn: () => void) => void;
}

export default function TeammatesTable({
  teammates,
  onUpdate,
  onDelete,
  onFilterChange,
}: Props) {
  const newRowRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<TeammateFilters>({ ...EMPTY_FILTERS });
  const [openFilter, setOpenFilter] = useState<string | null>(null);

  const updateFilter = useCallback(
    <K extends keyof TeammateFilters>(key: K, value: TeammateFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const clearAllFilters = useCallback(
    () => setFilters({ ...EMPTY_FILTERS }),
    []
  );
  const filtersActive = isFilterActive(filters);

  useEffect(() => {
    onFilterChange?.(filtersActive, clearAllFilters);
  }, [filtersActive, clearAllFilters, onFilterChange]);

  const applyFilters = (list: Teammate[]): Teammate[] => {
    return list.filter((t) => {
      if (
        filters.name &&
        !t.name.toLowerCase().includes(filters.name.toLowerCase())
      )
        return false;
      if (
        filters.email &&
        !(t.email ?? "").toLowerCase().includes(filters.email.toLowerCase())
      )
        return false;
      if (filters.role.size > 0 && !filters.role.has(t.role ?? ""))
        return false;
      if (filters.level.size > 0 && !filters.level.has(t.level ?? ""))
        return false;
      if (filters.region.size > 0 && !filters.region.has(t.region ?? ""))
        return false;
      return true;
    });
  };

  const grouped = TEAMMATE_STATUS_ORDER.reduce(
    (acc, status) => {
      if (filters.status.size > 0 && !filters.status.has(status)) {
        acc[status] = [];
      } else {
        acc[status] = applyFilters(
          teammates.filter((t) => t.status === status)
        );
      }
      return acc;
    },
    {} as Record<string, Teammate[]>
  );

  const toggleFilter = (field: string) => {
    setOpenFilter(openFilter === field ? null : field);
  };

  type HeaderCol = {
    field: keyof TeammateFilters;
    label: string;
    align?: "left" | "right";
  };

  const columns: (HeaderCol | null)[] = [
    { field: "name", label: "Name" },
    { field: "email", label: "Email" },
    { field: "role", label: "Role" },
    { field: "level", label: "Level" },
    { field: "region", label: "Region" },
    { field: "status", label: "Status", align: "right" },
    null,
  ];

  const renderFilterContent = (field: keyof TeammateFilters) => {
    switch (field) {
      case "name":
        return (
          <TextFilter
            value={filters.name}
            onChange={(v) => updateFilter("name", v)}
            placeholder="Search name..."
          />
        );
      case "email":
        return (
          <TextFilter
            value={filters.email}
            onChange={(v) => updateFilter("email", v)}
            placeholder="Search email..."
          />
        );
      case "role":
        return (
          <MultiSelectFilter
            options={ROLE_OPTIONS.filter((o) => o.value)}
            selected={filters.role}
            onChange={(v) => updateFilter("role", v)}
          />
        );
      case "level":
        return (
          <MultiSelectFilter
            options={LEVEL_OPTIONS.filter((o) => o.value)}
            selected={filters.level}
            onChange={(v) => updateFilter("level", v)}
          />
        );
      case "region":
        return (
          <MultiSelectFilter
            options={REGION_OPTIONS.filter((o) => o.value)}
            selected={filters.region}
            onChange={(v) => updateFilter("region", v)}
          />
        );
      case "status":
        return (
          <MultiSelectFilter
            options={TEAMMATE_STATUS_OPTIONS}
            selected={filters.status}
            onChange={(v) => updateFilter("status", v)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 bg-white">
      <div className="min-w-[700px]">
        {/* Table header */}
        <div
          className={`sticky top-0 z-20 ${GRID_COLS} grid border-y-2 border-zinc-900 bg-white text-sm font-bold text-zinc-900 overflow-visible divide-x-2 divide-zinc-900 before:content-[''] before:absolute before:-top-6 before:-left-1 before:-right-1 before:h-5.5 before:bg-white before:-z-10`}
        >
          {columns.map((col, i) =>
            col ? (
              <div
                key={col.field}
                className="relative px-2 py-2 text-left flex items-center gap-1 hover:bg-emerald-50 transition-colors cursor-pointer select-none"
                onClick={() => toggleFilter(col.field)}
              >
                {col.label}
                {isFieldActive(filters, col.field) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0" />
                )}
                {openFilter === col.field && (
                  <ColumnFilterPopover
                    onClose={() => setOpenFilter(null)}
                    align={
                      col.align ??
                      (i >= columns.length - 3 ? "right" : "left")
                    }
                  >
                    {renderFilterContent(col.field)}
                  </ColumnFilterPopover>
                )}
              </div>
            ) : (
              <div key="delete" className="px-2 py-2" />
            )
          )}
        </div>

        {/* Grouped rows */}
        {Object.entries(grouped).map(([status, items]) => {
          if (items.length === 0) return null;
          const colors =
            TEAMMATE_STATUS_COLORS[
              status as keyof typeof TEAMMATE_STATUS_COLORS
            ];

          return (
            <div key={status} className="relative bg-white">
              <div className="sticky top-[37px] z-10 pointer-events-none py-1.5">
                <span
                  className={`inline-block rounded-md border-2 ml-1 px-2.5 py-0.5 text-xs font-bold shadow-sm ${colors.chip}`}
                >
                  {status}
                </span>
                <span className="text-xs text-zinc-400 ml-1.5">
                  {items.length}
                </span>
              </div>

              <div className={`overflow-hidden`}>
                {items.map((teammate, idx) => (
                  <TeammateRow
                    key={teammate.id}
                    teammate={teammate}
                    idx={idx}
                    rowBg={colors.rowBg}
                    rowBgAlt={colors.rowBgAlt}
                    newRowRef={newRowRef}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeammateRow({
  teammate,
  idx,
  rowBg,
  rowBgAlt,
  newRowRef,
  onUpdate,
  onDelete,
}: {
  teammate: Teammate;
  idx: number;
  rowBg: string;
  rowBgAlt: string;
  newRowRef: React.RefObject<HTMLInputElement | null>;
  onUpdate: (id: string, field: string, value: unknown) => void;
  onDelete: (id: string) => void;
}) {
  const canEdit = useCanEdit();
  const [confirming, setConfirming] = useState(false);
  const isDraft = teammate.id.startsWith("temp-");

  return (
    <div
      className={`grid ${GRID_COLS} gap-px transition-colors ${
        confirming
          ? "bg-rose-50"
          : isDraft
            ? "bg-amber-50"
            : idx % 2 === 0
              ? rowBg
              : rowBgAlt
      }`}
    >
      {confirming ? (
        <div className="col-span-full flex items-center gap-2 px-3 py-2">
          <span className="text-sm text-rose-700 mr-auto">
            Delete <strong>{teammate.name || "this teammate"}</strong>?
          </span>
          <button
            onClick={() => onDelete(teammate.id)}
            className="btn-chunky rounded-md bg-rose-500 px-2.5 py-1 text-xs font-bold text-white"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="btn-chunky rounded-md bg-white px-2.5 py-1 text-xs font-bold text-zinc-600"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <InlineText
            ref={isDraft ? newRowRef : undefined}
            value={teammate.name}
            placeholder="Enter name..."
            onSave={(v) => {
              if (v.trim()) onUpdate(teammate.id, "name", v.trim());
            }}
            autoFocus={isDraft}
          />
          <InlineText
            value={teammate.email ?? ""}
            placeholder="—"
            onSave={(v) => onUpdate(teammate.id, "email", v || null)}
          />
          <InlineSelect
            value={teammate.role ?? ""}
            options={ROLE_OPTIONS}
            onSave={(v) => onUpdate(teammate.id, "role", v || null)}
            disabled={isDraft}
          />
          <InlineSelect
            value={teammate.level ?? ""}
            options={LEVEL_OPTIONS}
            onSave={(v) => onUpdate(teammate.id, "level", v || null)}
            disabled={isDraft}
          />
          <InlineSelect
            value={teammate.region ?? ""}
            options={REGION_OPTIONS}
            onSave={(v) => onUpdate(teammate.id, "region", v || null)}
            disabled={isDraft}
          />
          <InlineSelect
            value={teammate.status}
            options={TEAMMATE_STATUS_OPTIONS.map((o) => ({
              ...o,
              label: o.label,
            }))}
            onSave={(v) => onUpdate(teammate.id, "status", v)}
            disabled={isDraft}
          />
          {canEdit && (
          <button
            onClick={() => setConfirming(true)}
            className="flex items-center justify-center text-zinc-300 hover:text-rose-500 transition-colors px-2"
            title="Delete teammate"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
              />
            </svg>
          </button>
          )}
        </>
      )}
    </div>
  );
}
