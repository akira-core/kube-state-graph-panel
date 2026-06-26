## Context

The panel currently **owns** the topology hierarchy: it synthesizes controllers + `controller-owns-pod` edges (`normalize.synthesizeControllers`), namespace boxes + PVC/storageclass sub-boxes (`applyNamespaceGrouping`, controller-mode only), and chooses pod nesting per a `PodParentMode` toggle (`applyPodParentMode`). StorageClass is treated as a synthetic compound group (`isStorageClass`) that boxes PVCs; "application" exists only as a string attribute on pods/controllers.

The backend (kube-state-graph `787573b`, design **D6**) moved hierarchy ownership server-side. The `/v1/graph` cytoscape payload now is authoritative for the full parent chain and emits real edges where the panel used nesting.

### Backend wire contract (confirmed from `internal/api/testdata/golden/with-storageclass-cytoscape.json`)

Node `data.type` literals: `cluster`, `namespace`, `application`, `controller`, `node`, `pod`, `pvc`, `service`, `storageclass`, `external`.
Edge `data.type` literals: `pod-to-node`, `pod-mounts-pvc`, `pod-calls-pod`, `pod-calls-service`, `service-selects-pod`, `pvc-to-storageclass`.

Parent chain (`data.parent`):

```
cluster/<c>                                   (parent: "")
└─ <c>/namespace/<ns>                          (namespace group)
   ├─ <c>/namespace/<ns>/application/<app>     (application group)
   │  └─ .../controller/<Kind>/<name>          (controller group)
   │     └─ <c>/<podUid>   type:pod  owner:{kind,name}  application:<app>  labels.node:<c>/<nodeName>
   ├─ <c>/<ns>/<pvc>       type:pvc
   └─ <c>/<svc>            type:service
cluster/<c>
├─ <c>/<nodeName>          type:node
└─ <c>/storageclass/<sc>   type:storageclass  provisioner:<...>  parameters:{pool,fs,cluster_id,selector}
```

Key facts:

- `pod` keeps `owner:{kind,name}`, `application:<string>`, and `labels.node` (the K8s node id) even though it is now nested under its controller.
- `controller` group is `type:"controller"` (the literal, **not** the lowercased Kind); the Kind lives only in the id path and on the child pods' `owner.kind`. `labels:{}`, no status, no edges.
- `application` / `namespace` groups: `labels:{}`, no edges; purely `data.parent` targets.
- `storageclass` is a **leaf** under the cluster (no children). `provisioner` + `parameters` are `omitempty`: a referenced-but-undefined storageclass materializes bare.
- `node` is a leaf under the cluster; `pod-to-node` is an explicit edge. A PVC with no resolved storageclass emits **no** `pvc-to-storageclass` edge.

## Goals / Non-goals

**Goals**: consume the backend hierarchy faithfully (full D6 adoption); show storageclass node info (provisioner/parameters); render the application group; preserve the controller detail panel and the pod-parent toggle; keep the showcase demo working.

**Non-goals**: changing the `/v1/graph` query string; adding a storageclass-specific Grafana dashboard; redesigning the layout engine or the detail-panel ArgoCD/container tables.

## Decisions

### D1 — Full adoption; retire client-side synthesis

The panel consumes the backend hierarchy; it stops deriving it. Rationale: the backend now emits `namespace` / `application` / `controller` groups and `pod-to-node` / `pvc-to-storageclass` edges unconditionally — keeping client synthesis would double-render controllers + namespace boxes and is unmaintainable against an evolving backend. (Alternatives "minimal patch" and "hybrid" were rejected: both fight the backend and leave `application` un-modeled.)

### D2 — Pipeline restructure

```
BEFORE: normalizeGraph(parseNodes+parseEdges+synthesizeControllers)
          → applyPodParentMode(mode) → applyNamespaceGrouping(mode) → wrapSwitchFabric
AFTER:  normalizeGraph(parseNodes[recognize groups + storageclass leaf + new edges
                                  + controller enrichment])
          → applyPodParentMode(mode)            // rewritten
          → wrapSwitchFabric                    // unchanged
        (applyNamespaceGrouping DELETED)
```

`wrapSwitchFabric` (physical-network wrapper) is orthogonal and unchanged.

### D3 — StorageClass becomes a leaf

