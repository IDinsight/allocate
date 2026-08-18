"use client";
import { useCanEdit } from "@/lib/access";

import { useRef, useState, useCallback, useEffect } from "react";
import type { Project } from "./ProjectsSidebar";
import InlineSelect from "./InlineSelect";
import InlineText from "./InlineText";
import InlineDate from "./InlineDate";
import InlineBlurb from "./InlineBlurb";
import { STATUS_COLORS, STATUS_ORDER } from "@/lib/statusColors";
import ColumnFilterPopover from "./ColumnFilterPopover";
import TextFilter from "./filters/TextFilter";
import MultiSelectFilter from "./filters/MultiSelectFilter";
import DateRangeFilter from "./filters/DateRangeFilter";

type Teammate = { id: string; name: string };

type ProjectFilters = {
  name: string;
  pillar: Set<string>;
  region: Set<string>;
  billingRate: Set<string>;
  status: Set<string>;
  conversionProbability: Set<string>;
  billable: Set<string>;
  unit4Code: string;
  startDate: { from: string; to: string };
  endDate: { from: string; to: string };
  blurb: string;
  leadId: Set<string>;
};

const EMPTY_FILTERS: ProjectFilters = {
  name: "",
  pillar: new Set(),
  region: new Set(),
  billingRate: new Set(),
  status: new Set(),
  conversionProbability: new Set(),
  billable: new Set(),
  unit4Code: "",
  startDate: { from: "", to: "" },
  endDate: { from: "", to: "" },
  blurb: "",
  leadId: new Set(),
};

function isFilterActive(filters: ProjectFilters): boolean {
  return (
    filters.name !== "" ||
    filters.pillar.size > 0 ||
    filters.region.size > 0 ||
    filters.billingRate.size > 0 ||
    filters.status.size > 0 ||
    filters.conversionProbability.size > 0 ||
    filters.billable.size > 0 ||
    filters.unit4Code !== "" ||
    filters.startDate.from !== "" || filters.startDate.to !== "" ||
    filters.endDate.from !== "" || filters.endDate.to !== "" ||
    filters.blurb !== "" ||
    filters.leadId.size > 0
  );
}

function isFieldActive(filters: ProjectFilters, field: keyof ProjectFilters): boolean {
  const v = filters[field];
  if (v instanceof Set) return v.size > 0;
  if (field === "startDate" || field === "endDate") {
    const d = v as { from: string; to: string };
    return d.from !== "" || d.to !== "";
  }
  if (field === "billable") return v !== "all";
  return v !== "";
}

const PILLAR_OPTIONS = [
  { value: "", label: "—" },
  { value: "Products", label: "Products" },
  { value: "Services", label: "Services" },
  { value: "Advisory", label: "Advisory" },
  { value: "Internal", label: "Internal" },
  { value: "Admin", label: "Admin" },
];

const REGION_OPTIONS = [
  { value: "", label: "—" },
  { value: "Global", label: "Global" },
  { value: "IND", label: "IND" },
  { value: "WNA", label: "WNA" },
  { value: "ESA", label: "ESA" },
  { value: "SEA", label: "SEA" },
];

const BILLING_RATE_OPTIONS = [
  { value: "", label: "—" },
  { value: "Internal", label: "Internal" },
  { value: "L1", label: "L1" },
  { value: "Fractional", label: "Fractional" },
  { value: "CoImpact", label: "Co-Impact" },
  { value: "Standard", label: "Standard" },
];

const STATUS_OPTIONS = STATUS_ORDER.map((s) => ({ value: s, label: s }));

const CONV_PROB_OPTIONS = [
  { value: "", label: "—" },
  { value: "10", label: "10%" },
  { value: "20", label: "20%" },
  { value: "30", label: "30%" },
  { value: "40", label: "40%" },
  { value: "50", label: "50%" },
  { value: "60", label: "60%" },
  { value: "70", label: "70%" },
  { value: "80", label: "80%" },
  { value: "90", label: "90%" },
  { value: "100", label: "100%" },
];

