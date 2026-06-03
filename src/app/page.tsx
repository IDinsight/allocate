"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProjectsSidebar from "@/components/ProjectsSidebar";
import TeammatesSidebar from "@/components/TeammatesSidebar";
import WatermarkBackground from "@/components/WatermarkBackground";
import Notepad from "@/components/Notepad";
import AllocationView from "@/components/allocation/AllocationView";
import type { Project } from "@/components/ProjectsSidebar";
import type { Teammate } from "@/components/TeammatesSidebar";
import type { Allocation } from "@/components/allocation/ProjectSection";
import { trackWrite, hasPendingWrites, isBusy, POLL_INTERVAL_MS } from "@/lib/liveSync";

export default function Home() {
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [teammatesOpen, setTeammatesOpen] = useState(false);
  // useSearchParams (vs window.location) returns the same value on server
  // and client during SSR, so lazy-init from it doesn't cause a hydration
  // mismatch. Requires the Suspense boundary in layout.tsx.
  const searchParams = useSearchParams();
  const [activeView, setActiveView] = useState<"project" | "teammate">(() =>
    searchParams.get("view") === "teammate" ? "teammate" : "project"
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (activeView === "teammate") params.set("view", "teammate");
    else params.delete("view");
    const qs = params.toString();
    const next = window.location.pathname + (qs ? "?" + qs : "") + window.location.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(null, "", next);
    }
  }, [activeView]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [weekStarts, setWeekStarts] = useState<string[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  // Last data signature we've loaded, from /api/version — lets the poller skip
  // the heavy refetch when nothing has changed.
  const dataVersionRef = useRef<string | null>(null);
  const router = useRouter();

  const handleCellEdit = async (
    projectId: string,
    teammateId: string,
    weekStart: string,
    fraction: number | null,
    existingId: string | undefined
  ) => {
    // Each branch updates local state optimistically, then awaits the write.
    // `keepalive` lets the request finish even if the tab is reloading, and a
    // non-ok/failed write resyncs to the database truth instead of leaving a
    // phantom change on screen.
    try {
      if (fraction === null && existingId) {
        // Delete
        setAllocations((prev) => prev.filter((a) => a.id !== existingId));
        const res = await trackWrite(
          fetch(`/api/allocations/${existingId}`, { method: "DELETE", keepalive: true })
        );
        if (!res.ok) throw new Error("delete failed");
      } else if (existingId && fraction != null) {
        // Update
        setAllocations((prev) =>
          prev.map((a) => (a.id === existingId ? { ...a, fraction } : a))
        );
        const res = await trackWrite(
          fetch(`/api/allocations/${existingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fraction }),
            keepalive: true,
          })
        );
        if (!res.ok) throw new Error("update failed");
      } else if (fraction != null) {
        // Create
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const newAlloc: Allocation = {
          id: tempId,
          projectId,
          teammateId,
          weekStart,
          fraction,
          isHidden: false,
        };
        setAllocations((prev) => [...prev, newAlloc]);
        const res = await trackWrite(
          fetch("/api/allocations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, teammateId, weekStart, fraction }),
            keepalive: true,
          })
        );
        if (!res.ok) throw new Error("create failed");
        const created = await res.json();
        setAllocations((prev) =>
          prev.map((a) => (a.id === tempId ? created : a))
        );
      }
    } catch {
      reportSaveFailure();
    }
  };

  const handleSignOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) {
      setDataLoading(true);
      setLoadError(false);
    }
    try {
      const [projRes, teamRes, allocRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/teammates"),
        fetch("/api/allocations"),
      ]);
      if (!projRes.ok || !teamRes.ok || !allocRes.ok) {
        if (!silent) setLoadError(true);
        if (!silent) setDataLoading(false);
        return;
      }
      setProjects(await projRes.json());
      setTeammates(await teamRes.json());
      const data = await allocRes.json();
      setAllocations(data.allocations);
      setWeekStarts(data.weekStarts);
    } catch {
      if (!silent) setLoadError(true);
    }
    if (!silent) setDataLoading(false);
  }, []);

  // A write failed (or never reached the server). Snap state back to the
  // database truth and briefly surface the failure rather than leaving a
  // change on screen that wasn't actually saved.
  const reportSaveFailure = useCallback(() => {
    setSaveError(true);
    fetchAll(true);
    window.setTimeout(() => setSaveError(false), 4000);
  }, [fetchAll]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Live sync: poll the tiny /api/version signature and only run the heavy
  // fetchAll when the data actually changed. Skip a tick while the tab is
  // hidden, a sidebar is open (draft rows would be wiped), or a write/cell-edit
  // is in progress — see src/lib/liveSync.ts.
  useEffect(() => {
    if (dataLoading || loadError) return;
    const id = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      if (projectsOpen || teammatesOpen) return;
      if (isBusy()) return;
      try {
        const res = await fetch("/api/version");
        if (!res.ok) return;
        const v = await res.json();
        if (v.data !== dataVersionRef.current) {
          dataVersionRef.current = v.data;
          fetchAll(true);
        }
      } catch {
        // Network blip — try again next tick.
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [dataLoading, loadError, projectsOpen, teammatesOpen, fetchAll]);

  // Warn before leaving if a write is still in flight, so a refresh mid-save
  // isn't silent. (keepalive should still deliver it, but this is a backstop.)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasPendingWrites()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  return (
    <div className="relative isolate flex h-screen flex-col overflow-hidden bg-white">
      {/* Watermark background */}
      <WatermarkBackground text="A L L O C A T E" className="-z-10" color="black" opacity={0.05} rotation={90} />

      {/* Save-failure indicator */}
      {saveError && (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-lg border-2 border-zinc-900 bg-rose-100 px-4 py-1.5 text-sm font-bold text-rose-800 shadow-[3px_3px_0_#1a1a1a]">
          Couldn&apos;t save your last change — refreshed to latest
        </div>
      )}

      {/* Top bar */}
      <header className="flex items-center justify-center gap-8 bg-white mt-14 mb-10">
        <svg className="flex-1 h-3" preserveAspectRatio="none" viewBox="0 0 100 10">
          <path d="M0 5 Q8.33 0 16.67 5 T33.33 5 T50 5 T66.67 5 T83.33 5 T100 5" fill="none" stroke="#1a1a1a" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="flex items-center justify-center gap-10 bg-white">
          <button
            onClick={() => setActiveView("project")}
            className={`btn-chunky px-5 py-1 text-sm font-bold rounded-lg shrink-0 ${activeView === "project"
              ? "btn-chunky-pressed bg-purple-800 text-zinc-100"
              : "bg-white text-zinc-800"
              }`}
          >
            PROJECT VIEW
          </button>

          <button
            onClick={handleSignOut}
            className="group relative text-xl font-bold tracking-tight text-zinc-900 hover:cursor-pointer shrink-0"
          >
            <span className="inline-block transition-all duration-300 group-hover:scale-0 group-hover:opacity-0">
              A L L O C A T E
            </span>
            <span className="absolute inset-0 flex items-center justify-center scale-0 opacity-0 transition-all duration-300 group-hover:scale-100 group-hover:opacity-100 group-hover:animate-[bounce_0.3s_infinite]">
              B Y E B Y E ?
            </span>
          </button>

          <button
            onClick={() => setActiveView("teammate")}
            className={`btn-chunky px-5 py-1 text-sm font-bold rounded-lg shrink-0 ${activeView === "teammate"
              ? "btn-chunky-pressed bg-emerald-800 text-zinc-100"
              : "bg-white text-zinc-800"
              }`}
          >
            TEAM VIEW
          </button>
        </div>
        <svg className="flex-1 h-3" preserveAspectRatio="none" viewBox="0 0 100 10">
          <path d="M0 5 Q8.33 0 16.67 5 T33.33 5 T50 5 T66.67 5 T83.33 5 T100 5" fill="none" stroke="#1a1a1a" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        </svg>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {loadError ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-xl text-zinc-400 font-semibold">something went wrong... sorry :(</span>
          </div>
        ) : dataLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="wavy-loader flex gap-1.5 text-md font-black">
              {Array.from({ length: 3 }, () => [..."LOADING"]).flat().map((ch, i) => (
                <span
                  key={i}
                  style={{
                    animationDelay: `${i * 0.1}s`,
                    color: ["#7e22ce", "#7e22ce", "#1a1a1a", "#1a1a1a", "#1a1a1a", "#059669", "#059669"][i],
                  }}
                >
                  {ch}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <AllocationView
            projects={projects}
            teammates={teammates}
            allocations={allocations}
            weekStarts={weekStarts}
            activeView={activeView}
            onCellEdit={handleCellEdit}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="overflow-hidden text-center">
        <div className="inline whitespace-nowrap text-xs font-mono font-bold text-zinc-300 bg-white py-1">
          {Array(60).fill("v1.1").join(" ")}
        </div>
      </footer>

      {/* Projects sidebar + handle (left) */}
      <ProjectsSidebar
        open={projectsOpen}
        onClose={() => setProjectsOpen(false)}
        onFlushed={() => fetchAll(true)}
        onOpen={() => { setTeammatesOpen(false); setProjectsOpen(true); }}
        projects={projects}
        setProjects={setProjects}
        teammates={teammates}
        disabled={dataLoading || loadError}
      />

      {/* Teammates sidebar + handle (right) */}
      <TeammatesSidebar
        open={teammatesOpen}
        onClose={() => setTeammatesOpen(false)}
        onFlushed={() => fetchAll(true)}
        onOpen={() => { setProjectsOpen(false); setTeammatesOpen(true); }}
        teammates={teammates}
        setTeammates={setTeammates}
        disabled={dataLoading || loadError}
      />

      {!dataLoading && !loadError && <Notepad />}
    </div>
  );
}
