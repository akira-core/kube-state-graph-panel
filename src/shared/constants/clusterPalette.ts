// Single source of truth for cluster accent colours. Used by:
//   * normalize.ts — assigned to each backend-provided `type: "cluster"` container
//     node as `data.clusterColor` (the grouping STRUCTURE comes from the backend's
//     `parent` field untouched; only the colour is a frontend/presentation concern).
//   * the legend's ClusterLegend — swatches must match the on-canvas boxes.
//
// Hues are picked to be distinct from the edge palette (blue/purple/orange/green
// in colorByEdgeType) so a translucent cluster backplate never reads as an edge.
export const CLUSTER_PALETTE = [
  '#14b8a6', // teal
  '#ec4899', // pink
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#84cc16', // lime
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
