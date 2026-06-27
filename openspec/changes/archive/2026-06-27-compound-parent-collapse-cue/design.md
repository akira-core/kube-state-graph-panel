## Context

The panel renders the backend D6 hierarchy as nested compound boxes (`cluster > namespace > application > controller > pod`, plus k8s `node` and `storageclass` leaves). Collapse/expand is provided by `cytoscape-expand-collapse` (v4.1.1), initialised once in `useExpandCollapse` with `cueEnabled: true`. The extension's cue is **selection-driven**: `cueUtilities.js` binds `select unselect` and only calls `drawExpandCollapseCue(node)` when **exactly one** node is selected and it `isParent()` or is a collapsed node. Clicking inside the cue rect (its `tap` handler) toggles collapse.

`normalizeGraph` currently marks the decorative `cluster` / `namespace` / `application` groups `selectable: false` (via the `isNonSelectableGroup` helper) so a tap on them can neither latch a selection ring nor open the node-detail panel. Controllers / k8s nodes / storageclass leaves are already selectable. Empirically (live cy), selecting a controller sets `expandcollapseRenderedStartX` — the cue **does** render for selectable parents; it simply never reaches the decorative tiers because they cannot be selected.

## Goals / Non-Goals

**Goals:**
- A `+/-` "folder" collapse cue is reachable on **every** compound parent kind, including the decorative cluster / namespace / application tiers.
- Reuse the existing, already-enabled expand-collapse cue + collapse plumbing — no new component, config, or collapse mechanism.
- Preserve the rule that decorative groups never open the node-detail panel.

**Non-Goals:**
- Always-on cues on all parents at once (the built-in cue is one-at-a-time on selection — explicitly out of scope; would require a custom stylesheet button).
- Any change to the collapse/orphan-cascade plumbing, default-collapse behaviour, or the legend collapse-all toggles.
- A folder-shaped custom icon (the default extension `+/-` cue is used as-is).

## Decisions

- **Make the decorative groups selectable rather than build a custom button.** The built-in cue already works for selectable parents; the only blocker is selectability. Flipping `selectable` for the three decorative kinds is the minimal change that satisfies "a folder button on every compound parent". Alternative considered: a custom always-visible folder glyph via the stylesheet — rejected for this change as materially more code (stylesheet selector + corner hit-testing + its own tests) for a usage the built-in cue already covers on selection.
- **Keep the detail-panel guard untouched.** `resolveSelectedNode` returns `null` for `isCluster` / `isNamespace` / `isApplication` (via `isDashboardEligible`), so selecting a decorative group selects it (ring + cue) but opens no panel. No production change needed there — only a regression test to lock it.
- **No GraphCanvas tap-handler change.** `handleTap` currently deselects when `!single.selectable()`; once groups are selectable that branch simply no longer fires for them, and `onSelect(group.id())` flows through to the (already-guarding) `resolveSelectedNode`. The collapse toggle is handled by the extension's own cue `tap` handler.
- **Folded-decorative folder icon via a stylesheet rule, not a `NodeKind`.** `cluster` / `namespace` / `application` are synthetic decorative kinds and not members of `NodeKind`, so the folder glyph cannot join `ICON_SVG_BY_KIND` (a `Record<NodeKind,string>`). It is a standalone exported SVG (same authoring rules: XML header, `currentColor`, stroke art) painted by new collapsed-decorative selectors `node[?isCluster].cy-expand-collapse-collapsed-node` / `[?isNamespace]` / `[?isApplication]`, each setting `background-image` to the folder glyph tinted by that group's accent (`clusterColor` / `namespaceColor` / `applicationColor`) with `background-fit: contain`. These selectors are 2-condition (kind-flag + collapsed-class) so they out-specify the 1-condition `node[?isCluster]` `background-image: 'none'` rule; the icon shows ONLY when collapsed. Gap-fill: kind-ful compounds already revert to their kind icon when folded (base `node` rule, since they lose `:parent`), so they are untouched. Alternative considered: a uniform folder on all folded compounds (rejected — loses the informative kind glyph on folded controller/node/storageclass) and a corner badge (rejected — needs a second background-image layer for marginal gain).

## Risks / Trade-offs

- [Selecting a large cluster/namespace box now latches the single-selection ring + selection-focus dimming of other elements] → Accepted and documented in the spec; it is the cost of surfacing the cue on those tiers and matches every other selectable node's behaviour.
- [The panel's `tap` handler and the extension's cue `tap` handler both fire on a cue click] → The extension toggles collapse and unselectifies the node; the panel's `onSelect` routes through `resolveSelectedNode` which returns `null` for groups, so no panel opens. Covered by tests for "group selects, no panel" and the existing collapse tests.
- [Spec drift: the panel-rendering requirement asserts decorative groups are non-selectable] → Updated in this change's delta spec to "selectable to surface the collapse cue, still no detail panel".

## Migration Plan

Pure client-side rendering change; no data, API, or persistence impact. Ships with the plugin build. Rollback = revert the `selectable` flip in `normalizeGraph`.

## Open Questions

None.
