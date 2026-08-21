# panel-rendering delta — sync-netapp-storage-nodes

## MODIFIED Requirements

### Requirement: Edge colour by relationship type

The system SHALL map each edge type (`EdgeType`) to a distinct colour and line style through `src/shared/constants/colorByEdgeType.ts`, and that one table MUST be shared by the stylesheet and the legend. The `EdgeType` enum covers the edge types the backend emits (`pod-to-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-netapp-aggr` / `switch-to-switch` / `node-to-switch`) — 8 in total, **all backend-emitted**. With the adoption of the backend's D6 hierarchy the panel retires two former synthesised edges: `pod-runs-on-node` (pod-runs-on-node is no longer nesting or a synthesised edge; the backend's `pod-to-node` edge replaces it) and `controller-owns-pod` (the backend now emits the controller group, so the panel no longer synthesises this edge from a pod's `data.owner` — see graph-data-integration). `pod-to-node` (`pod → node`) MUST render as a blue `#3b82f6` (the old blue) solid line; `pvc-to-netapp-aggr` (`pvc → netapp-aggr`) MUST render as a violet `#8b5cf6` (storage violet) solid line, and that colour MUST be **deliberately distinct** from `pod-mounts-pvc`'s `#a855f7` so the two storage edges read apart (the removed `pvc-to-storageclass` vacated both the colour and the slot). `pod-calls-service` and `service-selects-pod` MUST share the **same orange `#f97316` as `pod-calls-pod`** — a pod→service→pod hop is still fundamentally a pod-to-pod relationship with a Service in the middle — and those two service types MUST be **omitted from the edge legend** (no row of their own and no extra merged row), represented instead by the single `pod-calls-pod` row, which renders as `pod ↔ pod/service` (a bidirectional arrow glyph) to mark that it covers both the direct and the via-Service pod-to-pod relationship (see the "Legend" requirement below). Every edge is solid and direction is conveyed by the **arrowhead**. `switch-to-switch` and `node-to-switch` (the backend v0.0.18 physical-network fabric) MUST **share one infra colour and one solid line style** and take the same orthogonal (`taxi`) routing (see the switch-tier-layout spec), making them visually identical — `node-to-switch` no longer uses a separate indigo or a bézier, and is distinguished only by its endpoints (`<node> → <switch>` vs `<switch> → <switch>`), so a K8s node's uplink reads as part of the switch fabric. `colorByEdgeType.ts` also exports `EDGE_ENDPOINTS_BY_TYPE` (the source and target `NodeKind` of each edge type) so the legend can render an edge type as `<from> → <to>`; `pod-to-node`'s endpoints MUST be `<pod> → <node>`, `pvc-to-netapp-aggr`'s `<pvc> → <netapp-aggr>`, `switch-to-switch`'s `<switch> → <switch>`, and `node-to-switch`'s `<node> → <switch>`.

#### Scenario: A known edge type maps to the correct colour

- **WHEN** an edge's data carries `edgeType: 'pod-to-node'` (or any other defined type)
- **THEN** that edge renders in the corresponding colour and line style (`pod-to-node` as a blue `#3b82f6` solid line), matching the definition in `colorByEdgeType.ts`

#### Scenario: The two storage edges are distinguished by different violets

- **WHEN** the graph holds both a `pod-mounts-pvc` and a `pvc-to-netapp-aggr` edge
- **THEN** `pod-mounts-pvc` renders in `#a855f7` and `pvc-to-netapp-aggr` in `#8b5cf6` — deliberately different so the two storage edges read apart

#### Scenario: Edge colours do not collide with status colours

- **WHEN** inspecting the colour of any edge type in `EDGE_STYLE_BY_TYPE`
- **THEN** it MUST NOT equal any value in `STATUS_COLOR` (green `#73BF69` / yellow `#F2CC0C` / red `#E02F44`) — `pod-to-node`'s `#3b82f6`, `pvc-to-netapp-aggr`'s `#8b5cf6`, and the service edges' orange `#f97316` all satisfy this

#### Scenario: node-to-switch and switch-to-switch look identical

- **WHEN** the graph holds both a `node-to-switch` and a `switch-to-switch` edge
- **THEN** both render in the same infra colour, the same solid line style, and the same `taxi` orthogonal routing (only their endpoints differ); `node-to-switch` no longer appears in a separate indigo or as a bézier

#### Scenario: An unknown edge type takes the fallback

- **WHEN** an edge's `edgeType` is absent from the mapping table
- **THEN** it renders as a grey solid fallback line and throws nothing

### Requirement: Interaction and selection state

The panel SHALL support click-to-select on nodes, visualising the selected state through cytoscape's built-in `:selected` style and optionally emitting the selected node's id through an `onSelect` callback for other components to consume.

**Selection and detail-panel visibility (detail open) MUST be two independent states.** Selection drives the cytoscape single-select highlight, the selection-focus fade, the pinned tooltip in the top-right corner (below the search bar — see `graph-search`), and variable output (selected-pod-export); whether the detail panel is open is pure UI state, and closing the panel MUST NOT clear the selection (see "Node detail panel"). Deselection happens through **exactly three** routes: clicking the background, clicking an edge, or clicking a non-selectable `cluster` backdrop (all three fire `onSelect(null)`). Clicking an **already-selected** node MUST reopen its detail panel rather than deselect it. Besides a canvas tap, graph-search's **locate** also establishes a selection and MUST open the detail panel for a detail-eligible node (equivalent to left-clicking it on the canvas — see the `graph-search` capability). Selection and deselection **on the canvas** (GraphCanvas `onSelect`) MUST clear a non-empty search query (see `graph-search`, "Canvas interaction clears search"); the locate path MUST NOT go through that clear.

**`controller` / K8s `node` / `netapp-node` / `netapp-aggr`, and the decorative `namespace` / `application` groups, MUST be selectable. The decorative `cluster` and `storage-cluster` groups MUST NOT be selectable (`selectable: false`).** The sole purpose of that selectability is to let the **`+/-` collapse cue** of the already-enabled `cytoscape-expand-collapse` (`cueEnabled: true`) appear: the cue is selection-driven and is drawn only on a **single selected** node that is a `:parent` (or already collapsed). So the user clicks any selectable compound parent → that parent shows its `+/-` cue → clicking the cue toggles it collapsed or expanded (reusing the existing expand-collapse plumbing, with no new component and no new collapse mechanism).

Because the `cluster` group is not selectable, tapping it always behaves like tapping the background (firing `onSelect(null)`, showing no selection ring, and surfacing no collapse cue). Its collapse/expand is triggered by **double-click (`dbltap`)** instead: on detecting a `dbltap` on an `isCluster` node, GraphCanvas MUST call the existing `ExpandCollapseApi` directly (`api.expand(node)` or `api.collapse(node)`, chosen by `isExpandable` / `isCollapsible`) to toggle that node's collapsed state. That path fires the same `expandcollapse.aftercollapse` / `afterexpand` events as the cue, and `collapsedIds` updates through the existing `onCollapsedChange` path, so no new collapse-state mechanism is introduced.

A `namespace` decorative group is selectable (showing the single-select ring and the existing selection-focus visuals) but MUST NOT open the node-detail panel: `resolveSelectedNode` always returns `null` for `isNamespace`. **The `application` group is the exception**: it is now detail-eligible — selecting it surfaces the collapse cue **and** opens the node-detail panel showing that ArgoCD application's config_changes (`resolveSelectedNode` resolves it with a synthetic `kind: application` plus `queryTarget { kind: 'application', name: <app> }` — see "Node detail panel" and "Node-detail Application and Containers sections"). `resolveSelectedNode`'s scope is therefore deliberately wider than `isDashboardEligible`'s: the latter still excludes the `application` group from the `/dashboard` button, since an application group has no per-node dashboard.

#### Scenario: Clicking a node selects it and fires the callback

- **WHEN** the user clicks any selectable node
- **THEN** cytoscape marks it `:selected` and applies the corresponding style, and if an `onSelect` prop was supplied it is called with the node's id

#### Scenario: Clicking an already-selected node reopens the panel rather than deselecting

- **WHEN** a node is already selected and its detail panel was closed with the close button, and the user clicks it again
- **THEN** the detail panel reopens and the selection is unchanged (it never passes through deselect-then-reselect, so the highlight, the pinned tooltip, and the variable output persist throughout)

#### Scenario: The cluster group is not selectable and a tap behaves like a background click

- **WHEN** the user clicks a decorative `cluster` group node
- **THEN** that node's `selectable()` is `false`, `onSelect(null)` is called, no selection ring appears, and the `cytoscape-expand-collapse` collapse cue does not surface

#### Scenario: Double-clicking a cluster group toggles collapse / expand

- **WHEN** the user double-clicks (`dbltap`) a decorative `cluster` group node
- **THEN** that node's collapsed / expanded state is toggled directly through `ExpandCollapseApi` and `collapsedIds` updates accordingly (through the existing `onCollapsedChange` path), regardless of whether the node is currently selected

#### Scenario: namespace / application groups are selectable so the collapse cue can surface

- **WHEN** the user clicks a decorative `namespace` / `application` group node
- **THEN** its `selectable()` is `true`, it is marked `:selected` (showing the single-select ring), and `cytoscape-expand-collapse` draws its `+/-` collapse cue on it

#### Scenario: Selecting a namespace group opens no detail panel

- **WHEN** the user selects a decorative `namespace` group node
- **THEN** `resolveSelectedNode` returns `null` and the node-detail panel MUST NOT open (only the selection ring and the collapse cue appear)

#### Scenario: Selecting an application group opens its app detail

- **WHEN** the user selects an `application` group node
- **THEN** `resolveSelectedNode` resolves it (with a synthetic `kind: application`), the node-detail panel opens and renders the Application section (prefetching that application's `config_changes`), and the tooltip pins to the top-right corner — while the collapse cue still surfaces

#### Scenario: Clicking the collapse cue toggles that parent's collapse

- **WHEN** a selectable compound parent (`controller` / K8s `node` / `netapp-node` / `namespace` / `application`) is selected and shows its `+/-` cue, and the user clicks within that cue
- **THEN** that parent's collapsed / expanded state toggles (through the expand-collapse api) and `collapsedIds` updates accordingly (reusing the existing cue-event → `onCollapsedChange` path)

### Requirement: A collapsed decorative group shows a folder icon

A decorative `cluster` / `storage-cluster` / `namespace` / `application` group MUST show a **folder glyph** in the centre of its frame when **collapsed** (`.cy-expand-collapse-collapsed-node`), tinted with that group's accent colour (`clusterColor` / `storageClusterColor` / `namespaceColor` / `applicationColor`) at `background-fit: contain`. When **expanded** it stays as it is today — a labelled container with no centred icon (`background-image: 'none'`). This folder icon is a gap-fill: a compound that has a `kind` (`controller` / k8s `node` / `netapp-node`) already falls back to its kind icon when collapsed (the base `node` rule) and MUST NOT be affected (the folder selector matches only `isCluster` / `isStorageCluster` / `isNamespace` / `isApplication`). The folder glyph is a standalone SVG outside `NodeKind` (`FOLDER_ICON_SVG`; a decorative kind is not a `NodeKind` and does not enter `ICON_SVG_BY_KIND`).

#### Scenario: A collapsed decorative group shows the folder icon

- **WHEN** a `cluster` / `namespace` / `application` decorative group is collapsed
- **THEN** its `background-image` is the folder glyph (tinted with that group's accent colour) rather than `'none'`

#### Scenario: An expanded decorative group has no centred icon

- **WHEN** that decorative group is expanded (`:parent`, with visible children beneath it)
- **THEN** its `background-image` is `'none'` (a labelled container with no centred folder icon)

#### Scenario: A collapsed kind-ful compound keeps its kind icon

- **WHEN** a `controller` / k8s `node` / `netapp-node` compound is collapsed
- **THEN** its centred icon stays that kind's icon and the folder selector MUST NOT apply to it

### Requirement: Legend

The panel SHALL provide a legend component showing the node icons and edge types **actually present in the graph**. The legend's icon and colour data MUST come from the same tables the cytoscape stylesheet uses (`iconSvgByKind.ts` / `colorByEdgeType.ts`). The node legend's kind set MUST be derived by the collapse-aware `deriveLegendKinds` (see the "Collapse-aware node-kinds legend" requirement) — listing only the kinds **currently drawn as a glyph on the canvas** (drawn leaves and collapsed containers; expanded containers and children hidden by a collapsed ancestor are excluded). The edge legend MUST list only the **edge types present in the current data**, except that `pod-calls-service` / `service-selects-pod` are always **omitted** (they are pod-to-pod in nature and are represented by `pod-calls-pod`'s `pod ↔ pod/service` bidirectional row — see below). Both MUST render nothing (`return null`) when their set is empty. The node legend MUST present each kind as a theme-tinted icon glyph (replacing the former `ShapeGlyph`) and **group** them by the panel-owned `kind → category` table (`categoryByKind.ts`: Workloads / Networking / Storage / Cluster / Other), rendering only categories holding at least one present kind; colour MUST NOT encode category (colour is reserved for status). A kind row's text label defaults to the kind string itself but MUST support a display-name override (a lookup inside `NodeLegend`): `network` MUST display as `physical network`. Each edge-legend row MUST render as `<from> [arrow glyph] <to>`: the arrow glyph (`EdgeGlyph`, carrying that edge's colour and line style) sits between the two `NodeKind` labels in place of a verb, the endpoint labels come from `EDGE_ENDPOINTS_BY_TYPE` (`service` abbreviated to `svc`), and no extra nesting explanation text may appear. The exception: the `pod-calls-pod` row MUST render as `pod ↔ pod/service` (a bidirectional arrow glyph with a head at each end), representing the omitted service-edge pair.

The legend's vertical section order MUST be: `Layout` (the Node|Controller switch, pinned at the top) → `Node Kinds` → **`Ingress Gateway`** → `Edge Types` → `Status` → the swatch sections (`Clusters` → `Namespaces` → `Applications` → **`Nodes`|`Controllers`**). That is, the swatch sections sit **after** `Status`, and **`Nodes`|`Controllers` (`NodeContainerLegend`) MUST be the bottom-most section** (after `Applications`; in `node` mode, where `Namespaces` / `Applications` do not render, it still follows `Clusters` as the bottom-most).

`Ingress Gateway` (`IngressToggle` — see the ingress-visibility-toggle capability) is **presence-gated**: it renders only when the graph actually holds a non-empty ingress-gateway node set, and MUST NOT render otherwise — consistent with this requirement's existing "return null when the set is empty" convention. It sits immediately **after** `Node Kinds` and **before** `Edge Types`, because like `NodeLegend` it is a **node-visibility control** (the eye / eye-slash vocabulary) rather than an explanatory row about edges or status; it MUST NOT be folded into `NodeLegend`'s kind-based rows, which are strictly keyed on kind. Besides its title and eye toggle, that section MUST carry a dashed `EdgeGlyph` sample explaining the dashed ingress semantics on the canvas — `EdgeLegend` omits the service-type rows and its samples are always solid, so without this sample the canvas's dashed lines would have no explanation anywhere in the legend.

`Namespaces` (`NamespaceLegend`) and `Applications` (`ApplicationLegend`, titled `Applications`) are **mode-gated**: they render only in `controller` mode (`node` mode strips the namespace / application groups, so both sections MUST `return null`). `NamespaceLegend` is fed by the backend's `isNamespace` group nodes (tinted with `namespaceColor`) and `ApplicationLegend` by the backend's `isApplication` group nodes (tinted with `applicationColor`, derived from `applicationPalette`). The `storageclass` kind has been removed from the backend contract, so `NodeLegend`'s `Storage` category now consists of the three glyphs `pvc` / `netapp-aggr` / `netapp-node` (through the existing `categoryByKind` wiring); the already-removed `StorageClassLegend` (the `Storage Classes` swatch section) MUST stay gone, and no new swatch section may be added for ONTAP — `storage-cluster` is a plain accent group frame and needs no legend row. Every section title MUST be Title Case (`Node Kinds` / `Ingress Gateway` / `Edge Types` / `Status` / `Clusters` / `Namespaces` / `Applications` / `Nodes`|`Controllers`).

#### Scenario: The node legend lists only glyph-rendered kinds, grouped by category

- **WHEN** the panel receives data where pod / service / pvc / node are all drawn leaves (no nesting containers, nothing collapsed) and there are no workloads or switches
- **THEN** the node legend presents only pod / service / pvc / node as icon glyphs grouped by category (pod→Workloads, service→Networking, pvc→Storage, node→Cluster), absent kinds (deployment / switch, …) are not listed, and colour is not used to distinguish category
- **AND** (see the collapse-aware requirement) if `node` instead becomes an expanded container holding pods, `node` drops out of the node legend (appearing in the "Nodes" swatch section instead) and returns to the node legend as a glyph only once collapsed

#### Scenario: The edge legend lists only the present, non-omitted edge types

- **WHEN** the graph holds `pod-mounts-pvc` and `pod-calls-pod` edges but no `switch-to-switch`
- **THEN** the edge legend presents only `pod-mounts-pvc` / `pod-calls-pod` as `<from> → <to>` (arrow glyph centred), `switch-to-switch` / `node-to-switch` are not listed, and colours and line styles match the canvas rendering

#### Scenario: Service edges are omitted from the edge legend (they are pod-to-pod in nature)

- **WHEN** the graph holds `pod-calls-service` / `service-selects-pod` edges
- **THEN** neither type may appear in the edge legend (no row of its own and no extra merged row); they draw on the canvas in the same orange as `pod-calls-pod` and are represented in the legend by the `pod-calls-pod` row, rendered as `pod ↔ pod/service` (a bidirectional arrow glyph)

#### Scenario: The Ingress Gateway section sits between Node Kinds and Edge Types

- **WHEN** the graph holds a non-empty ingress-gateway node set and the legend renders
- **THEN** the section order MUST be `Node Kinds` → `Ingress Gateway` → `Edge Types`, with the Title Case title `Ingress Gateway`

#### Scenario: The section does not render when the graph holds no ingress node

- **WHEN** no node in the graph belongs to the ingress-gateway set
- **THEN** the legend MUST NOT render the `Ingress Gateway` section, and the remaining section order is unaffected (`Node Kinds` runs straight into `Edge Types`)

#### Scenario: The Applications swatch section lists the backend's application groups (mode-gated)

- **WHEN** in `controller` mode the graph holds backend `isApplication` group nodes
- **THEN** `ApplicationLegend` (titled `Applications`) lists a swatch per application name, coloured from `applicationColor` (the `applicationPalette` accent); switching to `node` mode strips the application groups and the section returns `null` (mode-gated exactly like the `Namespaces` section)

#### Scenario: The Controllers/Nodes swatch is the bottom-most legend section

- **WHEN** in `controller` mode the legend renders `Clusters`, `Namespaces`, `Applications`, and `Controllers`
- **THEN** the vertical order MUST be `Clusters` → `Namespaces` → `Applications` → `Controllers` (`Controllers` last)
- **WHEN** in `node` mode the legend renders `Clusters` and `Nodes` (no Namespaces / Applications)
- **THEN** the vertical order MUST be `Clusters` → `Nodes` (`Nodes` last)

#### Scenario: NetApp kinds appear as NodeLegend glyphs with no swatch section of their own

- **WHEN** the graph holds `netapp-aggr` / `netapp-node` nodes (the `storageclass` leaf this scenario originally described has been removed from the contract)
- **THEN** each appears as its own glyph in `NodeLegend`'s `Storage` category (alongside `pvc`); the legend MUST NOT render a `Storage Classes` swatch section and MUST NOT add a swatch section for `storage-cluster`

#### Scenario: Nothing renders when the set is empty

- **WHEN** the graph holds no nodes (or no drawn edges)
- **THEN** the node legend (or the edge legend) returns `null` and renders no empty title

### Requirement: The hover tooltip shows element metadata

The panel SHALL render a `HoverTooltip` component with **two modes**:

- **(1) Floating hover mode (the default, when no detail node is selected).** When the user hovers any node or edge, the tooltip MUST position itself near the hovered element (`position: absolute`, taking a node's rendered centre or the cursor's rendered position on an edge, plus a fixed offset), clamped and flipped within the cytoscape canvas wrapper's bounds (flipping to the element's left and clamping inside the wrapper when the offset would push it past the right or bottom edge, never overflowing the viewport). It is about 280px wide and applies `pointer-events: none` so it never blocks interaction with the graph beneath. **This mode's behaviour is exactly as before.**
- **(2) Pinned mode (when a detail-eligible node is left-click selected).** The tooltip **pins to the canvas's top-right corner** (`top: 8` / `right: 8` / `left: auto`, `maxHeight: calc(50% - 16px)`, `overflowY: auto`, `pointer-events: auto` so its content can scroll, `zIndex: 1000` to sit above cytoscape expand-collapse's transparent input layer at `z-index: 999`), showing the **selected node's** full tooltip content (title + promoted attrs + raw labels). That content is **identical to and derived from the same source as** hover mode (the same `buildNodeAttributes` and `toLabelRows`, with the promoted `kind` row shown too). While pinned, the **floating hover tooltip is fully suppressed** for both nodes and edges.

The selected node's data comes from the already-gated `resolveSelectedNode` (visible + not hidden by a collapsed ancestor + detail-eligible), so the decorative **`cluster` / `namespace`** groups (for which `resolveSelectedNode` returns `null`) do **not** pin and their hover behaviour is unchanged; **the `application` group is now detail-eligible** and **does** pin when selected (showing its synthetic `kind: application` and its name). The pinned card has **no close button**: deselecting (clicking the background or an edge, switching nodes, filtering by kind / edge, collapsing an ancestor, or a data refresh removing it) automatically clears the pin and restores hover mode. Styling MUST use `@grafana/ui` theme tokens (a semi-transparent `theme.colors.background.secondary` at opacity ≥ 0.85).

**Physical-storage nodes (`netapp-aggr` / `netapp-node`) MUST go through the ordinary node-tooltip path** — they carry their own `kind`, `labels.ontap_cluster` (and, on an aggregate, `labels.node`), and `health`, and `netapp-aggr` additionally carries `usage`; the tooltip (floating or pinned) shows those own fields directly, with no synthesis path. The removed `storageclass` kind takes its `provisioner` / `parameters` tooltip rows with it. **`health` and `usage` MUST be promoted attribute rows** (from the same source as `kind` / `namespace` / `ipAddress`, via `buildNodeAttributes`): `health` displays its string value verbatim, and `usage` MUST be formatted human-readably as `<used> / <capacity> (<pct>%)` (bytes abbreviated in decimal units, percentage rounded to an integer). When `usage` is absent the whole row is omitted and **MUST NOT** be shown as `0` or a placeholder. A PVC node carrying `storageclass` (the claim's StorageClass name) and `usage` MUST show one row for each through the same mechanism. Kind-less backend groups (`isNamespace` / `isApplication`) MUST derive a **synthetic `kind` row** from their flag (`isApplication` → `application`, `isNamespace` → `namespace`) — presentation only, and it MUST NOT write `kind` into `data` (the group stays kind-less and invisible to the kind filter and icon legend). The `cluster` group is skipped upstream in `useHoverElement` and shows no tooltip, so it does not apply.

**The tooltip's name title MUST use the bare `data.label` (falling back to `data.id`) and MUST NOT include the canvas compound's kind prefix** (`Cluster:` / `Namespace:` / `Release Unit:` / `Node:`). Those prefixes are rendered by the stylesheet on the canvas label only (see "Decorative compound groups use fixed per-kind colours and a kind-prefixed label" and "physical-network and k8s node compound headers"); the `data.label` normalize writes for a decorative group is the bare name, so the hover and pinned paths get the bare name straight from `data.label` with no stripping.

#### Scenario: Hovering a node shows its metadata (with nothing selected)

- **WHEN** no detail node is selected and the user hovers any node
- **THEN** `HoverTooltip` floats and shows the node's `name` (`data.label ?? data.id`), `kind`, `namespace`, `ipAddress` (`data.ipAddress` joined with commas, only when present and non-empty), `application` (the ArgoCD application; shown for any leaf carrying `data.application` — pod / service / pvc and an aggregated controller — while a decorative `application` group node MUST NOT show this row, to avoid duplicating its synthetic `kind`/`name`), and whichever allow-listed labels have values (`app`, `version`, `app.kubernetes.io/name`, `app.kubernetes.io/instance`); a missing field MUST NOT render its row (no blank placeholder)

#### Scenario: Hovering a NetApp leaf shows its own metadata (nothing selected)

- **WHEN** nothing is selected and the pointer moves onto a `netapp-aggr` leaf (nested under some `netapp-node`, carrying its own `kind: netapp-aggr`, `labels.ontap_cluster`, `labels.node`, `health: "online"`, and `usage: { usedBytes: 700000000000, capacityBytes: 1000000000000 }`; the storageclass leaf this scenario originally described has been removed from the contract)
- **THEN** the tooltip floats and shows its name (as the title), `kind: netapp-aggr`, `health: online`, the formatted `usage` (for example `700 GB / 1 TB (70%)`), and the two label rows `ontap_cluster` / `node`
- **AND** it MUST NOT show any `provisioner` / `parameters` row (those fields left the contract with storageclass)

#### Scenario: Hovering a kind-less group (namespace / application) shows a synthetic kind

- **WHEN** the user hovers a backend `namespace` or `application` group node (kind-less: no `data.kind`, only the `isNamespace` / `isApplication` flag)
- **THEN** `HoverTooltip` MUST derive and show a synthetic `kind` row from that flag (`isApplication` → `application`, `isNamespace` → `namespace`) so the hover is not reduced to a bare name; that row is presentation only and MUST NOT write `kind` into `data` (the group stays kind-less and invisible to the kind filter and icon legend). The `cluster` group is skipped upstream in `useHoverElement` and shows no tooltip, so it does not apply

#### Scenario: A decorative group's hover title is the bare name (no kind prefix)

- **WHEN** the user hovers a `namespace` group whose `data.label` is `shop`, or an `application` group whose `data.label` is `mongo` (rendered on the canvas as `Namespace: shop` / `Release Unit: mongo` respectively)
- **THEN** the tooltip title MUST be `shop` / `mongo` respectively and MUST NOT include the `Namespace:` / `Release Unit:` prefix
- **AND** the synthetic `kind` row still shows `namespace` / `application` respectively

#### Scenario: A pinned application group's title is the bare name

- **WHEN** the user left-click selects an `application` group whose `data.label` is `mongo` (detail-eligible, so the tooltip pins)
- **THEN** the pinned card's title MUST be `mongo` and MUST NOT be `Release Unit: mongo`

#### Scenario: Hovering an edge shows its metadata (with nothing selected)

- **WHEN** no detail node is selected and the user hovers any edge
- **THEN** `HoverTooltip` floats and shows `edgeType` and `source → target` (resolved through the two endpoint nodes' `label`, not their bare ids)

#### Scenario: The tooltip positions near the hovered element (hover mode)

- **WHEN** no detail node is selected and the user hovers a node
- **THEN** the tooltip positions from that node's rendered position plus a fixed offset (dynamic `left` / `top`) rather than fixed in a corner
- **AND** when the offset would push it past the canvas's right or bottom edge, it flips to the node's left and clamps within the wrapper's bounds

#### Scenario: The tooltip does not block graph interaction (hover mode)

- **WHEN** the floating hover tooltip is showing and the user clicks a node beneath the tooltip's DOM area
- **THEN** that node is selected (firing the existing `:selected` style and the `onSelect` callback) and the hover tooltip does not intercept the click (`pointer-events: none` is in effect)

#### Scenario: After hover ends, the floating tooltip fades out and leaves the DOM

- **WHEN** nothing is selected and the pointer leaves the hovered element without entering another
- **THEN** `HoverTooltip` fades out over an opacity transition (≥ 100ms, ≤ 200ms) and, once the animation ends, renders no DOM at all (leaving no empty box occupying space)

#### Scenario: A removed hovered element clears the floating tooltip

- **WHEN** an element is hovered (nothing selected) and a data refresh removes it from the cytoscape instance
- **THEN** `useHoverElement` clears the store on the `remove` event, `HoverTooltip` disappears immediately, and it never renders content referring to an element that no longer exists

#### Scenario: Hovering does not re-render GraphCanvas

- **WHEN** the user hovers several elements in sequence
- **THEN** the `HoverTooltip` component subscribed through `useSyncExternalStore` re-renders, while `GraphCanvas` and the cytoscape instance reference do not (verified through the React DevTools profiler: `GraphCanvas`'s render count does not increase)

#### Scenario: Left-click selecting a detail node pins the tooltip to the top-right

- **WHEN** the user left-click selects a detail-eligible node (a leaf including `netapp-aggr`, a k8s-node, a `netapp-node`, or a controller)
- **THEN** `HoverTooltip` enters pinned mode: in the canvas's top-right corner (`top:8` / `right:8`, `pointer-events:auto`, `zIndex:1000`, scrollable at `maxHeight: calc(50% - 16px)`) it pins **that node's** title + promoted attrs (including the `kind` row) + raw labels (`toLabelRows` filtering out the already-promoted `namespace`)
- **AND** the pinned content is identical to what hovering that node would show (same source)

#### Scenario: Pinning suppresses the floating hover

- **WHEN** a detail node is selected (the tooltip is pinned) and the user hovers another node or edge
- **THEN** the floating hover tooltip MUST NOT appear (pinned mode suppresses hover) and the top-right corner continues showing only the selected node's pinned card

#### Scenario: The pinned tooltip shows even when the cursor is over nothing

- **WHEN** a detail node is selected and the cursor hovers no element (`useHoverElement` returns `null`)
- **THEN** the pinned card MUST still show (pinned mode does not depend on a hovered element; it renders before hover's `hovered === null` early return)

#### Scenario: Deselecting clears the pin and restores hover

- **WHEN** the tooltip is pinned and the user deselects (clicking the background or an edge, switching to another node, filtering that node out by kind or edge, collapsing its ancestor, or a data refresh removing it)
- **THEN** `resolveSelectedNode` returns `null`, the pinned card disappears, and the tooltip returns to floating hover mode

#### Scenario: Selecting a NetApp node pins its health and usage

- **WHEN** the user left-click selects a `netapp-aggr` leaf or a `netapp-node` compound (the storageclass leaf this scenario originally described has been removed from the contract)
- **THEN** the tooltip pins showing its `kind` + `health` + (on a `netapp-aggr`) the formatted `usage`, along with its `ontap_cluster` / `node` labels; the bottom detail panel renders header-only, having no change-report or alerts section (see "Node detail panel")
- **AND** selecting a PVC carrying `storageclass` and `usage` pins one row each for `storageclass: <name>` and the formatted `usage`

### Requirement: Node detail panel

On a **left click** on a node, the panel SHALL open a detail panel as an overlay at the bottom of the canvas (without resizing the graph), its header showing the node's name, kind, and status. There are **two semantically different** ways to close it: (1) clicking the background or an edge (= deselecting) closes the panel and clears the selection with it; (2) pressing the **close button** MUST **close the panel only** (detail open → false) — the selection and everything derived from it (the cytoscape single-select highlight, the selection-focus fade, the pinned top-right tooltip) and the variable output MUST all persist. Switching to another node switches the panel to it. The cytoscape single-select blue highlight MUST track **selection**, not the panel's open state. After closing, **clicking that already-selected node again** MUST reopen the panel using the query timestamp captured at selection time (it MUST NOT re-issue the change-report queries — closing and reopening is a UI action, not a data action; the query timestamp's lifetime is bound to the selection, and a new timestamp is taken only when a **different** node is selected). The decorative **cluster** group is **not selectable** (see "Interaction and selection state": a tap behaves like a background click, with no selection ring and no collapse cue, and collapse is triggered by dbltap instead), while the decorative **namespace** group **is** selectable (showing the selection ring and collapse cue, see the same requirement) — `resolveSelectedNode` returns `null` for both, so neither may open this detail panel or pin the tooltip. **The `application` group is the exception**: it is now detail-eligible (kind-less, resolved with a synthetic `kind: application`), so selecting it **opens the panel** rendering that ArgoCD application's Application config_changes section (see "Node-detail Application and Containers sections") and **pins the tooltip**, while still surfacing its collapse cue.

Besides the node's name / kind / status, when that node (any detail-eligible node: **a leaf including `netapp-aggr`, a k8s-node, a `netapp-node`, or a controller**; **only the decorative cluster / storage-cluster / namespace / application are excluded**) has a `/dashboard` query returning a usable URL, the header MUST show a **Dashboard button** beside the name; the query's timing, parameter assembly, 200-gated availability, and new-tab open behaviour are covered by the `node-dashboard-url` capability.

The panel body is always gated on **whether the data exists**, in this order: (1) the **Application change-report section**, shown for any node carrying `data.application` (**including `service` / `pvc`** — see the "Node-detail Application and Containers sections" requirement); the **Containers change-report section**, shown only for a workload kind carrying `data.containers`; (2) the **Alerts section** (`node-detail-section-alerts`), rendering the alert table when the node carries a non-empty `data.alerts` and **rendering nothing at all when there are no alerts**. **The panel no longer has an always-visible Properties section** — a node's promoted attributes (the synthetic kind, `namespace`, `application`, `ipAddress`, `storageclass`, `health`, and the formatted `usage`) are presented by the **pinned top-right tooltip** instead (see "The hover tooltip shows element metadata", pinned mode, sharing hover's source); the pinned card MUST sit **below the search bar** (search above, attribute card below — see `graph-search`).

**The panel ALWAYS renders** when a detail-eligible node is left-click selected **and the panel was not closed with the close button** (that is, a selection exists and detail open is true): the **header** (node name + kind / status badge + close button, plus the Dashboard button when the `/dashboard` query is `ready` with non-empty `urls`) is the minimum rendering, and each body section (Application / Containers / Alerts) is gated on its own data. A node with no body content at all (such as `netapp-aggr` / `netapp-node`, or a `service` / `pvc` with no `application`) **still renders a header-only panel** when left-click selected; its promoted attributes are carried by the pinned top-right tooltip and are not duplicated in the panel. The pinned card itself carries **no** Dashboard button, so the header is the sole dashboard entry point — and because the header always renders, that entry point is always reachable. **graph-search's locate MUST establish a selection and open the panel for a detail-eligible node** (detail open → true, equivalent to a canvas left click — see the `graph-search` capability), with the pinned tooltip appearing below the search bar as usual.

The panel's height MUST grow with its content and scroll only past a ceiling of `50%` of the canvas height (with the header pinned); content shorter than that ceiling MUST NOT scroll. **Scrolling MUST be concentrated in a single container (the panel body, `node-detail-scroll`): the body is the sole scroll authority (`overflowY: auto`), every section is content-height (`flex: 0 0 auto`), and no section may own an internal scroll.** The panel can stack several sections at once (Application + Containers + Alerts), and if any section carried its own internal scroll, several fill sections would overlap under a constrained height and none of them would scroll — so single-body-scroll is the only composable model.

Alert data comes from the optional `alerts: NodeAlert[]` field on the upstream graph JSON node (`normalizeGraph` carries it to `data.alerts`; absent or an empty array → the section does not render). Each `NodeAlert` represents repeated occurrences through `timeRecords: number[]` (Unix seconds, ascending); the backend already groups one alert into a **single** entry, so the alert table shows **one row per alert**. The **Count** column MUST show `timeRecords.length` and MUST list every occurrence time (formatted by `timeZone`) through a `@grafana/ui` `Tooltip`. The **Last occurred** column MUST show `max(timeRecords)` (formatted) and MUST be clickable: clicking it rewinds the dashboard time range by calling `onChangeTimeRange({ from: (t-300)*1000, to: (t+300)*1000 })`, centred on `t = max(timeRecords)` (Unix seconds) with a fixed ±5 minutes (300 seconds). `severity` is a free string: `info` / `warning` / `critical` take their `SEVERITY_COLOR`, and any other custom label MUST be preserved verbatim and coloured with `FALLBACK_SEVERITY_COLOR` (the critical colour). **A missing Pod / Service cell in the alert table MUST show a muted "n/a"** (the unified missing-value placeholder `MISSING_VALUE_PLACEHOLDER` — see "Node-detail Application and Containers sections").

#### Scenario: Left-clicking any detail-eligible node opens the panel

- **WHEN** the user **left-clicks** any non-decorative, detail-eligible node
- **THEN** the bottom overlay renders the header (node label, kind badge, status badge, close button) above the graph without changing the graph's size, and any body section with data appears with it
- **AND** that node's selection highlight tracks the selection, and its attributes pin simultaneously in the top-right tooltip

#### Scenario: Clicking outside or pressing close

- **WHEN** the user clicks the graph background or an edge
- **THEN** the detail panel closes and the selection clears (the selection highlight, the focus fade, and the pinned top-right tooltip all disappear, and the variable output empties)
- **WHEN** the panel is open and the user presses the close button
- **THEN** the detail panel closes but the selection persists — the selection highlight, the selection-focus fade, and the pinned top-right tooltip stay visible, and the selected-pod-export variable value is unchanged

#### Scenario: Reopening after close does not re-issue queries

- **WHEN** the user closed the panel with the close button and then left-clicks that (still-selected) node again
- **THEN** the panel reopens with the same content as before the close, and the change-report queries reuse the original selection timestamp and MUST NOT be re-issued

#### Scenario: Switching nodes

- **WHEN** the panel is open and the user clicks another node
- **THEN** the panel switches to the newly clicked node (the pinned tooltip switches with it) and the queries are issued with the timestamp taken at that new selection

#### Scenario: A bare node still renders a header-only panel

- **WHEN** the user left-click selects a detail-eligible node with no application, containers, or alerts and no ready dashboard URL (such as `netapp-aggr` / `netapp-node`, or a `service` / `pvc` with no `application`)
- **THEN** `NodeDetailPanel` **still renders**, holding only the header (node name + kind / status badge + close button) and no body section at all
- **AND** that node's promoted attributes are carried by the pinned top-right tooltip and are not duplicated in the panel

#### Scenario: The header shows the Dashboard button when the backend supplies a URL

- **WHEN** the `/dashboard` query for the left-click selected node returns ready with a non-empty url (whether or not there is any body content)
- **THEN** the header shows the Dashboard button beside the node name; with no body content at all this is a header-only panel
- **AND** the Dashboard button is reachable (it exists only in the header, never in the pinned card)

#### Scenario: The Dashboard button appears beside the name

- **WHEN** a detail-eligible node's panel opens (because it carries change-report / alerts data, or header-only because it merely has a ready dashboard) and its `/dashboard` query returns 200 with a non-empty url
- **THEN** the header shows the Dashboard button beside the node name
- **AND** the decorative cluster / storage-cluster / namespace / application groups have no such button, because `resolveSelectedNode` returns null for them and they open no panel; a detail-eligible leaf such as `netapp-aggr` with a dashboard URL shows the button in a header-only panel

#### Scenario: The alert table renders grouped, one row per alert

- **WHEN** the selected node carries a non-empty `data.alerts` (one or several)
- **THEN** the Alerts section shows the alerts row by row in an `InteractiveTable`, **one row per alert**, with the columns Pod / Service / Alert / Severity / Count / Last occurred

#### Scenario: A missing alert Pod / Service shows n/a

- **WHEN** an alert row's Pod or Service is missing
- **THEN** that cell shows a muted "n/a" (`MISSING_VALUE_PLACEHOLDER`)

#### Scenario: The Count badge and its occurrence-time tooltip

- **WHEN** an alert's `timeRecords` holds N occurrence times
- **THEN** that row's Count column shows `N` (= `timeRecords.length`)
- **AND** hovering Count lists all N occurrence times in a `@grafana/ui` `Tooltip` (formatted by `timeZone`)

#### Scenario: Severity colouring (a free string plus SEVERITY_COLOR)

- **WHEN** an alert's `severity` is `info` / `warning` / `critical`
- **THEN** that row's Severity renders as a badge in the corresponding `SEVERITY_COLOR`
- **WHEN** `severity` is not in `SEVERITY_COLOR` (a custom label such as `fatal`)
- **THEN** it renders in `FALLBACK_SEVERITY_COLOR` (the critical colour) with the badge preserving that label's text verbatim, and nothing errors

#### Scenario: Clicking Last occurred rewinds the time range

- **WHEN** the user clicks a row's Last occurred column and that alert's largest `timeRecords` value is `t` (Unix seconds)
- **THEN** the panel calls `onChangeTimeRange({ from: (t-300)*1000, to: (t+300)*1000 })` (±5 minutes, in milliseconds)
- **AND** the dashboard time range rewinds to that window, centred on the last occurrence

#### Scenario: Several sections share one body scroll and never overlap

- **WHEN** the panel renders several tall sections at once (say a pod with an application, many containers, and many alerts, where both the Containers and Alerts sections exceed the ceiling)
- **THEN** the panel body (`node-detail-scroll`) is the sole scroll container (`overflowY: auto`), every section is `flex-grow: 0` (content-height), and their table slots MUST NOT carry their own `overflowY: auto`
- **AND** the sections stack vertically and MUST NOT overlap; past the ceiling the body scrolls the whole stack (with the header pinned), and below the ceiling nothing scrolls

#### Scenario: With no alerts, the Alerts section renders nothing

- **WHEN** the selected node has no `alerts` field, or it is an empty array
- **THEN** the Alerts section (`node-detail-section-alerts`) MUST NOT render (no table, and not the old "No alerts" message either); the other data-bearing sections render as usual, and with no other body section the panel still renders header-only

### Requirement: A collapsed container (controller / k8s node) borders in its worst child status

When a **container is collapsed** (a controller or a k8s `node`), its rectangular border MUST take the `STATUS_COLOR` of **the worst status it hides by collapsing** (`normal` green `#73BF69` / `warning` yellow / `critical` red) — **including `normal`**: a container whose contents are all healthy MUST draw a `normal` green border when collapsed (explicit good news, rather than a neutral borderless box). The data comes from `data.worstStatus`, which normalize aggregates onto that node (see graph-data-integration: for a controller it is the worst status among its child pods (`pod.parent === controllerId`) and is **always written**; for a k8s node it is the worst of its own status and **its pods'** status, worst-wins — in the `controller` view pods no longer nest under the node, so a node's pods are identified as **the pods reachable through a `pod-to-node` edge** (D8), while in the `node` view, where pods nest under the node again, the child-based identification is used. It is **written whenever there is status information** — a node with no status of its own and no pods at all, reachable or nested, has no such field and keeps a neutral border when collapsed, because "no information" must not masquerade as normal). The stylesheet MUST implement this with the `node[worstStatus="<status>"].cy-expand-collapse-collapsed-node` selector, declared **after** `statusSelectors` (the data-driven `node[status="<s>"]` — **any node carrying `status`** draws its own status border, rather than a pod/node/pvc allow-list; normalize writes that field only when the backend actually supplies a status, so service / external / cluster / netapp-aggr / netapp-node and others without one keep a neutral border. NetApp's `health` is a separate field and MUST NOT be mapped onto the status border colour — colour is reserved for the K8s status scale), so that a **collapsed k8s node**'s worst child status can override its own status border. A controller has no status border of its own, so this is its only colouring. `node:selected` is expressed as an outline/underlay and therefore does not affect this border colour. An **expanded** container does not match this selector (a controller keeps the neutral `:parent` container border and a k8s node keeps its own status border). This uses **status**, not alert severity: `info` exists only on alerts and is not on the status scale, so a collapsed border is never `info` (`SEVERITY_COLOR` still serves only the detail panel's alert table).

#### Scenario: A collapsed controller shows its worst child pod status

- **WHEN** a controller has a pod with `status: critical` beneath it and the user **collapses** that controller
- **THEN** the collapsed controller's rectangular border is coloured `STATUS_COLOR.critical` (red)
- **WHEN** that same controller is **expanded**
- **THEN** the border returns to the neutral `:parent` container colour

#### Scenario: A k8s node's worstStatus is computed through pod-to-node edges

- **WHEN** in the `controller` view a k8s `node` has `status: normal` of its own and a pod with `status: critical` points at it through a `pod-to-node` edge (that pod nesting under its controller, not the node)
- **THEN** normalize writes `data.worstStatus` as `critical` (taking the worst among the pods reachable through `pod-to-node` edges); in the `node` view, where pods nest under the node again, the child-based identification yields the same result

#### Scenario: A collapsed k8s node's worst child status overrides its own status border

- **WHEN** a k8s `node` has `status: normal` of its own and a pod with `status: critical` beneath it (identified through a `pod-to-node` edge or through nesting), and the user **collapses** that node
- **THEN** the collapsed node's rectangular border is coloured `STATUS_COLOR.critical` (red), overriding its own normal green
- **WHEN** that same node is **expanded**
- **THEN** the border returns to its own status (`normal` green) and each child pod shows its own status border

#### Scenario: An all-normal container draws a normal green border when collapsed

- **WHEN** the worst status a container (a controller or a k8s node) hides by collapsing is `normal` (every child normal, a missing status counting as normal)
- **THEN** the collapsed container's rectangular border is coloured `STATUS_COLOR.normal` (green) — always for a controller, and for a k8s node whenever it or at least one of its pods carries status information

#### Scenario: A k8s node with no status information keeps a neutral border when collapsed

- **WHEN** a k8s `node` has no `status` of its own and no pods at all, reachable or nested
- **THEN** that node has no `data.worstStatus` and keeps a neutral container border when collapsed ("no information" is not "normal")

### Requirement: Collapse-aware node-kinds legend (listing only what is drawn as a glyph)

The kind set for the "Node Kinds" icon legend MUST be derived by the pure function `deriveLegendKinds(elements, collapsedIds)`, listing only the kinds **currently drawn as a glyph on the canvas** rather than simply the kinds that appear in the data. The rule, for each non-cluster node carrying a `kind`: a node hidden by a collapsed ancestor is **not** counted; an **expanded** container (whose id is someone's `parent` and which is not itself collapsed) is **not** counted (it is presented in the Clusters / Nodes|Controllers swatch section instead); everything else (a drawn leaf or a **collapsed** container) counts its kind. `cluster` (having no kind) is never counted. This rule replaces the former `presentKinds` + `deriveContainers.showNodeKindIcon`, making the node and controller containers consistent. `netapp-aggr` is a leaf beneath `netapp-node` and always counts through its glyph (a drawn leaf); `netapp-node` **is** a real compound container, so the same rule applies to it as to `node` / `controller` — not counted when expanded (it is a frame on the canvas) and counted through its glyph when collapsed. The removed `storageclass` kind has no corresponding rule any more.

#### Scenario: A NetApp aggregate always counts as a leaf glyph in Node Kinds

- **WHEN** the graph holds a `netapp-aggr` leaf (its parent `netapp-node` expanded) alongside a pvc leaf (the storageclass leaf this scenario originally described has been removed from the contract)
- **THEN** the Node Kinds legend's `Storage` category lists both the `pvc` and the `netapp-aggr` glyph; the expanded `netapp-node` is **not** counted (it is a frame on the canvas) and returns to the Node Kinds legend as a `netapp-node` glyph only once collapsed

#### Scenario: Collapsing a container drops its child kinds and adds the container kind (node / controller alike)

- **WHEN** a K8s `node` (or controller) container is collapsed and every pod beneath it is aggregated away
- **THEN** `pod` leaves the Node Kinds legend and `node` (or the corresponding controller kind) enters it through its glyph; an expanded container does not appear in Node Kinds at all (only in its swatch section)

#### Scenario: Collapsing the virtual network compound replaces switch with network in Node Kinds

- **WHEN** the virtual `network` compound wrapping the switch fabric (see the switch-tier-layout spec) is collapsed
- **THEN** the `switch` beneath it leaves the Node Kinds legend for being hidden by a collapsed ancestor, and the collapsed `network` enters through its wifi glyph (the NETWORKING category changing from `switch` to `network`, labelled `physical network`); expanding restores `switch`

### Requirement: Node-detail Application and Containers sections

The panel SHALL provide, in the node-detail panel, an **Application section** and a **Containers section** backed by change-report queries, reusing the existing panel position and layout (the same sticky-section styling as the Alerts section). The **Application section** shows for **any node carrying `data.application`** — a pod or workload controller (`kind ∈ { pod, deployment, statefulset, daemonset, job, cronjob }`), a `service` / `pvc` leaf belonging to some ArgoCD application, **and the ArgoCD `application` group node itself** (kind-less, resolved with a synthetic `kind: application`) — and its `config_changes` (Deployment Changes) query is issued with that node's own identity (`service` / `pvc` use their own kind/name; an `application` group uses `{ kind: 'application', name: <app> }`). The **Containers section** MUST show **only for a pod or workload controller** carrying `data.containers`; `service` / `pvc` / `application` groups / `node` / `external` and the like have no containers, and the Containers section never renders for them. A service's or PVC's application name **also** appears as a promoted attr in the pinned top-right tooltip (see "The hover tooltip shows element metadata"); the two are complementary — the tooltip shows the name and the Application section supplies the config_changes link.

The panel body is gated purely on **whether each section's data exists**: the **Application section** on the presence of `data.application` (any node carrying an application, `service` / `pvc` included); the **Containers section** on **a workload kind plus a non-empty `data.containers`**. Both coexist with the (data-gated) Alerts section in the same **left-click** panel. The panel **no longer has an always-visible Properties section** (promoted attributes are carried by the pinned tooltip — see "Node detail panel") and the header **always renders** (the panel ALWAYS renders — see "Node detail panel").

**Data sources.** The application name comes from the node's `data.application` (the backend emits it on pod nodes; a controller's is aggregated from its child pods by `normalizeGraph`); containers come from the node's `data.containers` (`Array<{ name, image }>`). With no `data.application` the Application section MUST NOT render; with no `data.containers` (or an empty array) the Containers section MUST NOT render; neither affects the other.

**Trigger.** A **left click** (cytoscape `tap`) on a pod/controller node MUST (a) select that node (reusing the existing single-select controlled state, in sync with the blue highlight and the panel's open state, so the panel opens with it), and (b) **establish** the input that node's two URL queries need (application-detail and image-detail): application name, controller kind, controller name, and time — time being the moment of the left-click selection, in Unix seconds — and **eagerly prefetch both queries concurrently** from that input. `config_changes` (application) and `code_changes` (containers) MUST both be issued **without any further click** the moment the panel opens from a left-click selection of a workload node (that is, whenever `enabled` is true because both the input and the endpoint resolve). **A right click (`cxttap`) no longer opens the detail panel, no longer establishes query input, and no longer issues any query** (the old right-click detail trigger and its native context-menu suppression are both removed). **A `service` / `pvc` belonging to an ArgoCD application** (carrying `data.application`) also establishes query input when left-click selected — with `kind` / `name` taken from **that node itself** — and prefetches `config_changes` (driving its Application section); its `code_changes` is issued too by the shared prefetch, but a service or PVC has no containers so the result goes unused (the Containers section does not render). **A non-workload node with no `data.application` (and therefore no `queryTarget`) MUST NOT establish query input and MUST NOT issue any query** when left-click selected (its attributes are carried by the pinned tooltip, and Alerts show if the data is there).

**Query contract.** The two queries MUST share one set of inputs: the ArgoCD application name, the pod-controller kind, the pod-controller name, and time. A pod node's controller kind/name come from its owner (`data.owner`); a controller node uses its own kind/name; a standalone pod with no owner passes its own kind (`pod`) and name. The responses are:

- **The application-detail query** (`GET <base>/config_changes`) returns `{ "url": string, "current_time": string, "previous_time": string }` — `url` being that ArgoCD application's external detail page, and `current_time` / `previous_time` the two timestamps of that deployment diff.
- **The image-detail query** (`GET <base>/code_changes`) returns `{ [containerName]: { "url": string, "current_time": string, "previous_time": string, "result_type": string } }` — a map from container name to entry. The input MUST NOT carry an image parameter; one call covers every container on that node.
- **The timestamp contract**: `current_time` / `previous_time` MUST be **RFC 3339 / ISO 8601 (UTC)** strings. Both are **best-effort**: when one is missing, is not a string, or fails to parse, its time column MUST show a muted (`theme.colors.text.secondary`) "n/a" (`MISSING_VALUE_PLACEHOLDER`) and MUST NOT affect that row's `url` anchor, its other columns, or any other row.
- **The change-type contract (`result_type`, `code_changes` only)**: each container entry MAY carry a `result_type` string, whose known enum values are **`UNCHANGED` / `UPDATED` / `REPLACED` / `ADDED` / `REMOVED` / `RENAMED`** (uppercase). `result_type` is **best-effort**: when missing, not a string, or an empty string, that row's Change Type column MUST show a muted (`theme.colors.text.secondary`) "n/a" (`MISSING_VALUE_PLACEHOLDER`); an **unknown value** (anything outside those six) MUST render verbatim (visible-by-default) in a neutral grey fallback colour. `config_changes` (application) carries **no** `result_type`, and the Application section MUST NOT have a Change Type column.

**A single source for the missing-value placeholder.** Every "row present, cell missing" placeholder in the panel (a change time, a Change Type, an alert's Pod/Service) MUST come from the single constant `MISSING_VALUE_PLACEHOLDER = 'n/a'`, rendered muted (replacing the previously scattered hard-coded em-dash "—").

**Call caching.** While the panel is open, `code_changes` and `config_changes` MUST each be called **at most once** — the eager prefetch issues one of each when the panel opens, and the whole map `code_changes` returns is **shared** by every container row. Only **successful** responses are cached; a failure MUST NOT be cached. **Switching nodes, switching endpoints, or closing the panel (unmount / clearing the selection) MUST clear the cache** (and abort anything in flight).

**Query transport.** Queries MUST go through the Grafana runtime (`@grafana/runtime`'s `getBackendSrv()`) to **the same graph API backend**, and `src/**` MUST NOT connect to an external backend directly through `fetch` / `axios` / `XMLHttpRequest`. The query endpoint (base path) MUST resolve in this order: (1) a non-empty panel option takes precedence (an override); (2) otherwise it SHALL be derived automatically from the panel's query request (`data.request.targets`) as a **sibling** of the graph query (taking the first target whose non-empty proxied base path resolves through the Grafana runtime datasource instance settings, appending the directory of the graph query path, then appending `/config_changes` and `/code_changes`); (3) with neither available, both sections render from their data but their link columns MUST show a "Not found" hint (`enabled` is false → no query is issued) and no query may be issued. The prefetch queries MUST be abortable and MUST NOT setState after unmount.

**Presentation** (each link-column target holds its own independent state, one of three: **loading / ready / unavailable**):

- **loading**: the queries fire concurrently the moment the panel opens; until they return, every unresolved target MUST show a `Spinner` plus hint text in its row's link column, and no anchor may appear there.
- **ready**: when `config_changes` / `code_changes` returns 200 with a valid `url`, the link column MUST render a real anchor `<a href={url} target="_blank" rel="noopener noreferrer">` (a pre-resolved URL — never `window.open`).
- **unavailable**: on failure, no result, or no URL, the link column MUST show a "Not found" hint in secondary (muted) text (truncated if long, with the full failure message in `title`).
- **Failure isolation**: one unavailable target MUST NOT affect the header, the other section, or any other row in the same section.
- **Time columns (Current / Previous)**: both sections gain a **Current Change Time** and a **Previous Change Time** column, formatting the raw RFC 3339 string into a localised absolute time through `@grafana/data`'s `dateTimeFormat` using the panel's `timeZone`, with the full ISO string in `title`. With no value or an invalid date the cell shows a muted "n/a" (`MISSING_VALUE_PLACEHOLDER`), MUST NOT set `title`, and MUST NOT show `Invalid date`.
- **The Change Type column (Containers only)**: the Containers section's **Change Type** column presents `result_type` as coloured text from a single-source colour mapping (`colorByResultType.ts`) — `ADDED`=green / `REMOVED`=red / `UPDATED`=blue / `REPLACED`=orange / `RENAMED`=violet / `UNCHANGED`=grey. An unknown value renders verbatim in neutral grey; missing, non-string, or empty shows a muted "n/a". The colour lookup is case-insensitive and the display is always uppercase. The Application section MUST NOT have this column.
- **Alignment**: link-column content MUST be pinned to that column's right edge (`disableGrow` + `justifyContent: flex-end`) so both sections' link columns line up vertically without drifting horizontally.
- **Table layout**: both sections MUST render as an `InteractiveTable` with column headers — Application's columns in the order **Name / Current Change Time / Previous Change Time / Deployment Changes**, and Containers' in the order **Name / Image / Change Type / Current Change Time / Previous Change Time / Code Changes**. The link column stays rightmost (`disableGrow`), `Change Type` / `Current` / `Previous` are `disableGrow` too, and Name / Image fill the remaining width.
- Both sections MUST be implemented with `@grafana/ui` plus emotion's `useStyles2`, and their components (ApplicationTable / ContainerTable) MUST be co-located in the `node-detail` feature and exported through its `index.ts` barrel.

#### Scenario: Left-clicking a pod/controller selects it and immediately prefetches both queries concurrently

- **WHEN** the user **left-clicks** a pod (or controller) node carrying `data.application`, with a resolvable endpoint (`enabled`)
- **THEN** that node is selected (the blue highlight and the panel opening in sync) and the system establishes the input both queries need (application name, controller kind, controller name, time)
- **AND** the system MUST issue the application-detail (`config_changes`) and image-detail (`code_changes`) queries **concurrently** through `getBackendSrv()` **with no further click required**

#### Scenario: A right click no longer opens the detail panel or queries

- **WHEN** the user **right-clicks** (`cxttap`) a pod/controller node
- **THEN** the system MUST NOT open the detail panel, MUST NOT establish query input, and MUST NOT issue any change-report query (the right-click detail trigger has been removed)

#### Scenario: A pod's controller kind/name come from its owner

- **WHEN** the left-clicked node is a pod whose `data.owner` is `{ kind: "deployment", name: "gateway" }`
- **THEN** the controller kind/name in that node's prefetch input are `deployment` / `gateway`

#### Scenario: A controller node queries with its own kind/name

- **WHEN** the left-clicked node is a controller (say `statefulset` `mongo`)
- **THEN** the controller kind/name in that node's prefetch input are `statefulset` / `mongo`

#### Scenario: The sections show only for pods and controllers

- **WHEN** the node the user **left-click** selects has `kind` of `pod` or a controller kind and carries the corresponding data (`data.application` / a non-empty `data.containers`)
- **THEN** the panel renders the change-report Application section and Containers section

#### Scenario: Containers is workload-only; a service/pvc with an application shows Application

- **WHEN** the selected node's `kind` is `service` / `pvc` and it carries `data.application`
- **THEN** the **Application section** (`node-detail-section-application`) renders and prefetches `config_changes` (with that node's own kind/name), and the **Containers section** (`node-detail-section-containers`) MUST NOT render (a service or PVC has no containers, even if the data happens to carry `containers`)
- **WHEN** the selected node's `kind` is `node` / `external` / `switch` / `cluster` / `netapp-aggr` / `netapp-node`, or it is a `service` / `pvc` with no `data.application`
- **THEN** neither the Application nor the Containers section may render

#### Scenario: With no application, only the Application section hides

- **WHEN** the **left-click** selected pod/controller node has no `data.application` but carries a non-empty `data.containers`
- **THEN** the Application section MUST NOT render and the Containers section renders as usual, prefetching `code_changes`

#### Scenario: With no containers, only the Containers section hides

- **WHEN** the **left-click** selected pod/controller node carries `data.application` but no `data.containers` (or an empty array)
- **THEN** the Containers section MUST NOT render and the Application section renders as usual, prefetching `config_changes`

#### Scenario: An in-flight prefetch shows a loading spinner

- **WHEN** a left click opens the panel with a resolvable endpoint and the prefetch queries have not returned
- **THEN** every row's link column in both the Application and Containers sections shows a `Spinner` plus hint text, and no anchor appears there

#### Scenario: A successful Application prefetch renders an anchor

- **WHEN** the application-detail (`config_changes`) query returns a valid URL `u`
- **THEN** the Application section's link column (headed "Deployment Changes") renders `<a href="u" target="_blank" rel="noopener noreferrer">`, which opens `u` in a new tab on an ordinary user gesture (never `window.open`)

#### Scenario: A successful Container prefetch renders an anchor for each row with a URL

- **WHEN** the node's `data.containers` holds `{ name: "app", image: "repo/app:1.2" }` and image-detail (`code_changes`) returns `{ "app": { "url": "https://x/app" } }`
- **THEN** the `app` row's link column (headed "Code Changes") renders `<a href="https://x/app" target="_blank" rel="noopener noreferrer">`

#### Scenario: The Application section renders as a table with headers

- **WHEN** a left-click-opened panel renders the Application section (the node carrying `data.application`)
- **THEN** the section presents, through an `InteractiveTable`, the column headers **Name** / **Current Change Time** / **Previous Change Time** / **Deployment Changes** in that order

#### Scenario: The Containers section renders as a table with headers and stays column-aligned

- **WHEN** a left-click-opened panel renders the Containers section (the node carrying two or more containers with names of differing length)
- **THEN** the section presents, through an `InteractiveTable`, the column headers **Name** / **Image** / **Change Type** / **Current Change Time** / **Previous Change Time** / **Code Changes** in that order, column-aligned (the column boundaries do not drift with name length)

#### Scenario: The link column headers are named correctly

- **WHEN** the panel renders both the Application and Containers sections
- **THEN** the Application section's link column header is "Deployment Changes" and the Containers section's is "Code Changes" (neither may show "Change Report")

#### Scenario: With two timestamps, Application shows localised absolute times

- **WHEN** the application-detail (`config_changes`) query returns `{ "url": "u", "current_time": "2026-06-16T10:30:00Z", "previous_time": "2026-06-10T08:00:00Z" }`
- **THEN** the Application row's Current / Previous columns show localised absolute times formatted by the panel's `timeZone`, each with the full ISO string in `title`, and that row's link column still renders the anchor for `u`

#### Scenario: A code_changes container entry with two timestamps shows them on its row

- **WHEN** image-detail (`code_changes`) returns `{ "app": { "url": "https://x/app", "current_time": "2026-06-16T10:30:00Z", "previous_time": "2026-06-10T08:00:00Z" } }` and the node's `data.containers` holds `{ name: "app", image: "repo/app:1.2" }`
- **THEN** the `app` row's Current / Previous columns show those two timestamps as localised absolute times, each with the full ISO string in `title`, and that row's link column renders the anchor for `https://x/app`

#### Scenario: A code_changes entry with a result_type shows a coloured change type

- **WHEN** image-detail (`code_changes`) returns `{ "app": { "url": "https://x/app", "result_type": "UPDATED" } }` and the node's `data.containers` holds `{ name: "app", image: "repo/app:1.2" }`
- **THEN** the `app` row's Change Type column shows `UPDATED` in that known enum value's semantic colour (blue), and that row's link column still renders its anchor

#### Scenario: An unknown result_type renders verbatim in neutral grey

- **WHEN** a container's `code_changes` entry has a `result_type` outside the enum (say `"MIGRATED"`)
- **THEN** that row's Change Type column shows `MIGRATED` verbatim (it MUST NOT be silently dropped), rendered in the neutral grey fallback colour

#### Scenario: A missing / non-string / empty result_type degrades Change Type to a muted "n/a"

- **WHEN** a container's `code_changes` entry returns a valid `url` but its `result_type` is missing, is not a string, or is an empty string
- **THEN** that row's Change Type column shows a muted (`theme.colors.text.secondary`) "n/a" (`MISSING_VALUE_PLACEHOLDER`), and that row's url anchor, time columns, other columns, and every other row MUST NOT be affected

#### Scenario: The Application section has no Change Type column

- **WHEN** the panel renders the Application section
- **THEN** the Application section's columns are Name / Current Change Time / Previous Change Time / Deployment Changes in that order, and it MUST NOT hold a Change Type column

#### Scenario: A missing or non-RFC-3339 timestamp degrades its column to a muted "n/a"

- **WHEN** `config_changes` (or some container's `code_changes` entry) returns a valid `url` but its `current_time` is missing, is not a string, or is not an RFC 3339 string (say `"not-a-date"`), while `previous_time` is fine
- **THEN** that target's Current column shows a muted (`theme.colors.text.secondary`) "n/a" (`MISSING_VALUE_PLACEHOLDER`) with no `title`, its Previous column shows the localised absolute time as usual, and that row's url anchor, other columns, and every other row MUST NOT be affected (`Invalid date` MUST NOT appear)

#### Scenario: While open, code_changes is called once and every container shares the result

- **WHEN** the panel is open, the `code_changes` prefetch has completed, and there are several container rows
- **THEN** the system issues **one** call to `code_changes` and every container row takes its value from that one returned map
- **AND** closing the panel or switching nodes MUST clear the cache, so the next open calls it once again

#### Scenario: A failed query is not cached (a remount refetches)

- **WHEN** a `code_changes` (or `config_changes`) call fails and the panel later remounts for the same node
- **THEN** the system issues that query again (the failure was not cached)

#### Scenario: Link columns align across sections and across states

- **WHEN** the panel shows both the Application and Containers sections with some targets loading, some ready, and some unavailable (a mixed state)
- **THEN** every row's link-column content in both sections is pinned to the column's right edge and lines up vertically

#### Scenario: A container key missing from the map shows "Not found"

- **WHEN** `code_changes` succeeds but a container name is absent from the returned map (or that name has no valid URL)
- **THEN** that row's link column shows the "Not found" hint (no anchor) while its name and image still show as usual

#### Scenario: A failed query shows "Not found" without affecting the rest

- **WHEN** the `config_changes` (or `code_changes`) query fails
- **THEN** the corresponding target's link column shows the "Not found" hint in the secondary colour (no anchor; truncated if long, with the full failure message in `title`)
- **AND** the panel header and the other section / rows still show normally

#### Scenario: The endpoint is derived from the panel datasource (prefetching the sibling segment)

- **WHEN** no query endpoint is set in the panel options, the panel's query target carries a datasource ref (`access: proxy`) with a graph query path of `/api/v1/graph/service_graph`, and the user left-clicks open a workload node's panel
- **THEN** the prefetch queries go to the sibling segments in the same directory as the graph query (`…/api/v1/graph/config_changes` and `…/api/v1/graph/code_changes`)

#### Scenario: A panel option overrides the automatic derivation

- **WHEN** the panel option sets the endpoint to `/foo` and the user left-clicks open a workload node's panel
- **THEN** the prefetch queries go to `/foo/config_changes` and `/foo/code_changes` (the option takes precedence)

#### Scenario: With no endpoint set and none derivable, nothing is queried and "Not found" shows

- **WHEN** no query endpoint is set in the panel options and no datasource proxy path can be derived from the query targets
- **THEN** in the left-click-opened panel both sections render from their data, their link columns show the "Not found" hint (`enabled` is false), and no query may be issued

#### Scenario: A left-clicked service/pvc with an application prefetches config_changes

- **WHEN** the user left-click selects a `service` or `pvc` carrying `data.application`, with a resolvable endpoint
- **THEN** the system establishes query input from **that node's own kind/name** plus the application and prefetches `config_changes` (driving the Application section's Deployment Changes link)
- **AND** the Containers section does not render (there are no containers; the `code_changes` result goes unused)

#### Scenario: Selecting an application group prefetches its config_changes

- **WHEN** the user left-click selects an ArgoCD `application` group node (kind-less, carrying `application`), with a resolvable endpoint
- **THEN** the system establishes the query input `{ application: <app>, kind: 'application', name: <app>, time }` and prefetches `config_changes`; the Application section renders that application's Deployment Changes link (the header badge showing the synthetic `application` kind)
- **AND** the Containers section does not render (an application group has no containers)

#### Scenario: A left-clicked non-workload node with no application triggers no query

- **WHEN** the user left-click `tap`s a non-workload node with **no `data.application`** (say a `node` / `external`, or a `service` / `pvc` with no application; that is, no `queryTarget`)
- **THEN** the panel still renders (header-only, or with Alerts) and the node's attributes are carried by the pinned top-right tooltip, but the system MUST NOT establish query input and MUST NOT issue the application-detail / image-detail queries

#### Scenario: Switching nodes or closing the panel clears state and cache and aborts in-flight work

- **WHEN** the panel is open with a prefetch in flight and the user switches to another node or closes the panel (unmount / clearing the selection)
- **THEN** the system aborts the in-flight queries (`AbortController`), clears both endpoints' caches and every per-target state, and MUST NOT setState for the old node after aborting

#### Scenario: Queries go through the Grafana runtime rather than directly outside

- **WHEN** scanning the source code under `src/**`
- **THEN** queries go only through `getBackendSrv()`, and there is no code under `src/**` connecting to an external backend directly through `fetch` / `axios` / `XMLHttpRequest`

### Requirement: Show/hide toggle per node kind in the legend

The panel SHALL provide a **show/hide toggle button** (`eye` / `eye-slash`) on **every row** of the Node Kinds legend (icon + name), toggling that kind's node visibility on the canvas. The toggle MUST write to the panel option `visibleKinds` (through a partial `onOptionsChange` update) — the options editor's kind multi-select and the legend buttons are two interfaces onto **one state** and MUST stay in two-way sync. When a kind is hidden, **any edge with an endpoint of that kind** MUST hide with it (the existing `computeVisibility` endpoint rule), and a node left with no visible edge and no visible child MUST be hidden by the orphan cascade (the existing `hideOrphans`).

**The legend list.** The legend's kind list MUST be the **union** of "the kinds actually rendered as a glyph" (the existing collapse-aware derivation) and "the kinds present in the current (post-mode-transform) elements but filtered out by `visibleKinds`" — a hidden kind MUST keep its legend row (in a faded style with `eye-slash`), otherwise it could never be restored from the legend. The toggle button MUST render only on **filterable known kinds**: the `network` virtual wrapper (never kind-filtered) and unknown kinds (visible by default) MUST NOT carry a button.

**Interaction with the existing toggles:**

- **Collapse toggles** (the collapse-all for clusters / nodes-or-controllers / storage classes, and single-container collapse): collapsed state (`collapsedIds`) and visibility (`visibleKinds`) are two independent layers — hiding a kind MUST NOT change any container's collapsed state, and re-showing it MUST restore the collapsed state verbatim.
- **Collapse interchange semantics are unchanged**: a collapsed container is represented in the legend by its container kind's row (collapsing a `netapp-node` gives a `netapp-node` row, not a `netapp-aggr` one), and the button toggles that row's kind; hiding a container kind MUST also make its descendants invisible (effective visibility = its own AND its ancestors').
- **pod-parent mode switching**: `visibleKinds` is a global set across modes, applied to the post-mode-transform elements; a mode switch MUST NOT clear the hidden settings — a setting with no corresponding node in the other mode has no visual effect but is retained, and takes effect again on switching back.

Writing a toggle back to the option MUST preserve the canonical kind order (rebuilding the array in the fixed order of the full kind universe) — a hide/restore round trip must not reorder the persisted `visibleKinds` (keeping the dashboard JSON and the editor multi-select order stable).

When every toggleable kind is hidden, the canvas MUST show the existing `All node types filtered` empty state and the legend MUST still list every (hidden) kind so they can be restored. When the canvas empties because of **edge-type filtering** (an orphan cascade) while some toggleable kind is still shown, it MUST NOT blame node kinds — it shows the generic `All elements filtered out` instead.

#### Scenario: Toggling hides a kind and its related edges

- **WHEN** the graph holds `service` nodes and `service-selects-pod` edges and the user clicks the toggle button on the legend's `service` row
- **THEN** every `service` node and every edge with a `service` node as an endpoint (`pod-calls-service` / `service-selects-pod`) hides from the canvas
- **AND** the `service` row stays in the legend (faded, with `eye-slash`), and clicking again restores the nodes and edges

#### Scenario: The legend button and the options editor stay in sync

- **WHEN** the user clicks the toggle on the legend's `pvc` row to hide `pvc`
- **THEN** the panel option `visibleKinds` no longer holds `pvc` (the editor multi-select reflecting it in sync); conversely, unchecking a kind in the editor makes the legend's corresponding row show the hidden state

#### Scenario: Hiding does not clear the collapsed state

- **WHEN** a K8s `node` container is collapsed and the user hides and then re-shows the `node` kind
- **THEN** that node container reappears and **stays collapsed** (the toggle action did not clear its collapsed state)

#### Scenario: Hiding pods in controller mode triggers the orphan cascade

- **WHEN** in controller mode the user hides the `pod` kind and a controller box has no incident drawn edge of its own (its pods nest inside it, and `pod-to-node` runs from the pod to the K8s node rather than through the controller), so all of its child pods hide
- **THEN** that controller box hides too through the orphan cascade, having no visible child and no visible edge

#### Scenario: A mode switch preserves the hidden settings

- **WHEN** `deployment` is hidden in controller mode, the user switches to node mode and back to controller mode
- **THEN** the setting has no visual effect while in node mode (the graph holds no controller node) and `deployment` is still hidden on returning to controller mode

#### Scenario: A non-filterable row has no button

- **WHEN** the legend lists `network` (the virtual fabric wrapper) or an unknown kind (newly added by the backend, outside the known kind set)
- **THEN** that row shows its glyph and name as usual but renders no show/hide toggle button

#### Scenario: Hiding everything shows the empty state and stays restorable

- **WHEN** the user toggles every kind the legend lists to hidden
- **THEN** the canvas shows the `All node types filtered` empty state and the legend still lists every kind (faded, with `eye-slash`), so clicking any row restores that kind

#### Scenario: An edge-type filter emptying the canvas does not blame node kinds

- **WHEN** every kind is shown but the user unchecks every edge type in the options editor, and the orphan cascade makes every node vanish from the canvas
- **THEN** the canvas shows `All elements filtered out` (rather than `All node types filtered`) and the legend's kind rows keep their shown state (the `Hide` affordance)

#### Scenario: A hide/restore round trip does not reorder visibleKinds

- **WHEN** the user hides and then restores the same kind
- **THEN** the `visibleKinds` written back is element-for-element equal to the original array (canonical order, not appended at the end)

### Requirement: Decorative compound groups use fixed per-kind colours and a kind-prefixed label

The accent colours of the decorative `cluster` / `namespace` / `application` groups (`clusterColor` / `namespaceColor` / `applicationColor`) MUST be **a single colour fixed per group kind** — every group node of the same kind shares one colour regardless of its name, rather than hashing the name into a per-instance colour. The three kinds' colours MUST differ from one another and MUST contrast sufficiently with the existing edge colour table (`EDGE_STYLE_BY_TYPE`) and the status colours (normal green, warning yellow, critical red), so an edge line stays legible as it crosses any compound backdrop.

The **canvas label** of a decorative `cluster` / `namespace` / `application` group MUST be prefixed with a **capitalised kind word followed by `: `** (a colon and one space), in the form `${PREFIX}: ${name}` — a `cluster` group named `prod` gets the canvas label `Cluster: prod`, a `namespace` named `checkout` gets `Namespace: checkout`, and an `application` named `mongo` gets `Release Unit: mongo`. **The `application` group's display prefix is "Release Unit"** — display text only; the internal `type` / `kind` strings, the `isApplication` flag, `applicationColor`, and the CSS selector (`node[?isApplication]`) all stay `application`.

This prefix MUST be implemented as a **render-only function `label` mapper in the stylesheet** (selectors `node[?isCluster]` / `node[?isStorageCluster]` / `node[?isNamespace]` / `node[?isApplication]`) and **MUST NOT** be written into `data.label` by `normalizeGraph` — `data.label` MUST stay the bare upstream name (consistent with `data.cluster` / `data.namespace` / `data.application`). That way the hover / pinned tooltip's name title, and every other path reading `data.label` as an identity or display name, gets the bare name, and the prefix appears **only** in the canvas compound naming. This requirement applies only to the decorative compound groups (`cluster` / `storage-cluster` / `namespace` / `application`) and does not affect the label format of any leaf node (pod / service / pvc / node / netapp-aggr) or of the `controller` / `netapp-node` compounds. The whole canvas label (prefix + name) keeps the existing `font-weight: 600` styling — a single cytoscape label does not support mixed weights within one node, so the prefix and the name share one weight.

#### Scenario: Several cluster groups of the same kind share one colour

- **WHEN** the graph holds two or more `cluster` group nodes with different names
- **THEN** every `cluster` group node's `data.clusterColor` is the same fixed value, unaffected by their differing names

#### Scenario: The three kinds' fixed colours differ from each other and contrast with the edge colours

- **WHEN** the panel renders the `cluster` / `namespace` / `application` groups
- **THEN** their three fixed colours differ from one another and none is an exact match for any edge colour in `EDGE_STYLE_BY_TYPE` or for a status colour (green `#73BF69` / yellow `#F2CC0C` / red `#E02F44`)

#### Scenario: A decorative group's canvas label is kind-prefixed while data.label stays bare

- **WHEN** a `cluster` group named `prod`, a `namespace` group named `checkout`, and an `application` group named `mongo` are normalized and rendered
- **THEN** their `data.label` values are `prod`, `checkout`, and `mongo` respectively (bare names)
- **AND** the labels the stylesheet renders on the canvas are `Cluster: prod`, `Namespace: checkout`, and `Release Unit: mongo` respectively

#### Scenario: Non-decorative node labels are unaffected

- **WHEN** a `pod` / `service` / `pvc` / `node` / `netapp-aggr` leaf node or a `controller` / `netapp-node` compound node is normalized
- **THEN** its `data.label` stays the original name with no kind prefix applied

### Requirement: The hover tooltip shows an edge's RED metrics

When the user hovers an edge **carrying `data.metrics`**, `HoverTooltip` MUST append that edge's family's promoted attr rows, in order, **after** the existing `edgeType` row and **before** the `labels` divider (row keys being fixed English UI strings). `metrics` is a union of two mutually exclusive families (see graph-data-integration, "Upstream kube-state-graph payload contract"), and the tooltip MUST discriminate with **`'rate' in metrics`**, rendering only that family's rows — it **MUST NOT** assume `rate` exists on an arbitrary `metrics` object (the requirement's name keeps the word RED only to stay aligned with the existing requirement it modifies; the contract covers both families).

**The RED family** (trace-derived call edges), at most three rows:

| row key | source field | display format |
| --- | --- | --- |
| `rate` | `metrics.rate` | `<value> req/s` |
| `errorRate` | `metrics.errorRate` | `<value×100>%` |
| `duration(p90)` | `metrics.p90ServerMs` | `<value> ms` below `1000`; converted to `<value/1000> s` at `>= 1000` |

**The I/O family** (`pvc-to-netapp-aggr` edges only), at most eight rows in this fixed order — the six **measurement** rows first, the two **declared-ceiling** rows last:

| row key | source field | display format |
| --- | --- | --- |
| `read` | `metrics.readOps` | `<value> ops/s` |
| `write` | `metrics.writeOps` | `<value> ops/s` |
| `read latency` | `metrics.readLatencyUs` | `<value> µs` below `1000`; converted to `<value/1000> ms` at `>= 1000` |
| `write latency` | `metrics.writeLatencyUs` | as above |
| `read throughput` | `metrics.readBytesPerSec` | `<decimal byte unit>/s` (for example `5.24 MB/s`) |
| `write throughput` | `metrics.writeBytesPerSec` | as above |
| `max iops` | `metrics.maxIops` | `<value> ops/s` |
| `max throughput` | `metrics.maxBytesPerSec` | `<decimal byte unit>/s` (for example `250 MB/s`) |

The two ceiling rows sit **after** the measurements because they are a **configured value** of the volume's QoS policy group rather than something observed: the reader's first question is what the volume is doing now, not what it is allowed to do. Each ceiling row MUST use **exactly the same** formatter as its corresponding measurement row (`max iops` on the ops ladder, `max throughput` on the decimal byte ladder), so `read throughput: 5.24 MB/s` and `max throughput: 250 MB/s` compare at a glance — which is the whole reason the backend converts `max_bytes_per_sec` into bytes per second.

Number-formatting rules:

- `rate` / `errorRate` / `duration(p90)` / `read` / `write` / `read latency` / `write latency` / `max iops` share one set of pure functions (`formatEdgeMetrics.ts`): a value MUST render at no more than **3 significant digits** with trailing zeros removed (`5`, not `5.00`; `3.2`, not `3.20`).
- **`read throughput` / `write throughput` / `max throughput` are the exception** (the three bytes-per-second rows): their values are bytes/s, where a bare 3-significant-digit rendering degenerates into an unreadable exponent at realistic magnitudes, so they MUST use the **decimal byte-unit ladder the node `usage` row already uses** (`B` / `KB` / `MB` / `GB` / `TB` … in `src/shared/format/measurements.ts`) with a `/s` suffix. One shared ladder means a `700 GB` aggregate and a `5.24 MB/s` edge read on the same scale.
- **A non-zero value MUST NOT be formatted as `0`**: rounding may lose digits but MUST NOT lose magnitude. Tiny values (say `3.86e-7` req/s, a ratio of `6.7e-8`, or `12 B/s`) MUST keep their magnitude.
- `errorRate` is a ratio in `[0,1]` and MUST be multiplied by 100 and suffixed with `%` before display; `0` MUST render as `0%` (meaning "measured, with no failures").

The failure-emphasis rule: when `errorRate` is **measured and non-zero** (`errorRate !== 0`), that row's **value** MUST render in the theme's error colour while the key stays the secondary colour, so the row does not break the list's rhythm. The decision MUST be made on **the number itself** rather than on the formatted string — `6.7e-8` renders as `0.0000067%` and is still a real failure ratio. `errorRate: 0` MUST stay the neutral colour, and an absent `errorRate` MUST render no row at all (and therefore no colour). Every other row (RED's `rate` / `duration(p90)` and **all** of the I/O rows, the two ceilings included) MUST NOT be coloured — an I/O measurement has no notion of "failure", and high throughput or high latency MUST NOT be coloured as an error. Approaching or exceeding a declared ceiling MUST NOT trigger colouring or a warning either: a ceiling is configuration, not a threshold, and QoS throttling is normal operation rather than a fault.

Omission rules:

- When an edge has **no** `data.metrics`, the tooltip MUST look exactly as it does today — no metrics row, no heading, and no `N/A`-style placeholder.
- When any optional field within a family is absent, its row MUST NOT render (**and above all MUST NOT show `0`**: absence means "could not be measured", which is a different state from a measured zero). This applies to RED's `errorRate` / `p90ServerMs` and to all eight I/O fields. For the two ceiling fields the distinction has the same shape but a different reading: absence means the volume has no declared ceiling at all, which MUST NOT surface as `0` or as an unlimited sentinel.
- Metrics values MUST NOT appear in the `labels` block — they come from `data.metrics`, not the backend's labels map.

Both families affect only the **edge** tooltip in floating hover mode. Pinned mode applies only to a selected **node** and is therefore unaffected by this requirement, and an edge's colour, width, line style, and label on the canvas MUST NOT change because of either family's metrics.

#### Scenario: Hovering an edge with complete RED shows three rows

- **WHEN** the user hovers an edge with `edgeType: 'pod-calls-service'` and `data.metrics = { rate: 5, errorRate: 0.2, p90ServerMs: 45 }`
- **THEN** the tooltip shows, in order, `edgeType: pod-calls-service`, `rate: 5 req/s`, `errorRate: 20%`, and `duration(p90): 45 ms`
- **AND** the three RED rows sit after `edgeType` and before the `labels` divider

#### Scenario: An edge with no metrics looks as it does today

- **WHEN** the user hovers a `pod-mounts-pvc` edge (with no `data.metrics`)
- **THEN** the tooltip shows only the `source → target` title, the `edgeType` row, and the existing labels — no metrics row of either family, and no placeholder

#### Scenario: An omitted errorRate does not render as 0%

- **WHEN** the user hovers an edge with `data.metrics = { rate: 3 }` (neither `errorRate` nor `p90ServerMs` present)
- **THEN** the tooltip appends only the `rate: 3 req/s` row; no `errorRate` or `duration(p90)` row may appear

#### Scenario: A measured zero failure rate shows 0%

- **WHEN** the user hovers an edge with `data.metrics = { rate: 1, errorRate: 0 }`
- **THEN** the tooltip shows `errorRate: 0%` (explicitly distinct from the previous scenario's "no row")
- **AND** that value renders in the neutral text colour, never in the error colour

#### Scenario: A non-zero failure rate is marked in the error colour

- **WHEN** the user hovers an edge with `data.metrics = { rate: 5, errorRate: 0.2 }`
- **THEN** the `errorRate` row's **value** renders in the theme's error colour while its key keeps the existing secondary colour
- **AND** the `rate` and `duration(p90)` rows in the same tooltip MUST NOT be coloured

#### Scenario: Tiny values are not formatted as 0

- **WHEN** the user hovers an edge with `data.metrics = { rate: 3.86e-7, errorRate: 6.7e-8 }`
- **THEN** the `rate` row shows `3.86e-7 req/s` (in exponent form) and the `errorRate` row shows `0.0000067%` (in full decimal)
- **AND** neither may render as `0 req/s` / `0%`
- **AND** that `errorRate` still renders in the error colour (the colouring decided by the number `6.7e-8 !== 0`, not by the formatted string)

#### Scenario: A long duration renders in seconds

- **WHEN** the user hovers an edge with `data.metrics.p90ServerMs = 2500`
- **THEN** the `duration(p90)` row shows `2.5 s` (rather than `2500 ms`)

#### Scenario: Metrics do not change the canvas visuals

- **WHEN** the graph holds both edges with metrics (RED or I/O) and edges without
- **THEN** the line colour, width, style, arrowhead, and canvas label of both are decided entirely by the existing edge-type / ingressPath / relation rules, independently of `metrics`

#### Scenario: Storage edge shows all eight I/O rows

- **WHEN** the user hovers an edge with `edgeType: 'pvc-to-netapp-aggr'` and `data.metrics = { readOps: 150, writeOps: 40, readLatencyUs: 830, writeLatencyUs: 1200, readBytesPerSec: 5242880, writeBytesPerSec: 1048576, maxIops: 5000, maxBytesPerSec: 262144000 }` (no `rate`)
- **THEN** the tooltip shows, in order, `read: 150 ops/s`, `write: 40 ops/s`, `read latency: 830 µs`, `write latency: 1.2 ms`, `read throughput: 5.24 MB/s`, `write throughput: 1.05 MB/s`, `max iops: 5000 ops/s`, `max throughput: 262 MB/s`, and no `rate` / `errorRate` / `duration(p90)` row

#### Scenario: Absent I/O field renders no row

- **WHEN** a storage edge's `data.metrics` holds only `{ readOps: 150, readBytesPerSec: 5242880 }`
- **THEN** the tooltip shows only the `read` and `read throughput` rows; `write` / `read latency` / `write latency` / `write throughput` / `max iops` / `max throughput` render nothing (no `0`, no placeholder)

#### Scenario: Measured volume with no declared ceiling

- **WHEN** a storage edge carries the six measurement fields but neither `maxIops` nor `maxBytesPerSec`
- **THEN** the tooltip shows the six measurement rows and **no** ceiling row — absence is never rendered as `0`, as `unlimited`, or as a `max …: —` placeholder

#### Scenario: Ceiling row shares its measurement row's formatter

- **WHEN** a storage edge carries `readBytesPerSec: 5242880` and `maxBytesPerSec: 262144000`
- **THEN** the two rows render as `5.24 MB/s` and `262 MB/s` — the same decimal byte ladder on both, so the reader compares them without mentally converting units

#### Scenario: Throughput uses the byte-unit ladder rather than a bare 3-significant-digit value

- **WHEN** a storage edge's `readBytesPerSec` is `5242880` and its `writeBytesPerSec` is `12`
- **THEN** the two rows render as `5.24 MB/s` and `12 B/s` respectively — the same decimal unit ladder the node `usage` row uses; they MUST NOT render as `5.24e6 B/s` and MUST NOT round the small value to `0`

#### Scenario: No I/O row takes the failure colour

- **WHEN** a storage edge carries all eight I/O fields and its measured throughput sits above the declared ceiling
- **THEN** every one of the eight row values renders in the neutral colour — the error colour stays reserved for a measured, non-zero `errorRate`, and exceeding a ceiling is never styled as a fault

## ADDED Requirements

### Requirement: Node usage visual (data-driven on usage, independent of kind)

The system SHALL draw a usage visual on the canvas for **any node carrying `data.usageRatio`**, so an operator can spot storage approaching its capacity ceiling at a glance without opening a tooltip. In practice that set is `pvc` (kubelet volume stats) and `netapp-aggr` (Harvest aggregate space), but the rule MUST trigger **solely on the presence of `usageRatio`** and **MUST NOT** hard-code any kind list — when the backend adds `usage` to another kind in future it applies automatically, with no stylesheet change.

`usageRatio` is flattened by normalize into a top-level numeric field of the node's `data` (see graph-data-integration, "Normalization of NetApp nodes and PVC storage fields"), because a cytoscape selector can read neither nested `data` nor perform division inside a selector.

The visual encoding rules:

- Usage MUST be drawn **inside the cylinder silhouette of the kind SVG** (bottom-up, its height proportional to `usageRatio`) and **MUST NOT** fill the 40px node box through cytoscape's `background-fill` — a box fill spills outside the cylinder silhouette and, at high utilisation, covers `netapp-aggr`'s internal layer lines.
- The liquid colour MUST be `STATUS_COLOR` on Grafana's three thresholds and MUST be drawn at **fill-opacity 0.4** (painted before the line art, which stays opaque, so the aggregate's layer lines stay readable):
  - `usageRatio < 0.8` → `STATUS_COLOR.normal` (`#73BF69`)
  - `usageRatio >= 0.8` → `STATUS_COLOR.warning` (`#F2CC0C`)
  - `usageRatio >= 0.9` → `STATUS_COLOR.critical` (`#E02F44`)
- The node's kind icon MUST keep its original size (`NODE_SIZE` / `background-fit: contain`), and its label MUST stay `data(label)` rather than being rewritten as a percentage.
- A node with no `usageRatio` (every non-storage node, and any storage node whose `usage` is incomplete) MUST keep its existing background and unfilled icon with no liquid applied — **missing data MUST NOT render as 0%**.
- The k8s `status` border rule MUST be unaffected: the liquid occupies the interior colour channel and status the border, and both can appear on one node at once.

This visual is **presentation only**: it MUST NOT affect selection, filtering, layout, or tooltip content, and MUST NOT write back to any `data` field. The textual `usage` row in the tooltip (see "The hover tooltip shows element metadata") and this visual are two presentations of the same data and MUST coexist.

#### Scenario: A node with usageRatio renders a cylinder liquid

- **WHEN** a `netapp-aggr` node carries `usageRatio: 0.7` and a `pvc` node carries `usageRatio: 0.5`
- **THEN** both have a bottom-up cylinder liquid inside their kind SVG, at roughly 70% and 50% of the cylinder's height respectively; the node box itself MUST NOT apply `background-fill: linear-gradient`; and both go through **one** `usageRatio` trigger rule rather than a per-kind trigger

#### Scenario: A node with no usageRatio gets no liquid

- **WHEN** a `pvc` node has no `usage` (or its `usage` holds only `capacityBytes`, so normalize wrote no `usageRatio`)
- **THEN** that node keeps its existing background and unfilled icon, MUST NOT render any liquid, and MUST NOT be rendered as 0% full

#### Scenario: The usage liquid applies STATUS_COLOR on the 80/90 thresholds

- **WHEN** three nodes carry `usageRatio` values of `0.7`, `0.8`, and `0.9`
- **THEN** their liquid colours are `STATUS_COLOR.normal` / `warning` / `critical` (`#73BF69` / `#F2CC0C` / `#E02F44`) respectively, all at fill-opacity 0.4; `0.79` MUST still be green

#### Scenario: The usage liquid obscures neither the kind line art nor the status border

- **WHEN** a `netapp-aggr` carrying `usageRatio: 0.7` (with its two internal layer lines) and a `status` is rendered
- **THEN** its cylinder outline and internal layer lines stay visible (the liquid sits beneath the line art and is semi-transparent), the icon size is unchanged, and its status border colour still follows the existing rules (the liquid affects only the SVG interior, never the border)

#### Scenario: The usage visual affects neither interaction nor layout

- **WHEN** the user selects, filters, or switches pod-parent mode on a node carrying `usageRatio`
- **THEN** the behaviour is identical to a node of the same kind without that field (the fill is purely presentational and takes no part in `computeVisibility`, layout, or the `resolveSelectedNode` decision)
