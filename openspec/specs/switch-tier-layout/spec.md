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

The system SHALL pin each levelled `switch` node to an absolute position derived from its level so that switches form horizontal rows, one row per level, stacked so that lower-numbered levels sit above higher-numbered levels, with switches that share a level spread horizontally across a common row. This SHALL be expressed exclusively through the force-directed layout's native fixed-node constraint (`fixedNodeConstraint`), adding no new layout engine or dependency.

Additionally, in the **controller** pod-parent mode, when a switch fabric is present (at least one levelled `switch`), the system SHALL also pin every K8s `node` that participates in the fabric — i.e. that is the `source` of at least one `node-to-switch` edge — onto a single derived tier **one level above the topmost (minimum-level) switch row** (`min(switchLevel) − 1`), spread horizontally across that row exactly as switches are. **ALL fabric-connected K8s nodes share this single tier** (`min(switchLevel) − 1`, one row), regardless of which switch level each node actually connects to; a `node-to-switch` uplink to a deeper switch MAY visually cross intervening switch rows, and that is accepted (the system SHALL NOT pin each node to its own connected-switch-relative tier). This realises the `pod → node → switch → switch` top-to-bottom order: workload-bearing nodes sit directly above the physical fabric, with pods/controllers left free to float above them. The derived node tier SHALL be computed from the switch levels (NOT read from any `labels.level`) and merged into the level map by a **separate mode-aware step** — NOT by `readSwitchLevels`, which stays `switch`-kind-only and non-negative; `buildSwitchConstraints` consumes the already-merged map and supports the negative `−1` tier (`y = −180`). A K8s `node` with no `node-to-switch` edge SHALL remain free. In the **node** pod-parent mode the K8s `node` is a compound container boxing its pods and SHALL NOT be pinned. Absent a switch fabric (no levelled switch), no K8s `node` is pinned in either mode.

The constraint SHALL reference only (a) levelled `switch` nodes and (b) in controller mode, fabric-connected K8s `node` nodes; every other node (pods, controllers, services, pvcs, clusters, unlevelled switches, fabric-disconnected nodes) SHALL remain free to be placed by the force-directed layout. The constraint SHALL apply only when the active layout is the force-directed (`fcose`) layout. When no `switch` node carries a valid level, the system SHALL produce no constraint and the layout SHALL behave exactly as without this feature.

#### Scenario: Switches in the same level share a row

- **WHEN** two or more `switch` nodes resolve to the same level under the `fcose` layout
- **THEN** they are pinned to the same vertical position (one row) at distinct horizontal positions

#### Scenario: Levels stack top-to-bottom by level number

- **WHEN** level `k` and level `k+1` both contain switches under the `fcose` layout
- **THEN** the level `k` row is pinned above the level `k+1` row

#### Scenario: Controller-mode K8s nodes pin one tier above the fabric

- **WHEN** the pod-parent mode is `controller`, the graph has levelled switches whose minimum level is `m`, and a K8s `node` is the source of a `node-to-switch` edge
- **THEN** that K8s `node` is pinned to the derived tier `m − 1` (one row above the topmost switch row), spread horizontally like switches; the pods/controllers above it remain free

#### Scenario: Node-mode K8s nodes are not pinned

- **WHEN** the pod-parent mode is `node` (each K8s node boxes its pods) even with a switch fabric present
- **THEN** no K8s `node` is pinned; only levelled switches are pinned

#### Scenario: Fabric-disconnected node stays free in controller mode

- **WHEN** in `controller` mode a K8s `node` has no `node-to-switch` edge
- **THEN** it is not pinned to the fabric tier (it is left to the force-directed layout)

#### Scenario: Pinning references only fabric members

- **WHEN** the layout constraint is produced
- **THEN** it references only levelled `switch` ids and (controller mode only) fabric-connected K8s `node` ids; no pod / controller / service / pvc / cluster node and no unlevelled switch is pinned

#### Scenario: No constraint when no switch has a level

- **WHEN** no `switch` node carries a valid level (including the no-switch case)
- **THEN** no layout constraint is produced (null result), and no K8s `node` is pinned regardless of mode

#### Scenario: Pinning only in fcose mode

- **WHEN** the active layout is `dagre`
- **THEN** the fabric constraint is not applied (dagre already tiers the whole graph)

### Requirement: Orthogonal routing for switch-incident edges

The system SHALL render `node-to-switch` and `switch-to-switch` edges with orthogonal (`taxi`) routing so that multiple edges converging on the same switch share right-angle channels rather than overlapping curves, in BOTH pod-parent modes. All other edge types SHALL keep their existing curved (`bezier`) routing. `node-to-switch` and `switch-to-switch` SHALL share the **same infra colour** — colour authority is owned by `colorByEdgeType` / panel-rendering, and `node-to-switch` no longer uses its prior separate indigo; routing SHALL NOT alter whatever colour panel-rendering assigns. Edge routing SHALL be a stylesheet concern and therefore independent of which layout is active.

#### Scenario: Switch edges route orthogonally

- **WHEN** an edge is of type `node-to-switch` or `switch-to-switch`
- **THEN** it is rendered with `taxi` (orthogonal) curve style

#### Scenario: Non-switch edges stay curved

- **WHEN** an edge is of any type other than `node-to-switch` or `switch-to-switch`
- **THEN** it is rendered with the existing `bezier` curve style

#### Scenario: node-to-switch and switch-to-switch share one infra colour

- **WHEN** `node-to-switch` and `switch-to-switch` edges are rendered
- **THEN** both use the same infra colour and solid line-style (node-to-switch is no longer a separate indigo), differing only in endpoints; `taxi` routing does not change that colour

### Requirement: Zero impact when no switch is levelled

The system SHALL guarantee that a graph in which no `switch` node carries a valid level is laid out identically to its behaviour before this capability existed: no constraint is produced and the force-directed layout result is unchanged. (Switch-incident edge routing is governed by the orthogonal-routing requirement above and is independent of levelling.)

#### Scenario: Switch-free graph is unaffected

- **WHEN** the graph contains no `switch` nodes
- **THEN** the layout constraint is null and prior layout behaviour is intact

#### Scenario: Unlevelled switches do not pin

- **WHEN** the graph contains `switch` nodes but none carries a valid level
- **THEN** the layout constraint is null and every switch is placed freely by the force-directed layout
