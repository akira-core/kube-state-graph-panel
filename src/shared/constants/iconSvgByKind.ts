import type { NodeKind } from './types';

// Single source of truth for node identity: kind → monochrome line-art icon.
// Replaces SHAPE_BY_KIND's identity role — leaf nodes now share one container
// shape (round-rectangle) and are told apart by this icon (drawn as the node's
// background-image). Each SVG is single-colour and uses the `currentColor`
// sentinel so it can be tinted per Grafana theme via tintSvgToDataUri.
//
// Authoring rules (load-bearing — verified against the cytoscape.js style docs):
// - Prefix the XML header `<?xml version="1.0" encoding="UTF-8"?>`. The docs say
//   "Always include this XML header in each SVG image"; without it cytoscape
//   rasterises NOTHING onto the canvas (an <img> is lenient and still shows the
//   glyph, which is why the legend looked fine while the on-canvas node was blank).
// - Include `xmlns` + explicit `width`/`height` (24×24, matching the viewBox).
// - Use stroke-based art (fill="none") so the glyph stays crisp at small sizes
//   and tints cleanly.
// - Keep the sentinel literally `currentColor` (tintSvgToDataUri swaps it).
//
// These are intentionally simple in-house glyphs; the map is the only thing that
// needs to change to swap in a richer set later (e.g. Argo CD's resource icons).

const SVG_OPEN =
  '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">';
const SVG_CLOSE = '</svg>';

const icon = (inner: string): string => `${SVG_OPEN}${inner}${SVG_CLOSE}`;

export const ICON_SVG_BY_KIND: Record<NodeKind, string> = {
  // The iconic Kubernetes 7-sided heptagon. Reads as "a pod".
  pod: icon('<polygon points="12,3 19,6.4 20.8,14 15.9,20.1 8.1,20.1 3.2,14 5,6.4"/>'),
  // Desktop computer: a monitor screen on a stand. Reads as "a machine / host".
  node: icon('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v3M8.5 19h7"/>'),
  pvc: icon('<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6 v12 a7 2.6 0 0 0 14 0 V6"/>'),
  service: icon(
    '<circle cx="12" cy="5.5" r="2.2"/><circle cx="6" cy="18.5" r="2.2"/><circle cx="18" cy="18.5" r="2.2"/><path d="M12 7.7 V13 M12 13 L6.8 16.6 M12 13 L17.2 16.6"/>'
  ),
  // Rack-switch chassis: front-panel port row + status LED. Reads as hardware.
  switch: icon(
    '<rect x="2.5" y="8" width="19" height="8" rx="1.5"/><rect x="5" y="10.4" width="2" height="3.2" rx="0.4"/><rect x="8" y="10.4" width="2" height="3.2" rx="0.4"/><rect x="11" y="10.4" width="2" height="3.2" rx="0.4"/><rect x="14" y="10.4" width="2" height="3.2" rx="0.4"/><circle cx="18.7" cy="12" r="0.9"/>'
  ),
  // Cloud: "outside the cluster / internet". Plump rounded cloud (single stroke).
  external: icon(
    '<path d="M7 18C4.8 18 3 16.2 3 14C3 12.1 4.4 10.5 6.2 10.1C6.8 7.7 9.2 6 12 6C14.8 6 17.2 7.7 17.8 10.1C19.6 10.5 21 12.1 21 14C21 16.2 19.2 18 17 18Z"/>'
  ),
  // Controller glyphs follow the k8s / Argo CD visual LANGUAGE but are ORIGINAL
  // redraws in our monochrome outline style — the raw Argo SVGs are filled
  // silhouettes + multi-colour (and cronjob.svg has a broken clip-path ref), so
  // they were deliberately not vendored (no third-party files → no attribution).
  // Deployment: the rolling-update circular arrow (k8s/Argo deploy motif).
  deployment: icon('<path d="M20 12a8 8 0 1 1-2.34-5.66"/><polyline points="20 3.5 20 7.5 16 7.5"/>'),
  // StatefulSet: a box of ORDERED rows (ordinal dots) — ordered, persistent replicas.
  statefulset: icon(
    '<rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="9.33" x2="20" y2="9.33"/><line x1="4" y1="14.66" x2="20" y2="14.66"/><circle cx="7" cy="6.7" r="0.55"/><circle cx="7" cy="12" r="0.55"/><circle cx="7" cy="17.3" r="0.55"/>'
  ),
  // DaemonSet: one box per node, sitting on a baseline — "a pod on every node".
  daemonset: icon(
    '<rect x="3.3" y="5.5" width="5" height="6" rx="1"/><rect x="9.5" y="5.5" width="5" height="6" rx="1"/><rect x="15.7" y="5.5" width="5" height="6" rx="1"/><line x1="2.5" y1="16.5" x2="21.5" y2="16.5"/>'
  ),
  // Job: a grid of squares (parallel completions, Argo's job motif) + a checkmark.
  job: icon(
    '<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><polyline points="14 17.5 16.5 20 20 14.5"/>'
  ),
  // CronJob: a clock — "scheduled job".
  cronjob: icon('<circle cx="12" cy="12" r="8"/><polyline points="12,7.5 12,12 15.5,14"/>'),
  // StorageClass: a database cylinder with two internal layer lines — one clean
  // shape (continuous side walls, unlike the earlier disjoint-tiers version) that
  // reads as "a class/tier of storage", distinct from the single-segment pvc
  // cylinder. Only ever drawn when the group is COLLAPSED (an expanded storageclass
  // box is a labelled container with no icon, like a K8s node container — see
  // getStylesheet's node:parent rule).
  storageclass: icon(
    '<ellipse cx="12" cy="5.5" rx="7" ry="2.4"/><path d="M5 5.5 v13 a7 2.4 0 0 0 14 0 V5.5"/><path d="M5 9.8 a7 2.4 0 0 0 14 0"/><path d="M5 14.1 a7 2.4 0 0 0 14 0"/>'
  ),
};

// Drawn for any kind not in the map, so upstream/backend additions never vanish.
export const FALLBACK_ICON_SVG = icon(
  '<rect x="4.5" y="4.5" width="15" height="15" rx="2.5"/><line x1="4.5" y1="9.5" x2="19.5" y2="9.5"/>'
);

export function iconSvgForKind(kind: string | undefined): string {
  if (kind !== undefined && kind in ICON_SVG_BY_KIND) {
    const svg = ICON_SVG_BY_KIND[kind as NodeKind];
    if (svg !== undefined) {
      return svg;
    }
  }
  return FALLBACK_ICON_SVG;
}
