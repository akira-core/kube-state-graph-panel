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
  '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">';
const SVG_CLOSE = '</svg>';

const icon = (inner: string): string => `${SVG_OPEN}${inner}${SVG_CLOSE}`;

export const ICON_SVG_BY_KIND: Record<NodeKind, string> = {
  pod: icon('<polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5"/>'),
  node: icon(
    '<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="6.5" cy="14.5" r="1"/>'
  ),
  pvc: icon('<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6 v12 a7 2.6 0 0 0 14 0 V6"/>'),
  service: icon(
    '<circle cx="12" cy="5.5" r="2.2"/><circle cx="6" cy="18.5" r="2.2"/><circle cx="18" cy="18.5" r="2.2"/><path d="M12 7.7 V13 M12 13 L6.8 16.6 M12 13 L17.2 16.6"/>'
  ),
  switch: icon(
    '<rect x="3" y="5.5" width="18" height="9" rx="1.5"/><circle cx="6.5" cy="8" r="0.8"/><circle cx="9.5" cy="8" r="0.8"/><line x1="6" y1="14.5" x2="6" y2="18"/><line x1="10" y1="14.5" x2="10" y2="18"/><line x1="14" y1="14.5" x2="14" y2="18"/><line x1="18" y1="14.5" x2="18" y2="18"/>'
  ),
  external: icon(
    '<circle cx="12" cy="12" r="8"/><line x1="4" y1="12" x2="20" y2="12"/><path d="M12 4 a12 8 0 0 1 0 16 a12 8 0 0 1 0-16"/>'
  ),
  deployment: icon(
    '<rect x="3.5" y="6" width="17" height="12" rx="2"/><circle cx="8" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="16" cy="12" r="1.4"/>'
  ),
  statefulset: icon(
    '<rect x="4" y="5" width="16" height="5" rx="1.2"/><rect x="4" y="13" width="16" height="5" rx="1.2"/><circle cx="7.5" cy="7.5" r="0.9"/><circle cx="7.5" cy="15.5" r="0.9"/>'
  ),
  daemonset: icon(
    '<rect x="2.5" y="9" width="5" height="6" rx="1"/><rect x="9.5" y="9" width="5" height="6" rx="1"/><rect x="16.5" y="9" width="5" height="6" rx="1"/>'
  ),
  job: icon('<rect x="4" y="4" width="16" height="16" rx="2"/><polyline points="8,12.5 11,15.5 16,9"/>'),
  cronjob: icon('<circle cx="12" cy="12" r="8"/><polyline points="12,7.5 12,12 15.5,14"/>'),
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
