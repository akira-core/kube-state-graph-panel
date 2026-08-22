# graph-data-integration delta — sync-netapp-storage-nodes

## MODIFIED Requirements

### Requirement: Upstream kube-state-graph payload contract (cytoscape.js shape)

The upstream `kube-state-graph` backend's `GET /v1/graph` endpoint emits JSON in **cytoscape.js elements shape**, and this panel MUST treat it as the sole data-source contract and normalize accordingly. The backend (design **D6**, commit `787573b`, replacing the old D31 `cluster > node > pod` model) is now the **single source of truth for the entire topology hierarchy**. The top-level shape is:

```
{ apiVersion: string, clusters: string[], elements: { nodes: CyNode[], edges: CyEdge[] } }
```

Each node and edge is wrapped in a `data` object per cytoscape convention:

- `CyNode.data { id: string, name: string, type: string, parent?: string, ipaddress?: string[], owner?: { kind: string, name: string }, application?: string, containers?: Array<{ name: string; image: string }>, storageclass?: string, health?: string, usage?: { used_bytes?: number, capacity_bytes?: number }, labels: Record<string,string> }`
- `CyEdge.data { id: string, type: string, source: string, target: string, labels: Record<string,string>, metrics?: EdgeMetricsUnion }`

The backend's node `type` enum (lowercase): the core resources `pod` / `node` / `pvc` / `service` / `external`; **physical storage** `netapp-aggr` / `netapp-node`; the **compound group nodes** `cluster` / `storage-cluster` / `namespace` / `application` / `controller`; and physical networking `switch`. A `controller` group's `type` is the literal string `controller` (**not** a lowercased workload Kind); its Kind lives only in the id path and in its child pods' `owner.kind`. A `node` is a leaf under its cluster. An endpoint that maps to no concrete K8s resource becomes `external` (the contract has no `others` type). `storageclass` **has been removed from the contract** — the backend no longer emits that node type, and a claim's StorageClass name now rides on the PVC's own `data.storageclass` (string, omitempty).

**The NetApp storage chain.** `netapp-aggr` (an ONTAP aggregate, id `netapp/<ontap-cluster>/aggr/<aggr>`) is the physical unit a PVC actually lands on, and its `labels` are exactly `{ontap_cluster, node}` (`node` = the controller currently owning the aggregate); `netapp-node` (an ONTAP controller, id `netapp/<ontap-cluster>/<node>`) has `labels` of exactly `{ontap_cluster}`. Neither carries a `cluster` label (they belong to no K8s cluster and never appear in the top-level `clusters[]`), so the panel's cluster accent and cluster filtering do not apply to them. Both may carry `health` (exactly `"online"` or `"degraded"`, omitempty); `netapp-aggr` may additionally carry `usage`. **An absent `health` is not the same as `"degraded"`** — absence means the backend has no status data for it, and consumers MUST NOT read absence as `"degraded"`.

**The `usage` field** has the shape `{ used_bytes?: number, capacity_bytes?: number }` (bytes, JSON numbers) and appears on both `pvc` (from kubelet volume stats) and `netapp-aggr` (from Harvest aggregate space) with an **identical shape**. The object itself appears when at least one field resolved; a field that did not resolve is simply absent (never filled with `0`).

The backend's edge `type` enum: `pod-to-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-netapp-aggr`, plus the physical-network fabric edges `switch-to-switch` / `node-to-switch`. `pod-to-node` (pod→node) expresses a pod's relationship to its K8s node (since D6, pod-runs-on-node is no longer expressed as nesting); `pvc-to-netapp-aggr` (pvc→netapp-aggr) connects a PVC to the ONTAP aggregate holding its FlexVol (replacing the removed `pvc-to-storageclass`); `pod-calls-service` (pod→service) and `service-selects-pod` (service→pod) are a pair pointing in opposite directions. Edge visuals (colour, line style, arrowheads) are defined by the panel-rendering spec.

