# Design — graph-search-selection-ux

## Context

Motivation: see `proposal.md` — Why. Behavior contracts: `specs/graph-search/spec.md` + `specs/panel-rendering/spec.md` (delta). Terms (`hit` / `miss fade` / `proxy hit` / `locate` / `filter-hidden` / `selection` / `detail open`) are defined in root `CONTEXT.md` — code identifiers follow them.

Current state that shapes the design:

- `selectedNodeId` in `KsgPanel` drives four consumers at once (detail panel via `resolveSelectedNode`, cy highlight via `selectSingle`, focus fade via `useSelectionFocus`, pinned card + variable export). Close button routes `onClose={() => handleSelect(null)}` — the coupling this change breaks.
- Fading already has one mechanism: `FADED_CLASS = 'ksg-faded'` (`getStylesheet.ts:26`) applied imperatively in `cy.batch()` by `applySelectionFocus`. Filter hiding is a separate mechanism (`useElementFilter` sets `style('visibility')`). Search must join the *class* mechanism, never the visibility one.
- Collapse state lives in `KsgPanel` (`collapsedIds: Set<string>`) and is applied by `useExpandCollapse` reconciling the cy instance via `cytoscape-expand-collapse`; programmatic changes route through `onCollapsedChange`. Layout reruns are token-gated (`useLayoutRunToken`): collapse-set changes fold/unfold in place, no global relayout.
- Controller mode default-collapses all controllers on entry — collapsed-hit handling (proxy hit) is the common case, not an edge case.
- Strict TS: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Feature-first layout; cross-feature imports only via barrels.

## Goals / Non-Goals

**Goals:**

- Zero layout perturbation while typing: search touches only classes, viewport, and the DOM dropdown.
- One fade authority at a time: a single precedence rule decides whether the canvas shows miss fade or focus fade.
- Reuse existing plumbing (collapse chain, selection mirror, fade class infra) — no parallel state machines.

**Non-Goals:**

- Hover/pinned coexistence changes (cancelled during design), edge search, query persistence, global shortcuts, fuzzy/regex matching (all recorded out-of-scope in proposal).
- Virtualized dropdown rendering — 50-row cap makes it unnecessary.

## Decisions

### D1 — State model: `searchQuery` + `detailOpen` in `KsgPanel`; hits derived

Two new `useState` in `KsgPanel`: `searchQuery: string`, `detailOpen: boolean`. Hits are **derived** (`useMemo`) from `(elements, searchQuery, visibility, collapsedIds)` — never stored. Alternatives: state in `GraphCanvas` (rejected: locate needs `setSelectedNodeId` and collapse state, both live in `KsgPanel`; callbacks would tunnel two layers); a context/store (rejected: repo convention is local state + props).

`handleSelect(id)` is the core selection path: sets `selectedNodeId` and `detailOpen = true` when `id !== null` (re-tap of the already-selected node re-opens); `id === null` clears selection + detail. `onClose` sets only `detailOpen = false`.

**Canvas vs locate wiring (search clear):**

- `handleCanvasSelect(id)` — used as GraphCanvas `onSelect`: if `searchQuery` is non-empty, **`setSearchQuery('')` first** (same effects as Esc-clear: miss fade off, list closes via empty query, viewport stays put), then `handleSelect(id)`. Covers node / background / edge / cluster-backplate taps.
- `handleLocate` — expand chain, then `handleSelect(id)` **without** clearing search; SearchBar still commits `result.label` + closes the list. Locate must not go through `handleCanvasSelect` or the committed label would race a forced empty clear.
- Detail close button and legend toggles do not clear search.

Non–detail-eligible nodes follow `resolveSelectedNode` rules (e.g. namespace → no panel). `NodeDetailPanel` renders on `selectedNode !== null && detailOpen`. `detailRequest` keeps its lifecycle tied to selection (unchanged code path) — reopen reuses it, satisfying the no-refetch requirement for free.

### D2 — Match: pure function in `src/features/graph-search/`

