// Shared client-side "activity" signal used to coordinate live-sync polling.
//
// The app fetches everyone's data on an interval so changes show up without a
// manual refresh. But a blind refetch would clobber an edit that's still
// in-flight (its write hasn't landed in the DB yet) or a cell/draft the user is
// actively typing into. So mutations register here while in flight, and cells
// register while being edited; the poller skips a tick whenever anything is
// busy. Because every mutation is awaited, by the time things go idle the
// write has already reached the DB, so the next refetch returns it rather than
// reverting it.

// Polling cadence. Each tick is a tiny /api/version check; the heavy fetch only
// runs when that signature changes, so a short interval stays cheap.
export const POLL_INTERVAL_MS = 1000;

let pendingWrites = 0;
let activeEdits = 0;
// Bumped every time a write starts. A background refetch captures this before
// fetching and re-checks it before applying: if it changed, the user edited
// something mid-fetch and the fetched snapshot may be stale, so it's dropped.
let writeGeneration = 0;

// Wrap a mutation request so live-sync polling (and the unload guard) know a
// write is in flight. Returns the same promise, so callers can still await it.
export function trackWrite<T>(p: Promise<T>): Promise<T> {
  pendingWrites++;
  writeGeneration++;
  // Decrement once settled. Swallow rejection on this branch only — the
  // original promise `p` is returned untouched for the caller to handle.
  p.finally(() => {
    pendingWrites--;
  }).catch(() => {});
  return p;
}

// Monotonic counter of writes started — for stale-snapshot detection.
export function getWriteGeneration(): number {
  return writeGeneration;
}

// True while any mutation request is in flight.
export function hasPendingWrites(): boolean {
  return pendingWrites > 0;
}

// Call when a cell enters edit mode; the returned fn ends the edit.
export function beginEditing(): () => void {
  activeEdits++;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    activeEdits--;
  };
}

// True while a write is in flight or a cell is being actively edited.
export function isBusy(): boolean {
  return pendingWrites > 0 || activeEdits > 0;
}
