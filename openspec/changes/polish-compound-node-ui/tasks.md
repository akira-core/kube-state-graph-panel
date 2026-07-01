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

## 6. Verify

- [x] 6.1 `npm run typecheck && npm run lint && npm run test:ci` _(all green: 77 suites / 723 tests / 1 snapshot)_
- [x] 6.2 `openspec validate polish-compound-node-ui --strict`
- [ ] 6.3 Manual: `npm run build && docker compose --profile backend up -d` → click a cluster backplate (no selection ring, no cue), double-click it (toggles collapse/expand), click a namespace/application backplate (still selects, cue still surfaces, application still opens detail); confirm cluster/namespace/application backplates each render one uniform colour per kind with `kind:name` labels, and edges crossing any backplate stay legible _(build verified green; docker stack + visual confirmation is a developer-run manual step — not executable headlessly here)_
