# Unify Graph Fade

## Why

`graph-search-selection-ux` shipped miss fade as a second fade hook (`useSearchFade`) alongside `useSelectionFocus`, kept apart by a `suppressed` boolean. A follow-up tweak then tried to make locating a result light its 1-hop neighbours by passing `selectedId` into the miss fade — and that exposed the cost of the split:

- **A stale selection lit an unrelated island.** The union was gated on `selectedId !== null`, but closing the detail panel deliberately keeps the selection. Select `gateway`, close the panel, type `mongodb` — and `gateway` plus every neighbour stayed fully lit next to the real hits, reading as matches.
- **A zero-hit query stopped fading the whole graph.** With any selection live, the lit set was non-empty, so the canvas kept a lit island while the result list said "no results" — contradicting two existing spec scenarios.
- **The focus-set algebra was copy-pasted** between the two hooks, so "what is a focus neighborhood" had two definitions to keep in step — precisely the drift the tweak was trying to fix.

Underneath all three: two hooks, two style classes with one shared declaration, and a boolean gate exist to produce **one** visual dimming. Mutual exclusivity was an invariant two hooks had to honour rather than a property of the design.

A separate latent bug surfaced while testing: both hooks read `.visible()` **inside** `cy.batch()`, where cytoscape defers style application — an element whose style has not been computed yet reads back as invisible, and that answer is cached. The old tests could not catch it because their cytoscape fixtures ran with `styleEnabled` off, where `.visible()` short-circuits to `true`.

## What Changes

- **One fade hook.** `useSelectionFocus` + `useSearchFade` → `useGraphFade`, computing one lit set from one input: focus fade around the selection while no query is active, miss fade around the hits while one is. The `suppressed` gate is gone; mutual exclusivity is now structural.
- **One style class.** `SEARCH_FADE_CLASS` (`ksg-search-miss`) is removed; `FADED_CLASS` (`ksg-faded`) carries both reasons, which is what the shared opacity declaration already implied. "Focus fade" and "miss fade" remain distinct domain terms for *why* something dims.
- **Locate focus replaces "the selection while searching".** A new `searchFocusNodeId` prop names the node the user **located for the current query** — the only selection that expands the miss-fade lit set. `KsgPanel` tracks it as `{ nodeId, query }`, so any query edit invalidates it without depending on the order in which `SearchBar` fires `onLocate` / `onQueryChange`.
- **A zero-hit query always fades everything**, locate focus or not.
- **Lit set resolved before `cy.batch()`**, so `.visible()` reads current style instead of a deferred (and cached) `false`.
- **Efficiency**: hits resolve in one `cy.nodes().filter(...)` pass instead of a per-id `union` accumulator, which copied and re-deduped the collection on every iteration (the spec allows 120+ hits, re-run per keystroke).

## Capabilities

### Modified Capabilities

- `graph-search`: the "Miss fade, mutually exclusive with focus fade" requirement scoped the lit-set expansion to any selection; it now scopes it to the **locate focus**, states that a pre-existing selection stays faded, and states that a zero-hit query fades the whole graph unconditionally. The "Locate a result" requirement names the locate focus and its lifetime.

## Impact

- `src/features/graph-canvas/hooks/useGraphFade.ts` (new, replaces `useSelectionFocus.ts` + `useSearchFade.ts`); `focusSetFor` is exported from it as the single definition of a focus neighborhood.
- `src/features/graph-canvas/styles/getStylesheet.ts`: `SEARCH_FADE_CLASS` removed; both fade selectors collapse to `FADED_CLASS` (snapshot updated).
- `src/features/graph-canvas/components/GraphCanvas/`: one hook call; new `searchFocusNodeId` prop; `selectedId`'s doc comment now states its fade role.
- `src/panels/KsgPanel/KsgPanel.tsx`: `locateFocus` state, a `handleQueryChange` wrapper that invalidates it, and `setLocateFocus(null)` on canvas select.
- No backend, datasource, dashboard-provisioning, or dependency changes. No behavior change to filtering, layout, collapse, or the detail panel.
