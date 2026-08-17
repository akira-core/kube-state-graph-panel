## 1. SearchBar — locate clears the query (TDD)

- [x] 1.1 Write a failing test in `SearchBar.test.tsx`: clicking a non-disabled result row calls `onQueryChange` with `''` (not the result label), and `onLocate` is called with that result **before** the clear
- [x] 1.2 Write a failing test that `Enter` on a highlighted row does the same (locate + clear + list closed), and that `Enter` with no highlighted row still flushes fit-to-all without clearing
- [x] 1.3 Write a failing test that after locate the result list stays closed even though the query is now empty (empty query already closes it — assert no reopen on the same render)
- [x] 1.4 Change `activateLocate` to call `onQueryChange('')` after `onLocate(result)`, keeping the existing `setListOpen(false)` / `setHighlightedIndex(-1)` ordering and the direct-`onQueryChange` (not `handleQueryChange`) call so the list is not reopened
- [x] 1.5 Update the comment above `activateLocate` — it currently documents committing the label
- [x] 1.6 Run `npx jest src/features/graph-search` — new tests green, pre-existing SearchBar / ResultList tests still green

## 2. useGraphFade — drop the locate-focus union (TDD)

- [x] 2.1 Rewrite the `searchFocusNodeId` cases in `useGraphFade.test.ts`: delete the tests asserting a located node widens the miss-fade lit set; add a test that with `searchActive: true` the lit set is exactly hits ∪ their incident edges ∪ their ancestors regardless of `selectedId`
- [x] 2.2 Add a failing test for the reported bug shape: two hits whose labels overlap, `selectedId` = one of them, `searchActive: false` → only that node's focus set is lit and the other former hit's incident edges are faded
- [x] 2.3 Keep the existing zero-hit test (empty lit set fades the whole graph) and the "selection from before the search stays faded" test passing unchanged
- [x] 2.4 Remove `searchFocusNodeId` from `GraphFadeInput`; collapse `litSet`'s miss branch to return `hits.union(hits.connectedEdges()).union(hits.ancestors())` unconditionally
- [x] 2.5 Update the hook's doc comments: the header block, the `GraphFadeInput` field docs, and the note explaining why `focusSetFor` is shared — `focusSetFor` itself stays exported and unchanged
- [x] 2.6 Run `npx jest src/features/graph-canvas/hooks/useGraphFade.test.ts` — all green

## 3. Prop-chain removal

- [x] 3.1 Remove `searchFocusNodeId` from `GraphCanvas.types.ts` (prop + its doc comment) and from the `useGraphFade` call in `GraphCanvas.tsx`
- [x] 3.2 Update `GraphCanvas.test.tsx` — drop the `searchFocusNodeId` cases; keep coverage that `searchLitNodeIds` still drives miss fade and that omitting it falls back to the stable empty set
- [x] 3.3 Remove `KsgPanel`'s `locateFocus` state, its `setLocateFocus` calls in `handleCanvasSelect` / `handleQueryChange` / `handleLocate`, and the `searchFocusNodeId` prop passed to `GraphCanvas`; `handleQueryChange` collapses to `setSearchQuery`
- [x] 3.4 Update `KsgPanel.test.tsx` — replace the locate-focus assertions with: after locate the search input is empty, the located node is selected, and the detail panel opened for a detail-eligible node
- [x] 3.5 Run `npx jest src/panels/KsgPanel src/features/graph-canvas` — all green

## 4. Integration check against the reported bug

- [x] 4.1 Add a KsgPanel-level test using a fixture with overlapping labels (a `gateway` pod plus a `mesh-gateway` application/controller/pod): type `gateway`, assert multiple hits are lit, then locate the `gateway` pod and assert only its focus neighborhood is lit — specifically that the `mesh-gateway` pod's `pod-to-node` edge is faded (GraphCanvas is mocked at this layer, so the FADED_CLASS check itself lives in `useGraphFade.test.ts`; this test proves KsgPanel feeds it the narrowed input — see the in-test comment)
- [x] 4.2 Confirm the fit still runs on locate (the existing viewport-api assertion) and that clearing the query did not cancel it

## 5. Documentation

- [x] 5.1 `CONTEXT.md` — rewrite "Miss fade" (lit set no longer includes a locate focus), rewrite "Locate" (step 4 clears the query; locate ends the search state), and remove the "Locate focus" entry
- [x] 5.2 Check `openspec/changes/unify-graph-fade/` is not contradicted in a way that needs a note; if its design references the locate focus as current behavior, leave the archived rationale intact and rely on this change's delta

## 6. Verification (first bug — locate ends search)

- [x] 6.1 Run `npm run lint` and `npm run typecheck` — both clean, zero warnings
- [x] 6.2 Run `npm run test:ci` — full suite green
- [x] 6.3 Run `npm run build` — production build succeeds (pre-existing bundle-size warnings only)
- [x] 6.4 Browser-verify on the offline showcase (`docker compose up -d`, `/d/ksg-switch-demo`): search `gateway`, locate the `gateway` pod, confirm the input is empty, the `mesh-gateway` group and `node/worker-1` are faded, and no lit edge ends in a faded node; repeat with `mongo-0` and confirm `pvc/data-mongo-0 → prod/storageclass/fast-ssd` is faded
- [x] 6.5 Run `/opsx:verify` and reconcile any spec/implementation divergence before archiving (clean — see verification report; one pre-existing, out-of-scope scenario noted, not blocking)

## 7. Miss fade lights each hit's focus neighborhood (TDD — second bug, same change)

- [x] 7.1 Rewrite the miss-fade expectations in `useGraphFade.test.ts`: a hit's 1-hop neighbour node now stays lit with the connecting edge (was: "INCLUDING a non-hit neighbour" faded); the proxy-container case lights the container's own neighbours; the stale-selection case re-derives its expected faded set under neighborhood semantics
- [x] 7.2 Add a test that no lit edge ends in a faded node (multi-hit fixture, assert over every unfaded edge), and a test that a hit container's descendants stay lit
- [x] 7.3 Extract the shared focus-set helper over a node collection in `useGraphFade.ts`; `focusSetFor` (single node, visibility-guarded) and the miss branch (hit collection) both call it (design D6)
- [x] 7.4 Keep zero-hit structural: empty hit collection → empty lit set → whole graph fades (existing tests must pass unchanged)
- [x] 7.5 Update `CONTEXT.md` "Miss fade" (per-hit lit set = focus neighborhood) and "Hit" (a hit lights its focus neighborhood, not just incident edges)
- [x] 7.6 Run `npx jest src/features/graph-canvas src/panels/KsgPanel` — all green

## 8. Re-verification (both bugs together)

- [x] 8.1 Re-run `npm run lint`, `npm run typecheck`, `npm run test:ci`, `npm run build` — all clean
- [x] 8.2 Browser re-verify miss fade on the offline showcase: type `mongo` (multi-hit), confirm every hit's 1-hop neighbours are lit and no lit edge ends in a faded node; then locate one hit and confirm the first fix still holds (input empty, single focus neighborhood)
- [x] 8.3 `openspec validate locate-ends-search --strict` passes after the artifact updates
