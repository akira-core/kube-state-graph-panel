// Single source of truth for cluster accent colours. Used by:
//   * normalize.ts — assigned to each backend-provided `type: "cluster"` container
//     node as `data.clusterColor` (the grouping STRUCTURE comes from the backend's
//     `parent` field untouched; only the colour is a frontend/presentation concern).
//   * the legend's ClusterLegend — swatches must match the on-canvas boxes.
//
// Hues are confined to the cool arc (sky → cyan → indigo → violet → magenta →
// pink) for two reasons: (1) they MUST stay clear of the STATUS colours — green
// (#73BF69 normal), yellow (#F2CC0C warning), red (#E02F44 critical) — so a
// cluster accent is never mistaken for node health; hence no green/lime/amber/
// orange/red. (2) Translucent backplates still read distinctly from the edge
// palette. The old amber/lime/teal were dropped precisely because they sat next
// to the warning/normal status colours.
export const CLUSTER_PALETTE = [
  '#0ea5e9', // sky blue
  '#22d3ee', // cyan
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#c026d3', // fuchsia
  '#ec4899', // pink
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
