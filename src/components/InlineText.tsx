"use client";

import { useState, useRef, useEffect, forwardRef } from "react";
import { useCanEdit } from "@/lib/access";

interface Props {
  value: string;
  placeholder?: string;
  onSave: (value: string) => void;
  autoFocus?: boolean;
}

const InlineText = forwardRef<HTMLInputElement, Props>(
  ({ value, placeholder, onSave, autoFocus }, ref) => {
    const canEdit = useCanEdit();
    const [editing, setEditing] = useState(!!autoFocus);
    const [draft, setDraft] = useState(value);
    const innerRef = useRef<HTMLInputElement>(null);

    // Combine forwarded ref with internal ref
    const inputRef = (ref as React.RefObject<HTMLInputElement>) ?? innerRef;

    useEffect(() => {
      setDraft(value);
    }, [value]);

    const commit = () => {
      setEditing(false);
      if (draft !== value) {
        onSave(draft);
      }
    };

    if (!editing || !canEdit) {
      return (
        <div
          className={`flex items-center px-3 py-2 text-sm min-h-[36px] overflow-hidden ${canEdit ? "cell-editable cursor-text" : ""}`}
          onClick={canEdit ? () => setEditing(true) : undefined}
        >
          <span className="truncate">{value || (
            <span className="text-zinc-300 italic">{placeholder ?? "—"}</span>
          )}</span>
        </div>
      );
    }

    return (
      <input
        ref={inputRef}
        type="text"
        className="w-full bg-transparent px-3 py-2 text-sm outline-none min-h-[36px] cell-editable"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        autoFocus
        placeholder={placeholder}
      />
    );
  }
);

InlineText.displayName = "InlineText";

export default InlineText;
