import { useState, useRef, useCallback, useMemo, useEffect } from "react";

const DRAG_THRESHOLD = 4;
const EMPTY_MAP = new Map<number, number | null>();

// How close (px) to the scroll container's inner edge before auto-scroll kicks in.
const AUTOSCROLL_EDGE = 40;
// Max px per animation frame to scroll when the mouse pins the edge.
const AUTOSCROLL_MAX_STEP = 20;

// Applied to <body> while a drag is active so the paint-roller cursor wins over
// per-cell `cursor: pointer` rules. Paired with a global CSS rule in globals.css.
const DRAG_BODY_CLASS = "drag-filling";

interface DragState {
  sourceIndex: number;
  sourceFraction: number | null; // null = empty cell (will clear targets)
  currentIndex: number;
  rowKey: string;
}

interface Pending {
  startX: number;
  sourceIndex: number;
  sourceFraction: number | null;
  rowKey: string;
  rowEl: HTMLElement;
}

interface UseDragToFillParams {
  weekStarts: string[];
  cellWidth: number;
}

export default function useDragToFill({ weekStarts, cellWidth }: UseDragToFillParams) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const justDraggedRef = useRef(false);
  // Latest mouse position (viewport coords). Updated by both the row's
  // onMouseMove and a window-level mousemove during drag, so auto-scroll can
  // reproject to the correct cell even when the mouse leaves the row.
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  const previewMap = useMemo(() => {
    if (!dragState) return EMPTY_MAP;
    const map = new Map<number, number | null>();
    const lo = Math.min(dragState.sourceIndex, dragState.currentIndex);
    const hi = Math.max(dragState.sourceIndex, dragState.currentIndex);
    for (let i = lo; i <= hi; i++) {
      map.set(i, dragState.sourceFraction);
    }
    return map;
  }, [dragState]);

  const onMouseDown = useCallback((
    e: React.MouseEvent,
    cellIndex: number,
    fraction: number | undefined,
    rowKey: string,
  ) => {
    // Only left mouse button
    if (e.button !== 0) return;
    pendingRef.current = {
      startX: e.clientX,
      sourceIndex: cellIndex,
      sourceFraction: fraction ?? null,
      rowKey,
      rowEl: e.currentTarget as HTMLElement,
    };
  }, []);

  // Recompute currentIndex from the last known mouse position against the row's
  // current bounding rect. Used by both onMouseMove and the auto-scroll RAF
  // loop — when the container scrolls under a stationary mouse, the row's
  // rect shifts, so the target cell changes even though the cursor didn't.
  const projectMouseToIndex = useCallback((rowEl: HTMLElement): number | null => {
    const pos = mousePosRef.current;
    if (!pos) return null;
    const rect = rowEl.getBoundingClientRect();
    const relativeX = pos.x - rect.left;
    return Math.max(0, Math.min(
      weekStarts.length - 1,
      Math.floor(relativeX / cellWidth),
    ));
  }, [weekStarts.length, cellWidth]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const pending = pendingRef.current;
    if (!pending) return;

    mousePosRef.current = { x: e.clientX, y: e.clientY };
    const dx = Math.abs(e.clientX - pending.startX);
    if (!dragState && dx < DRAG_THRESHOLD) return;

    // Activate or update drag
    e.preventDefault();
    const currentIndex = projectMouseToIndex(pending.rowEl);
    if (currentIndex == null) return;

    // Add drag class on first activation so the paint-roller cursor overrides
    // per-cell cursor styles via the global rule in globals.css.
    if (!dragState) {
      document.body.classList.add(DRAG_BODY_CLASS);
    }

    setDragState({
      sourceIndex: pending.sourceIndex,
      sourceFraction: pending.sourceFraction,
      currentIndex,
      rowKey: pending.rowKey,
    });
  }, [projectMouseToIndex, dragState]);

  const resetDrag = useCallback(() => {
    pendingRef.current = null;
    mousePosRef.current = null;
    setDragState(null);
    document.body.classList.remove(DRAG_BODY_CLASS);
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Returns fills if drag was active, null otherwise
  const onMouseUp = useCallback((): Array<{ index: number; fraction: number | null }> | null => {
    const wasDragging = !!dragState;
    const fills: Array<{ index: number; fraction: number | null }> = [];

    if (wasDragging && dragState) {
      justDraggedRef.current = true;
      requestAnimationFrame(() => { justDraggedRef.current = false; });

      for (const [idx, frac] of previewMap) {
        // Skip the source cell — it already has the value
        if (idx === dragState.sourceIndex) continue;
        fills.push({ index: idx, fraction: frac });
      }
    }

    resetDrag();
    return wasDragging ? fills : null;
  }, [dragState, previewMap, resetDrag]);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (justDraggedRef.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

  // Handle mouseup outside the container. Always installed so a mousedown
  // that never crossed the drag threshold still gets cleared.
  useEffect(() => {
    const handleWindowMouseUp = () => {
      if (pendingRef.current || rafRef.current != null) resetDrag();
    };
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => window.removeEventListener("mouseup", handleWindowMouseUp);
  }, [resetDrag]);

  // While a drag is active: track the mouse globally (so we still know its
  // position when it leaves the row) and run an auto-scroll loop that pushes
  // the scroll container when the mouse is near an edge. Each frame we also
  // reproject the mouse onto the row so the preview keeps advancing while the
  // container scrolls under a stationary cursor.
  //
  // Depend only on the boolean — we don't want the loop torn down and rebuilt
  // every frame as currentIndex updates.
  const isDragging = !!dragState;
  useEffect(() => {
    if (!isDragging) return;
    const pending = pendingRef.current;
    if (!pending) return;
    const rowEl = pending.rowEl;
    const scrollEl = rowEl.closest("[data-alloc-scroll]") as HTMLElement | null;

    const handleWindowMouseMove = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    };
    window.addEventListener("mousemove", handleWindowMouseMove);

    const tick = () => {
      const pos = mousePosRef.current;
      if (pos && scrollEl) {
        const rect = scrollEl.getBoundingClientRect();
        const leftPanelWidth = parseInt(
          scrollEl.getAttribute("data-alloc-left-width") ?? "0",
        );
        // Cells start after the sticky left panel; treat that as the visible left edge.
        const visibleLeft = rect.left + leftPanelWidth;
        let dx = 0;
        let dy = 0;
        if (pos.x < visibleLeft + AUTOSCROLL_EDGE) {
          const dist = Math.max(0, visibleLeft + AUTOSCROLL_EDGE - pos.x);
          dx = -Math.min(AUTOSCROLL_MAX_STEP, dist);
        } else if (pos.x > rect.right - AUTOSCROLL_EDGE) {
          const dist = Math.max(0, pos.x - (rect.right - AUTOSCROLL_EDGE));
          dx = Math.min(AUTOSCROLL_MAX_STEP, dist);
        }
        if (pos.y < rect.top + AUTOSCROLL_EDGE) {
          const dist = Math.max(0, rect.top + AUTOSCROLL_EDGE - pos.y);
          dy = -Math.min(AUTOSCROLL_MAX_STEP, dist);
        } else if (pos.y > rect.bottom - AUTOSCROLL_EDGE) {
          const dist = Math.max(0, pos.y - (rect.bottom - AUTOSCROLL_EDGE));
          dy = Math.min(AUTOSCROLL_MAX_STEP, dist);
        }
        if (dx !== 0) scrollEl.scrollLeft += dx;
        if (dy !== 0) scrollEl.scrollTop += dy;
      }

      // Reproject each frame — required when the mouse is stationary at an
      // edge and only the container is scrolling.
      const idx = projectMouseToIndex(rowEl);
      if (idx != null) {
        setDragState((prev) => (prev && prev.currentIndex !== idx ? { ...prev, currentIndex: idx } : prev));
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isDragging, projectMouseToIndex]);

  return {
    previewMap,
    isDragging: !!dragState,
    dragRowKey: dragState?.rowKey ?? null,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onClickCapture,
  };
}
