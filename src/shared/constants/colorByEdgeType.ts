import type { DrawnEdgeType, EdgeType } from './types';

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface EdgeStyle {
  color: string;
  lineStyle: LineStyle;
}

// Single source of truth for edge styling, keyed by upstream edge `data.type`,
// covering ALL wire edge types. The stylesheet resolves a colour/line-style per
// edge from this map regardless of mode — styling an edge type that has no edges
// in the current view is harmless. `pod-runs-on-node` only appears as a drawn
// edge in `service` pod-parent mode (features/pod-parent-mode); in the default
// `node` mode the backend expresses it as compound nesting (design D31) so no
// such edge exists. Which types are *drawn* (and shown in the legend) per mode is
// derived by `drawnEdgeTypesForMode`.
export const EDGE_STYLE_BY_TYPE: Record<EdgeType, EdgeStyle> = {
  'pod-runs-on-node': { color: '#3b82f6', lineStyle: 'solid' },
  'pod-mounts-pvc': { color: '#a855f7', lineStyle: 'dotted' },
  'pod-calls-pod': { color: '#f97316', lineStyle: 'solid' },
  'service-selects-pod': { color: '#10b981', lineStyle: 'dashed' },
};

// The edges drawn in the default `node` mode. Derived from the master map so the
// colour values stay single-sourced. Kept for callers that only need the
// node-mode drawn set; mode-aware callers use `drawnEdgeTypesForMode`.
export const COLOR_BY_EDGE_TYPE: Record<DrawnEdgeType, EdgeStyle> = {
  'pod-mounts-pvc': EDGE_STYLE_BY_TYPE['pod-mounts-pvc'],
  'pod-calls-pod': EDGE_STYLE_BY_TYPE['pod-calls-pod'],
  'service-selects-pod': EDGE_STYLE_BY_TYPE['service-selects-pod'],
};

export const FALLBACK_EDGE_STYLE: EdgeStyle = { color: '#94a3b8', lineStyle: 'solid' };
