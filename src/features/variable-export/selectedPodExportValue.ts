import type { GraphNodeKind, NodeStatus } from '../../shared/constants/types';

// The minimal slice of the selected node this decision needs. Structurally a subset
// of node-detail's NodeDetailData (kind?/status?/label), so KsgPanel passes that
// directly — but kept local so variable-export does not depend on node-detail.
export interface SelectedPodExportInput {
  kind?: GraphNodeKind;
  status?: NodeStatus;
  label: string;
}

// "non-normal" = the two unhealthy statuses. A node with no status is treated as
// normal (nothing to surface) — consistent with the data-driven status model.
const NON_NORMAL_STATUS: ReadonlySet<NodeStatus> = new Set<NodeStatus>(['warning', 'critical']);

/**
 * The value to write into the selected-pod variable: `[label]` ONLY when this is a
 * LEFT-click selection of a pod whose status is non-normal; otherwise `[]` (which the
 * writer turns into the `$__empty` clear sentinel). Right-click (`isLeftClick: false`),
 * a normal/status-less pod, a non-pod, and no selection all clear.
 */
export function selectedPodExportValue(node: SelectedPodExportInput | null, isLeftClick: boolean): string[] {
  if (!isLeftClick || node === null) {
    return [];
  }
  if (node.kind !== 'pod') {
    return [];
  }
  if (node.status === undefined || !NON_NORMAL_STATUS.has(node.status)) {
    return [];
  }
  return [node.label];
}
