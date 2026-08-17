# Design — unify-graph-fade

## Context

Behavior contract: `specs/graph-search/spec.md` (delta on the `graph-search` capability). Terms (`focus fade`, `miss fade`, `locate`, `locate focus`, `hit`, `proxy hit`, `selection`) are defined in root `CONTEXT.md`; code identifiers follow them.

State this change starts from, all of it landed by `2026-08-11-graph-search-selection-ux`:

- `applySelectionFocus(cy, selectedId, suppressed)` applies `FADED_CLASS` around the selection's focus neighborhood, and clears without applying when `suppressed` (search active).
- `applySearchFade(cy, litNodeIds, active)` applies `SEARCH_FADE_CLASS` around the hit set. The two classes share one opacity declaration via a comma-joined selector.
- `KsgPanel` owns `searchQuery` and `selectedNodeId`. Selection deliberately outlives the detail panel's close; a canvas tap clears the query, but locate must not (it commits the result label instead).

## Goals / Non-Goals

**Goals**

- Locating a result lights its 1-hop neighbours, so locate and canvas-click read the same.
- A selection the user made *before* searching never lights anything while a query is active.
- A zero-hit query fades the whole graph, unconditionally.
- One definition of "focus neighborhood", one definition of "what is lit", one style class.

**Non-Goals**

- Changing what counts as a hit, the proxy-hit rule, the fit/zoom behavior, or the result list.
- Changing filtering (`computeVisibility` / `useElementFilter`) or the collapse pipeline.
- Making the fade animated or configurable.

## Decisions

### D1 — Merge the two fade hooks (supersedes `graph-search-selection-ux` design D3)

The archived design chose to keep the fades apart: *"`useSelectionFocus` is stable, tested, and semantically distinct; a boolean gate is the smallest honest coupling."* That reasoning held while miss fade was purely hit-driven. It stopped holding the moment miss fade had to reproduce a focus neighborhood too: the "smallest honest coupling" then meant duplicated set algebra in two files, and mutual exclusivity — a MUST in the spec — stayed an invariant two hooks had to remember rather than something the code made impossible to violate.

`useGraphFade` computes one lit set:

```
searchActive  →  hits ∪ hits.connectedEdges ∪ hits.ancestors
                 ∪ (hits non-empty ∧ locate focus visible ? focusSetFor(locateFocus) : ∅)
otherwise     →  selectedId === null ? NOTHING_FADES : focusSetFor(selectedId)
```

and applies `FADED_CLASS` to `cy.elements().difference(lit)`. `null` is the distinct "fade nothing" answer — different from an empty collection, which fades everything and is what a zero-hit query must produce.

The two classes collapse into one. They always carried the same declaration; two names only made sense as two application paths, and there is now one. `focus fade` / `miss fade` survive as domain vocabulary for the *reason*, which is where the distinction was always useful.

### D2 — Locate focus, not "the selection while searching"

Passing `selectedId` into the miss fade is wrong because the panel deliberately keeps a selection alive across a detail-panel close, and across the start of a search. What locate wants to say is narrower: *this node is what the current query is showing.*

`KsgPanel` stores `locateFocus: { nodeId, query } | null` rather than a bare id:

- `handleLocate` sets `{ nodeId: result.id, query: result.label }` — the label `SearchBar` is about to commit into the input.
- `handleQueryChange` keeps it only while `prev.query === next`, so typing past the label, replacing the query, or clearing it all drop the focus.
- `handleCanvasSelect` clears it outright (it clears the query anyway).

Keying on the query rather than clearing on every change is what makes this **order-independent**: `SearchBar.activateLocate` calls `onLocate` *then* `onQueryChange(result.label)`, so a naive "any query change clears the focus" would wipe what locate just set. Nothing about the fix depends on that call order staying as it is.

Rejected alternative — swapping `SearchBar`'s two calls so `onQueryChange` runs first: fewer moving parts, but it makes correctness depend on statement order inside an unrelated component, with nothing local to that component explaining why.

### D3 — Zero hits fade everything, even with a locate focus

A visible located node is necessarily a hit (locate commits its own label as the query), so in practice a zero-hit query means the node has been filtered out or dropped from the data. Rather than leave that to the `.visible()` guard, `litSet` skips the expansion outright when the hit set is empty. It makes the spec's "no results ⇒ whole graph fades" hold by construction and gives the property a direct test.

### D4 — Resolve the lit set before opening `cy.batch()`

`focusSetFor` reads `.visible()`. Inside `cy.batch()` cytoscape defers style application, so an element whose style has not been computed yet reads back as **invisible**, and `cachePrototypeStyleFunction` caches that answer for the current style version. Production got away with it because `useElementFilter` runs first and warms the styles; the tests got away with it because their fixtures ran with `styleEnabled` off, where `.visible()` short-circuits to `true`.

Both accidents are now removed: the lit set is computed outside the batch (which is what batching is for — mutations, not reads), and the hook's tests run with `styleEnabled: true`.

The ordering requirement against `useElementFilter` still stands and is now stated once, on `useGraphFade` itself, instead of in a comment at one of two call sites.

### D5 — `visibility` stays a dep-only prop

`useGraphFade` takes `visibility?: unknown`, never reads it, and lists it as an effect dep. For the **focus** path it is load-bearing: a filter flip changes nothing else the hook receives, yet it decides whether a fade applies at all. For the **search** path it is redundant (`resolveSearchHits` allocates a fresh `litNodeIds` Set on every recompute, and `KsgPanel`'s memo already depends on `visibleNodeIds`) — harmless, and not worth a second, differently-shaped dep list. This supersedes the archived note that *"`useSearchFade` does not need to consult `visibility` for correctness"*, which was true only while miss fade never read `.visible()`.

Typing it `unknown` rather than `VisibilitySets` is deliberate: the type says "not read".

## Risks / Trade-offs

- **Removing `SEARCH_FADE_CLASS` is a public-ish rename** inside the feature. Nothing outside `graph-canvas` referenced it (the panel never names fade classes), and no E2E selector uses it.
- **`cy.nodes().filter(...)` is O(nodes)** where the old accumulator was O(hits) lookups — but the old one allocated and re-deduped a collection per hit (O(hits²) copying) on a per-keystroke path. One linear pass with no allocation wins at every graph size the spec contemplates.
- **`locateFocus` is a second piece of search state in `KsgPanel`.** The alternative (deriving it from `selectedId` plus a heuristic) is what this change exists to remove.
