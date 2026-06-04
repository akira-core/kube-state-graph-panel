## Context

The panel renders Kubernetes topology with Cytoscape.js. Non-network nodes nest into compound containers (`cluster > node > pod`, plus `service`/`pvc` under `cluster`) and are laid out by `fcose` (force-directed) or `dagre` (hierarchical), selected via the `layout` panel option and executed by the single `useGraphLayout` hook (`src/features/graph-canvas/hooks/useGraphLayout.ts`).

Backend v0.0.18 introduced `kind:'switch'` nodes and `node-to-switch` / `switch-to-switch` edges. These form hubs and meshes: many edges land on one switch and overlap. Under `fcose` the switches float and the cyan switch edges tangle. Exploration of the backend confirms the switch contract is minimal — only enum constants exist (`kube-state-graph` commit `0768ef6`); there is **no tier/role/layer metadata**, and backend `labels` is a strict `map[string]string` with numeric/typed fields explicitly deferred. So any tier signal must be produced in the panel.

Current edge styling in `getStylesheet.ts` applies `curve-style: 'bezier'` to all edges through a single `edge` selector. `useGraphLayout` builds static `fcose`/`dagre` option objects memoised on the layout name only.

## Goals / Non-Goals

**Goals:**

- Pull only the `switch` fabric into a readable, stacked-tier hierarchy while every non-switch node keeps its `fcose` placement.
- Derive tiers structurally, panel-side, with no backend dependency and no new npm package.
- Declutter hub edges via orthogonal (`taxi`) routing for switch-incident edges only.
- Guarantee byte-for-byte unchanged behaviour when no switches are present.

**Non-Goals:**

- Adding a new Cytoscape layout engine (elk/cola/etc.) or any dependency.
- Re-laying-out non-switch nodes or changing `dagre` mode behaviour.
- A user-facing on/off toggle for the layering (always-on within `fcose`; can be added later).
- Handling switches nested inside a `cluster` compound (assumed top-level; see Risks).
- Defining a backend tier field (only honoured opportunistically if it ever appears).

## Decisions

### D1 — Layer switches via `fcose` native constraints, not a new layout

`fcose` supports `alignmentConstraint` (align node centres onto a shared axis) and `relativePlacementConstraint` (force one node above/left of another by a gap). We derive switch tiers and emit `alignmentConstraint.horizontal = [[tier0 ids], [tier1 ids], …]` plus `relativePlacementConstraint` stacking adjacent tiers. One layout pass, switch-only effect, zero new dependency.

_Alternatives considered:_ **elk `layered`** — best compound + hierarchy, but adds `cytoscape-elk`, re-tiers the _whole_ graph, and Cytoscape still draws its own edges (no free orthogonal routing). **dagre** — already available but unreliable on compound nodes, and tiers everything. **Per-subset layout** (`cy.nodes('[kind=switch]').layout(…)` then pin) — most control but requires coordinating two layout passes and avoiding overlap with the force layout. The constraint approach is the most surgical and lowest-risk.

### D2 — N-tier derived from topology, not fixed names

A switch with a `node-to-switch` edge is _access_ (tier 0); tier then equals `switch-to-switch` BFS distance from the access set. The graph shows exactly as many rows as the topology has.

_Alternatives considered:_ a fixed **core/dist/access** 3-tier squashes deeper fabrics into one middle row and invents structure that the data does not carry; a flat **2-tier** (access vs. everything) loses real depth. N-tier is honest to the actual topology and needs no role metadata.

### D3 — Tier source is panel-derived, with a forward-compatible backend override

The backend exposes no tier today, so the derived value is the source of truth. If a switch ever carries a backend-supplied tier value, it wins. This keeps the feature shippable now and automatically benefits from a future backend field without a code change to the contract.

### D4 — `taxi` routing for switch-incident edges only

Add `curve-style: 'taxi'` (with `taxi-direction: 'vertical'`) selectors for `edge[edgeType='node-to-switch']` and `edge[edgeType='switch-to-switch']`. Many edges into one switch then share right-angle trunks. All other edges keep `bezier`. Being a stylesheet concern, this also helps in `dagre` mode. Colours/line-styles are untouched.

### D5 — Always-on within `fcose`, no toggle

The layering only reshapes switches and is a no-op when none exist, so it needs no UI surface. A panel option or runtime toggle can be added later if users want to compare; deliberately deferred to avoid speculative UI.

### D6 — Constraints computed upstream, threaded into the single layout hook

`useGraphLayout` must remain the single source of layout execution. Because the constraints depend on the actual graph, they cannot be static. `GraphCanvas` computes `switchConstraints = useMemo(() => buildSwitchConstraints(computeSwitchTiers(elements)), [elements])` and passes it down; `useGraphLayout` merges it into the `fcose` options. The `dagre` branch ignores it. Two pure functions live in a new `src/features/switch-topology/` feature folder, keeping logic testable in isolation per the project's feature-first convention.

### D7 — Apply constraints at layout-run time via a ref, not as an effect trigger

The panel deliberately does **not** re-run the layout on every Grafana data refresh — `useGraphLayout`'s effect fires only on layout-name change or a `runToken` bump (structural changes), and the diff-patch sync preserves node positions otherwise. `switchConstraints` gets a fresh object identity on every refresh (a new `elements` array), so feeding it into the effect's dependency list would re-run the full `fcose` layout on each refresh for any switch-bearing graph — a visible regression. Instead `useGraphLayout` keeps the latest constraints in a ref and reads them when a layout run actually happens. The effect's triggers stay exactly as today (`[cyRef, baseOptions, runToken]`); fresh constraints are picked up on the next real layout run (mount / name change / `runToken` bump). Trade-off: a switch-topology change mid-session is not re-laid-out until the next structural trigger — consistent with how the panel already treats added/removed nodes on refresh.

## Risks / Trade-offs

- **Switches nested inside a `cluster` compound would break alignment** — `fcose` constraints act on simple (non-compound-child) nodes; aligning compound children across containers fights containment. → We assume switches are top-level (consistent with current data and the `external` precedent). If the backend later nests switches, the feature degrades gracefully (no crash; constraints simply have no useful effect) and a follow-up change adapts it.
- **Constraint satisfaction could distort the rest of the layout** — over-constraining can push the force solver into awkward configurations. → Constraints reference only switch nodes; the access tier is pulled toward the workload naturally by `node-to-switch` edge length rather than by hard constraint, minimising interference.
- **`taxi` routing can look odd under a non-vertical arrangement** → `taxi-direction: 'vertical'` matches the top-to-bottom tier stack; only switch edges are affected, so a poor result is contained.
- **Tier flicker across data refreshes** → derivation is deterministic and memoised on `elements`; identical input yields identical tiers.
- **Performance** → BFS is linear in switch nodes + switch edges; negligible at expected scale.

## Migration Plan

Purely additive. No data migration, no config change, no breaking API. Rollback = revert the change; with no switches in a graph, behaviour is already identical to today, so the blast radius is confined to switch-bearing graphs. Verify on the local demo once the backend (or a seeded fixture) emits switch nodes and switch edges.

## Open Questions

- Spacing constant for inter-tier gap (`relativePlacementConstraint` gap) — pick a sensible default and tune visually on the demo.
- Whether to eventually expose an on/off toggle (panel option vs. legend button) — deferred until there is user demand.
- Exact shape of a future backend tier field (label key/value) — left flexible; the hybrid override reads whatever the contract settles on.
