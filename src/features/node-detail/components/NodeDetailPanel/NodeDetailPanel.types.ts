import type { NodeAlert, NodeKind, NodeStatus } from '../../../../shared/constants/types';
import type { ContainerSpec } from '../../../../shared/types/containerSpec';
import type { NodeDetailLookups } from '../../hooks/useNodeDetailUrls';

// The slice of a node's data the detail panel needs. Resolved by KsgPanel from
// the selected node id (cluster containers excluded).
export interface NodeDetailData {
  id: string;
  label: string;
  kind?: NodeKind;
  status?: NodeStatus;
  alerts?: NodeAlert[]; // node's alerts; absent/empty → "No alerts"
  application?: string; // ArgoCD application (pod passthrough / controller aggregate)
  containers?: ContainerSpec[]; // pod containers / controller (name,image)-deduped union
  // Controller identity both detail-URL queries use (design D4): a pod resolves
  // it from data.owner, a controller from itself, a standalone pod from its own
  // kind/name. Present only on the DETAIL_URL_KINDS the queries may fire for.
  queryTarget?: { kind: string; name: string };
}

export interface NodeDetailPanelProps {
  node: NodeDetailData | null; // null → panel closed (renders nothing)
  onClose: () => void;
  // Invoked with the clicked alert's time (Unix SECONDS); KsgPanel rewinds the
  // dashboard time range to a fixed ±5m window around it.
  onAlertTimeClick: (timeSec: number) => void;
  timeZone?: string; // for formatting alert times in the table
  // Eager-prefetched Change Report state behind the Application / Containers
  // sections: resolved per-target lookup state (loading / ready anchor /
  // unavailable hint). Omitted → idle/disabled (no endpoint / left-click
  // selection): sections still render their data, every target shows the hint.
  lookups?: NodeDetailLookups;
  // Which sections to render — the two click paths show disjoint content:
  //   'alerts' (default; left-click selection) → Alerts table only
  //   'detail' (right-click)                   → Application / Containers only
  view?: 'alerts' | 'detail';
}
