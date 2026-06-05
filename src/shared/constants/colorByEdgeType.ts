import type { DrawnEdgeType, EdgeType, NodeKind } from './types';

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface EdgeStyle {
  color: string;
  lineStyle: LineStyle;
}

// Source → target node kinds for each edge type. The legend renders an edge type
// as `<from> → <to>` (the arrow replacing the verb), so it needs the endpoints
// explicitly rather than parsing the hyphenated wire string. Single source of
// truth, keyed by the same `data.type` enum as `EDGE_STYLE_BY_TYPE`.
export interface EdgeEndpoints {
  from: NodeKind;
  to: NodeKind;
}

export const EDGE_ENDPOINTS_BY_TYPE: Record<EdgeType, EdgeEndpoints> = {
  'pod-runs-on-node': { from: 'pod', to: 'node' },
  'pod-mounts-pvc': { from: 'pod', to: 'pvc' },
  'pod-calls-pod': { from: 'pod', to: 'pod' },
  'pod-calls-service': { from: 'pod', to: 'service' },
  'service-selects-pod': { from: 'service', to: 'pod' },
  'switch-to-switch': { from: 'switch', to: 'switch' },
  'node-to-switch': { from: 'node', to: 'switch' },
};

// Single source of truth for edge styling, keyed by upstream edge `data.type`,
// covering ALL wire edge types. The stylesheet resolves a colour/line-style per
// edge from this map regardless of mode — styling an edge type that has no edges
// in the current view is harmless. `pod-runs-on-node` only appears as a drawn
// edge in `service` pod-parent mode (features/pod-parent-mode); in the default
// `node` mode the backend expresses it as compound nesting (design D31) so no
// such edge exists. Which types are *drawn* (and shown in the legend) per mode is
// derived by `drawnEdgeTypesForMode`.
// All edges are SOLID — direction is conveyed by the arrowhead, and same-direction
// distinctions by colour. (No dashed/dotted strokes.) Same-colour pairs
// (pod→service / service→pod share green) differ only by arrow direction.
export const EDGE_STYLE_BY_TYPE: Record<EdgeType, EdgeStyle> = {
  'pod-runs-on-node': { color: '#3b82f6', lineStyle: 'solid' },
  'pod-mounts-pvc': { color: '#a855f7', lineStyle: 'solid' },
  'pod-calls-pod': { color: '#f97316', lineStyle: 'solid' },
  'pod-calls-service': { color: '#10b981', lineStyle: 'solid' },
  'service-selects-pod': { color: '#10b981', lineStyle: 'solid' },
  // Physical network fabric (backend v0.0.18). switch↔switch is the cyan fabric
  // (taxi-routed); node→switch is a distinct indigo direct uplink so the two are
  // separable by colour now that neither uses a dashed stroke.
  'switch-to-switch': { color: '#06b6d4', lineStyle: 'solid' },
  'node-to-switch': { color: '#6366f1', lineStyle: 'solid' },
};

// The edges drawn in the default `node` mode. Derived from the master map so the
// colour values stay single-sourced. Kept for callers that only need the
// node-mode drawn set; mode-aware callers use `drawnEdgeTypesForMode`.
export const COLOR_BY_EDGE_TYPE: Record<DrawnEdgeType, EdgeStyle> = {
  'pod-mounts-pvc': EDGE_STYLE_BY_TYPE['pod-mounts-pvc'],
  'pod-calls-pod': EDGE_STYLE_BY_TYPE['pod-calls-pod'],
  'pod-calls-service': EDGE_STYLE_BY_TYPE['pod-calls-service'],
  'service-selects-pod': EDGE_STYLE_BY_TYPE['service-selects-pod'],
  'switch-to-switch': EDGE_STYLE_BY_TYPE['switch-to-switch'],
  'node-to-switch': EDGE_STYLE_BY_TYPE['node-to-switch'],
};

export const FALLBACK_EDGE_STYLE: EdgeStyle = { color: '#94a3b8', lineStyle: 'solid' };
