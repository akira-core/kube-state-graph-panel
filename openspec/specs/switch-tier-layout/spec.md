# switch-tier-layout Specification

## Purpose

TBD - created by archiving change switch-network-tier-layout. Update Purpose after archive.

## Requirements

### Requirement: Switch level read from node label

The system SHALL read a network **level** for each `switch` node from that node's `data.labels.level` value, parsing it as a base-10 integer. A level SHALL be accepted only when it parses to an integer greater than or equal to zero. A `switch` node whose `labels.level` is absent, blank, non-numeric, or negative SHALL receive no level. The read SHALL be a pure function of the supplied elements and SHALL be deterministic for identical input. The system SHALL NOT derive the level from graph structure (no `node-to-switch` / `switch-to-switch` traversal).

#### Scenario: Valid level label is read

- **WHEN** a `switch` node carries `labels.level` equal to the string `"2"`
- **THEN** it is assigned level 2

#### Scenario: Missing level label yields no level

- **WHEN** a `switch` node has no `labels.level` value
- **THEN** it is assigned no level and is excluded from the level mapping

#### Scenario: Invalid level label yields no level

- **WHEN** a `switch` node carries a `labels.level` that does not parse to a non-negative integer (blank, non-numeric, or negative)
- **THEN** it is assigned no level and is excluded from the level mapping

#### Scenario: Non-switch nodes are ignored

- **WHEN** a node whose `kind` is not `switch` carries a `labels.level` value
- **THEN** it is ignored and never assigned a level

#### Scenario: No switches yields empty result

- **WHEN** the graph contains no `switch` nodes
- **THEN** the level read returns an empty mapping

### Requirement: Switch fabric pinned into stacked levels

The system SHALL pin each levelled `switch` node to an absolute position derived from its level so that switches form horizontal rows, one row per level, stacked so that lower-numbered levels sit above higher-numbered levels, with switches that share a level spread horizontally across a common row. This SHALL be expressed exclusively through the force-directed layout's native fixed-node constraint (`fixedNodeConstraint`), adding no new layout engine or dependency. The constraint SHALL reference only levelled `switch` nodes; every non-switch node and every switch without a level SHALL remain free to be placed by the force-directed layout.

The constraint SHALL apply only when the active layout is the force-directed (`fcose`) layout. When no `switch` node carries a valid level, the system SHALL produce no constraint and the layout SHALL behave exactly as without this feature.

#### Scenario: Switches in the same level share a row

- **WHEN** two or more `switch` nodes resolve to the same level under the `fcose` layout
- **THEN** they are pinned to the same vertical position (one row) at distinct horizontal positions

#### Scenario: Levels stack top-to-bottom by level number

- **WHEN** level `k` and level `k+1` both contain switches under the `fcose` layout
- **THEN** the level `k` row is pinned above the level `k+1` row

#### Scenario: Pinning references only levelled switches

- **WHEN** the switch-level constraint is produced
- **THEN** it references only `switch` node ids that have a valid level, and no pod / node / service / pvc / cluster node and no unlevelled switch is pinned

#### Scenario: No constraint when no switch has a level

- **WHEN** no `switch` node carries a valid level (including the no-switch case)
- **THEN** no layout constraint is produced (null result)

#### Scenario: Pinning only in fcose mode

- **WHEN** the active layout is `dagre`
- **THEN** the switch-level constraint is not applied (dagre already tiers the whole graph)

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

### Requirement: Zero impact when no switch is levelled

The system SHALL guarantee that a graph in which no `switch` node carries a valid level is laid out identically to its behaviour before this capability existed: no constraint is produced and the force-directed layout result is unchanged. (Switch-incident edge routing is governed by the orthogonal-routing requirement above and is independent of levelling.)

#### Scenario: Switch-free graph is unaffected

- **WHEN** the graph contains no `switch` nodes
- **THEN** the layout constraint is null and prior layout behaviour is intact

#### Scenario: Unlevelled switches do not pin

- **WHEN** the graph contains `switch` nodes but none carries a valid level
- **THEN** the layout constraint is null and every switch is placed freely by the force-directed layout
