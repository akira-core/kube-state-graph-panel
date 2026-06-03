## Why

The panel encodes node identity (`kind`) with a distinct Cytoscape shape per kind. Human-distinguishable geometric shapes top out at ~8, and 6 are already used (`pod`/`node`/`pvc`/`service`/`others`/`external`). Adding Kubernetes workload kinds (Deployment, StatefulSet, DaemonSet, Job, CronJob) has no remaining shape budget. We move kind identity to per-kind **icons** (an effectively unbounded channel), freeing the visual system to scale to many more resource kinds, and add a workload-controller topology so those new nodes connect meaningfully to their pods.

## What Changes

- **BREAKING** Retire shape-per-kind. `SHAPE_BY_KIND` no longer encodes identity; all leaf nodes render as a uniform `round-rectangle` container and kind is conveyed by a monochrome line-art **icon** drawn as the node `background-image`. `ICON_SVG_BY_KIND` becomes the single-source map (replacing `SHAPE_BY_KIND`'s identity role).
- Icons are theme-tinted at runtime: a pure `tintSvgToDataUri(rawSvg, hex)` injects the Grafana theme colour into a `currentColor` sentinel and emits a UTF-8 `data:image/svg+xml` URI (`#`→`%23`, not base64), memoized by `(kind, hex)`. Tinting is owned solely by the `getStylesheet(theme, …)` factory via a `function(ele)` `background-image` mapper.
- Status keeps using the border colour. `STATUS_BORDER_KINDS` becomes "any kind the backend reports a status for" (data-driven; no status → neutral border).
- Add NodeKinds `deployment`/`statefulset`/`daemonset`/`job`/`cronjob`. ReplicaSet is **not** a panel kind — the backend collapses `Deployment → ReplicaSet → Pod`, so pods attribute directly to their top-level controller and ReplicaSet never appears. Unknown kinds fall back to a generic icon and stay **visible by default**.
- **BREAKING** Remove NodeKind `others` — the kube-state-graph backend dropped it from its contract (externals subsume the others fallback), so the panel no longer carries it.
- Add the v0.0.18 physical-network kinds/edges: NodeKind `switch` and EdgeTypes `switch-to-switch` / `node-to-switch` (drawn in both pod-parent modes). The backend defines these types but does not yet emit them; the panel renders them as soon as it does.
- **Dynamic legend** — the node legend and edge legend list only the kinds / edge types actually present in the graph (mirroring the cluster legend), instead of the full map.
- **BREAKING** Replace the `pod-parent-mode` toggle `'node' | 'service'` with `'node' | 'controller'`. Service is no longer a compound parent — it is always edge-connected in both modes. `node` mode nests `cluster > node > pod` and draws `controller-owns-pod`; `controller` mode nests `cluster > controller > pod` and draws the synthesised `pod-runs-on-node`. `controller-owns-pod` connects a pod directly to its top-level controller (e.g. Deployment); the backend has already collapsed any intervening ReplicaSet.
- Add edge type `controller-owns-pod` to `EdgeType`, `colorByEdgeType`, `drawnEdgeTypesForMode`, `EDGE_ENDPOINTS_BY_TYPE`, and the legend.
- Legend: node legend renders theme-tinted icon glyphs (replacing `ShapeGlyph`) grouped by a panel-owned super-category map (Workloads / Networking / Storage / Cluster / Other); colour does **not** encode category (colour = status). Edge legend adds `controller-owns-pod`, and `service-selects-pod` is shown in both modes. The mode toggle UI relabels node⇄service to node⇄controller.
- Vendor Argo CD monochrome resource SVGs (Apache-2.0-compatible) as the icon source; record attribution in `docs/THIRD_PARTY.md`.

## Capabilities

### New Capabilities

- `node-icon-encoding`: per-kind icon glyph rendering — the `ICON_SVG_BY_KIND` single-source map, `tintSvgToDataUri` theme tinting, the `getStylesheet` `background-image` mapper, the uniform leaf container, status-border behaviour, compound-container icon placement, and the unknown-kind fallback.

### Modified Capabilities

- `pod-parent-mode`: the toggle changes from `'node' | 'service'` to `'node' | 'controller'`; service stops being a compound parent; `applyPodParentMode` re-parents pods under their owning controller from `controller-owns-pod` edges and synthesises `pod-runs-on-node` in controller mode.
- `panel-rendering`: new `controller-owns-pod` edge type and its drawn-edge/legend wiring; node legend switches to icon glyphs grouped by super-category; mode-toggle relabel; `computeVisibility` `ALL_KINDS` derives the new kinds from the single-source map.

## Impact

- **Source**: `src/shared/constants/{shapeByKind,colorByEdgeType,colorByStatus,drawnEdgeTypesForMode,types}.ts` (+ new `iconSvgByKind.ts`, `tintSvgToDataUri.ts`, `categoryByKind.ts`); `src/features/graph-canvas/styles/getStylesheet.ts`; `src/features/graph-data/normalize.ts`; `src/features/pod-parent-mode/applyPodParentMode.ts`; `src/features/element-filter/computeVisibility.ts`; `src/features/legend/components/{NodeLegend,EdgeLegend,EdgeGlyph,ShapeGlyph}`; panel options editor (mode-toggle label).
- **Assets**: vendored monochrome SVGs under `src/`; `docs/THIRD_PARTY.md` attribution.
- **Backend contract (external dependency, not panel code)**: the deployed kube-state-graph v0.0.14 backend must emit workload nodes (`data.type` = `deployment`/`statefulset`/`daemonset`/`job`/`cronjob`) and `controller-owns-pod` edges (pods attributed to their top-level controller, ReplicaSet collapsed). PromQL/kube-state-metrics may not expose full ownerReference chains without a backend change. The panel degrades gracefully for any kind/edge the backend does not emit and never errors.
- **Out of scope (YAGNI)**: ingress/pv/storageclass/configmap/secret/rbac nodes and edges; low-zoom icon→bare-shape LOD; status corner badge (border only for now).
