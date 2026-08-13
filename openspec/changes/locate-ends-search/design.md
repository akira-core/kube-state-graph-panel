## Context

See proposal.md — Why, for the measured symptom. The mechanism spans three files that the just-landed `unify-graph-fade` change left coupled:

- `SearchBar.activateLocate` commits `result.label` into the query, so `searchActive` (derived in `KsgPanel` as `searchQuery.trim().length > 0`) stays true after locate.
- `computeHits` treats that label as a fresh query: case-insensitive substring, AND across whitespace tokens, OR across six fields (`label`, `kind`, `namespace`, `cluster`, `application`, `ipAddress`). A label is not a node identity, so it routinely matches siblings (`mongo-0` ⊂ `data-mongo-0`) and superstrings (`gateway` ⊂ `mesh-gateway`).
- `useGraphFade.litSet` unions the located node's focus set onto the hit-derived lit set rather than replacing it, and the hit-derived set already contains `hits.connectedEdges()` — every incident edge of every hit, including edges whose far endpoint is not lit.

`unify-graph-fade` introduced `searchFocusNodeId` (and `KsgPanel`'s `{ nodeId, query }` `locateFocus`) precisely to make the *committed label* case behave: only the node located for the current query may widen the lit set. Removing the commit removes that case, and with it the reason the state exists.

## Goals / Non-Goals

**Goals:**

- Locate ends the search state so the fade authority is unambiguous afterwards: one selection, focus fade, nothing else lit.
- Delete the locate-focus state rather than leave it unreachable.
- Keep every other locate step observably unchanged (expand chain → select + detail → fit), and keep miss-fade behavior during typing untouched.

**Non-Goals:**

- Changing `computeHits` matching rules. The label-as-query matching is not wrong in itself; the bug is that a query runs at all after locate.
- Fixing lit edges whose far endpoint is faded *during typing*. `hits.connectedEdges()` is specified behavior ("Miss fade") and stays; this change only prevents it from outliving a locate.
- Preserving search context in the input for re-opening the result list after locate. That is the accepted cost (see Decisions).

## Decisions

**D1 — Locate clears the query instead of committing the label.**
`activateLocate` calls `onQueryChange('')`. Alternatives considered:

- _Keep the label, replace instead of union in `litSet`_: leaves the input showing `gateway` while the canvas shows a single-node focus, and re-focusing the input reopens a result list for a query the fade no longer reflects. Two states claiming to describe the same thing.
- _Keep the label, add a "query consumed by locate" flag_: adds state to suppress state. `searchActive` would no longer be derivable from the query string, which is the property that makes the current lifecycle auditable.

Clearing makes locate exactly `handleCanvasSelect` plus a fit, which is the mental model the spec already claims for it ("act like a canvas left-click on that node").

**D2 — Locate keeps its own clear path; it does not route through `handleCanvasSelect`.**
`handleCanvasSelect` force-clears then selects, and is wired to GraphCanvas `onSelect`. Locate must also expand the collapsed ancestor chain and fit, and it must not be re-entered by the canvas selection event its own selection triggers. Keeping `handleLocate` separate — now with the clear performed by `SearchBar` at the end of `activateLocate` — preserves that separation while producing the same observable end state.

**D3 — The clear happens in `SearchBar`, after `onLocate`, not inside `handleLocate`.**
`activateLocate` already owns the input's committed value; `KsgPanel.handleLocate` owns graph state. Ordering (`onLocate` → `onQueryChange('')`) matters for the fit: `SearchBar`'s debounce effect cancels any pending fit-to-all-hits when the query becomes empty, while `handleLocate`'s two-frame `requestAnimationFrame` fit-to-neighborhood is scheduled outside that effect and survives. Reversing the order would still work but would render one frame of an empty-query fade before the selection lands.

**D4 — Delete `locateFocus` / `searchFocusNodeId` rather than leave them wired.**
After D1 the state is provably unreachable: `handleLocate` sets `{ nodeId, query: result.label }`, then `onQueryChange('')` runs `handleQueryChange`, whose `prev.query === next` guard fails for any non-empty label and nulls it in the same commit. A prop that can only ever be `null` is worse than no prop — it keeps a branch of `litSet` alive that no test can reach honestly.

`focusSetFor` stays exported: focus fade is now the only consumer, and it is also the definition the spec's "Locating a result ends miss fade" scenario is written against.

**D5 — `litSet`'s miss branch collapses to three lines.**
With `searchFocusNodeId` gone, the miss branch is derived from the hit collection alone, returned unconditionally — including for zero hits, which keeps "a zero-hit query fades the whole graph" structural rather than a special case (an empty hit collection produces an empty focus set).

**D6 — Miss fade and focus fade share one lit-set function.**
The second reported bug — lit edges dangling into faded 1-hop neighbours on any multi-node match — existed because the miss branch computed `hits ∪ hits.connectedEdges() ∪ hits.ancestors()` while focus fade computed `closedNeighborhood ∪ descendants`, then ancestors of those. Two definitions of "what lights up around a node" can drift; they had. The fix extracts the focus-set computation into one helper over a node *collection* (`closedNeighborhood().union(descendants())`, then `.union(core.ancestors())`): `focusSetFor` (single selection, with the visibility guard) and the miss branch (the hit collection, no per-node guard) both call it. Alternatives considered:

- _Just add `hits.neighborhood().nodes()` to the old union_: fixes the dangling edge but leaves two hand-maintained definitions that can drift again, and still diverges from click semantics on descendants (an expanded container hit would fade its own children).
- _Filter hits to `.visible()` first_: rejected — `resolveSearchHits` already documents that filter-hidden hits in the lit set are harmless, and the pre-existing behavior (their ancestors lit) was never guarded either; adding a guard here would change behavior this fix does not own.

Consequence worth naming: a proxy-hit container now lights its own 1-hop neighbours and (if expanded mid-query) its children, exactly as clicking it would — the visual grammar "lit = what a click would light" holds everywhere.

## Risks / Trade-offs

- **The user loses the query text after locate; re-searching means retyping.** → Accepted, and it is the point: the input and the canvas can no longer disagree. Esc-clear already discards the query, so there is no new class of loss. Mitigation if this proves annoying in use: a separate change can add a "recent searches" affordance, which is orthogonal to the fade.
- **A test could pass for the wrong reason.** After the change, "only the located node's neighborhood is lit" holds both because the query cleared and because nothing else could widen the set. → The spec scenario asserts the query is empty *and* the lit set, so a regression that stops clearing the query fails on the first assertion.
- **`unify-graph-fade` is not yet archived and its spec still describes the locate focus.** → This change's delta modifies the same requirements in `openspec/specs/graph-search/spec.md`, which already carries the landed `unify-graph-fade` text; archiving order does not matter as long as the deltas are applied in landing order.
- **`CONTEXT.md` drops a vocabulary entry ("Locate focus").** → Removing a term is safe only if nothing else uses it; the term appears in the fade spec and in `useGraphFade`'s doc comments, both of which this change rewrites.
