## Why

The kube-state-graph backend (commit `787573b`, design D6 — supersedes the panel's old D31 `cluster > node > pod` model) became the **single source of truth for the whole topology hierarchy**. It now emits, in the `/v1/graph` cytoscape payload:

- `storageclass` as a **real leaf node** (was a synthetic compound group that boxed PVCs), parented under the cluster, carrying `provisioner` + `parameters`.
- a new **`application`** compound group node (ArgoCD app), parent = namespace group.
- **`namespace`** and **`controller`** compound group nodes (previously synthesized client-side by the panel).
- two new edges: **`pod-to-node`** (pod → node; pod-runs-on-node is no longer nesting) and **`pvc-to-storageclass`** (pvc → storageclass).
- the full parent chain `cluster > namespace > application > controller > pod`; `node` and `storageclass` are leaves under `cluster`; `pvc` / `service` under `namespace`.

The panel still **re-derives all of this client-side** (`synthesizeControllers`, `applyNamespaceGrouping`, `applyPodParentMode` nesting, `deriveStorageClassContainers`). Consuming the new payload as-is would **double-render** controllers and namespace boxes and drop the new edges/groups into the unknown-type fallback. The panel must stop synthesizing and start consuming the backend hierarchy.

## What Changes

- **Retire client-side hierarchy synthesis.** Delete `applyNamespaceGrouping` and `synthesizeControllers`; recognize backend `namespace` / `application` / `controller` group nodes via flags.
- **StorageClass → leaf.** Drop the `isStorageClass` grouping flag; normalize `storageclass` as an ordinary `kind:'storageclass'` leaf carrying `provisioner` + `parameters`; surface a **Storage Class** node-detail section.
- **Application → group node.** New `isApplication` flag + accent palette + `ApplicationLegend`. The pod's `application` string attribute is kept (still emitted on pods).
- **Edges.** Remove `pod-runs-on-node` + `controller-owns-pod` (panel synthetics); add `pod-to-node` + `pvc-to-storageclass`.
- **Pod-parent toggle reimplemented on the backend graph.** `controller` view = backend payload as-is. `node` view = re-parent pods under their K8s node (`labels.node`), drop the workload grouping tiers, draw pod↔node as nesting (drop `pod-to-node` edges).
- **Preserve the controller detail panel** by enriching backend `controller` groups from their child pods (derive Workloads `kind` from `owner.kind`; aggregate `application` / `containers` / `alerts` / `worstStatus`).
- **Demo / fixtures** updated to the D6 shape so the showcase does not regress.

## Capabilities

### Modified Capabilities

- `graph-data-integration` — normalize recognizes backend group nodes + storageclass leaf + new edges; controller synthesis replaced by controller enrichment.
- `pod-parent-mode` — both modes redefined to operate on the backend-owned hierarchy.
- `node-icon-encoding` — `storageclass` glyph now always drawn (leaf, not collapse-only); `application` group is icon-less.
- `panel-rendering` — edge-color map (new edges), legend wiring (add `ApplicationLegend`, remove `StorageClassLegend`), node-detail Storage Class section, container-legend / collapsed-border sourcing.
- `node-dashboard-url` — `storageclass` becomes a selectable detail node; controller detail preserved.

### Removed Capabilities

- `namespace-grouping` — client-side namespace synthesis (and the controller-mode PVC→storageclass sub-box split) is removed; namespace grouping is now backend-owned and consumed in `graph-data-integration` / `panel-rendering`.

## Impact

- `src/shared/constants/{types,colorByEdgeType,drawnEdgeTypesForMode}.ts`
- `src/shared/types/cytoscape.d.ts`
- `src/features/graph-data/normalize.ts` (group recognition, storageclass leaf, controller enrichment, new edges, node worstStatus via edges)
- `src/features/graph-data/applyNamespaceGrouping.ts` **(deleted)**
- `src/features/pod-parent-mode/applyPodParentMode.ts` **(rewritten)**
- `src/features/graph-canvas/styles/getStylesheet.ts` (`node[?isApplication]`)
- `src/features/legend/components/ApplicationLegend/**` **(new)**, `StorageClassLegend/**` **(deleted)**
- `src/shared/constants/applicationPalette.ts` **(new)**
- `src/features/node-detail/` (Storage Class section, `NodeDetailData` fields, DENYLIST)
- `src/features/hover-tooltip/` (drop storageclass synthesized-children path)
- `src/panels/KsgPanel/{KsgPanel.tsx,deriveStorageClassContainers.ts (deleted),KsgPanel.types.ts}`
- Demo: showcase inline dashboard JSON, `dev/victoriametrics/seed.sh`, `KSG_BACKEND_TAG`
- Tests across all of the above (delete `applyNamespaceGrouping.test`, `deriveStorageClassContainers.test`, `StorageClassLegend.test`; add `applicationPalette.test`, `ApplicationLegend.test`).
