// Aligned with upstream kube-state-graph `GET /v1/graph` cytoscape payload.
// Node `data.type` and edge `data.type` enums are the source of truth here;
// see internal/graph/{node,edge}.go in the backend repo.

export type NodeKind = 'pod' | 'node' | 'pvc' | 'service' | 'others' | 'external';

export type EdgeType = 'pod-runs-on-node' | 'pod-mounts-pvc' | 'pod-calls-pod' | 'service-selects-pod';
