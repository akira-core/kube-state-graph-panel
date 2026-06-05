// Single source of truth for cluster accent colours. Used by:
//   * normalize.ts — assigned to each backend-provided `type: "cluster"` container
//     node as `data.clusterColor` (the grouping STRUCTURE comes from the backend's
//     `parent` field untouched; only the colour is a frontend/presentation concern).
//   * the legend's ClusterLegend — swatches must match the on-canvas boxes.
//
// Muted, professional cool tones — desaturated steel-blue / slate / plum rather
// than neon accents, so a board full of clusters reads calm, not busy. Hues stay
// on the cool arc (blue → indigo → violet → muted teal) for two reasons: (1) they
// MUST stay clear of the STATUS colours — green (#73BF69 normal), yellow (#F2CC0C
// warning), red (#E02F44 critical) — so a cluster accent is never mistaken for
// node health; hence no green/lime/amber/orange/red. (2) At these medium
// lightnesses they read as legible label text on the dark theme AND as faint
// translucent backplates. Used as the box tint, the legend swatch, and (now) the
// expanded node-container label colour.
export const CLUSTER_PALETTE = [
  '#3f7fbf', // steel blue
  '#3f9f9f', // teal
  '#6b6fc8', // indigo
  '#8a63b5', // violet
  '#b05f8f', // muted rose
  '#5a96c8', // sky blue
] as const;

// Deterministic colour for a cluster, keyed by a stable hash of its name. A given
// cluster keeps its colour regardless of which OTHER clusters are present — which
// matters for a live-polling panel where the cluster set changes between refreshes
// (a positional index would reshuffle colours when a cluster appears/disappears).
// Hash collisions can give two clusters the same colour; that is preferable to a
// cluster's colour flipping between polls.
export function colorForCluster(cluster: string): string {
  let hash = 0;
  for (let i = 0; i < cluster.length; i++) {
    hash = (hash * 31 + cluster.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % CLUSTER_PALETTE.length;
  return CLUSTER_PALETTE[index] ?? CLUSTER_PALETTE[0];
}
