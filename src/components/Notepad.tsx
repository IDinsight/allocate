"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { POLL_INTERVAL_MS } from "@/lib/liveSync";

const WIDTH = 450;
const HEIGHT = 500;
const HEADER = 30;
const MARGIN_BOTTOM = -10;

export default function Notepad() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hovering, setHovering] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Last content we know matches the server, so we don't re-save (or get
  // re-flagged dirty by) a value that just came from the server.
  const lastSyncedRef = useRef("");
  const savingRef = useRef(false);
  // Notepad's updatedAt as last known — compared against /api/version so we
  // only refetch the content when it actually changed on the server.
  const versionRef = useRef("");

  useEffect(() => {
    fetch("/api/notepad")
      .then((r) => r.json())
      .then((d) => {
        const content = d.content ?? "";
        setNotes(content);
        lastSyncedRef.current = content;
        versionRef.current = d.updatedAt ?? "";
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const save = useCallback((content: string) => {
    setSaving(true);
    savingRef.current = true;
    fetch("/api/notepad", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      keepalive: true,
    })
      .then(async (r) => {
        if (!r.ok) return;
        lastSyncedRef.current = content;
        // Adopt the server's new updatedAt so our own save doesn't look like a
        // remote change on the next version poll.
        const saved = await r.json().catch(() => null);
        if (saved?.updatedAt) versionRef.current = saved.updatedAt;
      })
      .finally(() => { setSaving(false); savingRef.current = false; });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (notes === lastSyncedRef.current) return; // nothing changed locally
    const t = setTimeout(() => save(notes), 600);
    return () => clearTimeout(t);
  }, [notes, loaded, save]);

  // Live sync: poll the tiny /api/version signature; only fetch the notepad
  // content when it actually changed on the server. Only apply the server value
  // when the user isn't actively editing (textarea unfocused, no save in
  // flight, no unsaved local change) so we never wipe what they're typing.
  useEffect(() => {
    if (!loaded) return;
    const id = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      if (document.activeElement === textareaRef.current) return;
      if (savingRef.current) return;
      if (notes !== lastSyncedRef.current) return; // unsaved local edit pending
      try {
        const vRes = await fetch("/api/version");
        if (!vRes.ok) return;
        const v = await vRes.json();
        if (v.notepad === versionRef.current) return; // unchanged
        const d = await fetch("/api/notepad").then((r) => r.json());
        versionRef.current = d.updatedAt ?? "";
        const content = d.content ?? "";
        if (content !== lastSyncedRef.current) {
          lastSyncedRef.current = content;
          setNotes(content);
        }
      } catch {
        // Network blip — try again next tick.
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [loaded, notes]);

  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  let translateY: number;
  if (open) translateY = -MARGIN_BOTTOM;
  else if (hovering) translateY = -MARGIN_BOTTOM;
  else translateY = HEIGHT - HEADER;

  return (
    <div
      ref={ref}
      className="fixed z-20"
      style={{
        right: 80,
        bottom: 0,
        width: WIDTH,
        height: HEIGHT,
        transform: `translateY(${translateY}px)`,
        transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        cursor: open ? "default" : "pointer",
      }}
      onMouseEnter={() => { if (!open) setHovering(true); }}
      onMouseLeave={() => setHovering(false)}
      onClick={() => { if (!open) setOpen(true); }}
    >
      <div
        className="w-full h-full bg-white rounded-lg border-2 border-zinc-900 flex flex-col overflow-hidden pb-5"
        style={{ boxShadow: "3px 3px 0 #1a1a1a" }}
      >
        {/* Header tab */}
        <div
          className="flex items-center justify-between px-4 border-b-2 border-zinc-900 bg-amber-50 shrink-0 cursor-pointer"
          style={{ height: HEADER }}
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        >
          <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">Public Notepad</span>
          <span className="text-xs text-zinc-400">{saving ? "saving..." : "saved"}</span>
        </div>

        {/* Lined writing area */}
        <div className="flex-1 relative bg-white">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: "repeating-linear-gradient(to bottom, transparent, transparent 23px, #dbeafe 23px, #dbeafe 24px)",
              backgroundPositionY: 8,
            }}
          />
          <div className="absolute top-0 bottom-0 left-9 w-px bg-rose-300/50 pointer-events-none" />
          <textarea
            ref={textareaRef}
            className="w-full h-full resize-none bg-transparent px-4 pl-11 py-2 text-sm text-zinc-800 outline-none font-mono leading-6"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Jot something down..."
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
