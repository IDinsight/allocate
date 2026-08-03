"use client";

import { useState, useRef } from "react";
import ChunkyCalendar from "./ChunkyCalendar";
import { useCanEdit } from "@/lib/access";

interface Props {
  value: string | null;
  onSave: (value: string | null) => void;
  disabled?: boolean;
}

export default function InlineDate({ value, onSave, disabled }: Props) {
  // `disabled` greys the value out; read-only keeps it fully legible and only
  // withholds the picker. See InlineSelect for the same distinction.
  const canEdit = useCanEdit();
  const readOnly = !canEdit && !disabled;
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const dateStr = value ? value.slice(0, 10) : "";

  // Format for display: "Apr 9, 2026"
  const displayStr = dateStr
    ? new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <div ref={anchorRef}>
      <div
        className={`flex items-center px-3 py-2 text-sm min-h-[36px] overflow-hidden ${
          disabled
            ? "cell-editable opacity-40 pointer-events-none"
            : readOnly
              ? ""
              : "cell-editable cursor-pointer"
        }`}
        onClick={() => !disabled && !readOnly && setOpen(true)}
      >
        <span className="truncate">
          {displayStr || <span className="text-zinc-300 italic">—</span>}
        </span>
      </div>
      {open && (
        <ChunkyCalendar
          value={dateStr}
          onChange={(v) => onSave(v || null)}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
        />
      )}
    </div>
  );
}
