## Context

The panel renders Kubernetes topology with Cytoscape.js. Non-network nodes nest into compound containers (`cluster > node > pod`, plus `service`/`pvc` under `cluster`) and are laid out by `fcose` (force-directed) or `dagre` (hierarchical), selected via the `layout` panel option and executed by the single `useGraphLayout` hook (`src/features/graph-canvas/hooks/useGraphLayout.ts`).

Backend v0.0.18 introduced `kind:'switch'` nodes and `node-to-switch` / `switch-to-switch` edges. These form hubs and meshes: many edges land on one switch and overlap. Under `fcose` the switches float and the cyan switch edges tangle.

The first implementation of this change derived a tier structurally and expressed it with `fcose`'s soft `alignmentConstraint` + `relativePlacementConstraint`. **It did not visibly stack into layers** on the demo: `relativePlacementConstraint` only links one representative node per tier (not every member), and `fcose`'s `nodeRepulsion` (5000) overrides soft constraints, so the rows collapsed together. This revision pivots: the tier is no longer derived — each `switch` node carries an explicit integer **`level`** label, and switches are **hard-pinned** to absolute positions via `fcose`'s `fixedNodeConstraint`. Hard-fixed nodes are not moved by the force solver, so the layers are guaranteed.

Current edge styling in `getStylesheet.ts` applies `curve-style: 'bezier'` to all edges through a single `edge` selector, with `taxi` overrides for the two switch edge types (added in this change's first cut; retained). `useGraphLayout` builds static `fcose`/`dagre` option objects memoised on the layout name and merges any supplied `SwitchConstraints` at layout-run time.

## Goals / Non-Goals

**Goals:**

- Pull only the `switch` fabric into a readable, stacked-layer hierarchy while every non-switch node keeps its `fcose` placement.
- Place switches by an explicit per-node `level` label — deterministic, no derivation, no backend round-trip beyond the label already in the payload.
- Use only native `fcose` constraints — no new layout engine, no new npm package.
- Declutter hub edges via orthogonal (`taxi`) routing for switch-incident edges only.
- Guarantee byte-for-byte unchanged behaviour when no switch carries a valid level.

**Non-Goals:**

- Deriving the level from graph structure (explicitly removed — that was the failed first cut).
- Adding a new Cytoscape layout engine (elk/cola/etc.) or any dependency.
- Re-laying-out non-switch nodes or changing `dagre` mode behaviour.
- A user-facing on/off toggle for the layering (always-on within `fcose`; can be added later).
- Handling switches nested inside a `cluster` compound (assumed top-level; see Risks).

## Decisions

### D1 — Pin switches with `fcose` `fixedNodeConstraint` (hard), not soft alignment/relative-placement

`fcose` supports `fixedNodeConstraint: [{ nodeId, position: { x, y } }]`, which pins listed nodes to exact coordinates and lays the rest of the graph out around them. We compute one entry per switch and emit them as the layout's `fixedNodeConstraint`. One layout pass, switch-only effect, zero new dependency.

_Why not the original `alignmentConstraint` + `relativePlacementConstraint`:_ both are **soft** — `fcose` balances them against `nodeRepulsion`/edge forces and may violate them. Worse, `relativePlacementConstraint` was applied only between one representative id per tier, so non-representative switches were never ordered vertically. The result on the demo was overlapping rows, not a stack. `fixedNodeConstraint` is **hard** (fixed nodes don't move), which is exactly the guarantee "draw by layer" needs.

_Alternatives considered:_ **elk `layered`** — best compound + hierarchy, but adds `cytoscape-elk`, re-tiers the _whole_ graph, and Cytoscape still draws its own edges. **dagre** — already available but unreliable on compound nodes, and tiers everything. **Post-layout manual pin** (`fcose` runs, then JS sets switch positions + `lock()`) — works but is a second positioning pass outside `useGraphLayout`, fighting the "single source of layout execution" rule (Cytoscape integration rule 2). `fixedNodeConstraint` keeps it a single native pass.

### D2 — Level is read from the `switch` node label, not derived

Each `switch` node carries `data.labels.level`, a string the panel parses with `Number.parseInt(_, 10)` and accepts only when the result is an integer `>= 0`. There is no `node-to-switch`/`switch-to-switch` BFS, no access-tier inference, no role names. The graph shows exactly the levels the data declares.

_Why:_ the structural derivation invented depth the data did not carry and coupled the layout to edge topology. An explicit label is simpler, deterministic, and authoritative — the operator/backend decides the hierarchy.

### D3 — A switch without a valid level is left unpinned

If a `switch` node has no `labels.level`, or a non-integer / negative value, it is **omitted** from `fixedNodeConstraint` (placed freely by `fcose`) rather than coerced to level 0. Coercing would silently stack unrelated switches onto the top row and misrepresent the topology; leaving it free makes the missing data visible without breaking the layout.

### D4 — Absolute coordinates from level: `y = level · TIER_GAP`, `x` centred within the level

`buildSwitchConstraints` groups switch ids by level, sorts ids within each level (determinism), and assigns:

- `y = level * TIER_GAP` — lower levels sit above (smaller `y`); `TIER_GAP` is the vertical layer spacing.
- `x = (i - (n - 1) / 2) * COL_GAP` — the `i`-th of `n` switches in a level, spread horizontally and centred on `x = 0`, so each level is a centred row (pyramid-friendly).

`TIER_GAP` and `COL_GAP` are module constants (~180 px), tuned visually on the demo. Coordinates are in Cytoscape model space; `fcose` re-centres/fits the whole graph afterwards, so absolute origin is irrelevant — only relative spacing and ordering matter.

### D5 — `taxi` routing for switch-incident edges only (unchanged)

`curve-style: 'taxi'` (with `taxi-direction: 'vertical'`) for `edge[edgeType='node-to-switch']` and `edge[edgeType='switch-to-switch']`; all other edges keep `bezier`. Colours/line-styles untouched. Being a stylesheet concern, it also helps in `dagre` mode.

### D6 — Always-on within `fcose`, no toggle (unchanged)

The layering only reshapes switches and is a no-op when none have a level, so it needs no UI surface. A panel option can be added later if users want to compare; deferred to avoid speculative UI.

### D7 — Constraints computed upstream, threaded into the single layout hook (unchanged)

`useGraphLayout` remains the single source of layout execution. `GraphCanvas` computes `switchConstraints = useMemo(() => buildSwitchConstraints(readSwitchLevels(elements)), [elements])` and passes it down; `useGraphLayout` merges it into the `fcose` options. The `dagre` branch ignores it. The two pure functions live in `src/features/switch-topology/`, keeping logic testable in isolation per the feature-first convention.

### D8 — Apply constraints at layout-run time via a ref, not as an effect trigger (unchanged)

The panel deliberately does **not** re-run the layout on every Grafana data refresh. `switchConstraints` gets a fresh object identity on every refresh (a new `elements` array), so feeding it into the effect's dependency list would re-run the full `fcose` layout on each refresh for any switch-bearing graph — a visible regression. `useGraphLayout` keeps the latest constraints in a ref and reads them when a layout run actually happens (mount / name change / `runToken` bump). Trade-off: a switch-level change mid-session is not re-laid-out until the next structural trigger — consistent with how the panel already treats added/removed nodes on refresh.

## Risks / Trade-offs

- **Switches nested inside a `cluster` compound would break pinning** — `fcose` `fixedNodeConstraint` positions are absolute model coordinates; a compound child's position is constrained by its parent's bounds. → We assume switches are top-level (consistent with current data and the `external` precedent). If the backend later nests switches, the feature degrades gracefully (the pin is best-effort within the parent) and a follow-up change adapts it.
- **Operator-supplied levels can collide or skip numbers** — two switches sharing a level simply share a row; a gap in levels (0, 2) leaves an empty band. Both are acceptable and honest to the data; no remapping is attempted (would hide operator intent).
- **Fixed positions can crowd the force layout** — pinning many switches into a tall stack leaves less room for the workload around them. → `TIER_GAP`/`COL_GAP` are tunable; only switches are pinned, so the blast radius is the switch fabric.
- **`taxi` routing can look odd under a non-vertical arrangement** → `taxi-direction: 'vertical'` matches the top-to-bottom level stack; only switch edges are affected.
- **Level flicker across data refreshes** → derivation is a pure read of `labels.level`, memoised on `elements`; identical input yields identical positions.

## Migration Plan

Purely additive at the panel layer. No data migration, no config change, no breaking API. The data contract gains a dependency on `labels.level` being present for switches that should be tiered — switches without it still render (unpinned). Rollback = revert the change; with no levelled switches, behaviour is identical to today, so the blast radius is confined to switch-bearing graphs. Verify on the local demo with a seeded fixture that emits `kind:'switch'` nodes carrying `labels.level`.

## Open Questions

- Final values for `TIER_GAP` (vertical) and `COL_GAP` (horizontal) — pick sensible defaults (~180 px) and tune visually on the demo.
- Whether to eventually expose an on/off toggle (panel option vs. legend button) — deferred until there is user demand.
- Whether to also accept a typed numeric `data.level` (not just the string `labels.level`) as a forward-compatible source — deferred; `labels.level` is the agreed source for now.
