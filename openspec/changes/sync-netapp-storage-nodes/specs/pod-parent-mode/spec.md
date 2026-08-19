# pod-parent-mode delta — sync-netapp-storage-nodes

## MODIFIED Requirements

### Requirement: 模式相依的可繪製邊集合與 legend / stylesheet 適配

系統 SHALL 以單一 master 樣式來源 `EDGE_STYLE_BY_TYPE` 涵蓋全部 8 種 `EdgeType`(`pod-to-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-netapp-aggr` / `switch-to-switch` / `node-to-switch`),並導出純函式 `drawnEdgeTypesForMode(mode)`:`controller` 模式回傳 `['pod-mounts-pvc', 'pod-calls-pod', 'pod-calls-service', 'service-selects-pod', 'pod-to-node', 'pvc-to-netapp-aggr', 'switch-to-switch', 'node-to-switch']`;`node` 模式回傳同集合**減去 `pod-to-node`**(即 `['pod-mounts-pvc', 'pod-calls-pod', 'pod-calls-service', 'service-selects-pod', 'pvc-to-netapp-aggr', 'switch-to-switch', 'node-to-switch']`)——`pod-to-node` 在 `node` 模式以巢狀表示,由 `applyPodParentMode` 整體卸除。已移除的 `pvc-to-storageclass` MUST NOT 出現於 master 樣式來源、任一模式的回傳集、或 `ALL_EDGE_TYPES`。先前的合成邊 `pod-runs-on-node` / `controller-owns-pod` 已不存在(階層改由後端擁有,panel 不再合成)。`pvc-to-netapp-aggr` 兩模式皆繪製;`service-selects-pod` 與 `pod-calls-service` 兩模式皆繪製(service 不再當 compound parent);實體網路 fabric 邊 `switch-to-switch` / `node-to-switch` **兩模式皆繪製**(以 `...SWITCH_EDGES` 併入兩模式回傳集)。`getStylesheet` 的 colorMap MUST 用 master `EDGE_STYLE_BY_TYPE`(mode-agnostic——可為任一存在的邊上色;某模式不存在的型別為惰性,不影響輸出)。`ALL_EDGE_TYPES` 與預設 `visibleEdgeTypes` MUST = 全部 8 種 `EdgeType`,使兩種模式的邊(含 switch fabric)預設皆可見(避免切到 controller 模式時 `pod-to-node` 被預設過濾,或 `switch-to-switch` / `node-to-switch` 被排除於預設可見集)。`EdgeLegend` 列出的邊 MUST 由 `drawnEdgeTypesForMode(當前模式)` ∩ 圖中實際出現的邊決定,並以既有的 `<from> → <to>`(箭頭 glyph 置中)格式呈現,MUST NOT 顯示額外的 nesting 說明文字。

#### Scenario: node 模式的 drawn 邊集合

- **WHEN** `mode === 'node'`
- **THEN** drawable 邊集含 `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-netapp-aggr`,以及兩模式常駐的 `switch-to-switch` / `node-to-switch`;canvas 不繪製任何 `pod-to-node` 邊(以巢狀表示,由 `applyPodParentMode` 卸除)

#### Scenario: controller 模式的 drawn 邊集合

- **WHEN** `mode === 'controller'`
- **THEN** drawable 邊集含 `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pod-to-node` / `pvc-to-netapp-aggr`,以及兩模式常駐的 `switch-to-switch` / `node-to-switch`;`pod-to-node` 邊以 master 樣式來源定義的顏色(`#3b82f6`)/線型繪製,`pvc-to-netapp-aggr` 以其自身顏色繪製(與 `pod-mounts-pvc` 的紫色可區分)

#### Scenario: switch fabric 邊兩模式常駐

- **WHEN** 圖中存在 `switch-to-switch` 或 `node-to-switch` 邊
- **THEN** 兩種 pod-parent 模式皆繪製之(不因模式切換消失),且預設可見(`visibleEdgeTypes` 預設涵蓋之)

#### Scenario: 未知邊類型仍走 fallback

- **WHEN** 任一模式下,邊 `data.edgeType` 不在 master 樣式來源中
- **THEN** 該邊以 fallback 灰色實線渲染,不拋出例外(沿用既有 forward-compat 行為)

### Requirement: Controller 模式重新掛載 pod 至 controller

系統 SHALL 提供純函式 `applyPodParentMode(elements, mode)`,於 `normalizeGraph` 之後、傳入 `GraphCanvas` 之前套用;`normalizeGraph` 本身 MUST 維持純 anti-corruption,不接受模式參數。**階層由後端(D6)擁有**,故 `mode === 'controller'`(預設)MUST 為 **identity clone**:MUST NOT 重新掛載任何 pod、MUST NOT 合成任何邊——pod 已由後端 payload 巢狀於其 `controller` 群組(完整 parent 鏈 `cluster > namespace > application > controller > pod`),`pod-to-node` 亦已為後端 drawn edge;此模式僅需逐一拷貝產生彼此獨立的新元素(`data` 至少淺拷貝),原 `data.parent` 與邊集合內容保持不變。`mode === 'node'` 時 MUST 回傳乾淨的基礎設施視圖(`cluster > node > pod`):對每個 `pod`,將其 `data.parent` 重設為其 `labels.node`(K8s node id),且僅當該 id 對應到**存在於 elements 的 `node` kind** 節點時才重掛——若 `labels.node` 缺漏或對應節點不存在,則 MUST 將該 pod 留在 `cluster` 下(fallback);同時 MUST 卸除所有 `namespace` / `application` / `controller` 群組節點,並將其非 pod 成員(`pvc` / `service`)重新掛載至其 `cluster`;並 MUST 移除所有 `pod-to-node` 邊(該關係於 `node` 模式以巢狀表示)。

