// Single source of truth for application (ArgoCD app) accent colours. Used by:
//   * normalize.ts — assigned to each backend `application` group node as
//     `data.applicationColor` (the grouping STRUCTURE comes from the backend's
//     `parent` field untouched; only the colour is a frontend/presentation concern).
//   * the legend's ApplicationLegend — swatches must match the on-canvas boxes.
//
// Mirrors namespacePalette (design D9). An application box is the INNERMOST decorative
// group (cluster > namespace > application > controller > pod), so two hard constraints
// (mechanically enforced by applicationPalette.test.ts):
//   (1) MUST avoid the STATUS colours — green (#73BF69), yellow (#F2CC0C), red
//       (#E02F44) — so an application tint is never mistaken for node health.
//   (2) MUST NOT collide with CLUSTER_PALETTE or NAMESPACE_PALETTE — application boxes
//       nest inside namespace boxes inside cluster boxes; the same hex on nested boxes
//       would be unreadable.
// The set leans to brighter sky / teal / violet hues, distinct from the muted cluster
// arc and the warm namespace arc, so the innermost box reads as its own layer.
export const APPLICATION_PALETTE = [
  '#0ea5e9', // sky blue
  '#14b8a6', // teal
  '#a78bfa', // light violet
  '#f472b6', // pink
  '#fb923c', // light orange
  '#22d3ee', // cyan
  '#818cf8', // indigo
  '#e879f9', // fuchsia
] as const;

// Deterministic colour for an application, keyed by a stable hash of its name (same
// scheme as colorForNamespace / colorForCluster). An application keeps its colour
// regardless of which OTHER applications / namespaces / clusters are present — so on a
// live-polling panel an application's colour never reshuffles between refreshes, and the
// SAME application name in two namespaces reads as the same colour. Hash collisions can
// give two applications the same colour; that is preferable to a colour flipping between
// polls.
export function colorForApplication(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % APPLICATION_PALETTE.length;
  return APPLICATION_PALETTE[index] ?? APPLICATION_PALETTE[0];
}
