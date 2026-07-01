## 1. Palette constants (single-source maps first)

- [x] 1.1 `clusterPalette.ts`: replace `CLUSTER_PALETTE` array + `colorForCluster` name-hash with a single fixed `CLUSTER_COLOR` constant (muted, low-saturation, clear of edge/status hues per design.md); update file header comment
- [x] 1.2 `namespacePalette.ts`: same pattern, `NAMESPACE_COLOR`
- [x] 1.3 `applicationPalette.ts`: same pattern, `APPLICATION_COLOR`
- [x] 1.4 Update `clusterPalette.test.ts` / `namespacePalette.test.ts` / `applicationPalette.test.ts`: replace hash-distribution assertions with "same constant regardless of name" assertions

## 2. normalize.ts (data layer)

- [x] 2.1 RED — `normalize.test.ts`: cluster node gets `selectable: false`; namespace/application nodes keep no `selectable` property (unchanged, cytoscape default `true`); `clusterColor`/`namespaceColor`/`applicationColor` are the fixed constant regardless of node name; `data.label` is `${kind}:${name}` for cluster/namespace/application; non-decorative node kinds (pod/service/pvc/node/storageclass/controller) keep unprefixed labels
- [x] 2.2 GREEN — `resolveNodeIdentity`: source colour from the new fixed per-kind constants; prefix `label` with `cluster:`/`namespace:`/`application:` for the three decorative kinds
- [x] 2.3 GREEN — `parseNodes`: add `selectable: false` as a sibling of `data` on the pushed `ElementDefinition` when `identity.isCluster` is true (namespace/application unaffected)
- [x] 2.4 Fix stale comment at `normalize.ts` ~line 300-304 (currently claims every node including decorative groups is selectable — no longer true for `cluster`); fix stale "right-click detail panel" comment ~line 367-368 (right-click detail is already fully removed)

## 3. GraphCanvas: dbltap collapse trigger for cluster

- [x] 3.1 RED — `GraphCanvas.test.tsx`: fix stale fixture (remove `selectable: false` from the `namespace` test node — only `cluster` carries it); add test asserting `dbltap` on an `isCluster` node calls `apiRef.current.expand`/`.collapse` (via `isExpandable`/`isCollapsible`); add test asserting `dbltap` on a non-cluster node is a no-op for the expand-collapse api
- [x] 3.2 GREEN — `GraphCanvas.tsx`: add a `dbltap` listener (bound alongside the existing `tap` listener, same effect or a sibling one) gated on `target.data('isCluster') === true`, calling `apiRef.current?.expand(node)` when `isExpandable(node)` else `.collapse(node)` when `isCollapsible(node)`

## 4. Stale right-click comment cleanup (feature already removed, docs lag)

- [x] 4.1 `src/features/node-detail/hooks/useNodeDetailUrls.ts`, `detailUrlKinds.ts`, `detailPaths.ts`: correct comments describing a "right-clicked pod/controller" / "right-click Change-Report queries" — the prefetch is now purely selection-driven (left-click only)
- [x] 4.2 `src/panels/KsgPanel/KsgPanel.tsx` (~line 363-365 prefetch comment), `KsgPanel.types.ts` (~line 28-30 `selectedPodVariable` doc comment), `KsgPanel.editor.tsx` (~line 97 option help text): correct "right-click" references — clearing/prefetch is now left-click-selection-driven only, not a separate right-click gesture
- [x] 4.3 `src/features/variable-export/selectedPodExportValue.ts`: correct the doc comment describing `isLeftClick: false` as a live "right-click" path — `useSelectedPodExport` is always called with `isLeftClick: true` in production (`KsgPanel.tsx`), so the `false` branch is dead-but-kept-for-type-completeness; comment should say so rather than imply a live right-click gesture feeds it

## 5. Spec deltas

- [x] 5.1 `specs/panel-rendering/spec.md` (MODIFIED: 互動與選取狀態; ADDED: 裝飾性 compound 群組使用 per-kind 固定色彩與 kind 前綴標籤)

