## ADDED Requirements

### Requirement: Structural switch-tier derivation

The system SHALL assign each `switch` node a non-negative integer tier derived from graph structure. A switch with at least one incident `node-to-switch` edge SHALL be tier 0 (_access_). Every other switch SHALL receive a tier equal to its shortest `switch-to-switch` distance to the access set. Derivation SHALL be a pure function of the supplied elements and SHALL be deterministic for identical input.

When a `switch` node carries a backend-supplied tier value, that value SHALL take precedence over the derived tier (forward-compatible hybrid source).

#### Scenario: Access switch is tier 0

- **WHEN** a `switch` node has at least one incident `node-to-switch` edge
- **THEN** it is assigned tier 0

#### Scenario: Tier follows switch-to-switch distance

- **WHEN** a `switch` node has no `node-to-switch` edge but is reachable from an access switch through `n` `switch-to-switch` hops (minimum)
- **THEN** it is assigned tier `n`

#### Scenario: Isolated switch defaults to tier 0

- **WHEN** a `switch` node has no incident `node-to-switch` or `switch-to-switch` edge
- **THEN** it is assigned tier 0 and the derivation completes without error

#### Scenario: Cyclic switch-to-switch graph terminates

- **WHEN** the `switch-to-switch` edges form a cycle
- **THEN** derivation terminates and each switch receives a single stable tier (no infinite loop)

#### Scenario: Backend tier label wins over derived value

- **WHEN** a `switch` node carries a backend-supplied tier value
- **THEN** the assigned tier equals the backend value, ignoring the structurally-derived value

#### Scenario: No switches yields empty result

- **WHEN** the graph contains no `switch` nodes
- **THEN** the derivation returns an empty tier mapping

### Requirement: Switch fabric laid out as stacked tiers

The system SHALL arrange `switch` nodes into horizontal rows, one row per tier, stacked so that lower-numbered tiers sit above higher-numbered tiers. This SHALL be expressed exclusively through the force-directed layout's native alignment and relative-placement constraints, adding no new layout engine or dependency. Constraints SHALL reference only `switch` nodes; all non-switch nodes SHALL remain free to be placed by the force-directed layout.

The constraints SHALL apply only when the active layout is the force-directed (`fcose`) layout. When fewer than two `switch` nodes exist (including the no-switch case), the system SHALL produce no constraints and the layout SHALL behave exactly as without this feature.

#### Scenario: Switches in the same tier align on one row

- **WHEN** two or more `switch` nodes share a tier under the `fcose` layout
- **THEN** they are horizontally aligned onto a common row

#### Scenario: Tiers stack top-to-bottom by tier number

- **WHEN** tier `k` and tier `k+1` both contain switches under the `fcose` layout
- **THEN** tier `k` is placed above tier `k+1`

#### Scenario: Single tier of multiple switches still aligns

- **WHEN** two or more `switch` nodes all resolve to the same single tier
- **THEN** they are aligned onto one row with no relative-placement (stacking) constraint

#### Scenario: Non-switch nodes are not constrained

- **WHEN** switch-tier constraints are produced
- **THEN** the constraints reference only `switch` node ids and no pod / node / service / pvc / cluster node is constrained

#### Scenario: No constraints below two switches

- **WHEN** the graph has fewer than two `switch` nodes
- **THEN** no layout constraints are produced (null result)

#### Scenario: Hierarchical layout layout only in fcose mode

- **WHEN** the active layout is `dagre`
- **THEN** switch-tier constraints are not applied (dagre already tiers the whole graph)

### Requirement: Orthogonal routing for switch-incident edges

The system SHALL render `node-to-switch` and `switch-to-switch` edges with orthogonal (`taxi`) routing so that multiple edges converging on the same switch share right-angle channels rather than overlapping curves. All other edge types SHALL keep their existing curved (`bezier`) routing. The existing colour and line-style of switch edges SHALL be preserved. Edge routing SHALL be a stylesheet concern and therefore independent of which layout is active.

#### Scenario: Switch edges route orthogonally

- **WHEN** an edge is of type `node-to-switch` or `switch-to-switch`
- **THEN** it is rendered with `taxi` (orthogonal) curve style

#### Scenario: Non-switch edges stay curved

- **WHEN** an edge is of any type other than `node-to-switch` or `switch-to-switch`
- **THEN** it is rendered with the existing `bezier` curve style

#### Scenario: Switch edge colour and line-style preserved

- **WHEN** switch edges are rendered with orthogonal routing
- **THEN** their colour and solid/dashed line-style are unchanged from the existing styling

### Requirement: Zero impact when no switches are present

The system SHALL guarantee that a graph containing no `switch` nodes is laid out and rendered identically to its behaviour before this capability existed: no constraints are produced, no edge is rerouted, and the force-directed layout result is unchanged.

#### Scenario: Switch-free graph is unaffected

- **WHEN** the graph contains no `switch` nodes and no switch-incident edges
- **THEN** layout constraints are null and no edge is routed with `taxi`, leaving prior behaviour intact
