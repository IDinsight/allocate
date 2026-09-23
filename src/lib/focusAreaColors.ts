// Stacked-bar segment colors for FocusArea. Keys are the enum identifiers
// stored on Project.focusArea (see FOCUS_AREA_OPTIONS in ProjectsTable.tsx
// for the matching display labels). "Uncategorized" covers projects with no
// focus area set.
export const FOCUS_AREA_COLORS: Record<string, string> = {
  AI_enabled_Dashboards: "#8ecae6", // sky-blue-light
  Public_Participation: "#219ebc", // blue-green
  Education: "#126782", // cerulean
  CHW_AI: "#023047", // deep-space-blue
  Benefits_AI: "#ffb703", // amber-flame
  Ecosystem: "#fd9e02", // amber-glow
  Not_a_focus_area: "#fb8500", // princeton-orange
  Uncategorized: "#a1a1aa", // zinc-400
};

export const FOCUS_AREA_LABELS: Record<string, string> = {
  AI_enabled_Dashboards: "AI-enabled Dashboards",
  Public_Participation: "Public-Participation",
  Education: "Education",
  CHW_AI: "CHW AI",
  Benefits_AI: "Benefits AI",
  Ecosystem: "Ecosystem",
  Not_a_focus_area: "Not a focus area",
  Uncategorized: "Uncategorized",
};

export const FOCUS_AREA_ORDER = Object.keys(FOCUS_AREA_COLORS);
