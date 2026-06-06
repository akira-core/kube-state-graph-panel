## Why

Switch network-topology nodes (`kind: 'switch'`, with `node-to-switch` / `switch-to-switch` edges) form hub-and-mesh shapes: many edges converge on the same switch and repeatedly cross one another. Under the force-directed `fcose` layout these switches float arbitrarily and their edges tangle into an unreadable knot. We want the rest of the graph to keep its organic `fcose` look, while **only the switch fabric** is pulled into a clean, readable hierarchy.

> **Approach pivot (2026-06-05).** The first cut derived a switch tier structurally (`node-to-switch` ⇒ access, `switch-to-switch` BFS for depth) and expressed it with `fcose`'s **soft** `alignmentConstraint` + `relativePlacementConstraint`. On the demo this did not actually stack into layers: the relative-placement constraint links only one representative per tier, and `fcose`'s `nodeRepulsion` overrides the soft constraints, so tiers overlapped. This revision drops the structural derivation entirely and reads an explicit per-switch **`level`** off the node label, pinning each switch to an absolute position with `fcose`'s **hard** `fixedNodeConstraint`. See design D1/D2.

## What Changes

- Introduce switch-only hierarchical layering: read a non-negative integer **`level`** off each `switch` node (`data.labels.level`) and pin switches into stacked horizontal rows — one row per level — while every non-switch node keeps its existing `fcose` placement.
- Level is **label-supplied, not derived**: the backend (or seeded fixture) provides `labels.level`; the panel performs **no** structural BFS or role inference. A switch missing a valid integer `level` is left unpinned (placed freely by `fcose`).
- Layering pins each switch to an absolute `(x, y)` computed from its level — `y` grows with the level (lower levels sit above), `x` spreads the switches within a level around a shared centre — expressed through **`fcose`'s native `fixedNodeConstraint`**. A fixed node is a hard pin the force solver does not move, so the layers stay clean. No new Cytoscape layout and **no new npm dependency**.
- Switch-incident edges (`node-to-switch`, `switch-to-switch`) render with orthogonal **`taxi`** routing so multiple edges into one switch share clean right-angle channels instead of overlapping béziers. All other edges keep `bezier`. (Unchanged from the first cut.)
- Zero-impact-when-absent: with no `switch` nodes (or none carrying a valid `level`), no constraint is produced and layout/rendering behaviour is byte-for-byte unchanged.

Not breaking. The layering only applies in `fcose` mode; `dagre` mode is untouched (it already tiers the whole graph). The `taxi` edge routing, being a stylesheet concern, applies in both modes.

## Capabilities

### New Capabilities

- `switch-tier-layout`: read a per-`switch` network level from its label and pin the switch fabric into stacked horizontal rows inside the existing force-directed layout, with orthogonal edge routing for switch-incident edges, leaving all non-switch nodes unaffected.

### Modified Capabilities

<!-- None. The scaffold change (panel-rendering, etc.) is not yet archived and openspec/specs/ is empty, so there is no published requirement to delta against. The new spec-level behaviour is fully owned by the new switch-tier-layout capability; implementation touches existing panel-rendering code (see Impact) without changing its published requirements. -->

## Impact

- **New code**: `src/features/switch-topology/` — two pure functions: `readSwitchLevels(elements)` (read `labels.level` per `switch` node) and `buildSwitchConstraints(levelById)` (compute pinned positions), plus a barrel `index.ts`. Replaces the prior `computeSwitchTiers` BFS derivation.
- **Modified code**:
  - `src/features/graph-canvas/hooks/useGraphLayout.ts` — merge the `SwitchConstraints` (`fixedNodeConstraint`) into the `fcose` options; the existing `{ ...baseOptions, ...constraints }` spread already carries the new field, so the merge logic is unchanged; `dagre` path unchanged.
  - `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx` — compute `switchConstraints = useMemo(() => buildSwitchConstraints(readSwitchLevels(elements)), [elements])` and thread it into `useGraphLayout` (call-site rename only).
  - `src/features/graph-canvas/styles/getStylesheet.ts` — `taxi` selectors for `edge[edgeType='node-to-switch']` / `edge[edgeType='switch-to-switch']`. **No change** from the first cut.
  - `src/shared/types/cytoscape.d.ts` — remove the now-unused `NodeDataDefinition.tier`; `labels.level` is read through the existing `labels?: Record<string, string>`.
- **Data contract**: read-only consumer of `kind:'switch'` nodes and their `labels.level` (a string the panel parses to int). Requires the backend/fixture to emit `labels.level` for switches that should be tiered. `normalize` already passes node `labels` through verbatim, so no normalize change is required. `node-to-switch` / `switch-to-switch` edges are still consumed, but **only** for `taxi` routing — no longer for tiering.
- **Dependencies**: none added.
- **Tests**: rewrite both pure-function unit suites (`readSwitchLevels`, `buildSwitchConstraints`); adjust `useGraphLayout` tests for `fixedNodeConstraint`; `getStylesheet` tests unchanged.