**NetApp 儲存鏈於 `node` 模式維持原狀**:`storage-cluster` **不是**被卸除的 workload 群組(卸除集恰為 `namespace` / `application` / `controller`),`netapp-node` / `netapp-aggr` 皆為真實節點而非群組,故整條 `storage-cluster > netapp-node > netapp-aggr` 巢狀 MUST 於兩模式**原樣保留**,`applyPodParentMode` MUST NOT 對其重新掛載或攤平。PVC 於 `node` 模式因其 `namespace` 群組被卸除而重掛至 cluster,但其 `pvc-to-netapp-aggr` 邊仍指向未被移動的 aggregate——**跨越 K8s cluster 框與 storage-cluster 框的邊是預期結果**,不得為此改動任一側的 parent。

`service-selects-pod` / `pod-calls-service` / `pvc-to-netapp-aggr` 邊在兩模式皆 MUST 保留(`node` 模式僅額外移除 `pod-to-node`)。所有節點/邊變更 MUST 以 immutable 方式產生新物件,不就地修改輸入。此外,兩種模式下 `applyPodParentMode` 回傳的**每個**元素 MUST 為全新且彼此獨立的物件(`data` 至少淺拷貝),非僅變更者——因 cytoscape 會 alias 傳給 `cy.add` 的 `data` 物件,而 expand-collapse extension 於 controller 摺疊時就地改寫其 incident 邊的 `data.source` / `data.target`;若回傳共用了 `baseElements` 的物件,該就地改寫會污染正規化後的輸入(切回另一模式時將出現錯誤的邊並使整組 workload orphan/消失)。

#### Scenario: controller 模式為 identity clone

- **WHEN** `mode === 'controller'`
- **THEN** `applyPodParentMode` 不重新掛載任何 pod、不合成任何邊;pod 維持巢狀於其後端 `controller` 群組,`pod-to-node` 維持為 drawn edge;回傳的每個元素皆為新物件(referential 上不同於輸入),`data.parent` 與邊集合內容與後端 payload 相同

#### Scenario: node 模式重掛 pod 至 K8s node 並卸除 workload 群組

- **WHEN** `mode === 'node'`
- **THEN** 每個 pod 的 `data.parent` 重設為其 `labels.node`(對應到存在的 `node` kind);所有 `namespace` / `application` / `controller` 群組節點被卸除,其 `pvc` / `service` 成員重新掛載至 `cluster`;所有 `pod-to-node` 邊被移除;結果為 `cluster > node > pod` 扁平視圖,回傳元素皆為新物件

#### Scenario: labels.node 不存在時 fallback 留在 cluster

- **WHEN** `mode === 'node'` 且某 pod 的 `labels.node` 缺漏,或其值未對應到任一存在的 `node` kind 節點
- **THEN** 該 pod MUST 留在其 `cluster` 下(不重掛至不存在的 node id),其餘 pod 不受影響

#### Scenario: service 與 storageclass 邊兩模式皆保留

- **WHEN** 圖中有 `service-selects-pod` / `pod-calls-service` / `pvc-to-netapp-aggr` 邊(本情境原先命名的 `pvc-to-storageclass` 已自契約移除)
- **THEN** 兩模式皆保留之為 drawn edge;`node` 模式僅額外移除 `pod-to-node`(不移除上述邊)

#### Scenario: NetApp 儲存鏈於 node 模式不被卸除或重掛

- **WHEN** `mode === 'node'` 且圖中含 `storage-cluster > netapp-node > netapp-aggr` 巢狀與 `pvc-to-netapp-aggr` 邊
- **THEN** `storage-cluster` 群組節點 MUST NOT 被卸除,`netapp-node` / `netapp-aggr` 的 `data.parent` MUST 原樣保留,`pvc-to-netapp-aggr` 邊仍存在(其 PVC 端因 namespace 群組卸除而重掛至 cluster,aggregate 端不動)

#### Scenario: 不就地修改輸入

- **WHEN** 以同一組 elements 連續呼叫 `applyPodParentMode(elements, 'controller')` 與 `applyPodParentMode(elements, 'node')`
- **THEN** 輸入 `elements` 陣列與其節點/邊物件不被修改(referential 上產生新物件),兩次呼叫結果互不污染

### Requirement: pod-parent-mode 純函式可單測

`applyPodParentMode` 與 `drawnEdgeTypesForMode` MUST 為純函式並具備單元測試覆蓋。

#### Scenario: 純函式測試覆蓋

- **WHEN** CI 跑 `npm run test`
- **THEN** `applyPodParentMode.test.ts` 覆蓋:controller 模式為 identity clone(pod 維持巢狀於後端 `controller` 群組、不合成邊、`data.parent` 與邊集合不變、每個元素皆為新物件)、node 模式 re-parent pod 至其 `labels.node`(對應到存在的 `node` kind)、node 模式卸除 `namespace` / `application` / `controller` 群組並將 `pvc` / `service` 重掛至 `cluster`、node 模式移除所有 `pod-to-node` 邊、`labels.node` 缺漏或不存在時 pod fallback 留在 cluster、`service-selects-pod` / `pod-calls-service` / `pvc-to-netapp-aggr` 兩模式皆保留、**NetApp 儲存鏈兩模式皆不被卸除或重掛**、跨 cluster `pod-calls-pod` 不受影響、兩模式回傳皆為獨立新物件(不就地修改輸入);`drawnEdgeTypesForMode.test.ts` 覆蓋兩種模式的邊集合(`node` 模式不含 `pod-to-node`、兩模式皆不含 `pvc-to-storageclass`),皆通過