`computeHits(elements, query): { hitIds: Set<string>, results: SearchResult[] }` — pure, straight-Jest-testable, mirroring `computeVisibility`'s shape. Tokenize on whitespace, lowercase once, `every(token => fields.some(f => f.includes(token)))` over the six fields read from `NodeDataDefinition`. `SearchResult` carries `{ id, label, kind, matchedField?, context }` for the dropdown. Fields are read defensively (`typeof === 'string'`) — free-form `GraphNodeKind` data means nothing is guaranteed.

### D3 — Miss fade: second class, one authority

New `SEARCH_FADE_CLASS = 'ksg-search-miss'` in `getStylesheet` reusing the same style declarations as `FADED_CLASS` (same selectors block, comma-joined — one visual fade, two orthogonal reasons). A `useSearchFade` hook in `graph-canvas` applies it in `cy.batch()`, computing the lit set: hit nodes ∪ their incident edges ∪ ancestors ∪ proxy-hit containers. Precedence lives where the fades are applied: `useSelectionFocus` gains a `suppressed: boolean` prop (true while query non-empty) — when suppressed it clears `FADED_CLASS` and does nothing else. Alternative — merging both fades into one hook — rejected: `useSelectionFocus` is stable, tested, and semantically distinct; a boolean gate is the smallest honest coupling.

