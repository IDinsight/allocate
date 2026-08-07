"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import type { Project } from "@/components/ProjectsSidebar";
import type { Teammate } from "@/components/TeammatesSidebar";
import type { Allocation } from "@/components/allocation/ProjectSection";
import Loader from "@/components/Loader";
import useCubeData from "./useCubeData";
import type { Axis } from "./CubeScene";

// three.js is ~150KB gzipped — keep it out of the main bundle and off the
// server (WebGL has no SSR story).
const CubeScene = dynamic(() => import("./CubeScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader />
    </div>
  ),
});

const TRANSITION_MS = 420;

type Props = {
  projects: Project[];
  teammates: Teammate[];
  allocations: Allocation[];
  weekStarts: string[];
  onClose: () => void;
};

export default function CubeMode({ projects, teammates, allocations, weekStarts, onClose }: Props) {
  const data = useCubeData(projects, teammates, allocations, weekStarts);
  const [collapsed, setCollapsed] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [snap, setSnap] = useState<Axis | null>(null);
  const [spinning, setSpinning] = useState(true);

  // The cube grows out of the header logo and shrinks back into it. Measured
  // rather than hard-coded, so it still lands on the button if the header moves.
  const [origin] = useState(() => {
    if (typeof document === "undefined") return { dx: 0, dy: 0 };
    const rect = document.querySelector(".cube-trigger")?.getBoundingClientRect();
    if (!rect) return { dx: 0, dy: 0 };
    return {
      dx: rect.left + rect.width / 2 - window.innerWidth / 2,
      dy: rect.top + rect.height / 2 - window.innerHeight / 2,
    };
  });

  // One frame collapsed, then expand — otherwise the browser coalesces both
  // states into the final one and there is nothing to transition.
  useEffect(() => {
    const id = requestAnimationFrame(() => setCollapsed(false));
    const t = setTimeout(() => setMounted(true), TRANSITION_MS);
    return () => { cancelAnimationFrame(id); clearTimeout(t); };
  }, []);

  const beginClose = useCallback(() => {
    setCollapsed(true);
    setMounted(false);
    // Let the shrink finish before unmounting — this also releases the WebGL
    // context, since the scene is unmounted rather than hidden.
    setTimeout(onClose, TRANSITION_MS);
  }, [onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") beginClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [beginClose]);

  const panel = (
    <div
      className="fixed inset-0 z-30"
      style={{
        transform: collapsed
          ? `translate(${origin.dx}px, ${origin.dy}px) scale(0.02) rotate(-90deg)`
          : "translate(0, 0) scale(1) rotate(0deg)",
        opacity: collapsed ? 0 : 1,
        transition: `transform ${TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${TRANSITION_MS}ms ease`,
      }}
    >
      {/* Mounted only once the grow finishes: the canvas sizes itself from its
          bounding box, which is still scaled to 2% mid-transition. */}
      {mounted && (
        <CubeScene
          data={data}
          snap={snap}
          onSnap={(axis) => { setSpinning(false); setSnap(axis); }}
          onSnapDone={() => setSnap(null)}
          spinning={spinning}
          onInteract={() => { setSpinning(false); setSnap(null); }}
          onBackgroundClick={beginClose}
        />
      )}
    </div>
  );

  return createPortal(panel, document.body);
}
