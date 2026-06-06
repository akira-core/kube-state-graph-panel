import type { EdgeType, PodParentMode } from './types';

// The edge types actually drawn (and listed in the legend) for each pod-parent
// mode. In `node` mode the pod↔node relationship is compound nesting and the
// pod↔controller relationship is the drawn `controller-owns-pod` edge. In
// `controller` mode this swaps: the pod nests in its controller so
// `controller-owns-pod` becomes nesting (not drawn), and the pod↔node
// relationship is the drawn `pod-runs-on-node` edge synthesised by
// features/pod-parent-mode. Service edges (`service-selects-pod` /
// `pod-calls-service`) are drawn in both modes.
//
// `switch-to-switch` / `node-to-switch` are physical network-fabric edges
// (backend v0.0.18) involving neither pods nor controllers, so they are drawn in
// BOTH modes.
const SWITCH_EDGES = ['switch-to-switch', 'node-to-switch'] as const;
const DRAWN_BY_MODE: Record<PodParentMode, readonly EdgeType[]> = {
  node: [
    'pod-mounts-pvc',
    'pod-calls-pod',
    'pod-calls-service',
    'service-selects-pod',
    'controller-owns-pod',
    ...SWITCH_EDGES,
  ],
  controller: [
    'pod-mounts-pvc',
    'pod-calls-pod',
    'pod-calls-service',
    'service-selects-pod',
    'pod-runs-on-node',
    ...SWITCH_EDGES,
  ],
};

export function drawnEdgeTypesForMode(mode: PodParentMode): EdgeType[] {
  return [...DRAWN_BY_MODE[mode]];
}
