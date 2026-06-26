## 1. Constants & types (single-source maps first)

- [ ] 1.1 `types.ts` `EdgeType`: remove `pod-runs-on-node`, `controller-owns-pod`; add `pod-to-node`, `pvc-to-storageclass`
- [ ] 1.2 `colorByEdgeType.ts`: update `EDGE_ENDPOINTS_BY_TYPE` + `EDGE_STYLE_BY_TYPE` (`pod-to-node` `#3b82f6` pod→node; `pvc-to-storageclass` `#8b5cf6` pvc→storageclass); drop the two removed
- [ ] 1.3 `drawnEdgeTypesForMode.ts`: controller draws `pod-to-node` + `pvc-to-storageclass`; node draws `pvc-to-storageclass` only
- [ ] 1.4 `cytoscape.d.ts`: add `isApplication?`, `applicationColor?`, `provisioner?`, `parameters?: Record<string,string>`; remove `isStorageClass?`
- [ ] 1.5 `applicationPalette.ts` (new) `colorForApplication` + barrel export; `applicationPalette.test.ts`
- [ ] 1.6 Update `colorByEdgeType.test.ts`, `drawnEdgeTypesForMode.test.ts`

## 2. normalize.ts (data layer)

- [ ] 2.1 RED: `normalize.test.ts` — storageclass leaf (`kind:'storageclass'`, `provisioner`, `parameters`, no `isStorageClass`); `namespace`/`application`/`controller` flag-groups; `pod-to-node`/`pvc-to-storageclass` edges pass through; controller enrichment (kind from child `owner.kind`, aggregated `application`/`containers`/`alerts`/`worstStatus`); node `worstStatus` via `pod-to-node`
- [ ] 2.2 GREEN: `resolveNodeIdentity` — delete storageclass branch; add namespace/application/controller branches
- [ ] 2.3 GREEN: `parseNodes` — drop `isStorageClass` local + alerts-suppression term; pass through `provisioner`/`parameters`; `selectable:false` for namespace/application/controller
- [ ] 2.4 GREEN: replace `synthesizeControllers` with a controller-enrichment pass (decorate backend `controller` nodes from child pods)
- [ ] 2.5 GREEN: node `worstStatus` recomputed from `pod-to-node` edges

## 3. Transforms

- [ ] 3.1 Delete `applyNamespaceGrouping.ts` + `applyNamespaceGrouping.test.ts`; remove from `KsgPanel` view-transform memo
- [ ] 3.2 RED: `applyPodParentMode.test.ts` — controller = identity clone; node = re-parent pod→`labels.node`, drop workload-tier groups, re-parent pvc/service/storageclass→cluster, drop `pod-to-node` edges
- [ ] 3.3 GREEN: rewrite `applyPodParentMode`

## 4. Stylesheet & styles

- [ ] 4.1 `getStylesheet.ts`: add `node[?isApplication]` selector (clone of `node[?isNamespace]`, `data(applicationColor)`)
- [ ] 4.2 Refresh `getStylesheet.test.ts` snapshot

## 5. Legend & KsgPanel wiring

- [ ] 5.1 `ApplicationLegend/**` (new, SwatchLegend wrapper) + barrel export + `ApplicationLegend.test.tsx`
- [ ] 5.2 `KsgPanel.tsx`: add `applicationEntries` memo + `applicationContainerIds` + collapse group + render `<ApplicationLegend>` (mode-gated)
- [ ] 5.3 Remove `StorageClassLegend/**` + its render/state; delete `deriveStorageClassContainers.ts` + tests
- [ ] 5.4 Verify `NamespaceLegend` fed by backend `isNamespace`; `NodeContainerLegend` controller predicate on enriched controllers

## 6. Node detail & hover

- [ ] 6.1 `NodeDetailData` + `resolveSelectedNode` spread: add `provisioner`/`parameters`; storageclass now resolves (eligible)
- [ ] 6.2 `NodeDetailPanel`: new Storage Class section gated `node.kind === 'storageclass'` (provisioner + parameters k/v, generic keys)
- [ ] 6.3 `assembleDashboardParams` DENYLIST: add `provisioner`, `parameters`; remove `isStorageClass`
- [ ] 6.4 hover-tooltip: delete `gatherStorageClassContext` + `storageClass` field + `isStorageClass` branch; storageclass leaf uses normal path
- [ ] 6.5 Update `resolveSelectedNode.test`, `NodeDetailPanel.test`, `assembleDashboardParams.test`, `HoverTooltip.test`, `useHoverElement.test`

## 7. Demo / fixtures (so the showcase doesn't regress)

- [ ] 7.1 Rewrite showcase inline dashboard JSON (`/d/ksg-switch-demo`) to D6 shape
- [ ] 7.2 `dev/victoriametrics/seed.sh`: emit `kube_storageclass_info`; bump `KSG_BACKEND_TAG` to the `787573b` image

## 8. Spec deltas

- [ ] 8.1 `specs/graph-data-integration/spec.md`
- [ ] 8.2 `specs/namespace-grouping/spec.md` (REMOVED)
- [ ] 8.3 `specs/pod-parent-mode/spec.md`
- [ ] 8.4 `specs/node-icon-encoding/spec.md`
- [ ] 8.5 `specs/panel-rendering/spec.md`
- [ ] 8.6 `specs/node-dashboard-url/spec.md`

## 9. Verify

- [ ] 9.1 `npm run typecheck && npm run lint && npm run test:ci`
- [ ] 9.2 Manual: `npm run build && docker compose --profile backend up -d` → both dashboards render the D6 hierarchy; toggle node/controller views; storageclass detail shows provisioner/parameters
- [ ] 9.3 `openspec validate adopt-backend-d6-hierarchy --strict`