Delete the `resolveNodeIdentity` `storageclass` branch → it falls through to the generic leaf branch `{ kind: 'storageclass', status? }` (backend sends no status, so status is omitted). Drop the `isStorageClass` flag entirely (and the `NodeIdentity` union member, the `parseNodes` `isStorageClass` local, and the alerts-suppression term at `normalize.ts:263`). Pass through two new data fields when present: `provisioner` (string) and `parameters` (`Record<string,string>` via the existing `isStringRecord` guard). `storageclass` is already a `NodeKind` with an icon + `Storage` category, so it renders in `NodeLegend` automatically.

### D4 — namespace / application / controller are flag-groups (not kinds)

These are decorative compound parents, modeled like the existing `cluster` flag-group — **no `kind`**, so they are invisible to the kind filter and the icon legend, and they are skipped by `computeVisibility` (kind-less ⇒ always visible, subject only to the orphan cascade). Add `resolveNodeIdentity` branches keyed on `data.type`:

- `namespace` → `{ isNamespace, namespace: label, namespaceColor: colorForNamespace(label) }` — **reuses** the existing `isNamespace` flag, palette, stylesheet selector, and `NamespaceLegend` (originally built for the synthesized version).
- `application` → `{ isApplication, application: label, applicationColor: colorForApplication(label) }` — **new** flag, new `applicationPalette.ts`, new stylesheet selector, new `ApplicationLegend`.
- `controller` → see D5 (carries a real `kind` to preserve detail).

All three are `selectable:false` (like cluster). `data.parent` is passed through verbatim (the panel is structure-agnostic; it only assigns accent colors).

### D5 — Controller enrichment preserves the detail panel

`synthesizeControllers` is deleted, but the backend `controller` group is **enriched** to reproduce the old synthesized-controller shape so the right-click detail panel (ApplicationTable, ContainerTable, dashboard URL) keeps working:

- derive `kind` = lowercased `owner.kind` of a child pod (e.g. `statefulset`) → so the controller is a Workloads kind and trips `DETAIL_URL_KINDS` gates;
- set `isController: true` (drives `NodeContainerLegend` controller-mode predicate + collapse);
- aggregate from child pods (matched by `pod.parent === controllerId`): `application` (first in stable order), `containers` (deduped union), `alerts`, `worstStatus` (max child rank — always written for the colored border, D10-old);

A controller therefore carries both `isController` **and** a real `kind` (the same dual nature `storageclass` had under the old flag model). It is still a compound parent, so the stylesheet `node:parent` rule paints it as a labelled box when expanded and the `kind` glyph when collapsed — identical to today.

### D6 — Edge model

`EdgeType` net stays 8. Remove the two panel synthetics, add the two backend edges:

| removed | added |
| --- | --- |
| `pod-runs-on-node` (synthetic) | `pod-to-node` (backend, `pod→node`, color `#3b82f6` — old blue) |
| `controller-owns-pod` (synthetic) | `pvc-to-storageclass` (backend, `pvc→storageclass`, color `#8b5cf6` — storage violet) |

`#8b5cf6` is deliberately distinct from `pod-mounts-pvc` `#a855f7` so the two storage edges read apart. `EDGE_ENDPOINTS_BY_TYPE`, `EDGE_STYLE_BY_TYPE`, `ALL_EDGE_TYPES`, and `computeVisibility.KNOWN_EDGE_TYPES` all derive from these maps.

### D7 — Pod-parent toggle, reimplemented on the backend graph

`applyPodParentMode(elements, mode)`:

- **`controller`** (default): immutable clone of the backend payload (pods stay under their controller; `pod-to-node` drawn as an edge).
- **`node`** (infra view): for each `pod`, re-parent to `labels.node` (validated against a present `node`-kind id; if absent, leave under cluster); **drop** the `namespace` / `application` / `controller` group nodes; re-parent their non-pod members (`pvc`, `service`, `storageclass`) directly under the cluster; **drop** `pod-to-node` edges (the relationship is now nesting). Result = flat `cluster > node > pod`, matching the old infra view.

`drawnEdgeTypesForMode`: `controller` draws `[pod-mounts-pvc, pod-calls-pod, pod-calls-service, service-selects-pod, pod-to-node, pvc-to-storageclass, switch…]`; `node` draws the same **minus `pod-to-node`** (nesting).

### D8 — Node `worstStatus` follows `pod-to-node` edges

