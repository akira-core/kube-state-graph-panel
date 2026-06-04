## Why

Switch network-topology nodes (`kind: 'switch'`, with `node-to-switch` / `switch-to-switch` edges) form hub-and-mesh shapes: many edges converge on the same switch and repeatedly cross one another. Under the current force-directed `fcose` layout these switches float arbitrarily and their edges tangle into an unreadable knot. We want the rest of the graph to keep its organic `fcose` look, while **only the switch fabric** is pulled into a clean, readable hierarchy.

## What Changes

- Introduce switch-only hierarchical layering: derive a network **tier** for every `switch` node from graph structure, then arrange switches into stacked horizontal rows (one row per tier) while every non-switch node keeps its existing `fcose` placement.
- Tiering is **N-tier, structurally derived**: a switch with at least one `node-to-switch` edge is _access_ (tier 0); tier then increases by `switch-to-switch` BFS distance from the access set, so the graph shows exactly as many rows as the topology actually has.
- Tier values are computed **panel-side** (the backend exposes no tier/role metadata today), with a forward-compatible fallback: if a switch ever carries a backend-supplied tier label, that wins over the derived value.
- Layering is expressed entirely through **`fcose`'s native constraints** (`alignmentConstraint` + `relativePlacementConstraint`) — no new Cytoscape layout and **no new npm dependency**.
- Switch-incident edges (`node-to-switch`, `switch-to-switch`) render with orthogonal **`taxi`** routing so multiple edges into one switch share clean right-angle channels instead of overlapping béziers. All other edges keep `bezier`.
- Zero-impact-when-absent: with no `switch` nodes in the graph, no constraints are produced and layout/rendering behaviour is byte-for-byte unchanged.

Not breaking. The layering only applies in `fcose` mode; `dagre` mode is untouched (it already tiers the whole graph). The `taxi` edge routing, being a stylesheet concern, applies in both modes.

## Capabilities

### New Capabilities

- `switch-tier-layout`: derive a structural network tier per `switch` node and lay the switch fabric out as stacked horizontal tiers inside the existing force-directed layout, with orthogonal edge routing for switch-incident edges, leaving all non-switch nodes unaffected.

### Modified Capabilities

<!-- None. The scaffold change (panel-rendering, etc.) is not yet archived and openspec/specs/ is empty, so there is no published requirement to delta against. The new spec-level behaviour is fully owned by the new switch-tier-layout capability; implementation touches existing panel-rendering code (see Impact) without changing its published requirements. -->

## Impact

- **New code**: `src/features/switch-topology/` — two pure functions: `computeSwitchTiers(elements)` and `buildSwitchConstraints(tiers)`, plus a barrel `index.ts`.
- **Modified code**:
  - `src/features/graph-canvas/hooks/useGraphLayout.ts` — accept optional `switchConstraints`; merge into `fcose` options (memo dependency added); `dagre` path unchanged.
  - `src/features/graph-canvas/components/GraphCanvas/*` — compute `switchConstraints` via `useMemo` from `elements` and thread it into `useGraphLayout`.
  - `src/features/graph-canvas/styles/getStylesheet.ts` — add `curve-style: 'taxi'` selectors for `edge[edgeType='node-to-switch']` and `edge[edgeType='switch-to-switch']`.
- **Data contract**: read-only consumer of existing `kind:'switch'` nodes and `node-to-switch` / `switch-to-switch` edges (already in `shared/constants/types.ts`). No backend change required; a future backend tier label is honoured if present but not depended on.
- **Dependencies**: none added.
- **Tests**: new unit tests for both pure functions; extended `useGraphLayout` and `getStylesheet` tests; existing suite (179 tests) stays green.
