## Why

Locate currently commits the result's `label` back into the search input, so the search stays **active** after the user has already picked one node. `computeHits` then re-runs that label as a fresh query — case-insensitive substring across six fields — and the miss fade lights every node it matches, plus **all** of their incident edges, with the located node's focus neighborhood merely unioned on top instead of replacing it.

Measured against the showcase fixture: locating `pod/mongo-0` commits `mongo-0`, which also matches `pvc/data-mongo-0`, leaving `pvc/data-mongo-0 → prod/storageclass/fast-ssd` lit while `prod/storageclass/fast-ssd` itself is faded. Locating `pod/gateway` commits `gateway`, which also matches the whole `mesh-gateway` application, controller and pod: 20 nodes stay lit and `pod/mesh-gateway-0 → node/worker-1` is lit while `node/worker-1` is faded. The user picked one node and the graph still reads as a multi-hit search, with lit edges dangling into faded nodes.

## What Changes

- **BREAKING** (user-visible): locate **ends the search state**. `SearchBar.activateLocate` clears the query (`onQueryChange('')`) instead of committing `result.label`. The input is left empty, the result list closes, and the fade falls back to **focus fade** on the located node — locate becomes exactly "canvas left-click on that node, plus a fit".
- Locate's other steps are unchanged: expand the collapsed ancestor chain, select + open the detail panel when detail-eligible, fit to the closed neighborhood, keep expanded containers expanded.
- The **locate focus** concept is removed. With the query empty after locate, the `{ nodeId, query }` state in `KsgPanel` can never survive its own commit, so `locateFocus` / the `searchFocusNodeId` prop chain (`KsgPanel` → `GraphCanvas` → `useGraphFade`) is deleted rather than left unreachable.
- `useGraphFade`'s miss-fade branch loses the focus union and returns the hit-derived lit set alone. The mutual exclusivity of miss fade and focus fade is unchanged — it is what the fix now relies on.
- The carve-out in "Canvas interaction clears search" that exempted locate from the clear path is inverted: locate clears too, differing from a canvas tap only in that it also fits.
- **Miss fade lights each hit's focus neighborhood** (second bug, found during verification of the first): the old lit set (`hits ∪ hits.connectedEdges() ∪ hits.ancestors()`) lit a hit's incident edges but not the nodes at their far ends, so every multi-node match rendered lit edges dangling into faded 1-hop neighbours. Each hit now lights exactly what a canvas left-click on it would light (closed neighborhood + descendants + ancestors of those), computed by the same function as focus fade — a lit edge ending in a faded node becomes structurally impossible.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `graph-search`: four requirements change enough that their scenario sets no longer survive a MODIFIED block, so the delta removes and re-adds each under a name that matches the new behavior:
  - "Miss fade, mutually exclusive with focus fade" → "Miss fade over the hit set alone" (the locate-focus expansion of the lit set is gone)
  - "Locate (activating a result row)" → "Locate (activating a result row) ends the search" (step 4 clears the query instead of committing the label)
  - "Keyboard interaction inside the search input" → "… (arrows, Enter, Esc)" (`Enter`-locate no longer commits the label)
  - "Canvas interaction clears search" → "Canvas interaction and locate clear search" (locate is no longer exempt from the clear)

## Impact

- `src/features/graph-search/components/SearchBar/SearchBar.tsx` — `activateLocate` commits `''`.
- `src/panels/KsgPanel/KsgPanel.tsx` — drop the `locateFocus` state, its `setLocateFocus` calls in `handleCanvasSelect` / `handleQueryChange` / `handleLocate`, and the `searchFocusNodeId` prop.
- `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx` + `.types.ts` — drop the `searchFocusNodeId` prop.
- `src/features/graph-canvas/hooks/useGraphFade.ts` — drop `searchFocusNodeId` from `GraphFadeInput`; the miss-fade branch computes each hit's focus neighborhood via the same helper `focusSetFor` uses, so miss fade and focus fade share one lit-set definition.
- Tests: `useGraphFade.test.ts`, `GraphCanvas.test.tsx`, `KsgPanel.test.tsx`, `SearchBar.test.tsx`.
- `CONTEXT.md` — "Miss fade", "Hit" and "Locate" entries; the "Locate focus" entry is removed from the domain vocabulary.
- No change to `computeHits`, `resolveSearchHits`, `computeVisibility`, layout, or the backend wire contract.
