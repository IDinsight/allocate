"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import type { Project } from "@/components/ProjectsSidebar";
import type { Teammate } from "@/components/TeammatesSidebar";
import type { Allocation } from "@/components/allocation/ProjectSection";
import Loader from "@/components/Loader";
import useCubeData from "./useCubeData";

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

/** Growing out of the logo is the showy bit; collapsing back should get out of
 *  the way, so it runs a good deal quicker. */
const OPEN_MS = 420;
const CLOSE_MS = 170;

type Props = {
  projects: Project[];
  teammates: Teammate[];
  allocations: Allocation[];
  weekStarts: string[];
  /** Fired when the shrink starts, so the header logo can fade back in with it. */
  onCollapse: () => void;
  onClose: () => void;
};

export default function CubeMode({
  projects, teammates, allocations, weekStarts, onCollapse, onClose,
}: Props) {
  const data = useCubeData(projects, teammates, allocations, weekStarts);
  const [collapsed, setCollapsed] = useState(true);
  const [closing, setClosing] = useState(false);
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
    return () => cancelAnimationFrame(id);
  }, []);

  const beginClose = useCallback(() => {
    setCollapsed(true);
    setClosing(true);
    onCollapse();
    // Let the shrink finish before unmounting — this also releases the WebGL
    // context, since the scene is unmounted rather than hidden.
    setTimeout(onClose, CLOSE_MS);
  }, [onCollapse, onClose]);

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
        // Translate only — deliberately no CSS scale. The canvas sizes itself
        // from its bounding box, and a scale transform would have it measure
        // the shrunken box and stay that resolution. The growing is done by the
        // camera instead (see `closing` below), which lets the scene stay
        // mounted throughout so the animation is actually visible.
        transform: collapsed ? `translate(${origin.dx}px, ${origin.dy}px)` : "translate(0, 0)",
        opacity: collapsed ? 0 : 1,
        transition: closing
          // Fade out ahead of the travel so it is gone before it lands, rather
          // than shrinking into the corner in full view.
          ? `transform ${CLOSE_MS}ms ease-in, opacity ${CLOSE_MS * 0.6}ms ease-in`
          : `transform ${OPEN_MS}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${OPEN_MS}ms ease`,
      }}
    >
      <CubeScene
        data={data}
        spinning={spinning}
        closing={closing}
        onInteract={() => setSpinning(false)}
        onBackgroundClick={beginClose}
      />
    </div>
  );

  return createPortal(panel, document.body);
}
