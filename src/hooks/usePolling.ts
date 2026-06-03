import { useEffect, useRef } from "react";
import { POLL_INTERVAL_MS } from "@/lib/liveSync";

// Runs `tick` every POLL_INTERVAL_MS while `enabled` is true and the tab is
// visible. The latest callback is kept in a ref so callers can pass an inline
// function (closing over fresh state) without re-creating the interval on every
// render. Each tick decides for itself whether there's anything to do.
export default function usePolling(tick: () => void, enabled: boolean = true) {
  const savedTick = useRef(tick);
  useEffect(() => {
    savedTick.current = tick;
  });

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      savedTick.current();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled]);
}
