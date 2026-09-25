// Input rules shared by the allocation write routes. Kept out of the route
// files because Next.js only allows HTTP-method exports from a route module.

/** Mirrors the grid cell (AllocationCell): any whole percentage from 0 up.
 *  The cell rounds its 0.25-style input to an integer percent and rejects
 *  negatives; 0 means "clear the cell". There is no upper bound in the UI. */
export const isValidFraction = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0;
