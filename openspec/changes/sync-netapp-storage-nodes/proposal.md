## Why

The kube-state-graph backend replaced its StorageClass entity with the physical NetApp storage chain (`replace-storageclass-with-netapp-nodes`): a PVC now joins the ONTAP **aggregate** holding its FlexVol, the aggregate nests under the **controller** that owns it, and the wire carries the numbers an operator actually asks for — per-aggregate health, aggregate space, per-claim space, and read/write ops and latencies on the storage edge.

Against that backend the panel renders a broken storage half. `storageclass` nodes and `pvc-to-storageclass` edges never arrive, so the whole StorageClass code path is dead; the two new node kinds fall through to the unknown-kind fallback (generic glyph, `Other` category); the new `storage-cluster` group is mistaken for a leaf and drawn as a node; and `usage`, `health`, and the storage `metrics` are dropped on the floor by the normalize boundary. The panel is deployed against a backend image, so this is a coordinated cut, not an optional follow-up.

## What Changes

### Added

- **Two node kinds** — `netapp-aggr` (ONTAP aggregate; `labels: {ontap_cluster, node}`) and `netapp-node` (ONTAP controller; `labels: {ontap_cluster}`), both in the `Storage` category with their own icons. Neither carries a `cluster` label, so neither participates in cluster-accent grouping.
- **The `storage-cluster` group kind** — a fourth decorative, kind-less compound group alongside `cluster` / `namespace` / `application`, accented like its siblings and non-selectable.
- **A real node as compound parent** — `netapp-aggr` nests under the **real** `netapp-node` node (`data.parent` = a real node id), which in turn nests under `storage-cluster`. Every existing compound parent is either kind-less-decorative or a K8s `node` container; this is the first backend-driven tier where a real, selectable, icon-bearing node boxes another real node.
- **`pvc-to-netapp-aggr` edge type**, drawn in both pod-parent modes, with its own colour in the master edge-style map.
- **Storage `metrics` on that edge** — six measurements (`read_ops` / `write_ops` / `read_latency_us` / `write_latency_us` / `read_bytes_per_sec` / `write_bytes_per_sec`) plus the volume's two declared QoS ceilings (`max_iops` / `max_bytes_per_sec`), hoisted through the same normalize path as RED and surfaced in the tooltip. The three bytes-per-second fields format through the shared decimal byte-unit ladder (`5.24 MB/s`), the same one the node `usage` row already uses — and the backend converts `max_bytes_per_sec` out of Harvest's MB/s precisely so a ceiling and a measurement compare directly. Ceiling absence means *no declared ceiling* and is never `0` or an "unlimited" sentinel; a ceiling never arrives without at least one measurement (they come from two different backend join hops). `data.metrics` becomes a **union**: an edge carries either the RED family (`rate` REQUIRED within it) or the I/O family, never both, so `rate` can no longer be assumed present.
- **`health` on both NetApp kinds** — `"online"` / `"degraded"`, promoted as a tooltip row. Absence is distinct from `"degraded"` and MUST NOT be defaulted.
- **`usage` on `netapp-aggr` AND `pvc`** — `{used_bytes, capacity_bytes}`, surfaced two ways: a formatted text row (`700 GB / 1 TB (70%)`) and an **on-node usage visual** on the canvas. The visual is keyed on the presence of a derived usage ratio, **not on kind**, so both kinds get it from one rule and any future usage-bearing kind joins for free. The liquid fills the **cylinder glyph** (not the node box), at fill-opacity 0.4 so `netapp-aggr` layer lines stay visible, coloured with Grafana thresholds on `STATUS_COLOR`: green `< 80%`, yellow `>= 80%`, red `>= 90%`. Status still owns the border.
- **`storageclass` as a PVC attribute** — the claim's StorageClass name moves onto the PVC's own `data.storageclass` and is promoted as a PVC tooltip row.

### Removed — **BREAKING**

- **The `storageclass` node kind** and everything keyed to it: its icon, its `Storage` category entry, its `provisioner` / `parameters` data fields and tooltip rows, its detail-panel / dashboard-URL applicability carve-out, and its `applyPodParentMode` re-homing case.
- **The `pvc-to-storageclass` edge type** — its style entry, its traffic-map entry, and its membership in both modes' drawn sets.

The panel drops all support for the pre-change backend wire in one cut (no dual-model compatibility): a panel build after this change requires a backend built from `replace-storageclass-with-netapp-nodes` or later, and the demo's `KSG_BACKEND_TAG` must move with it.

## Capabilities

### New Capabilities

None — every behaviour lands in an existing capability.

### Modified Capabilities

- `graph-data-integration`: the upstream wire contract (node-kind and edge-type enums, the `storage-cluster` group, the real-node parent tier, `health` / `usage` / `storageclass` node fields, the `metrics` union) and the normalize rules that parse them.
- `panel-rendering`: styling and legend entries for the two kinds, the new edge type and the `storage-cluster` group; the on-node usage visual; the tooltip rows for `health`, `usage`, `storageclass` and the storage `metrics`; removal of the StorageClass rendering rules.
- `node-icon-encoding`: the `NodeKind` enum membership and the two new icons; removal of the `storageclass` glyph.
- `node-dashboard-url`: NetApp leaves' detail-panel and `/dashboard` applicability (`netapp-node` is a compound container that is nonetheless a real, selectable kind), replacing the `storageclass` carve-out.
- `pod-parent-mode`: the master edge-type set and both modes' drawn sets; `applyPodParentMode`'s treatment of the NetApp subtree under group teardown in `node` mode.
- `dev-environment`: the demo seeder must push the NetApp Harvest and kubelet series so the local stack exercises every new node kind, edge type, and numeric field.

## Impact

**Code.** `src/shared/constants/` (`types`, `categoryByKind`, `iconSvgByKind`, `colorByEdgeType`, `drawnEdgeTypesForMode`); `src/shared/types/cytoscape.d.ts` (node `health` / `usage` / `storageclass` / `usageRatio`, edge metrics union); `src/features/graph-data/normalize.ts` (group recognition, new field parsing, usage-ratio derivation, metrics union); `src/features/graph-canvas/styles/getStylesheet.ts` (usage visual, group accent, edge colour); `src/shared/nodeAttributes/buildNodeAttributes.ts`; `src/features/{legend,hover-tooltip,node-detail,pod-parent-mode}`.

**Demo.** `dev/victoriametrics/seed.sh` gains the backend's three NetApp join hops — `volume_labels` (the info series that is the SOLE source of storage topology), the six `qos_*` workload families seeded at volume granularity (no `lun` label, so they survive the backend's `{lun=""}` selector), and `qos_policy_fixed_max_throughput_iops` / `_mbps` joined on `(cluster, svm, policy_group)` — plus the Harvest aggregate / node series and kubelet volume stats. `docker-compose.yaml`'s default `KSG_BACKEND_TAG` must point at an image carrying the backend change.

**Docs.** `CONTEXT.md`'s node-kind and edge-type vocabulary, and the `CLAUDE.md` demo-fixture description.

**Compatibility.** Hard cut, as above — an older backend image yields a graph with no storage half at all.
