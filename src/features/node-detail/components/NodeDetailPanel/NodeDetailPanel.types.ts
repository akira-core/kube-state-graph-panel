import type { NodeAlert, NodeKind, NodeStatus } from '../../../../shared/constants/types';

// The slice of a node's data the detail panel needs. Resolved by KsgPanel from
// the selected node id (cluster containers excluded).
export interface NodeDetailData {
  id: string;
  label: string;
  kind?: NodeKind;
  status?: NodeStatus;
  alerts?: NodeAlert[]; // node's alerts; absent/empty → "No alerts"
}

export interface NodeDetailPanelProps {
  node: NodeDetailData | null; // null → panel closed (renders nothing)
  onClose: () => void;
  // Invoked with the clicked alert's time (Unix SECONDS); KsgPanel rewinds the
  // dashboard time range to a fixed ±5m window around it.
  onAlertTimeClick: (timeSec: number) => void;
  timeZone?: string; // for formatting alert times in the table
}
