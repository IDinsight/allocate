// Line colors for Level, in seniority order. Teammates with no level set
// are excluded from level-based charts rather than bucketed here.
export const LEVEL_COLORS: Record<string, string> = {
  INT: "#f94144", // strawberry-red
  I: "#f3722c", // atomic-tangerine
  II: "#f8961e", // carrot-orange
  III: "#f9c74f", // tuscan-sun
  IV: "#90be6d", // willow-green
  AD: "#43aa8b", // seagrass
  D: "#577590", // blue-slate
};

export const LEVEL_ORDER = Object.keys(LEVEL_COLORS);
