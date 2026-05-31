import type { NodeKind, NodeStatus } from '../../../../shared/constants/types';

// The slice of a node's data the detail panel needs. Resolved by KsgPanel from
// the selected node id (cluster containers excluded).
export interface NodeDetailData {
  id: string;
  label: string;
  kind?: NodeKind;
  status?: NodeStatus;
}

export interface NodeDetailPanelProps {
  node: NodeDetailData | null; // null → panel closed (renders nothing)
  onClose: () => void;
}
