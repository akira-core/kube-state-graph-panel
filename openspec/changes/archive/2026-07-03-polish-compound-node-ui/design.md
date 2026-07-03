## Context

Three decorative compound-group kinds nest content on the canvas: `cluster` (outermost), `namespace`, and `application` (ArgoCD app). Since the archived `compound-parent-collapse-cue` change (2026-06-27), all three are `selectable` purely so `cytoscape-expand-collapse`'s native, **selection-driven** `+/-` cue can surface — the cue is drawn by the extension's own `select`/`unselect` listeners only when exactly one `:parent` (or collapsed) node is selected (`cueUtilities.js`, not custom code in this repo). Selecting a `cluster`/`namespace` opens no detail panel (`resolveSelectedNode` returns `null` for both); `application` is the one exception and does open a detail panel.

Each of the three kinds also gets its background colour from a per-instance hash (`colorForCluster`/`colorForNamespace`/`colorForApplication`, each hashing the node's name into a small multi-colour palette drawn from the same cool blue/teal/indigo/violet family as real edge colours). Two clusters can therefore land on colours that are visually close to (or the same hue family as) `pod-to-node` (blue `#3b82f6`), `pvc-to-storageclass` (violet `#8b5cf6`), or the fabric cyan (`#06b6d4`), making an edge crossing that backplate harder to read.

GraphCanvas already special-cases non-selectable nodes correctly: its `tap` handler (GraphCanvas.tsx:124-133) checks `single.selectable()` and routes a tap on a non-selectable node to `onSelect(null)`, same as a background tap — this exact code path used to run for `cluster`/`namespace` before the cue change and is dead-but-correct today (nothing currently produces `selectable: false`). Re-introducing `selectable: false` on `cluster` nodes needs no change to this guard.

`GraphCanvas.test.tsx` currently has stale fixtures (lines 21-25) asserting `selectable: false` for BOTH `cluster` and `namespace` — leftover from before the 2026-06-27 change made `namespace` selectable too. This change is the first one to touch cluster-selectability again, so it's the natural point to fix those fixtures to match reality (`namespace` stays selectable; only `cluster` goes back to non-selectable).

## Goals / Non-Goals

**Goals:**
- `cluster` nodes are non-selectable; tapping one behaves like a background tap (deselect, no ring).
- Clusters remain collapsible/expandable — via `dbltap` instead of the selection-driven cue, reusing the existing `ExpandCollapseApi` and `expandcollapse.aftercollapse`/`afterexpand` event plumbing (no new state, no new collapse mechanism).
- `namespace` and `application` are untouched behaviourally (still selectable, still cue-driven, `application` still detail-eligible).
- `cluster` / `namespace` / `application` each get ONE fixed colour for their kind (not per-instance), chosen for visual contrast against the existing edge and status colour palettes.
- Compound-group labels are prefixed with a title-case kind word + `: ` (`Cluster: prod`, `Namespace: checkout`, `Release Unit: mongo` — `application`'s display prefix is renamed "Release Unit"; the internal type/kind string is unchanged).
- Stale "right-click detail panel" comments in `normalize.ts` / `node-detail/*` are corrected to reflect that right-click is fully removed (this behaviour itself needs no code change).

**Non-Goals:**
- No change to `namespace`/`application` selectability, cue behaviour, or detail-panel eligibility.
- No change to the folder-icon-on-collapse mechanism (still class-driven, unaffected by selectability).
- No change to the `ClusterLegend`/`NamespaceLegend`/`ApplicationLegend` components themselves — they read colour straight from `data.clusterColor`/`namespaceColor`/`applicationColor`, so a per-kind constant flows through unchanged.
- No change to leaf-node (pod/service/pvc/node/storageclass/controller) selectability, colour, or labels.
- Not attempting to make every compound colour's hue globally unique on the colour wheel (see Decisions below for the contrast approach actually used).

## Decisions

**1. `cluster` selectability: `selectable: false` + `dbltap` for collapse.**
Chosen over keeping `cluster` selectable-but-visually-suppressed (rejected: the cue is genuinely useful for a compound this large, and suppressing only the ring while keeping click-to-select-nothing is a confusing halfway state) and over leaving it fully selectable (rejected: that's the status quo the user explicitly asked to change). `dbltap` was chosen over an always-visible custom cue (rejected: `cytoscape-expand-collapse`'s cue rendering is internal to the extension — there's no supported option to force it to render without selection; building a parallel custom cue renderer is a much larger surface for a cosmetic ask). Implementation: a `dbltap` listener in `GraphCanvas.tsx`, gated on `target.data('isCluster') === true`, calling `apiRef.current.expand(node)` when `api.isExpandable(node)` else `api.collapse(node)` when `api.isCollapsible(node)`. This goes through the same `ExpandCollapseApi` the cue itself uses, so `expandcollapse.aftercollapse`/`afterexpand` fire normally and `useExpandCollapse`'s existing `handleCue` listener updates `collapsedIds` exactly as it does today for a cue-driven collapse — no new state path.

**2. Per-kind fixed colour, not per-instance hash.**
Replaces `colorForCluster`/`colorForNamespace`/`colorForApplication` (each a `CLUSTER_PALETTE`-style array + string hash) with one constant colour per kind. Contrast against edges is achieved primarily through **saturation/value separation**, not hue-avoidance alone: edge colours are vivid/high-saturation (`#3b82f6`, `#a855f7`, `#f97316`, `#8b5cf6`, `#06b6d4`, all ~85-95% saturation) rendered as opaque lines; the three kind colours below are deliberately muted/desaturated (~20-30% saturation) translucent backplates (existing opacity: cluster 7%, namespace/application 10%, unchanged), so an edge crossing any backplate stays visually distinct by vividness even where hue families loosely overlap. None of the three collides with status green/yellow/red (`#73BF69`/`#F2CC0C`/`#E02F44`):
   - `cluster` → `#5b6b7a` (muted slate blue-grey)
   - `namespace` → `#7d6a99` (muted plum)
   - `application` → `#8a6a53` (muted terracotta)
   These are starting values for implementation; exact hex is a cosmetic detail reviewable in the PR diff, not a spec-level contract.

**3. Label prefix format: `${PREFIX}: ${name}`, applied in `parseNodes` via a `GROUP_LABEL_PREFIX` lookup.**
Rather than a display-only prefix added at render time (stylesheet `label` mapper), the prefix is baked into `data.label` itself in `normalize.ts` where `cluster`/`namespace`/`application` are already resolved — same place the colour is assigned, single code path, and every consumer of `data.label` (stylesheet, legend, tooltip `name`) picks it up for free with no new plumbing. Considered doing it in the stylesheet's `label` selector instead (rejected: cytoscape style `label` mapper can't string-concatenate two data fields without a function mapper per compound selector, which is more code than a two-line change at the single normalize.ts callsite that already knows the kind). The prefix word is title-case (`Cluster`, `Namespace`, `Release Unit`) with a space after the colon for readability; cytoscape renders one plain-text label per node with no mixed-weight/rich-text support, so the existing whole-label `font-weight: 600` (getStylesheet.ts) already covers "bold" for the full label — there's no way to bold only the prefix substring within a single cytoscape label. `application`'s prefix word is renamed to "Release Unit" for display only; the internal `type`/`kind` string, `isApplication` flag, `applicationColor`, and all CSS selectors stay `application` — unaffected.

**3a. Physical-network + k8s-node compound headers: render-only label alignment.**
The user asked the two remaining compound-box headers — the physical-network fabric box (`kind: network`) and the k8s `node` box (the pod-wrapping compound in node-layout) — to match the decorative groups' capitalisation and label size. Unlike the decorative groups (§3), these labels are NOT safe to rewrite in `data.label`: a k8s node's `data.label` is its identity value — `paramsFromData` renames `label`→`name` for the `/dashboard` query, and `NodeDetailPanel` renders `node.label` as the panel title — so a baked-in `Node: ` prefix would send `name=Node: worker-0` (wrong query) and show a redundant `Node: worker-0` beside the kind badge. Chosen approach: **render-only stylesheet function `label` mappers** on `node[kind='network']` (title-case the words → `Physical Network`) and the k8s node (prefix `Node: `), leaving `data.label` pristine. This is deliberately asymmetric with §3 (groups bake into `data.label`) and correct: the groups are not dashboard-eligible and `resolveSelectedNode` returns null / uses `data.application` for them, so their baked prefix never reaches a query or a leaf title; the node/network boxes ARE identity-bearing, so their prefix must stay presentation-only. `font-size` is bumped to match the group headers (network 17, node 18); the selectors are declared after `node:parent` so they win the header label/size.

The k8s-node treatment is **gated on the node actually being a compound**, not applied to every `kind: node`: the selector is `node[kind='node']:parent` (a node-layout node that wraps its pods) plus a `node[kind='node'].cy-expand-collapse-collapsed-node` sibling (a folded compound loses `:parent` when its children are removed, so the class keeps the header stable across expand/collapse). A **controller-layout k8s node is a plain leaf** (pods parent to the synthesized controller, not the node) — it matches neither selector and falls through to the base `node` title (bare `worker-0`, base 11px, bottom-valign). A controller-layout leaf is never a compound, so it never carries the collapsed class → the sibling can't leak the treatment onto it. This matches the requested behaviour: "if the k8s node is not a compound node, roll back to the normal node title style." Switch leaf nodes are out of scope (their many small labels would clutter if enlarged/prefixed); this can be revisited if the fabric reads inconsistently.

**4. Right-click cleanup is comment-only.**
Confirmed via `GraphCanvas.tsx` (only binds `tap`) and `GraphCanvas.test.tsx` (explicit assertions that `cxttap` no-ops and the native context menu is untouched) that the right-click detail panel is already fully removed. No behavioural task; only stale comments in `normalize.ts` (~line 367) and `node-detail/*` that still describe a "right-click detail panel" get corrected for accuracy.

## Risks / Trade-offs

- [Risk] Users accustomed to single-click-to-collapse a cluster lose that gesture; `dbltap` is a new, less-discoverable interaction. → Mitigation: `namespace`/`application` (the other two compound kinds) keep the existing single-click cue, so the pattern isn't lost project-wide — only the outermost, least-frequently-collapsed grouping changes gesture. Legend already exposes an explicit "collapse all clusters" toggle (`ClusterLegend`'s `onToggleCollapseAll`) as a discoverable alternative.
- [Risk] Fixed muted colours may still read as "similar" to a given edge colour for some users/themes (this is Grafana, both light and dark themes are supported). → Mitigation: colours are a single constant per kind, trivial to retune post-review; no structural risk.
- [Risk] `GraphCanvas.test.tsx`'s existing stale `selectable: false` fixture for `namespace` (line 24) means an existing test may already be asserting behaviour the current `normalize.ts` doesn't actually produce — fixing it is in scope here since we're touching the same fixtures for `cluster`, but it's a pre-existing gap this change happens to surface, not something this change introduces. → Mitigation: covered explicitly in tasks.

## Migration Plan

Pure frontend, no data migration. Colour/label/selectability changes take effect on next panel render (no persisted state depends on the old per-instance colours or unprefixed labels). No feature flag — single coordinated change across normalize/stylesheet/palette files and their tests.

## Open Questions

None — the one open design question (how to preserve cluster collapsibility once non-selectable) was resolved with the user before writing this design (`dbltap`, add-alt-collapse option).
