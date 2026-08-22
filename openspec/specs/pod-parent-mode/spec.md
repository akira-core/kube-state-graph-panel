# pod-parent-mode Specification

## Purpose

TBD - created by archiving change scaffold-ksg-panel. Update Purpose after archive.
## Requirements

### Requirement: Pod-parent 模式切換控制

Panel SHALL 在 legend **最上方**(早於 `ClusterLegend` 等所有 section)提供一個 **layout 分段控制**(segmented,如 `@grafana/ui` `RadioButtonGroup`,兩選項 `Node` / `Controller`,標籤 `Layout`),用以在 `node` 與 `controller`(預設)兩種 pod compound 拓樸間切換,並高亮反映目前模式。此控制 MUST 取代既有「置於 `EdgeLegend` header 的 `IconButton` 切換鈕」——`EdgeLegend` 不再接收 `mode` / `onToggleMode` props,只負責列邊。模式狀態 MUST 為 `KsgPanel` 的 local React state(比照 `collapsedIds`),預設 `'controller'`,且 MUST NOT 實作為 Grafana panel option(runtime 不可由 panel UI 回寫 options)。切換 MUST 即時生效(無需進入 dashboard 編輯模式)。此處「layout」指 compound 群組拓樸,與 fcose / dagre 的佈局演算法選擇(panel option)為**不同概念**。**階層由後端(kube-state-graph D6)擁有**:`controller` 模式(預設)直接原樣消費後端 `/v1/graph` payload——pod 維持巢狀於其後端 `controller` 群組,完整 parent 鏈為 `cluster > namespace > application > controller > pod`,`pod-to-node` 以 drawn edge 表示;`node` 模式(基礎設施視圖)則由 `applyPodParentMode` 將每個 pod 重新掛載至其 K8s `node`、卸除 workload 群組層(`namespace` / `application` / `controller`),呈現扁平視圖 `cluster > node > pod`(`pod-to-node` 改以巢狀表示)。

#### Scenario: 分段控制切換模式

- **WHEN** 使用者點擊 legend 最上方 layout 分段控制的 `Controller` 段
- **THEN** `KsgPanel` 的 `podParentMode` 變為 `'controller'`,圖形即時重繪為後端階層 `cluster > namespace > application > controller > pod`;再點 `Node` 段則切回 `node`(`cluster > node > pod`,無 workload 群組層),皆無需進入 dashboard 編輯模式

#### Scenario: 控制置於 legend 最上方、EdgeLegend 不再有切換鈕

- **WHEN** 渲染 legend
- **THEN** layout 分段控制出現在所有 legend section 之上;`EdgeLegend` 不再渲染任何模式切換按鈕(僅列邊)

#### Scenario: 預設為 controller 模式

- **WHEN** Panel 初次載入(使用者尚未切換)
- **THEN** `podParentMode` 為 `'controller'`,layout 分段控制預設高亮 `Controller`;pod 巢狀於其後端 `controller` 群組(`cluster > namespace > application > controller > pod`,階層由後端 payload 提供)、`pod-to-node` 為 drawn edge;且圖中所有 controller 容器於初次載入即預設全摺疊(pod 聚合)

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

### Requirement: 模式切換觸發重新佈局

模式切換改變 compound 結構(`data.parent` 與邊集合),系統 MUST 在套用後觸發**恰一次**重新佈局。既有 collapse 專用的 render-phase run token 機制 MUST 一般化,使其在 `podParentMode` 變動時亦遞增 token,由 `useGraphLayout` 重跑 layout;visibility-only 的變更仍 MUST NOT 觸發重新佈局。

#### Scenario: 切換模式重跑 layout

- **WHEN** 使用者切換 `podParentMode`
- **THEN** run token 遞增,`useGraphLayout` 呼叫 `cy.stop()` 後 `cy.layout(opts).run()` 一次;cytoscape instance reference 不變;collapse 狀態經 `reconcileCollapse`(desired ∩ present)保留

#### Scenario: 模式未變不重跑 layout

- **WHEN** 其他 props 變更但 `podParentMode` 與 collapsed-id 內容皆未變
- **THEN** run token 不遞增,layout 不重跑

#### Scenario: 切換與還原皆實際改變 compound 巢狀

- **WHEN** 使用者切到 `controller` 模式,之後再切回 `node` 模式
- **THEN** pod 在 `controller` 模式 MUST 實際巢狀於其 owning controller 容器,切回 `node` 模式後 MUST 實際巢狀回其 K8s node 容器,雙向皆生效。因為 cytoscape 只在 `add()` 時可靠地建立 compound 巢狀(動態 `data('parent')` / `move()` 在 batch + expand-collapse extension 下不可靠),`useCytoscape` 偵測到 `podParentMode` 改變時 MUST 以整批重建(`cy.elements().remove()` + `cy.add(elements)`)套用新階層,而非 diff-patch;模式切換同時 bump layout run token,重建後重新佈局