Filter interplay: fade classes and `visibility` styles are independent layers; a filter-hidden element can carry the miss-fade class harmlessly (it's invisible anyway), so `useSearchFade` does not need to consult `visibility` for correctness — only the fit set does.

### D4 — Proxy hit resolution: shared ancestor walk

Extract the parent-chain walk from `hasCollapsedAncestor` (`KsgPanel.tsx:133`) into a shared helper (`src/shared/graph/`): `outermostCollapsedAncestor(parentById, id, collapsedIds): string | null` plus a `buildParentIndex(elements)` memo. `computeHits` output is post-processed against `collapsedIds` to annotate results (`collapsedUnder: containerId`) and to substitute proxy containers into the lit/fit sets. `KsgPanel`'s existing call sites migrate to the shared helper (single source, no drift).

### D5 — Fit: imperative viewport commands via a ref bridge

Fit must run on the cy instance but is triggered by panel-level state (debounced query, Enter, locate). Mechanism: `GraphCanvas` exposes an imperative handle (`useImperativeHandle` on a forwarded ref, or a callback-ref prop `onViewportApi`) with two commands: `fitToIds(ids: string[])` and `fitToNeighborhood(id: string)`. Both filter to `.visible()` elements, run `cy.animate({ fit }, { duration: 250 })`, then clamp `zoom > 1.5` → re-center at 1.5. Debounce (300 ms) lives in the search bar component, not the hook — Enter-to-fit-now is then just "flush". No snapshot/restore: clearing the query leaves the viewport in place (user decision; also removes an entire class of restore-vs-user-pan conflicts). Alternative — lifting `cyRef` up to `KsgPanel` — rejected: it breaks the "cy instance owned by graph-canvas" boundary every other feature respects.

### D6 — Locate: compose existing channels, no new machinery

Locate(result) in `KsgPanel`: (1) walk the parent index for collapsed ancestors of the id, `setCollapsedIds(prev => prev minus chain)` — `useExpandCollapse` reconciliation expands them, exactly like a legend collapse-all toggle would; (2) **select + open detail like a canvas tap** — call `handleSelect(id)` (or equivalent: `selectedNodeId` + `detailOpen = true`) so detail-eligible nodes open `NodeDetailPanel`; (3) `fitToNeighborhood(id)` after the expand has applied — sequenced by effect on `collapsedIds` application or a `requestAnimationFrame` chain; the design accepts one-frame latency rather than adding an expand-completion callback API. Filter-hidden rows never reach locate. SearchBar still commits `result.label` and closes the list after calling `onLocate`.

### D7 — Search bar UI: new feature folder, Grafana primitives

`src/features/graph-search/components/SearchBar/` (+ `ResultList/`): `@grafana/ui` `Input` with search icon, absolutely positioned at the **canvas top-right** — same inset as the pinned hover card (`right: 8`, top near/flush with the panel edge; **no** horizontal center). `zIndex` above the expand-collapse overlay canvas at 999, below Grafana chrome ≥ 1030 — same band as the legend expand button / pinned tooltip (search may sit at the same band or slightly above pinned so the input stays clickable). Dropdown is a plain scrollable list (`maxHeight: 40%` of canvas), rows per spec (label + kind badge + context subline; disabled rows with `eye-slash` `Icon`).

**Stacking with pinned attributes:** the search bar is always visible; the pinned hover-tooltip card docks **below** it (`top` = search bar height + gap, `right: 8`). Implement by adjusting `PINNED_STYLE` in `HoverTooltip` and/or a small top offset constant shared/documented with SearchBar height — search on top, attributes under it, never overlapping. Floating (non-pinned) hover placement is unchanged.

**Result-list open state (`listOpen`)** lives in `SearchBar` as local UI state, independent of `searchQuery`:

| Event | Effect on `listOpen` |
| --- | --- |
| User changes query to non-empty | `true` |
| Input focus while query non-empty | `true` |
| Input blur | `false` (query / miss fade / selection unchanged) |
| Successful locate (click or Enter on a non-disabled row) | `false`; also `onQueryChange(result.label)` — **label only** |
| Query becomes empty (Esc clear / clear control) | `false` |

List renders only when `query.trim() !== '' && listOpen`. Locate still runs expand → select/open-detail → fit (D6); committing the label may recompute hits for that string, but the list stays closed until the user types again or re-focuses.

**Blur vs. row click:** result rows MUST `preventDefault` on `mousedown` (or equivalent) so the input does not blur before `click`/`locate` fires. Keyboard handling stays on the input's `onKeyDown` with `stopPropagation`; `highlightedIndex` skips disabled rows. The partial-parse warning banner stays **top-left** (search is top-right) so the two do not compete for the same corner.

### D8 — Testing strategy

- `computeHits`, proxy-hit resolution, disabled-row skip logic: pure Jest.
- `useSearchFade`, fit clamp, suppressed `useSelectionFocus`: headless cytoscape + `renderHook` (layout stubbed per repo convention).
- `SearchBar`/`ResultList`: RTL component tests (typing, keyboard nav, Esc stages, locate commits label + closes list, blur hides list / focus reopens).
- `KsgPanel` integration: close-keeps-selection, reopen-no-refetch (assert stable `detailQueryInput` identity), **locate-opens-detail-panel** for detail-eligible nodes, canvas tap clears search while locate still commits label.


## Risks / Trade-offs

- [Two fade classes could drift visually] → single style block in `getStylesheet` serves both selectors; snapshot test pins them together.
- [Large hit sets (e.g. query `p`) fade almost nothing and fit to the whole graph] → accepted: dropdown + "N more" carries the signal; fit-to-everything ≈ `cy.fit()`, harmless. No minimum-query-length gate (would special-case CJK/short names).
- [Locate's expand → fit sequencing races the reconciler] → fit waits for the `collapsedIds` effect to flush (rAF chain); worst case the neighborhood fit centers on a just-expanded box mid-animation — cosmetic, self-corrects on animation end.
- [`stopPropagation` on Esc may still collide with Grafana's global key handling in some embed contexts] → keydown handled at the input (capture-free), verified manually in the docker demo; no global listeners added, so blast radius is the focused input only.
- [Suppressing focus fade while searching surprises a user who selected first] → the selection ring (`:selected`) never fades and stays visible; spec documents the precedence.

## Migration Plan

Pure frontend, additive; no options schema change, no dashboard JSON migration, no backend/datasource change. Ships in one release; revert = revert the commits. Existing dashboards behave identically until the user types in the search bar (the only pre-existing behavior change — close button preserving selection — is strictly less destructive than before).

## Open Questions

None — all decisions above were settled with the user during the grilling session (including the cancelled hover-coexistence scope and the dropped viewport restore).
