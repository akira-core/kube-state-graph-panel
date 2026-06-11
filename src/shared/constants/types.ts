// Aligned with upstream kube-state-graph `GET /v1/graph` cytoscape payload.
// Node `data.type` and edge `data.type` enums are the source of truth here;
// see internal/graph/{node,edge}.go in the backend repo.

// Identity is encoded by a per-kind icon (see iconSvgByKind.ts), not by shape, so
// this enum can grow without exhausting the shape budget. Workload controller
// kinds (deployment/statefulset/daemonset/job/cronjob) are panel-renderable as
// soon as the backend emits them; ReplicaSet is intentionally absent — the
// backend collapses Deployment → ReplicaSet → Pod, so pods attribute directly to
// their top-level controller and a ReplicaSet node never appears.
export type NodeKind =
  | 'pod'
  | 'node'
  | 'pvc'
  | 'service'
  | 'external'
  | 'switch'
  | 'deployment'
  | 'statefulset'
  | 'daemonset'
  | 'job'
  | 'cronjob'
  // A backend-synthesized StorageClass compound GROUP (cluster > storageclass > pvc).
  // It is also tagged `isStorageClass` (see cytoscape.d.ts) and behaves like the K8s
  // `node` container: icon-less while an expanded box, shows its icon when collapsed.
  | 'storageclass'
  // A virtual compound GROUP wrapping the physical switch fabric (network > switch).
  // Pure grouping box, collapsible like other containers; collapsing swaps
  // `switch` → `network` in the node-kinds legend (deriveLegendKinds). Never
  // carries status/alerts.
  | 'network';

// Full wire contract: every edge type the backend's core graph can carry.
// `switch-to-switch` / `node-to-switch` are the physical network-fabric edges
// added in backend v0.0.18 (pkg/graph/edge.go); they involve neither pods nor
// controllers, so they are drawn in both pod-parent modes.
export type EdgeType =
  | 'pod-runs-on-node'
  | 'pod-mounts-pvc'
  | 'pod-calls-pod'
  | 'pod-calls-service'
  | 'service-selects-pod'
  | 'controller-owns-pod'
  | 'switch-to-switch'
  | 'node-to-switch';

// Edge types the panel actually DRAWS. The backend's compound Cytoscape view
// (the only format this panel consumes) expresses `pod-runs-on-node` as
// compound nesting (cluster > node > pod) and omits it as an edge — see
// serialise.go / design D31. So it is excluded from the drawn map, the legend,
// the filter, and the stylesheet. It remains in `EdgeType` because it is still a
// valid wire value (the Grafana Node Graph format retains it).
export type DrawnEdgeType = Exclude<EdgeType, 'pod-runs-on-node'>;

// Health status carried on leaf nodes (upstream data.status). Drives the status
// border colour (pod/node/pvc) and the detail panel badge. Absent/unknown values
// are normalised to 'normal'.
export type NodeStatus = 'normal' | 'warning' | 'critical';

// The KNOWN alert-severity tiers that carry a dedicated badge colour. A DISTINCT
// scale from node health status: an alert is by definition not-normal (so no
// 'normal' tier) and carries an 'info' tier that node status never has. The
// backend sends node.status and alert.severity as separate attributes; the
// detail-panel alert table colours from SEVERITY_COLOR (see colorBySeverity.ts),
// not STATUS_COLOR. NodeAlert.severity itself is a free-form `string` (users
// define custom labels) — these three just get a non-neutral colour.
export type AlertSeverity = 'info' | 'warning' | 'critical';

// A single alert attached to a node, carried on the optional upstream graph-JSON
// node field `alerts` and surfaced in the detail panel's alert table. The backend
// groups repeats of the same alert into ONE entry whose `time_records` wire field
// lists every occurrence time; `normalizeGraph` projects that to `timeRecords`.
export interface NodeAlert {
  pod?: string;
  service?: string;
  name: string; // alert name
  // Free-form label from the backend: 'info'/'warning'/'critical' get a dedicated
  // colour (see SEVERITY_COLOR), any other custom label is kept verbatim and
  // rendered in the critical fallback colour. Never dropped for being "unknown".
  severity: string;
  // Every occurrence time of this (grouped) alert, Unix epoch SECONDS, ASCENDING.
  // Count = timeRecords.length, last-occurred = max(timeRecords) (the last element); both
  // are derived at render, never stored. A legacy backend's single `time` scalar
  // normalises to a one-element list. The panel converts to milliseconds only at the
  // render / time-rewind boundary.
  timeRecords: number[];
  id?: string; // optional stable row id; synthesised from name+records+index if absent
}

// Which K8s object a pod is compound-nested under (panel-side view toggle, not a
// wire value). 'node' (default) = backend's view: pod nests in its K8s node,
// `controller-owns-pod` is a drawn edge and `pod-runs-on-node` is nesting.
// 'controller' = pod nests under its owning controller; `controller-owns-pod`
// becomes nesting and `pod-runs-on-node` is drawn. See features/pod-parent-mode.
export type PodParentMode = 'node' | 'controller';