**Edge `metrics` is a union of two mutually exclusive families.** A single edge carries one family or the other, never a mixture:

1. **The RED family** (trace-derived edges): attached when the backend resolved both endpoints to a `pod` or `service` node and the edge came from `traces_service_graph_request_*` series. In practice only `pod-calls-pod` and `pod-calls-service` can carry it. Its fields are `rate` / `error_rate` / `p90_server_ms`.
2. **The I/O family** (`pvc-to-netapp-aggr` edges only): six **measurement** fields — `read_ops` / `write_ops` / `read_latency_us` / `write_latency_us` / `read_bytes_per_sec` / `write_bytes_per_sec` — plus two **declared-ceiling** fields, `max_iops` / `max_bytes_per_sec`. All eight are **independently** optional (each corresponds to its own Harvest series family, and a missing family costs only its own field). ops are per-second counts, latency is an average in microseconds, and throughput is bytes per second — all values the backend passes through verbatim.

   The measurement fields and the ceiling fields come from **two different hops** of the backend's NetApp join and degrade independently: the six measurements come from the Harvest QoS workload families (hop B), while the two ceilings come from the QoS fixed-policy families (hop C), joined to an already-matched workload series on the `(ontap_cluster, svm, policy_group)` triple. The backend therefore guarantees that **a ceiling field can never appear without at least one measurement field** — the panel MAY rely on that invariant, but MUST NOT assume the converse: a measured volume that belongs to no QoS policy group carries no ceiling at all, and that is a normal state, not an error.

The `service-selects-pod` / `pod-to-node` / `pod-mounts-pvc` / fabric edges, any edge with an `external` endpoint, and every backend-synthesised edge MUST be treated as **never carrying** `metrics`. The per-field contract is:

