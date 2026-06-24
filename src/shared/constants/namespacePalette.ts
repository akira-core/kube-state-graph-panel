// Single source of truth for namespace accent colours. Used by:
//   * applyNamespaceGrouping — assigned to each synthesized namespace box as
//     `data.namespaceColor` (controller mode only).
//   * the legend's NamespaceLegend — swatches must match the on-canvas boxes.
//
// A curated, high-contrast, colourblind-leaning categorical palette. Two hard
// constraints (mechanically enforced by namespacePalette.test.ts):
//   (1) MUST avoid the STATUS colours — green (#73BF69), yellow (#F2CC0C), red
//       (#E02F44) — so a namespace tint is never mistaken for node health.
//   (2) MUST NOT collide with CLUSTER_PALETTE (cluster boxes enclose namespace
//       boxes; same hex on nested boxes would be unreadable).
// The set leans to warm / magenta / emerald hues away from cluster's cool arc.
//
// NOTE (deferred, see change `namespace-compound-grouping` tasks 5.5 / 17.2): the
// exact hex list + dual-theme contrast + colourblind (deuteranopia / protanopia)
// simulation are pending visual validation; these values satisfy the mechanical
// constraints and are a reasonable starting set.
export const NAMESPACE_PALETTE = [
  '#e8833a', // orange
  '#c2407a', // magenta
  '#2a9d8f', // emerald teal
  '#9c6ade', // bright violet
  '#d9a21b', // amber gold
  '#1f9e89', // emerald
  '#cc6677', // dusty rose
  '#6699cc', // soft blue
] as const;

// Deterministic colour for a namespace, keyed by a stable hash of its name (same
// scheme as colorForCluster). A namespace keeps its colour regardless of which
// OTHER namespaces / clusters are present — so on a live-polling panel a namespace's
// colour never reshuffles between refreshes, and the SAME namespace name in two
// clusters reads as the same colour. Hash collisions can give two namespaces the
// same colour; that is preferable to a colour flipping between polls.
export function colorForNamespace(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % NAMESPACE_PALETTE.length;
  return NAMESPACE_PALETTE[index] ?? NAMESPACE_PALETTE[0];
}
