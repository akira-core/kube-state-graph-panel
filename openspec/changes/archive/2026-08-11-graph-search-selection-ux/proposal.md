# Graph Search & Selection UX

## Why

Finding a specific resource in a multi-cluster graph currently requires either eyeballing a dense canvas or narrowing via Grafana template variables — and a variable change re-queries the backend and redraws the whole graph, destroying pan/zoom and the user's spatial memory. Separately, closing the node-detail panel force-clears the selection (highlight, focus fade, pinned card, and exported dashboard variables all vanish), because one state drives both.

## What Changes

- **In-panel search bar** (persistent, **top-right** of the canvas — same `right: 8` inset as the pinned hover card, stacked **above** pinned attributes): case-insensitive substring match, whitespace tokens AND-combined, over six node fields (`label`, `kind`, `namespace`, `cluster`, `application`, `ipAddress`). Nodes only — a hit's incident edges light up with it; edges are never hits themselves.
- **Miss fade**: while the query is non-empty, non-hit elements dim (class toggle only — no element removal, no layout run, no `computeVisibility` involvement). Mutually exclusive with the selection focus fade: search active → miss fade alone; query cleared → focus fade restored.
- **Viewport fit to hits**: debounced fit to the visible hit set (zoom capped at 1.5); clearing the query leaves the viewport where it is (no snapshot/restore).
- **Result dropdown** under the search bar (capped at 50 + "N more"): label + kind badge + matched-field subline. List open/closed is independent of the query string: **blur dismisses the list without clearing the query**; focus with a non-empty query reopens it. Activating a result **locates** it (expand collapsed ancestor chain — the only search action that mutates collapse state — **select + open detail like a canvas node tap** for detail-eligible nodes, fit to its closed neighborhood), **commits the result's `label` into the input**, and **closes the dropdown**.
- **Proxy hit**: a hit folded inside a collapsed container is represented visually by its outermost collapsed ancestor (lit, in the fit set). Typing never auto-expands; expanded containers stay expanded after the query clears.
- **Filter-hidden hits** (kind/edge/ingress filter): listed in the dropdown as disabled rows with an eye-slash marker — announced, never locatable, and the filter is never silently overridden.
- **Keyboard inside the search input**: `↑`/`↓` walk the list (skipping disabled rows), `Enter` locates the highlighted row (or immediately fits all hits when none is highlighted), `Esc` two-stage (clear query → blur). No global shortcut.
- **Canvas interaction clears search**: tapping a node / background / edge / cluster on the graph (GraphCanvas `onSelect`, not SearchBar) clears the active query and miss fade (viewport stays put); selection/deselection from that click still applies. Locate-from-dropdown is a separate path and still commits the result label.
- **Detail-panel close no longer clears the selection**: a new `detailOpen` UI state decouples panel visibility from `selectedNodeId`. Highlight, focus fade, pinned card, and variable export all persist after close; tapping the selected node reopens the panel (reusing the original `detailRequest` time — no refetch). Deselect remains background / edge / cluster-backplate tap only.
- Search state is ephemeral (`useState` in `KsgPanel`) — never written to panel options.
- Out of scope (explicitly dropped during design): hover/pinned-card coexistence changes, edge search, search-string persistence, global keyboard shortcut.

## Capabilities

### New Capabilities

- `graph-search`: the in-panel search capability — matching rules (hit), miss fade, viewport fit/restore, result dropdown, locate, proxy hit, filter-hidden announcement, and in-input keyboard behavior.

### Modified Capabilities

- `panel-rendering`: the "Node Detail 面板" requirement currently mandates that the cytoscape selection highlight stays in sync with the panel's open/close and that the close button closes-and-deselects. That changes: close hides the panel only; selection (highlight, focus fade, pinned tooltip) persists; tapping the selected node reopens the panel. The "互動與選取狀態" requirement gains the selection-independent `detailOpen` semantics.

## Impact

- **New feature folder** `src/features/graph-search/` (components + hooks + pure match/fade helpers, per feature-first layout).
- `src/panels/KsgPanel/KsgPanel.tsx`: new `searchQuery` + `detailOpen` state; `onClose` no longer routes through `handleSelect(null)`; detail-panel render gated on `detailOpen`.
- `src/features/graph-canvas/`: a miss-fade hook alongside `useSelectionFocus` (shared fade-class precedence rule); fit/restore viewport helpers on the cy instance; search-driven expand routed through the existing `collapsedIds` / `onCollapsedChange` chain.
- `src/features/hover-tooltip/`, `src/features/node-detail/` internals: untouched (hover proposal cancelled; panel content unchanged).
- `src/features/variable-export/`: no behavior change — exports now simply outlive a panel close because selection does.
- Specs: new `specs/graph-search/spec.md`; delta on `openspec/specs/panel-rendering/spec.md`.
- No backend, datasource, or dashboard-provisioning changes; no new dependencies.