### Requirement: The pod-parent-mode pure functions are unit-testable

`applyPodParentMode` and `drawnEdgeTypesForMode` MUST be pure functions with unit-test coverage.

#### Scenario: Pure-function test coverage

- **WHEN** CI runs `npm run test`
- **THEN** `applyPodParentMode.test.ts` covers: controller mode as an identity clone (pods stay nested under the backend `controller` group, no edge synthesised, `data.parent` and the edge set unchanged, every element a new object); node mode re-homing pods onto their `labels.node` (naming an existing `node` kind); node mode stripping the `namespace` / `application` / `controller` groups and re-homing `pvc` / `service` onto the `cluster`; node mode removing every `pod-to-node` edge; the fallback keeping a pod under its cluster when `labels.node` is missing or unresolvable; `service-selects-pod` / `pod-calls-service` / `pvc-to-netapp-aggr` surviving both modes; **the NetApp storage chain being neither stripped nor re-homed in either mode**; a cross-cluster `pod-calls-pod` being unaffected; and both modes returning independent new objects without mutating the input. `drawnEdgeTypesForMode.test.ts` covers both modes' edge sets (`node` mode excludes `pod-to-node`, and neither mode includes `pvc-to-storageclass`). All pass.

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

### Requirement: Controller 模式預設聚合(摺疊)controller 容器

為使 `controller` 模式預設呈現「pod 已聚合進其控制器」的精簡視圖,**於初次載入(controller 為預設模式)以及每次切入 `controller` 模式時**,系統 MUST 在該模式下首次出現 controller 容器的那一個 render 將圖中**所有 controller 容器**(後端提供並經 enrichment 標記 `data.isController === true` 的 controller 群組節點)加入 `collapsedIds`,使其預設為 collapsed;此預設摺疊 MUST 以 ref 守衛,使其在同一次 controller-mode 期間至多觸發一次——之後的 data refresh MUST NOT 重新摺疊(使用者已展開的 controller 維持展開),離開 controller 模式時重置守衛使再入時重新全摺疊。使用者可再自行展開個別 controller 以檢視其 pod。切回 `node` 模式時 controller 群組被 `applyPodParentMode` 卸除,其 id 經既有 `reconcileCollapse`(desired ∩ present)自然自 collapsed 集合淘汰;**再次**切入 `controller` 模式時 MUST 重新將所有 controller 容器摺疊(即每次進入皆全摺疊,不保留上次的展開狀態)。此預設聚合 MUST 僅作用於 controller 容器,不影響使用者對 `cluster` / K8s `node` 容器既有的 collapse 選擇。

#### Scenario: 初次載入或切入 controller 模式預設全摺疊

- **WHEN** Panel 初次載入(controller 為預設模式),或使用者自 `node` 切到 `controller` 模式
- **THEN** 該模式下 controller 容器首次出現時即全部預設為 collapsed(pod 聚合於其中),canvas 顯示 controller 圖示而非展開的 pod

#### Scenario: controller 模式 data refresh 不重新摺疊

- **WHEN** 使用者在 controller 模式展開某 controller,之後底層圖資料 refresh(controller 仍存在)
- **THEN** 該已展開的 controller MUST 維持展開(ref 守衛使預設摺疊在同一次 controller-mode 期間不再重跑)

#### Scenario: 展開後再進入仍全摺疊

- **WHEN** 使用者在 controller 模式展開某 controller、切回 `node`、再切回 `controller`
- **THEN** 所有 controller 容器再次預設全摺疊(不保留上次的展開)

#### Scenario: 不影響 cluster / node 的 collapse 選擇

- **WHEN** 使用者已摺疊某 `cluster` 容器,然後切入 `controller` 模式
- **THEN** 該 `cluster` 維持其 collapse 狀態;controller 容器另外被全摺疊

#### Scenario: 單一 pod 的 controller 也預設摺疊

- **WHEN** 切入 `controller` 模式且某 controller 僅擁有一個 pod
- **THEN** 該單 pod controller 同樣被預設摺疊(預設聚合作用於**每個** controller 容器,不論子 pod 數量,無 `>1` 例外)

#### Scenario: 預設摺疊的 controller 不被 orphan 級聯隱藏

- **WHEN** 切入 `controller` 模式、所有 controller 預設摺疊,且某 controller 自身無 incident drawn edge(pod 巢狀於其中,`pod-to-node` 由 pod 指向 K8s node、不經 controller)
- **THEN** 該 controller MUST NOT 被 orphan 級聯隱藏——其子 pod 經 `computeVisibility` 仍在 `visibleNodeIds` 中(collapse 為 cy 層視覺操作、不自可見集移除),故依 panel-rendering 的 orphan 規則「有可見子節點的容器保留」,collapsed controller 視為有可見子節點而留存
