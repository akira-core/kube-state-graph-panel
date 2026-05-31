# Design — v0.0.14 Compound Demo Redesign

**Date:** 2026-05-31
**Branch:** `feat/ksg-panel`
**Status:** Approved (design)

## Goal

Redesign the self-contained demo so it exercises **every** kube-state-graph
v0.0.14 node kind and edge type against the **compound-node** (`type: "cluster"`,
`data.parent`) Cytoscape output, then verify the panel renders the nested
topology as expected.

Driving requirements from the user:

1. 2 clusters, 2 K8s nodes each.
2. A MongoDB 3-replica StatefulSet behind a **headless** Service — exercises the
   `<pod-hostname>.<service>.<namespace>.svc…` resolution to the **real backing
   pod** (no Service node).
3. A NATS 3-replica workload behind a **ClusterIP** Service — exercises the
   `<service>.<namespace>.svc…` resolution to a **Service node** with
   `service-selects-pod` fan-out to every backing pod.
4. Fill in the remaining coverage: `pvc`, `others`, `external`, cross-cluster
   `pod-calls-pod`, IP enrichment.

## Backend contract (v0.0.14, verified from source)

Node kinds (`internal/graph/node.go`): `pod`, `node`, `pvc`, `service`,
`others`, `external`. Edge types (`internal/graph/edge.go`): `pod-runs-on-node`,
`pod-mounts-pvc`, `pod-calls-pod`, `service-selects-pod`.

**Compound serialisation (`internal/api/serialise.go`, design D31) — load-bearing:**

- A synthetic `type:"cluster"`, `id:"cluster/<name>"` group node is emitted per
  distinct cluster.
- `data.parent`: a **pod** nests under its scheduling K8s node (`labels.node`,
  rewritten to `<cluster>/<node>`) when that node is in the view, else its
  cluster group; **node/service/pvc** nest under their cluster group;
  **others/external** carry empty labels so they get **no parent**.
- **`pod-runs-on-node` edges are OMITTED from the Cytoscape view** — the relation
  is expressed by the compound nesting (cluster › node › pod). They survive only
  in the Grafana Node Graph serialisation, which the panel does not consume.

**Connection-string resolution (`internal/build/servicegraph.go`, D29):** a
service-graph endpoint with an empty `*_k8s_pod_uid` and a `://` label is parsed
by `classifyK8sDNS` after stripping a trailing `.svc.<domain>`:

- 2 dotted labels `<svc>.<ns>` → **Service node** (+ `service-selects-pod` to
  every backing pod from the endpointslice index). ClusterIP carried as
  `ipaddress`; the headless sentinel `"None"` ⇒ no ipaddress.
- 3 dotted labels `<host>.<svc>.<ns>` → **real backing pod**, matched by
  endpointslice `hostname` first, then the StatefulSet `pod-name == hostname`
  convention (`PodsByNameNS`).
- otherwise / unresolved → **others** node.

A non-URL label with empty UID → **external** node (D27 fallback). The query
layer drops series whose client/server is exactly `user` or `unknown` (D30).

## Topology (split: one stateful pattern per cluster)

```
cluster/prod                                  cluster/dr
  node prod-1 [ExternalIP 203.0.113.10,         node dr-1
              zone us-east-1a]                     ├ pod consumer   (ns apps,      uid u-consumer)
    ├ pod gateway    (ns apps,  uid u-gateway)     ├ pod nats-0     (ns messaging, uid u-nats-0)
    ├ pod mongodb-0  (ns data,  uid u-mongo-0)     └ pod nats-1     (ns messaging, uid u-nats-1)
    └ pod mongodb-1  (ns data,  uid u-mongo-1)   node dr-2 [zone eu-west-1b]
  node prod-2                                       └ pod nats-2     (ns messaging, uid u-nats-2)
    └ pod mongodb-2  (ns data,  uid u-mongo-2)   svc nats (ClusterIP 10.96.0.50)  ← consumer
  svc mongodb (headless, cluster_ip=None)             ⇒ service-selects-pod ⇒ nats-0/1/2
    (3-label DNS → resolves to real pod, no node)
  pvc mongodb-data-mongodb-{0,1,2}
```

**Service-graph calls (seed.sh, monotonic counters so `rate()>0`):**

