"use client";

import { Dispatch, SetStateAction, useRef, useState } from "react";
import TeammatesTable from "./TeammatesTable";
import WatermarkBackground from "./WatermarkBackground";
import { trackWrite } from "@/lib/liveSync";

export type Teammate = {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  level: string | null;
  region: string | null;
  status: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  onFlushed?: () => void;
  teammates: Teammate[];
  setTeammates: Dispatch<SetStateAction<Teammate[]>>;
  disabled?: boolean;
}

export default function TeammatesSidebar({ open, onClose, onOpen, onFlushed, teammates, setTeammates, disabled }: Props) {
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
    if (id.startsWith("temp-") && field === "name" && value) {
      const res = await track(fetch("/api/teammates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value }),
        keepalive: true,
      }));
      if (res.ok) {
        const created = await res.json();
        setTeammates((prev) => prev.map((t) => (t.id === id ? created : t)));
      } else {
        alert("Couldn't create teammate — please try again.");
      }
      return;
    }

    if (id.startsWith("temp-")) return;

    setTeammates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
    const res = await track(fetch(`/api/teammates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
      keepalive: true,
    }));
    if (res.ok) {
      const updated = await res.json();
      setTeammates((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } else {
      // Write failed — resync to the database truth.
      onFlushed?.();
    }
  };

  const handleCreate = () => {
    const tempId = `temp-${Date.now()}`;
    const draft: Teammate = {
      id: tempId,
      name: "",
      email: null,
      role: null,
      level: null,
      region: null,
      status: "Active",
    };
    setTeammates((prev) => [draft, ...prev]);
  };

  const handleDelete = async (id: string) => {
    if (!id.startsWith("temp-")) {
      const res = await track(fetch(`/api/teammates/${id}`, { method: "DELETE", keepalive: true }));
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "Failed to delete teammate");
        return;
      }
    }
    setTeammates((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <>
      {/* Handle — when sidebar is closed */}
      {!open && (
        <div className="fixed -right-0.5 top-2/3 -translate-y-1/2 z-[51]">
          <button
            onClick={onOpen}
            disabled={disabled}
            className={`sidebar-tab sidebar-tab-right group bg-emerald-200 text-emerald-700 ${disabled ? "opacity-30 pointer-events-none" : ""}`}
          >
            <span className="px-1.5">
              {"\u2039"}
            </span>
            <span className="pr-4 transition-all w-5 whitespace-nowrap group-hover:w-14">
              <span className="group-hover:hidden ">T</span>
              <span className="hidden group-hover:inline">Team</span>
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
          className={`fixed inset-y-0 right-0 z-50 flex w-[60%] max-w-[1000px] flex-col border-l-3 border-zinc-900 bg-white shadow-2xl ${closing ? "slide-out-right" : "slide-in-right"}`}
        >
          <WatermarkBackground text="T E A M " className="-z-10" color="green" opacity={0.3} rotation={20}/>
          {/* Handle — attached to left edge of panel */}
          <div className="absolute left-2 top-2/3 -translate-y-1/2 -translate-x-full z-[51]">
            <button
              onClick={handleClose}
              className="sidebar-tab sidebar-tab-right bg-emerald-200 text-emerald-700"
            >
              <span className="px-1.5">
                {"\u203A"}
              </span>
              <span className="pr-3 pl-1  whitespace-nowrap">
                Team
              </span>
            </button>
          </div>

          {/* Header */}
          <div className="flex items-start justify-start gap-3 px-8 pt-8 pb-6">
            {filtersActive ? (
              <div className="flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 bg-white">
                <span className="text-sm font-medium">Filters active</span>
                <button
                  onClick={() => clearFilters?.()}
                  className="btn-chunky rounded-md px-2 py-0.5 text-xs font-bold text-emerald-700 bg-emerald-100"
                >
                  Clear all
                </button>
              </div>
            ) : (
              <button
                onClick={handleCreate}
                className="btn-chunky flex h-9 items-center gap-1.5 rounded-lg bg-emerald-100 px-3 text-sm font-bold text-emerald-800"
              >
                <span className="text-lg leading-none">+</span> New
              </button>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto mx-8 mb-10 border-2 border-zinc-900 bg-white">
            <TeammatesTable
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
