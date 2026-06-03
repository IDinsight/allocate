"use client";

import { Dispatch, SetStateAction, useRef, useState } from "react";
import ProjectsTable from "./ProjectsTable";
import WatermarkBackground from "./WatermarkBackground";
import { trackWrite } from "@/lib/liveSync";

type Teammate = { id: string; name: string };

export type Project = {
  id: string;
  name: string;
  pillar: string | null;
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
  setProjects: Dispatch<SetStateAction<Project[]>>;
  teammates: Teammate[];
  disabled?: boolean;
}

export default function ProjectsSidebar({ open, onClose, onOpen, onFlushed, projects, setProjects, teammates, disabled }: Props) {
  const [closing, setClosing] = useState(false);
  const [filtersActive, setFiltersActive] = useState(false);
  const [clearFilters, setClearFilters] = useState<(() => void) | null>(null);
  const pendingRef = useRef<Set<Promise<unknown>>>(new Set());

  const track = <T,>(p: Promise<T>): Promise<T> => {
    trackWrite(p); // also register globally so live-sync polling waits for it
    pendingRef.current.add(p);
    p.finally(() => pendingRef.current.delete(p));
    return p;
  };

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

  const handleUpdate = async (id: string, field: string, value: unknown) => {
    // If this is a draft row getting its name, create it in the DB first
    if (id.startsWith("temp-") && field === "name" && value) {
      const res = await track(fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value }),
        keepalive: true,
      }));
      if (res.ok) {
        const created = await res.json();
        setProjects((prev) => prev.map((p) => (p.id === id ? created : p)));
      } else {
        alert("Couldn't create project — please try again.");
      }
      return;
    }

    // Ignore edits on draft rows (shouldn't happen, but just in case)
    if (id.startsWith("temp-")) return;

    // Optimistic update
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
    const res = await track(fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
      keepalive: true,
    }));
    if (res.ok) {
      const updated = await res.json();
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } else {
      // Write failed — resync to the database truth so we don't keep showing
      // an edit that wasn't saved.
      onFlushed?.();
    }
  };

  const handleCreate = () => {
    const tempId = `temp-${Date.now()}`;
    const draft: Project = {
      id: tempId,
      name: "",
      pillar: null,
      region: null,
      billingRate: null,
      status: "Upcoming",
      conversionProbability: null,
      billable: false,
      unit4Code: null,
      startDate: null,
      endDate: null,
      blurb: null,
      leadId: null,
      lead: null,
    };
    setProjects((prev) => [draft, ...prev]);
  };

  const handleDelete = async (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    // Only call API if it's a real row
    if (!id.startsWith("temp-")) {
      const res = await track(fetch(`/api/projects/${id}`, { method: "DELETE", keepalive: true }));
      if (!res.ok) onFlushed?.(); // resync if the delete didn't persist
    }
  };

  return (
    <>
      {/* Handle — when sidebar is closed */}
      {!open && (
        <div className="fixed -left-0.5 top-1/3 -translate-y-1/2 z-[51]">
          <button
            onClick={onOpen}
            disabled={disabled}
            className={`sidebar-tab group bg-violet-100 text-violet-700 ${disabled ? "opacity-30 pointer-events-none" : ""}`}
          >
            <span className="px-2.5 transition-all w-0 overflow-hidden whitespace-nowrap group-hover:w-18 group-hover:px-2">
              Projects
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
          <WatermarkBackground text="P R O J E C T S" className="-z-10" color="purple" opacity={0.3} rotation={-20}/>
          {/* Handle — attached to right edge of panel */}
          <div className="absolute right-2 top-1/3 -translate-y-1/2 translate-x-full z-[51]">
            <button
              onClick={handleClose}
              className="sidebar-tab bg-violet-100 text-violet-700"
            >
              <span className="pl-3 pr-1 whitespace-nowrap">
                Projects
              </span>
              <span className="px-1.5">
                {"\u2039"}
              </span>
            </button>
          </div>
          {/* Header */}
          <div className="flex items-end justify-end gap-3 px-8 pt-8 pb-6">
            {filtersActive ? (
              <div className="flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 bg-white">
                <span className="text-sm font-medium">Filters active</span>
                <button
                  onClick={() => clearFilters?.()}
                  className="btn-chunky rounded-md px-2 py-0.5 text-xs font-bold text-violet-700 bg-violet-100"
                >
                  Clear all
                </button>
              </div>
            ) : (
              <button
                onClick={handleCreate}
                className="btn-chunky flex h-9 items-center gap-1.5 rounded-lg bg-violet-100 px-3 text-sm font-bold text-violet-800"
              >
                <span className="text-lg leading-none">+</span> New
              </button>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto mx-8 mb-10 border-2 border-zinc-900 bg-white">
            <ProjectsTable
              projects={projects}
              teammates={teammates}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onFilterChange={(active, clearFn) => {
                setFiltersActive(active);
                setClearFilters(() => clearFn);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
