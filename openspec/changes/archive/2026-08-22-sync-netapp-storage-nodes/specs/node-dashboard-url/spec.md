# node-dashboard-url delta — sync-netapp-storage-nodes

## MODIFIED Requirements

### Requirement: Node applicability of the Dashboard button

The panel SHALL request `/dashboard` and render the Dashboard button ONLY for nodes **the node-detail panel opens for** — that is, **leaf nodes** (including the backend's physical-storage **`netapp-aggr`** leaf, which carries `health` / `usage`), the **k8s-node** (`kind: node`) compound container, the **`netapp-node`** compound container (the one place in the backend contract where a real node acts as a compound parent; it carries `health`), and the **controller** compound container (backend-supplied and enriched with a real `kind`) — the set for which `resolveSelectedNode` is not `null`. The **cluster / storage-cluster / namespace / application** compounds MUST NOT trigger any `/dashboard` query and MUST NOT render the Dashboard button. Applicability is gated by having parameter assembly return "no parameters" (`undefined`) for an inapplicable node — so a disabled node issues no query — and it MUST share the same decision as `resolveSelectedNode`'s exclusion set (`isCluster` / `isStorageCluster` / `isNamespace` / `isApplication`) rather than maintaining a parallel list that could drift.

`netapp-aggr` / `netapp-node` open the detail panel and prefetch `/dashboard` like any other applicable node, but their `kind` is **not in the Workloads `DETAIL_URL` set**, so `resolveSelectedNode` MUST NOT assign them a per-kind dashboard query target (`queryTarget`): their `health` / `usage` (and, for `netapp-aggr`, its `ontap_cluster` / `node` labels) surface through the **pinned tooltip** in the top-right corner (see panel-rendering, "Hover Tooltip", pinned mode), and the detail panel itself is header-only, with no Workloads-kind query target. The removed `storageclass` kind takes its equivalent `provisioner` / `parameters` rule with it.

#### Scenario: Leaf / k8s-node / controller are applicable nodes

- **WHEN** the node-detail panel opens for a leaf node (including the `netapp-aggr` leaf; the `storageclass` leaf this scenario originally named has been removed from the contract), a k8s-node compound, a `netapp-node` compound, or a backend-supplied enriched controller compound
- **THEN** the system issues one `/dashboard` query for that node (at the moment described by the "prefetch" requirement below) and renders the Dashboard button when one is available

#### Scenario: NetApp leaf opens detail but has no per-kind dashboard query target

- **WHEN** the selected node is a `netapp-aggr` leaf or a `netapp-node` compound (carrying `health` / `usage`; the `storageclass` leaf this scenario originally named has been removed from the contract)
- **THEN** the detail panel opens header-only, its `health` / `usage` are pinned to the top-right tooltip (see panel-rendering, "Hover Tooltip", pinned mode), and because its `kind` is not in the Workloads `DETAIL_URL` set, `resolveSelectedNode` MUST NOT assign it a per-kind `queryTarget` — it still prefetches `/dashboard` like any other applicable node and renders the Dashboard button when one is available

#### Scenario: cluster / namespace / application are not applicable

- **WHEN** the selected node is a `cluster` / `storage-cluster` / `namespace` / `application` compound
- **THEN** the system MUST NOT issue a `/dashboard` query and MUST NOT render the Dashboard button (these nodes do not open the detail panel in the first place)
