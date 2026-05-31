import type { DrawnEdgeType } from './types';

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface EdgeStyle {
  color: string;
  lineStyle: LineStyle;
}

// Single source of truth for DRAWN edges: keyed by upstream edge `data.type`.
// The stylesheet, the legend, and the filter's ALL_EDGE_TYPES all derive from
// this map. `pod-runs-on-node` is intentionally absent — the backend's compound
// Cytoscape view expresses it as nesting (cluster > node > pod) rather than an
// edge (design D31), so the panel never draws it.
export const COLOR_BY_EDGE_TYPE: Record<DrawnEdgeType, EdgeStyle> = {
  'pod-mounts-pvc': { color: '#a855f7', lineStyle: 'dotted' },
  'pod-calls-pod': { color: '#f97316', lineStyle: 'solid' },
  'service-selects-pod': { color: '#10b981', lineStyle: 'dashed' },
};

export const FALLBACK_EDGE_STYLE: EdgeStyle = { color: '#94a3b8', lineStyle: 'solid' };
