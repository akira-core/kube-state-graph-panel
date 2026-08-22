# pod-parent-mode delta — sync-netapp-storage-nodes

## MODIFIED Requirements

### Requirement: Mode-dependent drawable edge set, and legend / stylesheet adaptation

The system SHALL cover all 8 `EdgeType` values (`pod-to-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-netapp-aggr` / `switch-to-switch` / `node-to-switch`) from the single master style source `EDGE_STYLE_BY_TYPE`, and SHALL export the pure function `drawnEdgeTypesForMode(mode)`: `controller` mode returns `['pod-mounts-pvc', 'pod-calls-pod', 'pod-calls-service', 'service-selects-pod', 'pod-to-node', 'pvc-to-netapp-aggr', 'switch-to-switch', 'node-to-switch']`; `node` mode returns the same set **minus `pod-to-node`** (that is, `['pod-mounts-pvc', 'pod-calls-pod', 'pod-calls-service', 'service-selects-pod', 'pvc-to-netapp-aggr', 'switch-to-switch', 'node-to-switch']`) — in `node` mode `pod-to-node` is expressed as nesting and `applyPodParentMode` strips it wholesale. The removed `pvc-to-storageclass` MUST NOT appear in the master style source, in either mode's returned set, or in `ALL_EDGE_TYPES`. The former synthesised edges `pod-runs-on-node` / `controller-owns-pod` no longer exist (the backend owns the hierarchy and the panel no longer synthesises it). `pvc-to-netapp-aggr` is drawn in both modes; `service-selects-pod` and `pod-calls-service` are drawn in both modes (a service is no longer a compound parent); and the physical-network fabric edges `switch-to-switch` / `node-to-switch` are **drawn in both modes** (merged into both returned sets via `...SWITCH_EDGES`). `getStylesheet`'s colorMap MUST use the master `EDGE_STYLE_BY_TYPE` (mode-agnostic — it can colour any edge that exists; a type absent from the current mode is simply inert and does not affect the output). `ALL_EDGE_TYPES` and the default `visibleEdgeTypes` MUST equal all 8 `EdgeType` values, so that both modes' edges (fabric included) are visible by default — otherwise switching to controller mode would find `pod-to-node` filtered out by default, or the fabric edges excluded from the default visible set. The edges `EdgeLegend` lists MUST be `drawnEdgeTypesForMode(current mode)` intersected with the edges actually present in the graph, presented in the existing `<from> → <to>` form (arrow glyph centred), and MUST NOT carry extra nesting explanation text.

#### Scenario: Drawable edge set in node mode

- **WHEN** `mode === 'node'`
- **THEN** the drawable edge set holds `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-netapp-aggr`, plus the always-present `switch-to-switch` / `node-to-switch`; the canvas draws no `pod-to-node` edge at all (it is expressed as nesting and stripped by `applyPodParentMode`)

#### Scenario: Drawable edge set in controller mode

- **WHEN** `mode === 'controller'`
- **THEN** the drawable edge set holds `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pod-to-node` / `pvc-to-netapp-aggr`, plus the always-present `switch-to-switch` / `node-to-switch`; the `pod-to-node` edge draws in the colour (`#3b82f6`) and line style the master style source defines, and `pvc-to-netapp-aggr` draws in its own colour, distinguishable from `pod-mounts-pvc`'s purple

#### Scenario: Fabric edges are present in both modes

- **WHEN** the graph holds a `switch-to-switch` or `node-to-switch` edge
- **THEN** both pod-parent modes draw it (it does not disappear on a mode switch) and it is visible by default (the default `visibleEdgeTypes` covers it)

#### Scenario: An unknown edge type still takes the fallback

- **WHEN** in either mode an edge's `data.edgeType` is absent from the master style source
- **THEN** that edge renders as a grey solid fallback line and throws nothing (the existing forward-compatibility behaviour)

### Requirement: Controller mode re-homes pods onto their controller

The system SHALL provide the pure function `applyPodParentMode(elements, mode)`, applied after `normalizeGraph` and before the elements reach `GraphCanvas`; `normalizeGraph` itself MUST stay a pure anti-corruption boundary and MUST NOT take a mode parameter. **The backend (D6) owns the hierarchy**, so `mode === 'controller'` (the default) MUST be an **identity clone**: it MUST NOT re-home any pod and MUST NOT synthesise any edge — the backend payload already nests each pod under its `controller` group (the full parent chain `cluster > namespace > application > controller > pod`), and `pod-to-node` is already a backend-drawn edge. This mode only copies element by element to produce independent new objects (`data` at least shallow-copied), leaving the original `data.parent` and the edge set unchanged. `mode === 'node'` MUST return a clean infrastructure view (`cluster > node > pod`): for each `pod`, reset `data.parent` to its `labels.node` (its K8s node id), re-homing it only when that id names a `node`-kind element **present in `elements`** — when `labels.node` is missing or names no such node, the pod MUST stay under its `cluster` (the fallback). It MUST also strip every `namespace` / `application` / `controller` group node and re-home their non-pod members (`pvc` / `service`) onto their `cluster`, and MUST remove every `pod-to-node` edge (that relationship is expressed as nesting in `node` mode).

