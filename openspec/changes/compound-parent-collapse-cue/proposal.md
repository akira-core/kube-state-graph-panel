## Why

Every compound parent box (cluster / namespace / application / controller / k8s node / storageclass) is collapsible, but there is no obvious per-node control to fold one. The `cytoscape-expand-collapse` extension already ships a `+/-` cue and it is enabled (`cueEnabled: true`), yet it only draws on a **selected** parent — and the decorative `cluster` / `namespace` / `application` groups are `selectable: false`, so the cue can never appear on them. Users have no discoverable way to collapse those tiers from the canvas.

## What Changes

- Make the decorative `cluster` / `namespace` / `application` group nodes **selectable** in `normalizeGraph` (drop the `selectable: false` they carry today). Controllers, k8s nodes and storageclass leaves are already selectable.
- With every compound parent selectable, the already-enabled built-in `+/-` cue renders on whichever parent the user selects; clicking the cue toggles that parent's collapse via the existing expand-collapse plumbing. No new button component, no new collapse mechanism.
- Decorative groups remain **non-detail**: selecting one MUST NOT open the node-detail panel (the `resolveSelectedNode` / `isDashboardEligible` guard already excludes `isCluster` / `isNamespace` / `isApplication`, and is unchanged).
- **Behaviour trade-off (accepted):** tapping a decorative group now latches the single-selection ring and the selection-focus dimming, the same as any other selected node. This is the cost of surfacing the cue on those tiers.
- **Folded-group icon:** when a decorative `cluster` / `namespace` / `application` group is **collapsed**, render a folder glyph centred in the box. Today a folded decorative group is an icon-less coloured box (its `node[?isCluster|Namespace|Application]` rule forces `background-image: 'none'`), unlike a kind-ful compound (controller / k8s node / storageclass) which reverts to its kind icon when folded. Gap-fill scope: the folder icon is added ONLY to the three decorative kinds; kind-ful compounds keep their kind icon when folded.

## Capabilities

### New Capabilities
<!-- none — reuses the existing expand-collapse cue + collapse plumbing -->

### Modified Capabilities
- `panel-rendering`: the decorative `cluster` / `namespace` / `application` groups change from non-selectable to selectable (so the built-in collapse cue can render on them); they still MUST NOT open the node-detail panel.

## Impact

- `src/features/graph-data/normalize.ts` — remove the `selectable: false` branch for the decorative-group kinds (the `isNonSelectableGroup` gate); its unit tests assert these are now selectable.
- `src/panels/KsgPanel/` — `resolveSelectedNode` already returns `null` for decorative groups; add coverage that a now-selectable group selects but opens no panel. No production change expected here.
- `openspec/specs/panel-rendering/spec.md` — the interaction / selection requirement updates to reflect selectable decorative groups + the collapse-cue surface; a folded-decorative-group folder-icon requirement is added.
- `src/shared/constants/iconSvgByKind.ts` (or sibling) — a standalone folder glyph SVG (cluster/namespace/application are not `NodeKind`s, so it lives outside `ICON_SVG_BY_KIND`).
- `src/features/graph-canvas/styles/getStylesheet.ts` — collapsed-decorative selectors (`node[?isCluster].cy-expand-collapse-collapsed-node`, …) paint the folder glyph tinted by each group's accent; its snapshot test regenerates.
- No change to the expand-collapse config (`useExpandCollapse`, `cueEnabled` already true), the collapse/orphan plumbing, or the detail-panel gating.