| client                        | server                                                                    | resolves to                  | edge(s)                                |
| ----------------------------- | ------------------------------------------------------------------------- | ---------------------------- | -------------------------------------- |
| prod/gateway (u-gateway)      | `mongodb://mongodb-{0,1,2}.mongodb.data.svc.cluster.local:27017` (no UID) | real mongodb pods (headless) | 3× pod-calls-pod                       |
| prod/gateway                  | `https://api.stripe.com/v1/charges` (no UID)                              | others node                  | pod-calls-pod                          |
| prod/gateway                  | dr/consumer (server uid u-consumer)                                       | dr pod via UID index         | cross-cluster pod-calls-pod            |
| dr/consumer (u-consumer)      | `nats://nats.messaging.svc.cluster.local:4222` (no UID)                   | nats Service node + fan-out  | pod-calls-pod + 3× service-selects-pod |
| legacy-cron (no UID, non-URL) | prod/gateway (server uid u-gateway)                                       | external node → gateway      | pod-calls-pod                          |

## Coverage matrix (Cytoscape / compound view = what the panel sees)

| Node kind          | source                                                               | count |
| ------------------ | -------------------------------------------------------------------- | ----- |
| pod                | gateway, consumer, mongodb-0/1/2, nats-0/1/2                         | 8     |
| node               | prod-1/2, dr-1/2                                                     | 4     |
| pvc                | mongodb-data-mongodb-0/1/2                                           | 3     |
| service            | nats (ClusterIP); mongodb headless deliberately does NOT materialise | 1     |
| others             | api.stripe.com URL                                                   | 1     |
| external           | legacy-cron                                                          | 1     |
| cluster (compound) | prod, dr                                                             | 2     |

| Edge type           | rendering                                     | count                     |
| ------------------- | --------------------------------------------- | ------------------------- |
| pod-calls-pod       | orange solid                                  | 7 (incl. 1 cross-cluster) |
| pod-mounts-pvc      | purple dotted                                 | 3                         |
| service-selects-pod | green dashed                                  | 3 (nats fan-out)          |
| pod-runs-on-node    | **nesting** (pod inside node box) — not drawn | —                         |

## Panel changes (match v0.0.14 compound semantics)

The panel consumes the Cytoscape format only, where `pod-runs-on-node` is never
an edge. To keep the legend/filter honest:

- `shared/constants/types.ts`: keep `EdgeType` as the full 4-type **wire**
  contract; add `DrawnEdgeType = Exclude<EdgeType, 'pod-runs-on-node'>`.
- `shared/constants/colorByEdgeType.ts`: retype `COLOR_BY_EDGE_TYPE` to
  `Record<DrawnEdgeType, EdgeStyle>` (3 entries), with a comment citing D31.
  The single-source map auto-propagates to the stylesheet edge selectors, the
  `EdgeLegend`, and the element-filter's `ALL_EDGE_TYPES`.
- `legend`: add a short "Nesting" note — pod inside a node box = runs-on-node;
  node/service/pvc inside a cluster box = cluster membership.
- Update affected tests (`EdgeLegend`, element-filter) to the 3-type reality.

No change needed to compound rendering itself: `normalize.ts` already tags
`type:"cluster"` containers and passes `parent` through; `getStylesheet.ts` has
`node:parent` + cluster-container styling; `HoverTooltip` skips cluster boxes;
`ClusterLegend` swatches per cluster.

## docker-compose

`kube-state-graph.image` tag `${KSG_BACKEND_TAG:-v0.0.13}` → `:-v0.0.14`.
No new env required (compound is automatic; `KSG_PROM_URL` unchanged).

## Verification plan

1. `docker compose up -d` (seeder re-pushes the new fixture).
2. `curl /v1/graph?start&end` → `jq` assertions matching the coverage matrix
   (type counts, `parent` nesting, the cross-cluster edge, nats fan-out).
3. `npm run build` → `dev/screenshot.mjs` to confirm 2 cluster boxes, nested
   node boxes, and the 3 drawn edge types.
4. `npm run typecheck && npm run lint && npm run test:ci` green.

## Out of scope

- Real cluster / kubeconfig (demo stays VictoriaMetrics-seeded).
- Backend code changes (panel + demo only).
- Grafana Node Graph format support in the panel.
