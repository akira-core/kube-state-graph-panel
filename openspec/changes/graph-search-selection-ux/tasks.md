# Tasks — graph-search-selection-ux

## 1. Selection / detail-open decoupling (panel-rendering delta)

- [ ] 1.1 `KsgPanel`: add `detailOpen` state; `handleSelect` (canvas tap) sets `selectedNodeId` + `detailOpen = true`; `onClose` sets only `detailOpen = false`; gate `NodeDetailPanel` render on `selectedNode !== null && detailOpen` (D1)
- [ ] 1.2 Verify `detailRequest` lifecycle stays selection-bound: reopen after close reuses the original `{ nodeId, time }` — assert stable `detailQueryInput` identity (no refetch) in a `KsgPanel` test
- [ ] 1.3 Tests: close-keeps-selection (highlight props, pinned tooltip, `useNodeClickExport` values persist after close); background/edge tap still clears everything; tap on already-selected node re-opens the panel

## 2. Shared ancestor-walk helper (D4)

- [ ] 2.1 Add `src/shared/graph/collapsedAncestors.ts`: `buildParentIndex(elements)` + `outermostCollapsedAncestor(...)` + full-chain variant for locate; unit tests (multi-level chains, cycle guard)
- [ ] 2.2 Migrate `hasCollapsedAncestor` / `resolveSelectedNode` call sites in `KsgPanel` to the shared helper; existing tests stay green

## 3. graph-search feature — pure logic (D2)

- [ ] 3.1 Scaffold `src/features/graph-search/` (barrel, types) per feature-first layout
- [ ] 3.2 `computeHits(elements, query)`: tokenize, six-field case-insensitive substring AND-match, defensive field reads; returns `{ hitIds, results }`; tests incl. multi-token cross-field, IP match, edge exclusion, empty/whitespace query
- [ ] 3.3 Post-process against `collapsedIds` + `visibility`: annotate results (`collapsedUnder`, `filterHidden`), substitute proxy-hit containers into lit/fit sets; tests (proxy substitution, filter-hidden exclusion from fit but presence in list)

## 4. Miss fade (D3)

- [ ] 4.1 `getStylesheet`: add `SEARCH_FADE_CLASS = 'ksg-search-miss'` to the existing fade style block (comma-joined selectors); update snapshot pinning both classes to one declaration
- [ ] 4.2 `useSearchFade` hook in `graph-canvas`: batch-apply class to non-lit elements (lit = hits ∪ incident edges ∪ ancestors ∪ proxy containers); headless-cy tests
- [ ] 4.3 `useSelectionFocus`: add `suppressed` prop — when true, clear `FADED_CLASS` and skip; wire `suppressed = searchQuery !== ''` through `GraphCanvas`; tests for precedence hand-off both directions (spec: miss fade exclusive while searching, focus fade restored on clear)

## 5. Viewport fit (D5)

- [ ] 5.1 `GraphCanvas` imperative viewport API: `fitToIds(ids)` + `fitToNeighborhood(id)` — filter to `.visible()`, `cy.animate({ fit }, 250)`, clamp zoom ≤ 1.5 re-centered; headless-cy tests (clamp, empty-set no-op, hidden-element exclusion)
- [ ] 5.2 Debounced (300 ms) fit-to-all-hits on query change; clearing the query leaves viewport in place (no snapshot/restore); zero-hit no-op

## 6. Search bar UI (D7)

- [ ] 6.1 `SearchBar` component: floating top-center `Input` (zIndex 1000 band), ephemeral `searchQuery` wiring from `KsgPanel`; partial-warning banner offsets below when both visible
- [ ] 6.2 `ResultList`: ≤50 rows + "N more", row = label + kind badge + context subline (matched field when not label; `in <container> (collapsed)` annotation); filter-hidden rows disabled + `eye-slash`, click no-op
- [ ] 6.3 Keyboard on input `onKeyDown` (+`stopPropagation`): ↑/↓ move `highlightedIndex` skipping disabled, Enter = locate highlighted / flush-fit-all when none, Esc two-stage (clear → blur); RTL tests for all paths
- [ ] 6.4 RTL tests: typing updates list, cap + "N more", disabled row rendering, refresh keeps query

## 7. Locate (D6)

- [ ] 7.1 `locate(result)` in `KsgPanel`: expand collapsed ancestor chain via `setCollapsedIds` shrink → existing reconciler; `setSelectedNodeId(id)` (NOT `handleSelect` — `detailOpen` stays false); `fitToNeighborhood` sequenced after collapse effect flush (rAF chain)
- [ ] 7.2 Tests: multi-level chain expands only that chain; locate selects without opening detail panel; expanded containers stay expanded after query clears

## 8. Verification & docs

- [ ] 8.1 Full gates: `npm run typecheck && npm run lint && npm run test:ci && npm run build`
- [ ] 8.2 Manual pass against docker demo (`npm run server`): type → fade + fit, locate collapsed pod, close-panel-keeps-selection, Esc stages, zero-hit overlay absence
- [ ] 8.3 `openspec validate graph-search-selection-ux` green; confirm CONTEXT.md terms match shipped identifiers (`computeHits`, `locate`, `SEARCH_FADE_CLASS`…)
