"use client";

import { memo, useState, useRef, useEffect } from "react";

const CELL_WIDTH = 56;
const CELL_ATTR = "data-alloc-col";

function scrollCellIntoView(target: HTMLElement) {
  const scrollContainer = target.closest("[data-alloc-scroll]") as HTMLElement | null;
  if (!scrollContainer) return;
  const containerRect = scrollContainer.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const leftPanelWidth = parseInt(scrollContainer.getAttribute("data-alloc-left-width") ?? "0");
  const visibleLeft = containerRect.left + leftPanelWidth;

  if (targetRect.left < visibleLeft) {
    scrollContainer.scrollLeft -= (visibleLeft - targetRect.left + 4);
  }
  if (targetRect.right > containerRect.right) {
    scrollContainer.scrollLeft += (targetRect.right - containerRect.right + 4);
  }
  if (targetRect.top < containerRect.top) {
    scrollContainer.scrollTop -= (containerRect.top - targetRect.top + 4);
  }
  if (targetRect.bottom > containerRect.bottom) {
    scrollContainer.scrollTop += (targetRect.bottom - containerRect.bottom + 4);
  }
}

function findAdjacentCell(
  current: HTMLElement,
  direction: "left" | "right" | "up" | "down"
): HTMLElement | null {
  const col = current.getAttribute(CELL_ATTR);
  if (col == null) return null;
  const colIdx = parseInt(col);

  if (direction === "left" || direction === "right") {
    const targetCol = direction === "left" ? colIdx - 1 : colIdx + 1;
    // Same row — sibling with adjacent col index
    const row = current.parentElement;
    return row?.querySelector(`[${CELL_ATTR}="${targetCol}"]`) as HTMLElement | null;
  }

  // Up/down — find the same col in the adjacent row
  const row = current.closest("[data-alloc-row]");
  if (!row) return null;

  let targetRow: Element | null = null;

  if (direction === "up") {
    // Walk backwards through previous siblings looking for a row
    let sibling = row.previousElementSibling;
    while (sibling) {
      if (sibling.hasAttribute("data-alloc-row")) { targetRow = sibling; break; }
      sibling = sibling.previousElementSibling;
    }
    // If not found in same section, try the previous section's last row
    if (!targetRow) {
      const section = row.closest("[data-alloc-section]");
      let prevSection = section?.previousElementSibling;
      while (prevSection) {
        const rows = prevSection.querySelectorAll("[data-alloc-row]");
        if (rows.length > 0) { targetRow = rows[rows.length - 1]; break; }
        prevSection = prevSection.previousElementSibling;
      }
    }
  } else {
    let sibling = row.nextElementSibling;
    while (sibling) {
      if (sibling.hasAttribute("data-alloc-row")) { targetRow = sibling; break; }
      sibling = sibling.nextElementSibling;
    }
    if (!targetRow) {
      const section = row.closest("[data-alloc-section]");
      let nextSection = section?.nextElementSibling;
      while (nextSection) {
        const firstRow = nextSection.querySelector("[data-alloc-row]");
        if (firstRow) { targetRow = firstRow; break; }
        nextSection = nextSection.nextElementSibling;
      }
    }
  }

  return targetRow?.querySelector(`[${CELL_ATTR}="${colIdx}"]`) as HTMLElement | null;
}

interface Props {
  fraction: number | undefined;
  colIndex: number;
  teammateTotal?: number;
  isMonthStart?: boolean;
  unsaved?: boolean;
  previewFraction?: number | null;
  onEdit: (value: number | null) => void;
}