Pods no longer nest under nodes, so a `node`'s colored border can no longer be computed from children in `controller` view. Recompute node `worstStatus` from the worst status among pods reachable via `pod-to-node` edges. In `node` view (where pods re-nest under the node) the existing child-based computation also holds.

### D9 — Legend

- **New** `applicationPalette.ts` `colorForApplication(name)` (mirror `namespacePalette`) + `ApplicationLegend` (thin `SwatchLegend` wrapper, title "Applications") + `applicationEntries` memo + collapse group in `KsgPanel`, mode-gated like namespaces.
- `NamespaceLegend` unchanged in shape; now fed by backend `isNamespace` nodes (controller view only — `node` view strips them).
- **Remove** `StorageClassLegend` (component + render + state). `storageclass` now appears as a normal glyph row under `Storage` in `NodeLegend` via the existing `categoryByKind` wiring.
- `NodeContainerLegend` controller-mode predicate `d.isController === true` continues to work on enriched backend controllers.

### D10 — Node-detail: Storage Class section

Make `storageclass` selectable and detail-eligible (the `isStorageClass` exclusion in `isDashboardEligible` disappears with the flag). Add `provisioner?` + `parameters?` to `NodeDetailData` and the `resolveSelectedNode` spread; render a new **Storage Class** section in `NodeDetailPanel` gated on `node.kind === 'storageclass'` (a fixed-height key/value block: `provisioner` row + the `parameters` map rendered generically — keys are provisioner-dependent, never hard-coded). Add `provisioner` + `parameters` to the `assembleDashboardParams` DENYLIST (structural, not query params).

### D11 — Hover tooltip

The storageclass leaf now carries its own `kind` + `labels.cluster` + `provisioner`, so the synthesized-from-children path is wrong. Delete `gatherStorageClassContext`, the `HoveredElement.storageClass` field, and the `isStorageClass` branch in `HoverTooltip`; the leaf flows the normal node-tooltip path (optionally surfacing `provisioner`).

### D12 — Demo / fixtures

Without this the showcase regresses (the inline JSON is old-shape and, with client synthesis gone, would render flat).

- Rewrite the showcase inline dashboard JSON (`/d/ksg-switch-demo`) to the D6 shape (namespace/application/controller groups, storageclass leaf, `pod-to-node` / `pvc-to-storageclass` edges).
- Update `dev/victoriametrics/seed.sh` to emit `kube_storageclass_info`; bump `KSG_BACKEND_TAG` to the `787573b` image so `docker compose --profile backend` produces the new payload.

## Risks / Mitigations

1. **Double-render** if synthesis is merely guarded, not removed → conflicting controllers/namespace boxes. *Mitigation: delete `synthesizeControllers` + `applyNamespaceGrouping`, don't gate them.*
2. **`node`-view re-parent** depends on `pod.labels.node` matching a present node id. *Mitigation: validate against the node-id set; fall back to leaving the pod under the cluster.*
3. **Controller detail regression** if enrichment misses a field. *Mitigation: D5 reproduces the exact old aggregation (kind, application, containers, alerts, worstStatus); covered by the existing controller detail tests, re-pointed at backend controllers.*
4. **Large test churn** bound by exhaustive map/snapshot tests (`colorByEdgeType.test`, `getStylesheet` snapshot, `computeVisibility.test`). *Expected, not a correctness risk — each is a known file.*
5. **Showcase drift** if D12 skipped. *Mitigation: D12 is an in-scope phase.*

## Test strategy

Pure functions stay straight Jest; cytoscape hooks stay headless. Rewrite: `normalize.test` (group recognition, storageclass leaf provisioner/parameters, controller enrichment, new edges, node worstStatus via edges), `colorByEdgeType.test`, `drawnEdgeTypesForMode.test`, `computeVisibility.test`, `applyPodParentMode.test`, `resolveSelectedNode.test`, `deriveLegendKinds.test`, `getStylesheet` snapshot, `KsgPanel.test`, `HoverTooltip`/`useHoverElement.test`, `assembleDashboardParams.test`. Delete `applyNamespaceGrouping.test`, `deriveStorageClassContainers.test`, `StorageClassLegend.test`. Add `applicationPalette.test`, `ApplicationLegend.test`. Gate: `npm run typecheck && npm run lint && npm run test:ci`.
