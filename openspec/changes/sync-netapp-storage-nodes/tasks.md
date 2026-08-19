# Tasks — sync-netapp-storage-nodes

## 1. Types and single-source maps (compile-driven sweep)

- [ ] 1.1 `src/shared/constants/types.ts`: remove `'storageclass'` from `NodeKind` and `'pvc-to-storageclass'` from `EdgeType`; add `'netapp-aggr'` / `'netapp-node'` to `NodeKind` and `'pvc-to-netapp-aggr'` to `EdgeType`, with comments recording the backend contract (labels, the real-node parent tier). Run `npm run typecheck` — the exhaustive `Record<…>` maps now fail and become the checklist for 1.2–1.4.
- [ ] 1.2 `categoryByKind.ts`: drop `storageclass`, add `netapp-aggr` / `netapp-node` → `'Storage'`.
- [ ] 1.3 `iconSvgByKind.ts`: drop the storageclass disk glyph; add two distinct `Storage` glyphs per design D7 (`netapp-aggr` = stacked-disks/pool, `netapp-node` = controller chassis), via the existing `icon()` helper.
- [ ] 1.4 `colorByEdgeType.ts`: replace the `pvc-to-storageclass` entries in `EDGE_STYLE_BY_TYPE` (keep `#8b5cf6`, still deliberately distinct from `pod-mounts-pvc`'s `#a855f7`), `EDGE_ENDPOINTS_BY_TYPE` (`{ from: 'pvc', to: 'netapp-aggr' }`), and `EDGE_IS_TRAFFIC_BY_TYPE` (`false`) with `pvc-to-netapp-aggr`.
- [ ] 1.5 `drawnEdgeTypesForMode.ts`: swap the edge type in both modes' sets; update `drawnEdgeTypesForMode.test.ts` (both modes contain `pvc-to-netapp-aggr`, neither contains `pvc-to-storageclass`).
- [ ] 1.6 `npm run typecheck` clean — no residual `storageclass` / `pvc-to-storageclass` reference in `src/`.

## 2. Data-layer types

- [ ] 2.1 `src/shared/types/cytoscape.d.ts` — `NodeDataDefinition`: remove `provisioner` / `parameters`; add `storageclass?: string`, `health?: string`, `usage?: { usedBytes?: number; capacityBytes?: number }`, `usageRatio?: number`, and the `isStorageCluster` / `storageCluster` / `storageClusterColor` group flags. Document `health` absence ≠ `'degraded'` and `usageRatio` absence ≠ 0% on the fields themselves.
- [ ] 2.2 Same file — split `EdgeMetrics` into `EdgeRedMetrics` / `EdgeIoMetrics` and type `metrics?: EdgeRedMetrics | EdgeIoMetrics`; document the `'rate' in metrics` discriminator and that consumers must not assume `rate`.

## 3. normalize (anti-corruption boundary)

- [ ] 3.1 `resolveNodeIdentity`: add the `storage-cluster` branch returning `{ isStorageCluster, storageCluster, storageClusterColor }` (mirroring `cluster`: kind-less, `selectable: false`); add `'storage-cluster'` to `isGroupType`. `netapp-aggr` / `netapp-node` need no branch — they fall through to the leaf `{ kind }` case (design D1).
- [ ] 3.2 Add `storageClusterPalette.ts` (fixed per-kind accent, mirroring `clusterPalette` / `applicationPalette`) + its test.
- [ ] 3.3 `parseNodes`: remove the `provisioner` / `parameters` passthrough; add guarded passthrough for `storageclass` (non-empty string), `health` (non-empty string, unknown values pass through verbatim), and `usage` (per-field finite `>= 0` number → `usedBytes` / `capacityBytes`; object omitted when neither field survives).
- [ ] 3.4 Derive `usageRatio` (design D3): written only when both fields are valid and `capacityBytes > 0`; clamped to `[0,1]`; **kind-independent**.
- [ ] 3.5 `parseEdgeMetrics`: add the family branch — `rate` present → existing RED logic verbatim; `rate` absent → parse the four I/O fields (each independently guarded), object dropped when none survive; both families present → RED wins, I/O keys discarded. Never write to `errors`.
- [ ] 3.6 `normalize.test.ts`: extend with the backend golden `with-netapp-storage-cytoscape.json` shape; cover `storage-cluster` identity, NetApp leaf/parent passthrough, `health` verbatim + absence, `usage` per-field degradation, `usageRatio` table (0.7 / 0.5 / capacity-0 / partial / non-object), and the metrics-union branches (RED-only, I/O-only, `rate`-invalid, both-present). Delete the storageclass normalize cases.

## 4. Stylesheet and canvas

- [ ] 4.1 `getStylesheet.ts`: add `node[?isStorageCluster]` to the decorative-group rules (accent background/border/label colour, `background-image: 'none'`) and to the collapsed-folder-glyph selector; add the `Storage:`-style label prefix mapper entry if the repo's prefix set covers it, keeping `data.label` bare.
- [ ] 4.2 Add the single `node[usageRatio]` usage-fill rule (design D3): achromatic `background-fill: 'linear-gradient'` from the theme's neutral scale, stop position `(1 - usageRatio) * 100`%, never a `STATUS_COLOR`. Verify the kind icon composites above the fill and the status border is unaffected.
- [ ] 4.3 `getStylesheet.test.ts`: assert the usage rule is keyed on the field (matches both `pvc` and `netapp-aggr` fixtures, matches nothing without `usageRatio`), the fill colour is not in `STATUS_COLOR`, and the `isStorageCluster` selectors exist. Delete the storageclass cases.
- [ ] 4.4 Manually verify the fill against both light and dark Grafana themes (design risk: an achromatic fill reading as "selected").

## 5. Tooltip, legend, detail panel

- [ ] 5.1 `buildNodeAttributes.ts`: remove the `provisioner` / `parameters` rows; add rows for `storageclass`, `health`, and a formatted `usage` (`<used> / <capacity> (<pct>%)`, decimal byte units, integer percent) emitted only when present. Add a small `formatBytes` / `formatUsage` helper with its own test (including exponent-safe and 0-capacity inputs).
- [ ] 5.2 `HoverTooltip`: render whichever `metrics` family is present on an edge (discriminate with `'rate' in metrics`), adding I/O rows with their units (`ops/s`, `µs`); remove the `isStorageClass` branch and any `gatherStorageClassContext` remnant if still present.
- [ ] 5.3 `deriveLegendKinds` / `NodeLegend`: verify (and test) that an expanded `netapp-node` is excluded and a collapsed one is included, and that `Storage` lists `pvc` / `netapp-aggr` / `netapp-node` glyphs; assert no `Storage Classes` swatch section and no new ONTAP swatch section.
- [ ] 5.4 `resolveSelectedNode` / `detailUrlKinds` / `assembleDashboardParams`: add `isStorageCluster` to the non-selectable exclusion set alongside `isCluster`; confirm `netapp-aggr` / `netapp-node` are detail-eligible but outside `DETAIL_URL_KINDS` (header-only panel, no per-kind query target). Update the affected tests.
- [ ] 5.5 `KsgPanel` / `deriveLegendEntries` / `NodeDetailPanel.types` / `buildPinnedTooltip` / `nodeClickExportValues` / `applicationBearingKinds`: sweep the remaining `storageclass` references reported by 1.6 and re-point or delete each.

## 6. pod-parent-mode

- [ ] 6.1 Confirm by test (no production change expected per design D6) that `node` mode leaves `storage-cluster` / `netapp-node` / `netapp-aggr` parents untouched and keeps `pvc-to-netapp-aggr` edges; add the crossing-edge case (PVC re-homed to cluster, aggregate not moved) to `applyPodParentMode.test.ts`. Update the storageclass re-homing case to drop the removed kind.

## 7. Demo environment

- [ ] 7.1 `dev/victoriametrics/seed.sh`: push the four Harvest `volume_*` families (with `cluster` / `node` / `aggr` / `svm` / `volume_name`, the last matching the fixture PVC's `kube_persistentvolumeclaim_info.volumename`), the three `aggr_*` families, `node_new_status`, and the two `kubelet_volume_stats_*` families — all as **gauges** (stable per tick, small jitter allowed), explicitly NOT counters.
- [ ] 7.2 Shape the fixture per spec: at least one PVC that joins an aggregate and at least one that does not (missing/empty `aggr`), plus usage at roughly 70% and 20% so the fill difference is visible.
- [ ] 7.3 `docker-compose.yaml`: bump the default `KSG_BACKEND_TAG` to an image carrying the backend `replace-storageclass-with-netapp-nodes` change.
- [ ] 7.4 Run `npm run server` and visually verify: storage chain nests correctly, both usage fills render at different heights, edge I/O metrics appear in the tooltip, the unjoined PVC has no storage edge.

## 8. Docs and verification

- [ ] 8.1 `CONTEXT.md`: update the node-kind and edge-type vocabulary entries (drop `storageclass` / `pvc-to-storageclass`, add the two NetApp kinds, `storage-cluster`, and `pvc-to-netapp-aggr`).
- [ ] 8.2 `CLAUDE.md`: update the demo-fixture description (new seeded families, the NetApp half of the graph, the `KSG_BACKEND_TAG` requirement).
- [ ] 8.3 Full gate: `npm run lint && npm run typecheck && npm run test:ci && npm run build` clean; `openspec validate sync-netapp-storage-nodes --strict` then `openspec verify sync-netapp-storage-nodes`.
