import type { EdgeType, NodeKind } from './types';

export type LineStyle = 'solid' | 'dashed' | 'dotted';

// How the edge routes on canvas. 'taxi' = orthogonal right-angle channels (the
// physical switch fabric); everything else is a direct bezier. A REQUIRED field
// so a new edge type cannot silently fall back to the wrong routing — the
// stylesheet derives its taxi selector from this map (no hardcoded type lists).
export type EdgeRouting = 'bezier' | 'taxi';

export interface EdgeStyle {
  color: string;
  lineStyle: LineStyle;
  routing: EdgeRouting;
}

// Source → target node kinds for each edge type. The legend renders an edge type
// as `<from> → <to>` (the arrow replacing the verb), so it needs the endpoints
// explicitly rather than parsing the hyphenated wire string. Single source of
// truth, keyed by the same `data.type` enum as `EDGE_STYLE_BY_TYPE`.
// `'controller'` is a display-only label used when the edge originates from any
// controller kind (StatefulSet/DaemonSet/Job/CronJob/Deployment); the real
// controller kind is carried on the node's `data.kind`, not here.
export interface EdgeEndpoints {
  from: NodeKind | 'controller';
  to: NodeKind | 'controller';
}

export const EDGE_ENDPOINTS_BY_TYPE: Record<EdgeType, EdgeEndpoints> = {
  'pod-runs-on-node': { from: 'pod', to: 'node' },
  'pod-mounts-pvc': { from: 'pod', to: 'pvc' },
  'pod-calls-pod': { from: 'pod', to: 'pod' },
  'pod-calls-service': { from: 'pod', to: 'service' },
  'service-selects-pod': { from: 'service', to: 'pod' },
  'controller-owns-pod': { from: 'controller', to: 'pod' },
  'switch-to-switch': { from: 'switch', to: 'switch' },
  'node-to-switch': { from: 'node', to: 'switch' },
};

// Single source of truth for edge styling, keyed by upstream edge `data.type`,
// covering ALL wire edge types. The stylesheet resolves a colour/line-style per
// edge from this map regardless of mode — styling an edge type that has no edges
// in the current view is harmless. `pod-runs-on-node` only appears as a drawn
// edge in `controller` pod-parent mode (features/pod-parent-mode); in the default
// `node` mode the backend expresses it as compound nesting (design D31) so no
// such edge exists. Which types are *drawn* (and shown in the legend) per mode is
// derived by `drawnEdgeTypesForMode`.
// All edges are SOLID — direction is conveyed by the arrowhead, and same-direction
// distinctions by colour. (No dashed/dotted strokes.) Same-colour pairs
// (pod→service / service→pod share indigo) differ only by arrow direction.
export const EDGE_STYLE_BY_TYPE: Record<EdgeType, EdgeStyle> = {
  'pod-runs-on-node': { color: '#3b82f6', lineStyle: 'solid', routing: 'bezier' },
  'pod-mounts-pvc': { color: '#a855f7', lineStyle: 'solid', routing: 'bezier' },
  'pod-calls-pod': { color: '#f97316', lineStyle: 'solid', routing: 'bezier' },
  // Service edges (pod→service / service→pod) share the SAME orange (#f97316) as
  // pod-calls-pod: a pod→service→pod hop is conceptually still a pod-to-pod
  // relationship, just with the Service as an extra layer. They are also OMITTED from
  // the edge legend (the single `pod ↔ pod/service` row covers them) — see EdgeLegend. (Was
  // green #10b981, which collided with the status-normal green border, then briefly
  // indigo; unified to the pod-calls-pod colour per the "still pod-to-pod" model.)
  'pod-calls-service': { color: '#f97316', lineStyle: 'solid', routing: 'bezier' },
  'service-selects-pod': { color: '#f97316', lineStyle: 'solid', routing: 'bezier' },
  // Controller → pod ownership edge (controller-mode topology: cluster > controller > pod).
  // Rose (#ec4899) is the "ownership" hue — distinct from blue/cyan (node edges),
  // orange (pod-calls-pod & service edges), purple (pvc), and not the reserved
  // status red.
  'controller-owns-pod': { color: '#ec4899', lineStyle: 'solid', routing: 'bezier' },
  // Physical network fabric (backend v0.0.18). Both switch↔switch and node→switch
  // share the cyan infra colour + taxi routing — separating them by colour added
  // confusion without benefit now that direction is already conveyed by arrowhead.
  'switch-to-switch': { color: '#06b6d4', lineStyle: 'solid', routing: 'taxi' },
  'node-to-switch': { color: '#06b6d4', lineStyle: 'solid', routing: 'taxi' },
};

export const FALLBACK_EDGE_STYLE: EdgeStyle = { color: '#94a3b8', lineStyle: 'solid', routing: 'bezier' };