## 5a. Label prefix refinement (title-case + space-after-colon + application→Release Unit rename)

- [x] 5a.1 `normalize.ts`: replace `DECORATIVE_GROUP_TYPES` Set with a `GROUP_LABEL_PREFIX` lookup (`cluster`→`Cluster`, `namespace`→`Namespace`, `application`→`Release Unit`); build `displayLabel` as `${prefix}: ${name}` (space after colon). Internal `type`/`kind` string, `isApplication`, `applicationColor` unaffected — display-only rename.
- [x] 5a.2 `normalize.test.ts`: update the three kind-prefixed label assertions to `Cluster: demo` / `Namespace: shop` / `Release Unit: checkout`.
- [x] 5a.3 `GraphCanvas.test.tsx`: update `cluster`/`namespace` fixture `label` values to match the new format for consistency with normalize.
- [x] 5a.4 `clusterPalette.ts` / `namespacePalette.ts` / `applicationPalette.ts`: fix stale comments referencing the old `kind:` prefix format.
- [x] 5a.5 `proposal.md` / `design.md` / `specs/panel-rendering/spec.md`: update label-prefix examples and the "Release Unit" rename rationale (cytoscape has no mixed-weight rich text, so "bold" stays whole-label via existing `font-weight: 600`, not prefix-only).
- [x] 5a.6 `getStylesheet.ts`: bump `node[?isCluster]` label `font-size` 14→18, `node[?isNamespace]`/`node[?isApplication]` 13→17 (two size-levels up on the three decorative compound kinds only; generic `node:parent` compound label untouched).

## 5b. Physical-network + k8s-node compound-header label alignment (capital + size)

- [x] 5b.1 `getStylesheet.ts`: add `titleCaseWords` helper (render-only word title-caser).
- [x] 5b.2 `getStylesheet.ts`: add `node[kind='network']` selector — RENDER-ONLY function `label` mapper title-cases the fabric name (`physical network`→`Physical Network`) + `font-size` 17 / `font-weight` 600. Declared after `node:parent` so it wins the wrapper header. `data.label` untouched.
- [x] 5b.3 `getStylesheet.ts`: add k8s-node header styling — RENDER-ONLY function `label` mapper prefixes `Node: ` (mirroring `Cluster: `/`Namespace: `/`Release Unit: `) + `font-size` 18 / `font-weight` 600. `data.label` stays the bare resource name that the dashboard `name=` query (`paramsFromData` label→name) and the detail-panel title (`NodeDetailPanel` `node.label`) depend on — so neither breaks. **Gated on the node being an actual compound**: `node[kind='node']:parent` (node-layout, wraps pods) + a `node[kind='node'].cy-expand-collapse-collapsed-node` sibling (folded compound). A controller-layout **leaf** k8s node matches neither → falls through to the base `node` title (bare label, base font).
- [x] 5b.4 `getStylesheet.test.ts`: assert selectors' ordering (after `node:parent`, before `node:selected`), font-size/weight, the render-only label mappers (`Physical Network`, `Node: worker-0`), that no bare `node[kind='node']` selector exists, and a headless case proving a COMPOUND k8s node renders `Node: worker-0`@18px while a LEAF k8s node renders bare `worker-9`@11px (identity `data.label` intact both ways, treatment survives fold); snapshot updated.

## 6. Verify

- [x] 6.1 `npm run typecheck && npm run lint && npm run test:ci` _(all green: 77 suites / 723 tests / 1 snapshot)_
- [x] 6.2 `openspec validate polish-compound-node-ui --strict`
- [ ] 6.3 Manual: `npm run build && docker compose --profile backend up -d` → click a cluster backplate (no selection ring, no cue), double-click it (toggles collapse/expand), click a namespace/application backplate (still selects, cue still surfaces, application still opens detail); confirm cluster/namespace/application backplates each render one uniform colour per kind with `kind:name` labels, and edges crossing any backplate stay legible _(build verified green; docker stack + visual confirmation is a developer-run manual step — not executable headlessly here)_