- `rate`: requests per second over the query window (**req/s**, not a cumulative count). **When the RED family is present** this field is always present and > 0; but because `metrics` is now a union, consumers MUST NOT assume `rate` exists on an arbitrary `metrics` object (the I/O family never has it).
- `error_rate`: the failure **ratio**, in `[0,1]` (**not** a percentage). Absence means the failure counter **could not be read**; `0` means **it was read successfully and there were no failures** — two different states, and consumers MUST NOT treat absence as `0`.
- `p90_server_ms`: the p90 request duration observed server-side, in **milliseconds**. Absent when no classic histogram is available (for example a native histogram or `vmrange`).
- `read_ops` / `write_ops`: reads and writes per second.
- `read_latency_us` / `write_latency_us`: average read and write latency, in **microseconds** (µs).
- `read_bytes_per_sec` / `write_bytes_per_sec`: read and write throughput, in **bytes per second** (decimal). **Not** a cumulative byte count, and not KB or MB.
- `max_iops`: the IOPS ceiling declared by the QoS policy group the volume belongs to (operations per second), passed through verbatim by the backend.
- `max_bytes_per_sec`: the throughput ceiling declared by that same policy group, in **bytes per second**. This is the **one field the backend converts** (from Harvest's megabytes-per-second figure, multiplied by `1048576`), precisely so it carries the same unit as `read_bytes_per_sec` / `write_bytes_per_sec` and the two compare directly. The panel MUST NOT apply any further unit conversion.
- **Absence semantics for both ceiling fields**: absence means the volume has **no declared ceiling** (it belongs to no QoS policy group, or that policy does not set this dimension). It MUST NOT be rendered as `0`, MUST NOT be rendered as an `∞` / `unlimited` sentinel, and MUST NOT be used to derive a utilisation percentage — an absent ceiling renders no row at all.

The backend emits every number at **6 significant digits**, so values may arrive in exponent form (for example `3.86e-7`); the panel MUST format from the actual value and MUST NOT assume small integers. When `metrics` is absent the key does not appear at all (not `null`, not `0`). None of these numeric fields may appear in the `labels` map — `labels` stays a strict `Record<string,string>`.

`ipaddress` is an **array** (possibly several IPs, possibly empty), carried only by `pod` / `node` / `service` nodes. Upstream commit `524057b` moved IP data out of `labels` (formerly `pod_ip` / `host_ip` / `external_ip`) into this dedicated field, so the panel MUST read IPs from `data.ipaddress` and **MUST NOT** read them from `labels`.

**The D6 parent chain (`data.parent`).** The workload chain is `cluster > namespace > application > controller > pod`; `pvc` / `service` parent directly onto their `namespace` group; `node` is a leaf under its cluster. **The storage chain is `storage-cluster > netapp-node > netapp-aggr`** — and its middle tier, `netapp-node`, is a **real node** (it has a kind, an icon, and is selectable) rather than a decorative group. This is the one place in the contract where a real node acts as a compound parent, and the panel MUST build the nesting verbatim from `data.parent` rather than re-expressing it as an edge because the parent happens to be a real kind. The `namespace` / `application` / `storage-cluster` groups have `labels: {}`, no status, and no edges; they exist purely as `data.parent` targets.

**Pod controller attribution.** The backend still carries `data.owner: { kind, name }`, `application: <string>`, and `labels.node` (its K8s node id) on the pod node **even though that pod is now nested under its `controller` group via `data.parent`**. The backend now **emits directly** the `controller` / `namespace` / `application` group nodes and the `pod-to-node` edge — the panel no longer synthesises a controller node or a `controller-owns-pod` edge from `data.owner` (that client-side synthesis has been removed). A PVC that did not join a NetApp aggregate (no `volumename`, no matching Harvest series, or a matched series with an empty `aggr`) gets **no** `pvc-to-netapp-aggr` edge from the backend.

#### Scenario: Contract fields anchored on the backend golden fixture

- **WHEN** `normalizeGraph` is fed the contents of the backend's `internal/api/testdata/golden/with-netapp-storage-cytoscape.json`
- **THEN** it parses the corresponding number of nodes and edges, and the three node types `netapp-aggr` / `netapp-node` / `storage-cluster` and the `pvc-to-netapp-aggr` edge are all mapped correctly

#### Scenario: The backend D6 hierarchy is consumed verbatim, and a pod nested under a controller keeps owner / application / labels.node

- **WHEN** an upstream pod node's `data` carries `owner: { kind: "StatefulSet", name: "mongo" }`, `application: "mongo"`, and `labels.node: "prod/node-1"`, with its `data.parent` pointing at a `controller` group
- **THEN** normalize synthesises no controller node and no `controller-owns-pod` edge, and preserves that pod's `owner` / `application` / `labels.node` along with its backend `parent`

#### Scenario: pod-to-node and pvc-to-netapp-aggr edges are mapped

- **WHEN** the upstream edges include `type: 'pod-to-node'` (pod→node) and `type: 'pvc-to-netapp-aggr'` (pvc→netapp-aggr; replacing the removed `pvc-to-storageclass` this scenario originally named)
- **THEN** both map to their corresponding `edgeType` and neither falls into the unknown-type fallback

#### Scenario: A PVC with no aggregate join has no storage edge

- **WHEN** a PVC did not join a NetApp aggregate (the backend emitted no corresponding `pvc-to-netapp-aggr` edge; the `pvc-to-storageclass` edge type this scenario originally described has been removed from the contract)
- **THEN** normalize produces no storage edge for it, and the PVC remains an ordinary node

#### Scenario: RED metrics contract anchored on the backend golden fixture

- **WHEN** `normalizeGraph` is fed content shaped like the backend's `internal/api/testdata/golden/with-red-metrics-cytoscape.json` (one payload holding an edge with a complete `metrics: { rate, error_rate, p90_server_ms }`, an edge with only `{ rate, error_rate }`, and an edge with no `metrics` at all)
- **THEN** all three edges parse into elements whose `metrics` field is respectively complete, restricted to the fields present, and absent

#### Scenario: NetApp nodes carry no cluster label and stay out of clusters[]

- **WHEN** the upstream payload holds `netapp-aggr` and `netapp-node` nodes whose `labels` are `{ontap_cluster, node}` and `{ontap_cluster}` respectively
- **THEN** neither has a `cluster` label, normalize assigns neither a cluster accent, and the top-level `clusters[]` contains no ONTAP cluster name

### Requirement: Recognition and colouring of backend group nodes (namespace / application / controller)

`normalizeGraph` SHALL recognise the four compound group nodes the backend emits directly (`data.type` of `namespace` / `application` / `controller` / `storage-cluster`) and normalize them into **decorative compound parents** the same way the existing `cluster` flag-group is handled — giving none of them a `kind` except `controller` (so they are invisible to the kind filter and the icon legend, and `computeVisibility` skips them: no kind ⇒ always visible, subject only to the orphan cascade). Their `data.parent` always **passes through verbatim** (the panel does not restructure; it only assigns an accent colour). **Selectability is governed by panel-rendering's "Interaction and selection state"**: the `namespace` / `application` groups and `controller` all stay selectable (the selection-driven collapse cue depends on it; selecting a `namespace` opens no detail panel, while `application` is a detail-eligible exception), and the `cluster` and `storage-cluster` groups are `selectable: false`. normalize MUST NOT set `selectable: false` on `namespace` / `application` / `controller` — the canvas's tap gate (`single.selectable()`) would then discard their clicks, so the collapse cue would never appear and the controller / application detail panel would never open. The mapping is:

- `namespace` → `{ isNamespace, namespace: <label>, namespaceColor }` — **reusing** the existing `isNamespace` flag, stylesheet selector, and `NamespaceLegend`; the accent is a fixed per-kind colour (see panel-rendering, "Decorative compound groups use fixed per-kind colours and a kind-prefixed label").
- `application` → `{ isApplication, application: <label>, applicationColor }` — **adding** the `isApplication` flag, `applicationPalette.ts`, a stylesheet selector, and `ApplicationLegend`; the accent is likewise a fixed per-kind colour.
- `storage-cluster` → `{ isStorageCluster, storageCluster: <label>, storageClusterColor }` — the decorative frame around an ONTAP cluster, accent likewise a fixed per-kind colour; `selectable: false` like `cluster` (the selectable real nodes are the `netapp-node` / `netapp-aggr` beneath it).
- `controller` → `{ isController: true, kind: <the child pod's owner.kind, lowercased> }` (see "pod / service / pvc `application` and pod `containers` passthrough, and controller aggregation"): a controller carries a real `kind` so it keeps its detail panel, making it both a compound parent and a glyph-bearing node (drawing that kind's icon when collapsed).

The `namespace` / `application` / `storage-cluster` groups have `labels: {}`, no status, and no edges; they exist purely as `data.parent` targets.

For the decorative groups (`cluster` / `storage-cluster` / `namespace` / `application`), `normalizeGraph` MUST set `data.label` to the bare upstream name (`data.name`, falling back to the id) and **MUST NOT** write a kind prefix (`Cluster:` / `Storage:` / `Namespace:` / `Release Unit:`). The prefixed on-canvas label is the stylesheet's render-only mapper's job (see panel-rendering); the bare `data.label` serves the tooltip title and other identity consumers.

#### Scenario: A namespace group is normalized and coloured

- **WHEN** an upstream node has `data.type === 'namespace'`, `name === 'shop'`, and a `parent` pointing at its cluster container
- **THEN** normalize produces `isNamespace: true`, `namespace: 'shop'`, `label: 'shop'` (bare, with no `Namespace:` prefix), and `namespaceColor` as the fixed per-kind accent; it carries **no** `kind`, does **not** set `selectable: false` (it stays selectable, cue-driven — see panel-rendering, "Interaction and selection state"), and its `parent` passes through verbatim

#### Scenario: An application group is normalized and coloured

- **WHEN** an upstream node has `data.type === 'application'`, `name === 'checkout'`, and a `parent` pointing at its namespace group
- **THEN** normalize produces `isApplication: true`, `application: 'checkout'`, `label: 'checkout'` (bare, with no `Release Unit:` prefix), and `applicationColor` as the fixed per-kind accent; it carries **no** `kind`, does **not** set `selectable: false` (it stays selectable; `application` is detail-eligible — see panel-rendering), and its `parent` passes through verbatim

#### Scenario: A cluster group is normalized to a bare label

- **WHEN** an upstream node has `data.type === 'cluster'` and `name === 'prod'`
- **THEN** normalize produces `isCluster: true`, `cluster: 'prod'`, `label: 'prod'` (bare, with no `Cluster:` prefix), `clusterColor` as the fixed per-kind accent, and `selectable: false`

#### Scenario: A storage-cluster group is normalized to a bare label

- **WHEN** an upstream node has `data.type === 'storage-cluster'` and `name === 'ontap-prod'` (with no `parent`)
- **THEN** normalize produces `isStorageCluster: true`, `storageCluster: 'ontap-prod'`, `label: 'ontap-prod'` (bare, no prefix), and `storageClusterColor` as the fixed per-kind accent; it carries **no** `kind` and is `selectable: false`

#### Scenario: A controller group is flagged isController and takes its kind from a child pod (staying selectable)

- **WHEN** an upstream node has `data.type === 'controller'` (with no `kind`) and one of its child pods has `owner.kind === 'StatefulSet'`
- **THEN** normalize produces `isController: true` and `kind: 'statefulset'`, passes `parent` through verbatim, and **MUST NOT** set `selectable: false` (a controller is detail-eligible and must stay selectable to open the detail panel)

#### Scenario: Kind-less groups are invisible to the kind filter and the icon legend

- **WHEN** `computeVisibility` and the icon-legend derivation run over the `namespace` / `application` / `storage-cluster` groups
- **THEN** all three are skipped by `computeVisibility` for having no `kind` (always visible, subject only to the orphan cascade) and none appears in the icon legend

### Requirement: Edge metrics normalization and per-field degradation

`normalizeGraph` MUST carry an upstream edge's `data.metrics` onto the produced cytoscape edge's `data.metrics` **under the same names and the same units**, with its type declared in `src/shared/types/cytoscape.d.ts` via declaration merging. `metrics` is a union of two mutually exclusive families (see "Upstream kube-state-graph payload contract"): the RED family `rate` / `errorRate` / `p90ServerMs`, and the I/O family `readOps` / `writeOps` / `readLatencyUs` / `writeLatencyUs` / `readBytesPerSec` / `writeBytesPerSec` / `maxIops` / `maxBytesPerSec` (snake_case → camelCase, nothing else changed). This is **pure passthrough plus validation**: the panel MUST NOT convert units, convert to percentages, round, or fill in defaults at this layer — formatting belongs to the rendering layer.

Validation and degradation rules (metrics are an additional information layer, so **no metrics problem may ever make an edge disappear**):

- `metrics` is not a plain object → discard the whole `metrics`; the edge is produced as usual.
- `rate` is present but is not a `number` or is not finite (`NaN` / `±Infinity`) → discard the whole `metrics` (`rate` is the RED family's required field); the edge is produced as usual.
- **A missing `rate` MUST NOT discard the whole `metrics`**: parse it as the I/O family instead — if any of the eight I/O fields is a finite `number`, keep the family; otherwise discard the whole `metrics`. This is the only behavioural difference introduced by the union.
- Any optional field (`error_rate` / `p90_server_ms` / the eight I/O fields) that is present but not a finite `number` → **drop that field only**, keeping the rest of `metrics`.
- The two ceiling fields (`max_iops` / `max_bytes_per_sec`) go through **exactly the same** per-field guard as the six measurement fields. normalize MUST NOT additionally enforce "a ceiling never appears alone": that invariant is the backend's (see the hop B / hop C note in the upstream contract), and re-checking it here would silently drop data the moment the backend's behaviour changes.
- If fields from both families appear (impossible per the contract), the RED family MUST win and the I/O fields MUST be discarded — never produce a mixed object a consumer cannot discriminate.
- An optional field the upstream did not send MUST stay absent (**never** filled with `0`, `null`, or any placeholder).
- Values MUST be preserved verbatim, including exponent-form tiny values (for example `3.86e-7`) and `0`.

A metrics validation failure MUST NOT be written to `normalizeGraph`'s `errors` array — that channel is for partial-parse warnings that affect topological correctness, and a metrics gap does not affect topology, so writing to it would only turn the warning banner into noise.

#### Scenario: Valid metrics pass through into edge data

- **WHEN** an upstream edge's `data` is `{ id, source, target, type: 'pod-calls-service', labels: {}, metrics: { rate: 5, error_rate: 0.2, p90_server_ms: 45 } }` (both endpoint nodes exist)
- **THEN** the produced edge element's `data.metrics` is `{ rate: 5, errorRate: 0.2, p90ServerMs: 45 }`, with no unit conversion and no rounding

#### Scenario: An edge with no metrics produces no such field

- **WHEN** an upstream edge's `data` has no `metrics` key (for example a `pod-mounts-pvc` edge)
- **THEN** the produced edge element's `data` likewise has no `metrics` key (not an explicit `undefined`, not an empty object)

#### Scenario: An absent error_rate and a zero error_rate are different states

- **WHEN** one upstream edge carries `metrics: { rate: 3 }` (no `error_rate`) and another carries `metrics: { rate: 1, error_rate: 0 }`
- **THEN** the former's `data.metrics` has no `errorRate` key, while the latter's is `errorRate: 0`

#### Scenario: One invalid field does not take the rest of metrics with it

- **WHEN** an upstream edge's `metrics` is `{ rate: 5, error_rate: 'high', p90_server_ms: 45 }`
- **THEN** the produced `data.metrics` is `{ rate: 5, p90ServerMs: 45 }` (dropping `errorRate`) and the edge itself is produced as usual

#### Scenario: An unusable rate discards metrics but keeps the edge

- **WHEN** an upstream edge's `metrics` is `{ rate: null, error_rate: 0.1 }` (`rate` present but invalid), or `metrics` is a string, or `{ error_rate: 0.1, p90_server_ms: 45 }` (no `rate` and no valid I/O field either)
- **THEN** the produced edge element has no `metrics` key, but the edge element still exists in `elements` with its `edgeType` / `labels` unaffected

#### Scenario: Tiny exponent-form values are preserved verbatim

- **WHEN** an upstream edge's `metrics` is `{ rate: 3.86e-7, error_rate: 6.7e-8 }`
- **THEN** the produced `data.metrics.rate` is strictly equal to `3.86e-7` and `data.metrics.errorRate` strictly equal to `6.7e-8` (neither truncated to `0`)

#### Scenario: A RED gap never reaches the errors channel

- **WHEN** the upstream payload holds edges with invalid `metrics` in any of the forms above
- **THEN** the `errors` array `normalizeGraph` returns MUST NOT gain any entry as a result

#### Scenario: I/O family metrics pass through onto the storage edge

- **WHEN** an upstream `pvc-to-netapp-aggr` edge carries `metrics: { read_ops: 150, write_ops: 40, read_latency_us: 830, write_latency_us: 1200, read_bytes_per_sec: 5242880, write_bytes_per_sec: 1048576, max_iops: 5000, max_bytes_per_sec: 262144000 }` (no `rate`)
- **THEN** the produced `data.metrics` is `{ readOps: 150, writeOps: 40, readLatencyUs: 830, writeLatencyUs: 1200, readBytesPerSec: 5242880, writeBytesPerSec: 1048576, maxIops: 5000, maxBytesPerSec: 262144000 }`, with no `rate` key and no conversion at this layer (nothing is converted to MB/s here; `maxBytesPerSec` was already converted out of MB/s by the backend)

#### Scenario: The I/O family degrades per field

- **WHEN** an upstream storage edge's `metrics` is `{ read_ops: 150, write_ops: 'many', read_bytes_per_sec: 5242880 }` (only some of the family's fields, one of them invalid)
- **THEN** the produced `data.metrics` is `{ readOps: 150, readBytesPerSec: 5242880 }`, the edge is produced as usual, and `errors` gains nothing

#### Scenario: Measurements present, no declared ceiling

- **WHEN** an upstream storage edge carries `metrics: { read_ops: 150, write_ops: 40, read_bytes_per_sec: 5242880 }` (the volume belongs to no QoS policy group, so the backend sent no ceiling)
- **THEN** the produced `data.metrics` has no `maxIops` and no `maxBytesPerSec` key (never `0`, `null`, or an unlimited sentinel), and every other field is carried through as usual

#### Scenario: Ceiling fields degrade per field

- **WHEN** an upstream storage edge carries `metrics: { read_ops: 150, max_iops: 5000, max_bytes_per_sec: 'unlimited' }`
- **THEN** the produced `data.metrics` is `{ readOps: 150, maxIops: 5000 }` — the invalid `max_bytes_per_sec` drops that field only, leaves the rest of the family intact, and adds nothing to `errors`

## ADDED Requirements

### Requirement: Normalization of NetApp nodes and PVC storage fields (health / usage / storageclass)

`normalizeGraph` SHALL normalize upstream nodes with `data.type === 'netapp-aggr'` and `data.type === 'netapp-node'` into **real leaf-semantics nodes** of the corresponding `kind` (icon-bearing, selectable, in the `Storage` category), passing their `parent` through verbatim — including the case where a `netapp-aggr`'s parent is the id of a **real** `netapp-node` (see the storage chain in "Upstream kube-state-graph payload contract"). The backend sends no `status`, so `status` is omitted.

Three new node fields pass through under independent per-field guards, so none takes another down with it:

- `health` (`netapp-aggr` / `netapp-node`): passed through when the value is the string `"online"` or `"degraded"`; **any other string also passes through verbatim** (an unknown backend value must never fail the node); a non-string or empty string is omitted. An absent `health` MUST NOT be filled with `"degraded"` or any other default.
- `usage` (`netapp-aggr` / `pvc`): `used_bytes` / `capacity_bytes` each pass through as `usedBytes` / `capacityBytes` when they are a finite `number` and `>= 0`; if neither qualifies, the whole `usage` is omitted.
- `storageclass` (`pvc`): passed through when it is a non-empty string.

**Deriving `usageRatio`.** When `usage` holds both a qualifying `usedBytes` and a qualifying `capacityBytes` with `capacityBytes > 0`, normalize MUST additionally write the derived field `usageRatio` (`usedBytes / capacityBytes`, clamped to `[0,1]`). This field exists **solely for the stylesheet's node usage visual** — a cytoscape selector can read neither nested `data` nor perform division — so it has to be flattened at normalize. When `capacityBytes` is `0`, when either field is missing, or when the ratio cannot be computed, `usageRatio` MUST NOT be written (absence = draw no usage visual). This derivation is **kind-independent**: any node with a qualifying `usage` gets a `usageRatio`, so `pvc` and `netapp-aggr` go through one rule and any future usage-bearing kind is covered automatically.

`netapp-aggr` and `netapp-node` are both icon-bearing `NodeKind`s in the `Storage` category, so they appear in `NodeLegend` automatically; both are **selectable**, detail-eligible nodes — `netapp-node` stays selectable despite being a compound parent, exactly like the `controller` and k8s `node` containers.

#### Scenario: netapp-aggr is normalized, passes health / usage through, and derives usageRatio

- **WHEN** an upstream node has `data.type === 'netapp-aggr'`, a `parent` pointing at a real `netapp-node` id, `health: "online"`, and `usage: { used_bytes: 700000000000, capacity_bytes: 1000000000000 }`
- **THEN** normalize produces `kind: 'netapp-aggr'`, `health: 'online'`, `usage: { usedBytes: 700000000000, capacityBytes: 1000000000000 }`, and `usageRatio: 0.7`, carries **no** `status`, and preserves its `parent` and `label` (= `name`) verbatim

#### Scenario: netapp-node is a real compound parent and stays selectable

- **WHEN** an upstream node has `data.type === 'netapp-node'`, a `parent` pointing at a `storage-cluster` group, and `health: "degraded"`, and another `netapp-aggr` node's `parent` points at it
- **THEN** normalize produces `kind: 'netapp-node'` and `health: 'degraded'`, **MUST NOT** set `selectable: false`, and that `netapp-aggr`'s `parent` still points at this node's id (cytoscape builds the nesting from `data.parent`)

#### Scenario: An absent health is not filled in

- **WHEN** an upstream `netapp-aggr` or `netapp-node` has no `health` field (or its value is an empty string or not a string)
- **THEN** the produced element's `data` has no `health` key (under `exactOptionalPropertyTypes`, no `undefined` value is written) and it MUST NOT be filled with `'degraded'`

#### Scenario: A PVC passes storageclass and usage through

- **WHEN** an upstream `pvc` node carries `storageclass: "netapp-nas"` and `usage: { used_bytes: 5368709120, capacity_bytes: 10737418240 }`
- **THEN** normalize produces `storageclass: 'netapp-nas'`, `usage: { usedBytes: 5368709120, capacityBytes: 10737418240 }`, and `usageRatio: 0.5`

#### Scenario: usage degrades per field

- **WHEN** an upstream node's `usage` is `{ capacity_bytes: 1000 }` (capacity only) or `{ used_bytes: 'lots', capacity_bytes: 1000 }` (one field invalid)
- **THEN** both produce `usage: { capacityBytes: 1000 }` and, lacking `usedBytes`, **MUST NOT** write `usageRatio`

#### Scenario: A zero capacity produces no usageRatio

- **WHEN** an upstream node's `usage` is `{ used_bytes: 0, capacity_bytes: 0 }`
- **THEN** it produces `usage: { usedBytes: 0, capacityBytes: 0 }` and **MUST NOT** write `usageRatio` (avoiding a division by zero)

#### Scenario: A malformed usage shape is discarded entirely

- **WHEN** an upstream node's `usage` is not a plain object (a string, an array, or `null`)
- **THEN** normalize omits both `usage` and `usageRatio`, normalizes every other field as usual, and produces the node as usual

## REMOVED Requirements

### Requirement: Normalization of the StorageClass compound container (a real NodeKind plus container flags)

**Reason**: The backend removed the `storageclass` node type and the `pvc-to-storageclass` edge (`replace-storageclass-with-netapp-nodes`). The storage side is now expressed as the physical NetApp chain (`storage-cluster > netapp-node > netapp-aggr`), and the `provisioner` / `parameters` fields are no longer emitted. This normalization rule's input no longer exists in the contract.

**Migration**: A claim's StorageClass name now rides on the PVC's own `data.storageclass` and is governed by the new "Normalization of NetApp nodes and PVC storage fields" requirement; the physical backing is represented by the `netapp-aggr` / `netapp-node` nodes and the `pvc-to-netapp-aggr` edge. The `provisioner` / `parameters` data fields, their type declarations, and their tooltip rows are removed together with no replacement.