**The NetApp storage chain is left intact in `node` mode.** `storage-cluster` is **not** one of the stripped workload groups (the stripped set is exactly `namespace` / `application` / `controller`), and `netapp-node` / `netapp-aggr` are real nodes rather than groups, so the whole `storage-cluster > netapp-node > netapp-aggr` nesting MUST be **preserved verbatim in both modes** and `applyPodParentMode` MUST NOT re-home or flatten any of it. In `node` mode a PVC does re-home onto its cluster because its `namespace` group was stripped, but its `pvc-to-netapp-aggr` edge still points at an aggregate that did not move — **an edge crossing from the K8s cluster box into the storage-cluster box is the expected result**, and neither endpoint's parent may be changed to tidy it away.

The `service-selects-pod` / `pod-calls-service` / `pvc-to-netapp-aggr` edges MUST be preserved in both modes (`node` mode removes only `pod-to-node` on top of the shared behaviour). Every node/edge change MUST produce new objects immutably and MUST NOT mutate the input in place. Beyond that, in both modes **every** element `applyPodParentMode` returns MUST be a brand-new, independent object (`data` at least shallow-copied), not merely the changed ones — cytoscape aliases the `data` object handed to `cy.add`, and the expand-collapse extension rewrites the `data.source` / `data.target` of a collapsed controller's incident edges in place. If the return value shared objects with `baseElements`, that in-place rewrite would corrupt the normalised input, producing wrong edges and orphaning or vanishing whole workloads when the user switches back to the other mode.

#### Scenario: Controller mode is an identity clone

- **WHEN** `mode === 'controller'`
- **THEN** `applyPodParentMode` re-homes no pod and synthesises no edge; pods stay nested under their backend `controller` group and `pod-to-node` stays a drawn edge; every returned element is a new object (referentially distinct from the input) whose `data.parent` and edge-set content match the backend payload

#### Scenario: Node mode re-homes pods onto the K8s node and strips workload groups

- **WHEN** `mode === 'node'`
- **THEN** each pod's `data.parent` is reset to its `labels.node` (naming an existing `node` kind); every `namespace` / `application` / `controller` group node is stripped and its `pvc` / `service` members re-home onto their `cluster`; every `pod-to-node` edge is removed; the result is the flat `cluster > node > pod` view, and every returned element is a new object

#### Scenario: Missing labels.node falls back to staying under the cluster

- **WHEN** `mode === 'node'` and a pod's `labels.node` is missing, or its value names no existing `node`-kind element
- **THEN** that pod MUST stay under its `cluster` (it is not re-homed onto a non-existent node id) and the other pods are unaffected

#### Scenario: Service and storage edges survive in both modes

- **WHEN** the graph holds `service-selects-pod` / `pod-calls-service` / `pvc-to-netapp-aggr` edges (the `pvc-to-storageclass` this scenario originally named has been removed from the contract)
- **THEN** both modes keep them as drawn edges; `node` mode removes only `pod-to-node` on top of that, never these

#### Scenario: The NetApp storage chain is neither stripped nor re-homed in node mode

- **WHEN** `mode === 'node'` and the graph holds the `storage-cluster > netapp-node > netapp-aggr` nesting along with `pvc-to-netapp-aggr` edges
- **THEN** the `storage-cluster` group node MUST NOT be stripped, `netapp-node` / `netapp-aggr` MUST keep their `data.parent` verbatim, and the `pvc-to-netapp-aggr` edge still exists — its PVC end re-homed onto the cluster because the namespace group was stripped, its aggregate end untouched

#### Scenario: The input is never mutated in place

- **WHEN** `applyPodParentMode(elements, 'controller')` and `applyPodParentMode(elements, 'node')` are called in sequence on the same `elements`
- **THEN** the input `elements` array and its node/edge objects are unmodified (new objects are produced referentially) and neither call's result contaminates the other

### Requirement: The pod-parent-mode pure functions are unit-testable

`applyPodParentMode` and `drawnEdgeTypesForMode` MUST be pure functions with unit-test coverage.

#### Scenario: Pure-function test coverage

- **WHEN** CI runs `npm run test`
- **THEN** `applyPodParentMode.test.ts` covers: controller mode as an identity clone (pods stay nested under the backend `controller` group, no edge synthesised, `data.parent` and the edge set unchanged, every element a new object); node mode re-homing pods onto their `labels.node` (naming an existing `node` kind); node mode stripping the `namespace` / `application` / `controller` groups and re-homing `pvc` / `service` onto the `cluster`; node mode removing every `pod-to-node` edge; the fallback keeping a pod under its cluster when `labels.node` is missing or unresolvable; `service-selects-pod` / `pod-calls-service` / `pvc-to-netapp-aggr` surviving both modes; **the NetApp storage chain being neither stripped nor re-homed in either mode**; a cross-cluster `pod-calls-pod` being unaffected; and both modes returning independent new objects without mutating the input. `drawnEdgeTypesForMode.test.ts` covers both modes' edge sets (`node` mode excludes `pod-to-node`, and neither mode includes `pvc-to-storageclass`). All pass.