function AllocationCellInner({ fraction, colIndex, teammateTotal, isMonthStart, unsaved, previewFraction, onEdit }: Props) {
  const [mode, setMode] = useState<"idle" | "selected" | "editing">("idle");
  const [draft, setDraft] = useState("");
  const [flashRed, setFlashRed] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);

  const isPreview = previewFraction !== undefined;
  const showFraction = isPreview ? previewFraction : fraction;
  const displayValue =
    showFraction != null && showFraction >= 0
      ? (showFraction / 100).toFixed(showFraction % 10 === 0 ? 1 : 2)
      : "";

  const borderClass = isMonthStart
    ? "border-l-2 border-l-zinc-300"
    : "border-l border-l-zinc-200";

  const reject = () => {
    setMode("idle");
    setFlashRed(false);
    requestAnimationFrame(() => setFlashRed(true));
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      setMode("idle");
      if (fraction != null) onEdit(null);
      return;
    }
    const parsed = parseFloat(trimmed);
    if (isNaN(parsed) || parsed < 0) return reject();
    const intVal = Math.round(parsed * 100);
    setMode("idle");
    if (intVal !== fraction) onEdit(intVal);
  };

  // Navigate to adjacent cell, optionally in editing mode
  const navigate = (direction: "left" | "right" | "up" | "down", editing: boolean) => {
    if (!cellRef.current) return;
    // Commit current edit before leaving
    if (mode === "editing") commit();
    const target = findAdjacentCell(cellRef.current, direction);
    if (!target) return;
    // Deselect current cell before activating target
    setMode("idle");
    if (editing) {
      target.dispatchEvent(new CustomEvent("alloc-enter-edit", { bubbles: false }));
    }
    // Prevent browser auto-scroll (it doesn't know about sticky panels)
    target.focus({ preventScroll: true });
    target.click();
    // Scroll into view ourselves, accounting for sticky left panel
    scrollCellIntoView(target);
  };

  // Listen for "enter editing" event from navigation
  useEffect(() => {
    const el = cellRef.current;
    if (!el) return;
    const handler = () => {
      setDraft(displayValue);
      // Small delay to let click/focus set "selected" first
      requestAnimationFrame(() => setMode("editing"));
    };
    el.addEventListener("alloc-enter-edit", handler);
    return () => el.removeEventListener("alloc-enter-edit", handler);
  }, [displayValue]);

  // Deselect when clicking outside
  useEffect(() => {
    if (mode === "idle") return;
    const handleClickOutside = (e: MouseEvent) => {
      if (cellRef.current && !cellRef.current.contains(e.target as Node)) {
        if (mode === "editing") return; // input's onBlur handles this
        setMode("idle");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mode]);

  const handleArrowKeys = (e: React.KeyboardEvent, isEditing: boolean) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const dir = e.key.replace("Arrow", "").toLowerCase() as "left" | "right" | "up" | "down";
      navigate(dir, isEditing);
    }
    if (e.key === "Tab") {
      e.preventDefault();
      navigate(e.shiftKey ? "left" : "right", isEditing);
    }
  };

  if (mode === "editing") {
    const draftVal = parseFloat(draft) || 0;
    const baseTotal = (teammateTotal ?? 0) - (fraction ?? 0);
    const remaining = (100 - baseTotal - draftVal * 100) / 100;
    const remainingText = `${remaining.toFixed(1)} remaining`;
    const isOver = remaining <= 0;
    const onFire = remaining <= -0.3;

    return (
      <div
        ref={cellRef}
        data-alloc-col={colIndex}
        style={{ width: CELL_WIDTH, minWidth: CELL_WIDTH }}
        className={`relative flex items-center justify-center h-full box-border ${borderClass}`}
      >
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 flex flex-col items-center">
          {onFire && (
            <div className="pointer-events-none flex justify-center z-40" style={{ width: 100, height: 15, marginBottom: -3 }}>
              <div className="flame" />
            </div>
          )}
          <div
            className="tooltip-bubble px-2 py-0.5 text-xs font-bold whitespace-nowrap z-50 relative"
            style={{ "--bubble-color": isOver ? "#991b1b" : "#166534" } as React.CSSProperties}
          >
            {remainingText}
          </div>
        </div>
        <input
          className="w-full h-full text-center text-sm bg-white outline-none border-2 border-zinc-900 rounded px-0.5"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { commit(); return; }
            if (e.key === "Escape") { setMode("idle"); return; }
            handleArrowKeys(e, true);
          }}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div
      ref={cellRef}
      tabIndex={0}
      data-alloc-col={colIndex}
      style={{
        width: CELL_WIDTH,
        minWidth: CELL_WIDTH,
        backgroundColor: unsaved ? "rgb(248, 248, 248)" : undefined,
        borderBottomWidth: isPreview ? 2 : undefined,
        borderBottomStyle: isPreview ? "solid" : undefined,
        borderBottomColor: isPreview ? "rgb(117, 117, 117)" : undefined,
        animation: flashRed ? "cellFlashRed 0.4s ease-out" : undefined,
        outline: mode === "selected" ? "2px solid #7c3aed" : undefined,
        outlineOffset: "-2px",
      }}
      onAnimationEnd={() => setFlashRed(false)}
      className={`flex items-center justify-center text-sm cursor-pointer select-none transition-colors hover:bg-violet-100/60 h-full border-b-1 border-zinc-200 box-border ${borderClass}`}
      onClick={() => {
        if (mode !== "selected") setMode("selected");
      }}
      onDoubleClick={() => {
        setDraft(displayValue);
        setMode("editing");
      }}
      onKeyDown={(e) => {
        if (mode !== "selected") return;
        handleArrowKeys(e, false);
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          if (fraction != null) onEdit(null);
          setMode("idle");
        } else if (e.key === "Escape") {
          setMode("idle");
        } else if (e.key === "Enter") {
          e.preventDefault();
          setDraft(displayValue);
          setMode("editing");
        } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
          // Start typing — enter edit mode with the typed character as initial draft
          e.preventDefault();
          setDraft(e.key);
          setMode("editing");
        }
      }}
    >
      {displayValue}
    </div>
  );
}

const AllocationCell = memo(AllocationCellInner);
export default AllocationCell;
