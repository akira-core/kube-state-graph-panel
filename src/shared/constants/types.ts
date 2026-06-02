// Aligned with upstream kube-state-graph `GET /v1/graph` cytoscape payload.
// Node `data.type` and edge `data.type` enums are the source of truth here;
// see internal/graph/{node,edge}.go in the backend repo.

export type NodeKind = 'pod' | 'node' | 'pvc' | 'service' | 'others' | 'external';

// Full wire contract: every edge type the backend's core graph can carry.
export type EdgeType = 'pod-runs-on-node' | 'pod-mounts-pvc' | 'pod-calls-pod' | 'service-selects-pod';

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

// Which K8s object a pod is compound-nested under (panel-side view toggle, not a
// wire value). 'node' (default) = backend's view: pod nests in its K8s node,
// `pod-runs-on-node` is nesting and `service-selects-pod` is drawn. 'service' =
// pod nests in its selecting Service, `service-selects-pod` becomes nesting and
// `pod-runs-on-node` is drawn. See features/pod-parent-mode.
export type PodParentMode = 'node' | 'service';
