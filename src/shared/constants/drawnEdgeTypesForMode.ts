import type { EdgeType, PodParentMode } from './types';

// The edge types actually drawn (and listed in the legend) for each pod-parent
// mode. In `node` mode the pod↔node relationship is compound nesting and the
// pod↔service relationship is the drawn `service-selects-pod` edge. In `service`
// mode this swaps: the pod nests in its Service so `service-selects-pod` becomes
// nesting (not drawn), and the pod↔node relationship is the drawn
// `pod-runs-on-node` edge synthesised by features/pod-parent-mode.
const DRAWN_BY_MODE: Record<PodParentMode, readonly EdgeType[]> = {
  node: ['pod-mounts-pvc', 'pod-calls-pod', 'pod-calls-service', 'service-selects-pod'],
  service: ['pod-mounts-pvc', 'pod-calls-pod', 'pod-calls-service', 'pod-runs-on-node'],
};

export function drawnEdgeTypesForMode(mode: PodParentMode): EdgeType[] {
  return [...DRAWN_BY_MODE[mode]];
}
