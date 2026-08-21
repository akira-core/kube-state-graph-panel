# Tasks — sync-netapp-storage-nodes

## 1. Types and single-source maps (compile-driven sweep)

- [x] 1.1 `src/shared/constants/types.ts`: remove `'storageclass'` from `NodeKind` and `'pvc-to-storageclass'` from `EdgeType`; add `'netapp-aggr'` / `'netapp-node'` to `NodeKind` and `'pvc-to-netapp-aggr'` to `EdgeType`, with comments recording the backend contract (labels, the real-node parent tier). Run `npm run typecheck` — the exhaustive `Record<…>` maps now fail and become the checklist for 1.2–1.4.
- [x] 1.2 `categoryByKind.ts`: drop `storageclass`, add `netapp-aggr` / `netapp-node` → `'Storage'`.
- [x] 1.3 `iconSvgByKind.ts`: drop the storageclass disk glyph; add two distinct `Storage` glyphs per design D7 (`netapp-aggr` = stacked-disks/pool, `netapp-node` = controller chassis), via the existing `icon()` helper.
- [x] 1.4 `colorByEdgeType.ts`: replace the `pvc-to-storageclass` entries in `EDGE_STYLE_BY_TYPE` (keep `#8b5cf6`, still deliberately distinct from `pod-mounts-pvc`'s `#a855f7`), `EDGE_ENDPOINTS_BY_TYPE` (`{ from: 'pvc', to: 'netapp-aggr' }`), and `EDGE_IS_TRAFFIC_BY_TYPE` (`false`) with `pvc-to-netapp-aggr`.
- [x] 1.5 `drawnEdgeTypesForMode.ts`: swap the edge type in both modes' sets; update `drawnEdgeTypesForMode.test.ts` (both modes contain `pvc-to-netapp-aggr`, neither contains `pvc-to-storageclass`).
- [x] 1.6 `npm run typecheck` clean — no residual `storageclass` / `pvc-to-storageclass` reference in `src/`.

## 2. Data-layer types

- [x] 2.1 `src/shared/types/cytoscape.d.ts` — `NodeDataDefinition`: remove `provisioner` / `parameters`; add `storageclass?: string`, `health?: string`, `usage?: { usedBytes?: number; capacityBytes?: number }`, `usageRatio?: number`, and the `isStorageCluster` / `storageCluster` / `storageClusterColor` group flags. Document `health` absence ≠ `'degraded'` and `usageRatio` absence ≠ 0% on the fields themselves.
- [x] 2.2 Same file — split `EdgeMetrics` into `EdgeRedMetrics` / `EdgeIoMetrics` (six optional I/O fields, throughput included) and type `metrics?: EdgeRedMetrics | EdgeIoMetrics`; document the `'rate' in metrics` discriminator and that consumers must not assume `rate`.

## 3. normalize (anti-corruption boundary)

- [x] 3.1 `resolveNodeIdentity`: add the `storage-cluster` branch returning `{ isStorageCluster, storageCluster, storageClusterColor }` (mirroring `cluster`: kind-less, `selectable: false`); add `'storage-cluster'` to `isGroupType`. `netapp-aggr` / `netapp-node` need no branch — they fall through to the leaf `{ kind }` case (design D1).
- [x] 3.2 Add `storageClusterPalette.ts` (fixed per-kind accent, mirroring `clusterPalette` / `applicationPalette`) + its test.
- [x] 3.3 `parseNodes`: remove the `provisioner` / `parameters` passthrough; add guarded passthrough for `storageclass` (non-empty string), `health` (non-empty string, unknown values pass through verbatim), and `usage` (per-field finite `>= 0` number → `usedBytes` / `capacityBytes`; object omitted when neither field survives).
- [x] 3.4 Derive `usageRatio` (design D3): written only when both fields are valid and `capacityBytes > 0`; clamped to `[0,1]`; **kind-independent**.
- [x] 3.5 `parseEdgeMetrics`: add the family branch — `rate` present → existing RED logic verbatim; `rate` absent → parse the six I/O fields (each independently guarded), object dropped when none survive; both families present → RED wins, I/O keys discarded. Never write to `errors`.
- [x] 3.6 `normalize.test.ts`: extend with the backend golden `with-netapp-storage-cytoscape.json` shape; cover `storage-cluster` identity, NetApp leaf/parent passthrough, `health` verbatim + absence, `usage` per-field degradation, `usageRatio` table (0.7 / 0.5 / capacity-0 / partial / non-object), and the metrics-union branches (RED-only, I/O-only, `rate`-invalid, both-present). Delete the storageclass normalize cases.

## 4. Stylesheet and canvas

- [x] 4.1 `getStylesheet.ts`: add `node[?isStorageCluster]` to the decorative-group rules (accent background/border/label colour, `background-image: 'none'`) and to the collapsed-folder-glyph selector; add the `Storage:`-style label prefix mapper entry if the repo's prefix set covers it, keeping `data.label` bare.
- [x] 4.2 Add the single `node[usageRatio]` usage-fill rule (design D3): achromatic `background-fill: 'linear-gradient'` from the theme's neutral scale, stop position `(1 - usageRatio) * 100`%, never a `STATUS_COLOR`. Verify the kind icon composites above the fill and the status border is unaffected.
- [x] 4.3 `getStylesheet.test.ts`: assert the usage rule is keyed on the field (matches both `pvc` and `netapp-aggr` fixtures, matches nothing without `usageRatio`), the fill colour is not in `STATUS_COLOR`, and the `isStorageCluster` selectors exist. Delete the storageclass cases.
- [x] 4.4 Manually verify the fill against both light and dark Grafana themes (design risk: an achromatic fill reading as "selected").

## 5. Tooltip, legend, detail panel

- [x] 5.1 `buildNodeAttributes.ts`: remove the `provisioner` / `parameters` rows; add rows for `storageclass`, `health`, and a formatted `usage` (`<used> / <capacity> (<pct>%)`, decimal byte units, integer percent) emitted only when present. Add a small `formatBytes` / `formatUsage` helper with its own test (including exponent-safe and 0-capacity inputs).
- [x] 5.2 `HoverTooltip`: render whichever `metrics` family is present on an edge (discriminate with `'rate' in metrics`), adding I/O rows with their units (`ops/s`, `µs`, and `MB/s` via the shared byte ladder); remove the `isStorageClass` branch and any `gatherStorageClassContext` remnant if still present.
- [x] 5.3 `deriveLegendKinds` / `NodeLegend`: verify (and test) that an expanded `netapp-node` is excluded and a collapsed one is included, and that `Storage` lists `pvc` / `netapp-aggr` / `netapp-node` glyphs; assert no `Storage Classes` swatch section and no new ONTAP swatch section.
- [x] 5.4 `resolveSelectedNode` / `detailUrlKinds` / `assembleDashboardParams`: add `isStorageCluster` to the non-selectable exclusion set alongside `isCluster`; confirm `netapp-aggr` / `netapp-node` are detail-eligible but outside `DETAIL_URL_KINDS` (header-only panel, no per-kind query target). Update the affected tests.
- [x] 5.5 `KsgPanel` / `deriveLegendEntries` / `NodeDetailPanel.types` / `buildPinnedTooltip` / `nodeClickExportValues` / `applicationBearingKinds`: sweep the remaining `storageclass` references reported by 1.6 and re-point or delete each.

## 6. pod-parent-mode

- [x] 6.1 Confirm by test (no production change expected per design D6) that `node` mode leaves `storage-cluster` / `netapp-node` / `netapp-aggr` parents untouched and keeps `pvc-to-netapp-aggr` edges; add the crossing-edge case (PVC re-homed to cluster, aggregate not moved) to `applyPodParentMode.test.ts`. Update the storageclass re-homing case to drop the removed kind.

## 7. Demo environment

- [x] 7.1 `dev/victoriametrics/seed.sh`: push the six Harvest `volume_*` families (with `cluster` / `node` / `aggr` / `svm` / `volume_name`, the last matching the fixture PVC's `kube_persistentvolumeclaim_info.volumename`), the three `aggr_*` families, `node_new_status`, and the two `kubelet_volume_stats_*` families — all as **gauges** (stable per tick, small jitter allowed), explicitly NOT counters.
- [x] 7.2 Shape the fixture per spec: at least one PVC that joins an aggregate and at least one that does not (missing/empty `aggr`), plus usage at roughly 70% and 20% so the fill difference is visible.
- [ ] 7.3 `docker-compose.yaml`: bump the default `KSG_BACKEND_TAG` to an image carrying the backend `replace-storageclass-with-netapp-nodes` change. (Comment updated to state the hard-cut requirement; the default is still `:latest` because no such image is published yet — bump the value once the backend ships.)
- [x] 7.4 Run `npm run server` and visually verify: storage chain nests correctly, both usage fills render at different heights, edge I/O metrics appear in the tooltip, the unjoined PVC has no storage edge.

## 8. Docs and verification

- [x] 8.1 `CONTEXT.md`: update the node-kind and edge-type vocabulary entries (drop `storageclass` / `pvc-to-storageclass`, add the two NetApp kinds, `storage-cluster`, and `pvc-to-netapp-aggr`).
- [x] 8.2 `CLAUDE.md`: update the demo-fixture description (new seeded families, the NetApp half of the graph, the `KSG_BACKEND_TAG` requirement).
- [x] 8.3 Full gate: `npm run lint && npm run typecheck && npm run test:ci && npm run build` clean; `openspec validate sync-netapp-storage-nodes --strict` then `openspec verify sync-netapp-storage-nodes`.

## 9. Volume throughput fields (`read_bytes_per_sec` / `write_bytes_per_sec`)

> Delta on top of the shipped sections 1-8, which landed with a four-field I/O
> family. The backend adds two throughput fields (its
> `replace-storageclass-with-netapp-nodes` change, section 10) sourced from
> Harvest `volume_read_data` / `volume_write_data`, in bytes per second. Those
> task lines above now read as the final contract; the outstanding work is here.
> Purely additive on the wire — an un-upgraded panel ignores the two keys.

- [x] 9.1 `src/shared/types/cytoscape.d.ts`: add `readBytesPerSec?: number` / `writeBytesPerSec?: number` to `EdgeIoMetrics`, with the bytes-per-second unit recorded on the fields.
- [x] 9.2 `normalize.ts` `parseEdgeMetrics`: hoist the two new snake_case keys with the same per-field guard as the existing four; either field alone MUST keep the I/O family alive. Extend `normalize.test.ts` (both fields, one-field survival, non-finite rejection, values passed through unconverted).
- [x] 9.3 `src/features/hover-tooltip/formatEdgeMetrics.ts`: add `formatThroughputBytesPerSec` delegating to the decimal byte ladder in `src/shared/format/measurements.ts` plus a `/s` suffix (`5.24 MB/s`, `12 B/s`); unit-test the magnitude-preservation and small-value cases.
- [x] 9.4 `HoverTooltip`: append `read throughput` / `write throughput` rows after the latency rows, each guarded by `isFiniteNumber`, neutral-coloured; extend `HoverTooltip.test.tsx` with the six-row storage edge, the partial-field case, and the byte-ladder formatting.
- [x] 9.5 `dev/victoriametrics/seed.sh`: seed `volume_read_data` / `volume_write_data` as gauges (bytes/s, stable per tick with small jitter) on the same label set as the four existing volume families, so the demo edge shows all six rows.
- [x] 9.6 `npm run lint typecheck test build` clean; `openspec validate --strict`.
- [x] 9.7 Backend coordination: the two fields only appear once the backend image carrying its section 10 ships — folds into the existing 7.3 `KSG_BACKEND_TAG` bump, no separate release gate.

## 10. Cylinder usage fill (revises D3)

The shipped 4.2 node-box gradient occludes cylinder strokes (especially `netapp-aggr` layer lines). Replace it with an in-glyph liquid. 4.2–4.4 stay as the historical landing; this section is the delta.

- [x] 10.1 Remove `background-fill: 'linear-gradient'` from the `node[usageRatio]` stylesheet rule; the node body stays the solid theme `background.secondary`.
- [x] 10.2 Add a pure helper that, given the kind SVG + `usageRatio`, paints a fill-opacity **0.4** bottom-up liquid clipped to the `pvc` / `netapp-aggr` outer cylinder (viewBox rect for any other kind), then the original strokes. Colour from `STATUS_COLOR`: `< 0.8` normal, `>= 0.8` warning, `>= 0.9` critical.
- [x] 10.3 Wire the `background-image` mapper so a node with `usageRatio` uses that helper. Icon size (`NODE_SIZE` / `contain`) and `label: data(label)` stay unchanged.
- [x] 10.4 Tests: no node-box gradient on usage nodes; URI / helper output contains fill-opacity 0.4; `0.7` green / `0.8` yellow / `0.9` red / `0.79` still green; absent ratio still solid + untinted icon; aggr internal layer paths still present. Flip the old "fill colour MUST NOT be STATUS_COLOR" assertion.
- [x] 10.5 Visual: light and dark Grafana themes, at ~70 / 85 / 95%, confirm aggr layer lines stay readable through the liquid.

## 11. QoS ceiling fields and the corrected demo join hops

> Delta on top of the shipped sections 1-10. Two independent gaps against the
> backend as it actually ships (both introduced by backend commit `160c347`,
> "read storage I/O from QoS workloads, surface the QoS ceiling", which landed
> after sections 1-10 were written):
>
> (a) the I/O family is **eight** fields, not six — the backend also emits the
> volume's declared QoS ceiling `max_iops` / `max_bytes_per_sec`;
>
> (b) the demo fixture seeds the wrong Harvest families. The backend resolves
> storage in three hops — `volume_labels` (topology, the SOLE source), the six
> `qos_*` workloads at `{lun=""}` (measurements), and
> `qos_policy_fixed_max_throughput_{iops,mbps}` joined on
> `(cluster, svm, policy_group)` (ceiling). The fixture currently pushes six
> `volume_*` measurement families and **no `volume_labels` at all**, so the demo
> renders no storage half whatsoever. Task 7.4's visual check passed against the
> pre-`160c347` backend and no longer holds.
>
> (a) is purely additive on the wire — an un-upgraded panel ignores the two keys.
> (b) is a fixture correction with no production-code impact.

- [ ] 11.1 `src/shared/types/cytoscape.d.ts`: add `maxIops?: number` / `maxBytesPerSec?: number` to `EdgeIoMetrics`, recording on the fields that `maxBytesPerSec` is bytes per second (already converted upstream from Harvest's MB/s) and that absence means *no declared ceiling* — never `0`, never an unlimited sentinel.
- [ ] 11.2 `normalize.ts` `parseEdgeMetrics`: hoist `max_iops` / `max_bytes_per_sec` with the same per-field guard as the existing six; either field alone MUST keep the I/O family alive, and normalize MUST NOT enforce "a ceiling never appears alone" (that invariant is the backend's). Extend `normalize.test.ts`: both ceilings present, measurements-with-no-ceiling, one ceiling invalid (drops that field only), values passed through unconverted.
- [ ] 11.3 `src/features/hover-tooltip/formatEdgeMetrics.ts`: route `maxIops` through the existing ops formatter and `maxBytesPerSec` through `formatThroughputBytesPerSec` (added in 9.3) — no new formatter, that shared ladder is what makes a ceiling and a measurement comparable at a glance.
- [ ] 11.4 `HoverTooltip`: append `max iops` / `max throughput` rows **after** the two throughput rows, each guarded by `isFiniteNumber`, neutral-coloured. Exceeding a ceiling MUST NOT colour or warn. Extend `HoverTooltip.test.tsx` with the eight-row storage edge, the measured-but-uncapped case, and an over-ceiling case asserting neutral colour.
- [ ] 11.5 `dev/victoriametrics/topology.prom`: replace the six `volume_*` measurement families with `volume_labels` (info series; `cluster` / `node` / `aggr` / `svm` / `volume_name`, value ignored) plus the six `qos_*` families carrying `cluster` / `svm` / `volume_name` / `policy_group` and **no `lun` label**. Keep the existing `aggr_*`, `node_new_status`, and `kubelet_volume_stats_*` blocks unchanged. Update the surrounding header comment, which currently describes the retired single-family model.
- [ ] 11.6 Same fixture: add `qos_policy_fixed_max_throughput_iops` / `_mbps` for one volume's `(cluster, svm, policy_group)`, and deliberately leave the second joined volume in no policy group, so the demo shows both the capped and the uncapped edge. Values in MB/s for the `_mbps` family (the backend converts).
- [ ] 11.7 Re-run the section 7.4 visual check against a backend image carrying `160c347`: storage chain nests, both usage fills render, the capped edge shows eight tooltip rows and the uncapped one shows six.
- [ ] 11.8 `CLAUDE.md` demo-fixture description: correct the seeded Harvest family names to the three-hop set.
- [ ] 11.9 Full gate: `npm run lint && npm run typecheck && npm run test:ci && npm run build` clean; `openspec validate sync-netapp-storage-nodes --strict`.
