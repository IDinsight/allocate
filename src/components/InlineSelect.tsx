"use client";

import { useCanEdit } from "@/lib/access";

interface Props {
  value: string;
  options: { value: string; label: string }[];
  onSave: (value: string) => void;
  disabled?: boolean;
}

export default function InlineSelect({ value, options, onSave, disabled }: Props) {
  // `disabled` is the greyed-out "not applicable" look (draft rows). Read-only
  // must stay as legible as an editable value — it just can't be changed.
  const canEdit = useCanEdit();
  const readOnly = !canEdit && !disabled;
  const current = options.find((o) => o.value === value);

  return (
    <select
      className={`w-full bg-transparent px-2 py-2 text-sm outline-none appearance-none min-h-[36px] truncate ${
        disabled
          ? "cell-editable pointer-events-none opacity-40"
          : readOnly
            ? "pointer-events-none"
            : "cell-editable cursor-pointer"
      }`}
      value={value}
      onChange={(e) => onSave(e.target.value)}
      // The native `disabled` attribute dims the text in every browser, which
      // is wrong for read-only — block interaction without it instead.
      disabled={disabled}
      tabIndex={readOnly ? -1 : undefined}
      aria-readonly={readOnly || undefined}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
      {/* If current value isn't in options (legacy data), show it */}
      {!current && value && (
        <option value={value} disabled>
          {value}
        </option>
      )}
    </select>
  );
}
