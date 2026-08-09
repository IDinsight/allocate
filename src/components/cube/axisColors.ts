export type Axis = "project" | "teammate" | "time";

/**
 * One colour per axis, shared by the 3D scene and the header logo so the two
 * read as the same object. Kept in its own module deliberately: the logo must
 * not import anything that pulls three.js into the main bundle.
 */
export const AXIS_COLORS: Record<Axis, string> = {
  project: "#7c3aed",
  teammate: "#059669",
  time: "#d97706",
};
