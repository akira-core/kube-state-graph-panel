# Tasks — unify-graph-fade

## 1. One fade hook (D1, D4)

- [x] 1.1 Add `src/features/graph-canvas/hooks/useGraphFade.ts`: exported `focusSetFor(cy, nodeId)` (the single definition of a focus neighborhood, `null` when the node is off canvas), module-local `litSet(cy, input)`, `applyGraphFade(cy, input)`, `useGraphFade(props)`
- [x] 1.2 Resolve the lit set BEFORE `cy.batch()` — `.visible()` inside a batch reads deferred style and caches an invisible answer (D4); batch only the class mutations
- [x] 1.3 Build the hit collection in one `cy.nodes().filter(...)` pass instead of a per-id `union` accumulator
- [x] 1.4 Delete `useSelectionFocus.ts` / `useSearchFade.ts` (+ their tests); state the "declared after `useElementFilter`" ordering requirement once, on `useGraphFade`
- [x] 1.5 `getStylesheet.ts`: drop `SEARCH_FADE_CLASS`; collapse both fade selectors to `FADED_CLASS`; update the snapshot

## 2. Locate focus (D2, D3)

- [x] 2.1 `GraphCanvasProps`: add `searchFocusNodeId`; document that `selectedId` drives the focus fade and does NOT feed the miss fade
- [x] 2.2 `GraphCanvas`: single `useGraphFade` call wired to `selectedId` / `searchActive` / `searchLitNodeIds` / `searchFocusNodeId`
- [x] 2.3 `KsgPanel`: `locateFocus: { nodeId, query } | null`; set in `handleLocate`; `handleQueryChange` keeps it only while the query still equals the committed label; `handleCanvasSelect` clears it
- [x] 2.4 Skip the lit-set expansion entirely for a zero-hit query (D3)

## 3. Tests

- [x] 3.1 `useGraphFade.test.ts`: focus-fade suite + miss-fade suite on a `styleEnabled: true` instance (the old fixtures ran with styling off, where `.visible()` short-circuits to `true`); every instance destroyed
- [x] 3.2 Regression: zero-hit query fades everything with a selection live, and again with a locate focus live
- [x] 3.3 Regression: a selection carried in from before the query does not light its neighborhood
- [x] 3.4 `GraphCanvas.test.tsx`: `searchFocusNodeId` is wired (deleting the prop must fail a test); `selectedId` alone does not light while searching
- [x] 3.5 `KsgPanel.test.tsx`: typing leaves `searchFocusNodeId` null, locate sets it, editing the query drops it, a pre-search selection never becomes it

## 4. Docs / specs

- [x] 4.1 `CONTEXT.md`: rewrite **Miss fade**, add **Locate focus**, note that **Focus fade** shares the class
- [x] 4.2 `openspec/specs/graph-search/spec.md`: scope the lit-set expansion to the locate focus; add the two new scenarios; state the zero-hit rule; update the Locate requirement
- [x] 4.3 This change folder (`proposal.md` / `design.md` / delta spec / `tasks.md`), recording D1 and D5 as superseding the archived `graph-search-selection-ux` design notes

## 5. Verification

- [x] 5.1 `npm run lint` clean
- [x] 5.2 `npm run typecheck` clean
- [x] 5.3 `npm run test:ci` green