const BILLABLE_OPTIONS = [
  { value: "false", label: "No" },
  { value: "true", label: "Yes" },
];

interface Props {
  projects: Project[];
  teammates: Teammate[];
  onUpdate: (id: string, field: string, value: unknown) => void;
  onDelete: (id: string) => void;
  onFilterChange?: (active: boolean, clearFn: () => void) => void;
}

export default function ProjectsTable({
  projects,
  teammates,
  onUpdate,
  onDelete,
  onFilterChange,
}: Props) {
  const newRowRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<ProjectFilters>({ ...EMPTY_FILTERS });
  const [openFilter, setOpenFilter] = useState<string | null>(null);

  const updateFilter = useCallback(
    <K extends keyof ProjectFilters>(key: K, value: ProjectFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const clearAllFilters = useCallback(() => setFilters({ ...EMPTY_FILTERS }), []);
  const filtersActive = isFilterActive(filters);

  useEffect(() => {
    onFilterChange?.(filtersActive, clearAllFilters);
  }, [filtersActive, clearAllFilters, onFilterChange]);

  const applyFilters = (list: Project[]): Project[] => {
    return list.filter((p) => {
      if (filters.name && !p.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
      if (filters.pillar.size > 0 && !filters.pillar.has(p.pillar ?? "")) return false;
      if (filters.region.size > 0 && !filters.region.has(p.region ?? "")) return false;
      if (filters.billingRate.size > 0 && !filters.billingRate.has(p.billingRate ?? "")) return false;
      if (filters.conversionProbability.size > 0 && !filters.conversionProbability.has(String(p.conversionProbability ?? ""))) return false;
      if (filters.billable.size > 0 && !filters.billable.has(String(p.billable))) return false;
      if (filters.unit4Code && !(p.unit4Code ?? "").toLowerCase().includes(filters.unit4Code.toLowerCase())) return false;
      if (filters.startDate.from || filters.startDate.to) {
        const d = p.startDate ? p.startDate.slice(0, 10) : "";
        if (!d) return false;
        if (filters.startDate.from && d < filters.startDate.from) return false;
        if (filters.startDate.to && d > filters.startDate.to) return false;
      }
      if (filters.endDate.from || filters.endDate.to) {
        const d = p.endDate ? p.endDate.slice(0, 10) : "";
        if (!d) return false;
        if (filters.endDate.from && d < filters.endDate.from) return false;
        if (filters.endDate.to && d > filters.endDate.to) return false;
      }
      if (filters.blurb && !(p.blurb ?? "").toLowerCase().includes(filters.blurb.toLowerCase())) return false;
      if (filters.leadId.size > 0 && !filters.leadId.has(p.leadId ?? "")) return false;
      return true;
    });
  };

  const grouped = STATUS_ORDER.reduce(
    (acc, status) => {
      if (filters.status.size > 0 && !filters.status.has(status)) {
        acc[status] = [];
      } else {
        acc[status] = applyFilters(projects.filter((p) => p.status === status));
      }
      return acc;
    },
    {} as Record<string, Project[]>
  );

  const leadOptions = [
    { value: "", label: "—" },
    ...teammates.map((t) => ({ value: t.id, label: t.name })),
  ];

  const leadFilterOptions = teammates.map((t) => ({ value: t.id, label: t.name }));

  const toggleFilter = (field: string) => {
    setOpenFilter(openFilter === field ? null : field);
  };

  type HeaderCol = {
    field: keyof ProjectFilters;
    label: string;
    align?: "left" | "right";
  };

  const columns: (HeaderCol | null)[] = [
    { field: "name", label: "Name" },
    { field: "leadId", label: "Lead" },
    { field: "pillar", label: "Pillar" },
    { field: "region", label: "Region" },
    { field: "billingRate", label: "Rate" },
    { field: "status", label: "Status" },
    { field: "conversionProbability", label: "Prob%" },
    { field: "billable", label: "Billable" },
    { field: "unit4Code", label: "U4 Code" },
    { field: "startDate", label: "Start" },
    { field: "endDate", label: "End" },
    { field: "blurb", label: "Blurb" },
    null, // delete column
  ];

  const renderFilterContent = (field: keyof ProjectFilters) => {
    switch (field) {
      case "name":
        return <TextFilter value={filters.name} onChange={(v) => updateFilter("name", v)} placeholder="Search name..." />;
      case "unit4Code":
        return <TextFilter value={filters.unit4Code} onChange={(v) => updateFilter("unit4Code", v)} placeholder="Search code..." />;
      case "pillar":
        return <MultiSelectFilter options={PILLAR_OPTIONS.filter((o) => o.value)} selected={filters.pillar} onChange={(v) => updateFilter("pillar", v)} />;
      case "region":
        return <MultiSelectFilter options={REGION_OPTIONS.filter((o) => o.value)} selected={filters.region} onChange={(v) => updateFilter("region", v)} />;
      case "billingRate":
        return <MultiSelectFilter options={BILLING_RATE_OPTIONS.filter((o) => o.value)} selected={filters.billingRate} onChange={(v) => updateFilter("billingRate", v)} />;
      case "status":
        return <MultiSelectFilter options={STATUS_OPTIONS} selected={filters.status} onChange={(v) => updateFilter("status", v)} />;
      case "conversionProbability":
        return <MultiSelectFilter options={CONV_PROB_OPTIONS.filter((o) => o.value)} selected={filters.conversionProbability} onChange={(v) => updateFilter("conversionProbability", v)} />;
      case "billable":
        return <MultiSelectFilter options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} selected={filters.billable} onChange={(v) => updateFilter("billable", v)} />;
      case "startDate":
        return <DateRangeFilter from={filters.startDate.from} to={filters.startDate.to} onChange={(f, t) => updateFilter("startDate", { from: f, to: t })} />;
      case "endDate":
        return <DateRangeFilter from={filters.endDate.from} to={filters.endDate.to} onChange={(f, t) => updateFilter("endDate", { from: f, to: t })} />;
      case "blurb":
        return <TextFilter value={filters.blurb} onChange={(v) => updateFilter("blurb", v)} placeholder="Search blurb..." />;
      case "leadId":
        return <MultiSelectFilter options={leadFilterOptions} selected={filters.leadId} onChange={(v) => updateFilter("leadId", v)} searchable />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">

      {/* Fixed-width table — sidebar handles scrolling */}
      <div className="min-w-[1390px]">

      {/* Table header — before pseudo-element covers content scrolling above */}
      <div className="sticky top-0 z-20 grid grid-cols-[220px_120px_100px_80px_100px_100px_70px_70px_100px_110px_110px_150px_40px] border-y-2 border-zinc-900 bg-white text-sm font-bold text-zinc-900 overflow-visible divide-x-2 divide-zinc-900 before:content-[''] before:absolute before:-top-6 before:-left-1 before:-right-1 before:h-5.5 before:bg-white">
        {columns.map((col, i) =>
          col ? (
            <div
              key={col.field}
              className="relative px-2 py-2 text-left flex items-center gap-1 hover:bg-violet-100 transition-colors cursor-pointer select-none"
              onClick={() => toggleFilter(col.field)}
            >
              {col.label}
              {isFieldActive(filters, col.field) && (
                <span className="w-1.5 h-1.5 rounded-full bg-violet-600 shrink-0" />
              )}
              {openFilter === col.field && (
                <ColumnFilterPopover
                  onClose={() => setOpenFilter(null)}
                  align={col.align ?? (i >= columns.length - 3 ? "right" : "left")}
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
        const colors = STATUS_COLORS[status as keyof typeof STATUS_COLORS];

        return (
          <div key={status} className="relative bg-white">
            {/* Group label — floating chip */}
            <div className="sticky top-[37px] z-10 pointer-events-none py-1.5">
              <span
                className={`inline-block rounded-md border-2 ml-1 px-2.5 py-0.5 text-xs font-bold shadow-sm ${colors.chip}`}
              >
                {status}
              </span>
              <span className="text-xs text-zinc-400 ml-1.5">{items.length}</span>
            </div>

            {/* Rows */}
            <div className={`overflow-hidden`}>
              {items.map((project, idx) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  idx={idx}
                  rowBg={colors.rowBg}
                  rowBgAlt={colors.rowBgAlt}
                  newRowRef={newRowRef}
                  leadOptions={leadOptions}
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

function ProjectRow({
  project,
  idx,
  rowBg,
  rowBgAlt,
  newRowRef,
  leadOptions,
  onUpdate,
  onDelete,
}: {
  project: Project;
  idx: number;
  rowBg: string;
  rowBgAlt: string;
  newRowRef: React.RefObject<HTMLInputElement | null>;
  leadOptions: { value: string; label: string }[];
  onUpdate: (id: string, field: string, value: unknown) => void;
  onDelete: (id: string) => void;
}) {
  const canEdit = useCanEdit();
  const [confirming, setConfirming] = useState(false);
  const isDraft = project.id.startsWith("temp-");

  return (
    <div
      className={`grid grid-cols-[220px_120px_100px_80px_100px_100px_70px_70px_100px_110px_110px_150px_40px] transition-colors ${
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
            Delete <strong>{project.name || "this project"}</strong>?
            Any allocations to this project will also be deleted. This action cannot be undone.
          </span>
          <button
            onClick={() => onDelete(project.id)}
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
            value={project.name}
            placeholder="Enter project name..."
            onSave={(v) => {
              if (v.trim()) onUpdate(project.id, "name", v.trim());
            }}
            autoFocus={isDraft}
          />
          <InlineSelect
            value={project.leadId ?? ""}
            options={leadOptions}
            onSave={(v) => onUpdate(project.id, "leadId", v || null)}
            disabled={isDraft}
          />
          <InlineSelect
            value={project.pillar ?? ""}
            options={PILLAR_OPTIONS}
            onSave={(v) => onUpdate(project.id, "pillar", v || null)}
            disabled={isDraft}
          />
          <InlineSelect
            value={project.region ?? ""}
            options={REGION_OPTIONS}
            onSave={(v) => onUpdate(project.id, "region", v || null)}
            disabled={isDraft}
          />
          <InlineSelect
            value={project.billingRate ?? ""}
            options={BILLING_RATE_OPTIONS}
            onSave={(v) => onUpdate(project.id, "billingRate", v || null)}
            disabled={isDraft}
          />
          <InlineSelect
            value={project.status}
            options={STATUS_OPTIONS}
            onSave={(v) => onUpdate(project.id, "status", v)}
            disabled={isDraft}
          />
          <InlineSelect
            value={
              project.conversionProbability != null
                ? String(project.conversionProbability)
                : ""
            }
            options={CONV_PROB_OPTIONS}
            onSave={(v) =>
              onUpdate(
                project.id,
                "conversionProbability",
                v ? parseInt(v) : null
              )
            }
            disabled={isDraft}
          />
          <InlineSelect
            value={String(project.billable)}
            options={BILLABLE_OPTIONS}
            onSave={(v) => onUpdate(project.id, "billable", v === "true")}
            disabled={isDraft}
          />
          <InlineText
            value={project.unit4Code ?? ""}
            placeholder="—"
            onSave={(v) => onUpdate(project.id, "unit4Code", v || null)}
          />
          <InlineDate
            value={project.startDate}
            onSave={(v) => onUpdate(project.id, "startDate", v || null)}
            disabled={isDraft}
          />
          <InlineDate
            value={project.endDate}
            onSave={(v) => onUpdate(project.id, "endDate", v || null)}
            disabled={isDraft}
          />
          <InlineBlurb
            value={project.blurb}
            onSave={(v) => onUpdate(project.id, "blurb", v)}
            disabled={isDraft}
          />
          {canEdit && (
          <button
            onClick={() => setConfirming(true)}
            className="flex items-center justify-center text-zinc-300 hover:text-rose-500 transition-colors px-2"
            title="Delete project"
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
