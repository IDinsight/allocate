// Stacked-bar segment colors for Pillar. "Uncategorized" covers projects
// with no pillar set.
export const PILLAR_COLORS: Record<string, string> = {
  Products: "#264653", // charcoal-blue
  Services: "#2a9d8f", // verdigris
  Advisory: "#e9c46a", // tuscan-sun
  Internal: "#f4a261", // sandy-brown
  Admin: "#e76f51", // burnt-peach
  Government: "#ec8c74", // salmon
  Uncategorized: "#a1a1aa", // zinc-400
};

export const PILLAR_ORDER = Object.keys(PILLAR_COLORS);
