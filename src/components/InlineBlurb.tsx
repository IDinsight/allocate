"use client";

import { useState, useRef, useEffect } from "react";
import { useCanEdit } from "@/lib/access";

interface Props {
  value: string | null;
  onSave: (value: string | null) => void;
  disabled?: boolean;
}

export default function InlineBlurb({ value, onSave, disabled }: Props) {
  const canEdit = useCanEdit();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [lastValue, setLastValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Resync the draft when the row is updated from elsewhere (polling).
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value ?? "");
  }

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    const newVal = trimmed || null;
    if (newVal !== (value ?? null)) {
      onSave(newVal);
    }
  };

  if (disabled) {
    return (
      <div className="cell-editable flex items-center px-3 py-2 text-sm min-h-[36px] opacity-40 pointer-events-none overflow-hidden">
        <span className="truncate text-zinc-300 italic">—</span>
      </div>
    );
  }

  if (!editing || !canEdit) {
    return (
      <div
        className={`flex items-center px-3 py-2 text-sm min-h-[36px] overflow-hidden ${canEdit ? "cell-editable cursor-text" : ""}`}
        onClick={canEdit ? () => setEditing(true) : undefined}
        title={value ?? undefined}
      >
        <span className="truncate">
          {value || <span className="text-zinc-300 italic">—</span>}
        </span>
      </div>
    );
  }

  return (
    <textarea
      ref={textareaRef}
      className="w-full bg-white px-3 py-2 text-sm outline-none min-h-[80px] cell-editable resize-y border border-violet-300 rounded shadow-sm"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setDraft(value ?? "");
          setEditing(false);
        }
      }}
      placeholder="Add a blurb..."
    />
  );
}
