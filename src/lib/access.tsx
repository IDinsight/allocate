"use client";

import { createContext, useContext, useEffect, useState } from "react";

// Whether to show editing affordances. The proxy is what actually enforces
// write access, so this only affects what's on screen — it starts closed and
// opens once /api/me confirms edit access.

const CanEditContext = createContext(false);

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setCanEdit(data?.access === "edit");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return <CanEditContext.Provider value={canEdit}>{children}</CanEditContext.Provider>;
}

export function useCanEdit() {
  return useContext(CanEditContext);
}
