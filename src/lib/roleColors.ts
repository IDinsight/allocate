// Line colors for Role. Teammates with no role set are excluded from
// role-based charts rather than bucketed here.
export const ROLE_COLORS: Record<string, string> = {
  DS: "#eac435", // saffron
  DE: "#345995", // dusk-blue
  FSE: "#03cea4", // mint-leaf
  PM: "#fb4d3d", // tomato
};

export const ROLE_ORDER = Object.keys(ROLE_COLORS);
