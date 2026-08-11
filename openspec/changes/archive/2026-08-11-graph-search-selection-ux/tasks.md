# Tasks — graph-search-selection-ux

## 1. Selection / detail-open decoupling (panel-rendering delta)

- [x] 1.1 `KsgPanel`: add `detailOpen` state; `handleSelect` (canvas tap) sets `selectedNodeId` + `detailOpen = true`; `onClose` sets only `detailOpen = false`; gate `NodeDetailPanel` render on `selectedNode !== null && detailOpen` (D1)
- [x] 1.2 Verify `detailRequest` lifecycle stays selection-bound: reopen after close reuses the original `{ nodeId, time }` — assert stable `detailQueryInput` identity (no refetch) in a `KsgPanel` test
- [x] 1.3 Tests: close-keeps-selection (highlight props, pinned tooltip, `useNodeClickExport` values persist after close); background/edge tap still clears everything; tap on already-selected node re-opens the panel

## 2. Shared ancestor-walk helper (D4)

- [x] 2.1 Add `src/shared/graph/collapsedAncestors.ts`: `buildParentIndex(elements)` + `outermostCollapsedAncestor(...)` + full-chain variant for locate; unit tests (multi-level chains, cycle guard)
- [x] 2.2 Migrate `hasCollapsedAncestor` / `resolveSelectedNode` call sites in `KsgPanel` to the shared helper; existing tests stay green

## 3. graph-search feature — pure logic (D2)

- [x] 3.1 Scaffold `src/features/graph-search/` (barrel, types) per feature-first layout
- [x] 3.2 `computeHits(elements, query)`: tokenize, six-field case-insensitive substring AND-match, defensive field reads; returns `{ hitIds, results }`; tests incl. multi-token cross-field, IP match, edge exclusion, empty/whitespace query
- [x] 3.3 Post-process against `collapsedIds` + `visibility`: annotate results (`collapsedUnder`, `filterHidden`), substitute proxy-hit containers into lit/fit sets; tests (proxy substitution, filter-hidden exclusion from fit but presence in list)

## 4. Miss fade (D3)

- [x] 4.1 `getStylesheet`: add `SEARCH_FADE_CLASS = 'ksg-search-miss'` to the existing fade style block (comma-joined selectors); update snapshot pinning both classes to one declaration
- [x] 4.2 `useSearchFade` hook in `graph-canvas`: batch-apply class to non-lit elements (lit = hits ∪ incident edges ∪ ancestors ∪ proxy containers); headless-cy tests
- [x] 4.3 `useSelectionFocus`: add `suppressed` prop — when true, clear `FADED_CLASS` and skip; wire `suppressed = searchQuery !== ''` through `GraphCanvas`; tests for precedence hand-off both directions (spec: miss fade exclusive while searching, focus fade restored on clear)

## 5. Viewport fit (D5)

- [x] 5.1 `GraphCanvas` imperative viewport API: `fitToIds(ids)` + `fitToNeighborhood(id)` — filter to `.visible()`, `cy.animate({ fit }, 250)`, clamp zoom ≤ 1.5 re-centered; headless-cy tests (clamp, empty-set no-op, hidden-element exclusion)
- [x] 5.2 Debounced (300 ms) fit-to-all-hits on query change; clearing the query leaves viewport in place (no snapshot/restore); zero-hit no-op

## 6. Search bar UI (D7)

- [x] 6.1 `SearchBar` component: floating top-center `Input` (zIndex 1000 band), ephemeral `searchQuery` wiring from `KsgPanel`; partial-warning banner offsets below when both visible
- [x] 6.2 `ResultList`: ≤50 rows + "N more", row = label + kind badge + context subline (matched field when not label; `in <container> (collapsed)` annotation); filter-hidden rows disabled + `eye-slash`, click no-op
- [x] 6.3 Keyboard on input `onKeyDown` (+`stopPropagation`): ↑/↓ move `highlightedIndex` skipping disabled, Enter = locate highlighted / flush-fit-all when none, Esc two-stage (clear → blur); RTL tests for all paths
- [x] 6.4 RTL tests: typing updates list, cap + "N more", disabled row rendering, refresh keeps query

## 7. Locate (D6)

- [x] 7.1 `locate(result)` in `KsgPanel`: expand collapsed ancestor chain via `setCollapsedIds` shrink → existing reconciler; `setSelectedNodeId(id)` (NOT `handleSelect` — `detailOpen` stays false); `fitToNeighborhood` sequenced after collapse effect flush (rAF chain)
- [x] 7.2 Tests: multi-level chain expands only that chain; locate selects without opening detail panel; expanded containers stay expanded after query clears

## 8. Verification & docs

- [x] 8.1 Full gates: `npm run typecheck && npm run lint && npm run test:ci && npm run build`
- [x] 8.2 Manual pass against docker demo (`npm run server`): type → fade + fit, locate collapsed pod (opens detail), close-panel-keeps-selection, Esc stages, zero-hit overlay absence; top-right search above pinned attrs, locate commits label + closes list, blur hides list / focus reopens; canvas tap while searching clears query + miss fade
- [x] 8.3 `openspec validate graph-search-selection-ux` green; confirm CONTEXT.md terms match shipped identifiers (`computeHits`, `locate`, `SEARCH_FADE_CLASS`…)

## 9. Search bar UX polish (post-implement feedback)

- [x] 9.1 Position `SearchBar` flush to the panel top edge (`top: 0`, zero top inset), horizontally centered; still absolute over the canvas (no layout shrink)
- [x] 9.2 On successful locate (click or Enter on a non-disabled row): set query to the result's `label` only and dismiss the result list (`listOpen = false`); keep expand / select / fit behavior
- [x] 9.3 On search input blur: hide the result list without clearing the query; on focus with non-empty query: reopen the list; typing a non-empty query while focused opens the list
- [x] 9.4 Result row `mousedown` `preventDefault` (or equivalent) so blur does not swallow the locate click
- [x] 9.5 RTL tests: locate commits label + closes list; blur hides list / focus reopens; Esc clear closes list
- [x] 9.6 Re-run `npm run typecheck && npm run lint && npm run test:ci` for the polish delta

## 10. Locate opens detail panel (act as canvas node click)

- [x] 10.1 `handleLocate`: after expand chain, open detail like canvas tap (`detailOpen = true` / reuse `handleSelect`) + keep fit; SearchBar still commits label + closes list
- [x] 10.2 Tests: locate opens NodeDetailPanel for detail-eligible nodes; filter-hidden still no-op; non–detail-eligible (e.g. namespace) still no panel
- [x] 10.3 Re-run typecheck / lint / test:ci for the locate-detail delta

## 11. Search bar top-right above pinned attributes

- [x] 11.1 Reposition `SearchBar` to canvas top-right (`right: 8`, like pinned; near/flush top edge; right-aligned, not centered)
- [x] 11.2 Offset pinned hover-tooltip below the search bar so the two never overlap
- [x] 11.3 Adjust partial-warning if needed (stay top-left vs right search)
- [x] 11.4 Tests / style smoke: bar is top-right; with selection, pinned card sits under search
- [x] 11.5 Re-run typecheck / lint / test:ci for the layout delta

## 12. Canvas interaction clears search

- [x] 12.1 Wire GraphCanvas `onSelect` through `handleCanvasSelect` that clears `searchQuery` when non-empty, then `handleSelect`; keep `handleLocate` on `handleSelect` only (no canvas-clear)
- [x] 12.2 Tests: canvas node/background tap clears query + miss fade; locate still commits label and does not force-empty
- [x] 12.3 Re-run typecheck / lint / test:ci for the clear-on-canvas delta
