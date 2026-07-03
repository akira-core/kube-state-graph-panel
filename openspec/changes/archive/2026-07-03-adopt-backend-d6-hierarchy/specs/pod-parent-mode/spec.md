## MODIFIED Requirements

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

### Requirement: 模式相依的可繪製邊集合與 legend / stylesheet 適配

系統 SHALL 以單一 master 樣式來源 `EDGE_STYLE_BY_TYPE` 涵蓋全部 8 種 `EdgeType`(`pod-to-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-storageclass` / `switch-to-switch` / `node-to-switch`),並導出純函式 `drawnEdgeTypesForMode(mode)`:`controller` 模式回傳 `['pod-mounts-pvc', 'pod-calls-pod', 'pod-calls-service', 'service-selects-pod', 'pod-to-node', 'pvc-to-storageclass', 'switch-to-switch', 'node-to-switch']`;`node` 模式回傳同集合**減去 `pod-to-node`**(即 `['pod-mounts-pvc', 'pod-calls-pod', 'pod-calls-service', 'service-selects-pod', 'pvc-to-storageclass', 'switch-to-switch', 'node-to-switch']`)——`pod-to-node` 在 `node` 模式以巢狀表示,由 `applyPodParentMode` 整體卸除。先前的合成邊 `pod-runs-on-node` / `controller-owns-pod` 已不存在(階層改由後端擁有,panel 不再合成)。`pvc-to-storageclass` 兩模式皆繪製;`service-selects-pod` 與 `pod-calls-service` 兩模式皆繪製(service 不再當 compound parent);實體網路 fabric 邊 `switch-to-switch` / `node-to-switch` **兩模式皆繪製**(以 `...SWITCH_EDGES` 併入兩模式回傳集)。`getStylesheet` 的 colorMap MUST 用 master `EDGE_STYLE_BY_TYPE`(mode-agnostic——可為任一存在的邊上色;某模式不存在的型別為惰性,不影響輸出)。`ALL_EDGE_TYPES` 與預設 `visibleEdgeTypes` MUST = 全部 8 種 `EdgeType`,使兩種模式的邊(含 switch fabric)預設皆可見(避免切到 controller 模式時 `pod-to-node` 被預設過濾,或 `switch-to-switch` / `node-to-switch` 被排除於預設可見集)。`EdgeLegend` 列出的邊 MUST 由 `drawnEdgeTypesForMode(當前模式)` ∩ 圖中實際出現的邊決定,並以既有的 `<from> → <to>`(箭頭 glyph 置中)格式呈現,MUST NOT 顯示額外的 nesting 說明文字。

#### Scenario: node 模式的 drawn 邊集合

- **WHEN** `mode === 'node'`
- **THEN** drawable 邊集含 `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-storageclass`,以及兩模式常駐的 `switch-to-switch` / `node-to-switch`;canvas 不繪製任何 `pod-to-node` 邊(以巢狀表示,由 `applyPodParentMode` 卸除)

#### Scenario: controller 模式的 drawn 邊集合

- **WHEN** `mode === 'controller'`
- **THEN** drawable 邊集含 `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pod-to-node` / `pvc-to-storageclass`,以及兩模式常駐的 `switch-to-switch` / `node-to-switch`;`pod-to-node` 邊以 master 樣式來源定義的顏色(`#3b82f6`)/線型繪製,`pvc-to-storageclass` 以其顏色(`#8b5cf6`)繪製

#### Scenario: switch fabric 邊兩模式常駐

- **WHEN** 圖中存在 `switch-to-switch` 或 `node-to-switch` 邊
- **THEN** 兩種 pod-parent 模式皆繪製之(不因模式切換消失),且預設可見(`visibleEdgeTypes` 預設涵蓋之)

#### Scenario: 未知邊類型仍走 fallback

- **WHEN** 任一模式下,邊 `data.edgeType` 不在 master 樣式來源中
- **THEN** 該邊以 fallback 灰色實線渲染,不拋出例外(沿用既有 forward-compat 行為)

### Requirement: Controller 模式重新掛載 pod 至 controller

系統 SHALL 提供純函式 `applyPodParentMode(elements, mode)`,於 `normalizeGraph` 之後、傳入 `GraphCanvas` 之前套用;`normalizeGraph` 本身 MUST 維持純 anti-corruption,不接受模式參數。**階層由後端(D6)擁有**,故 `mode === 'controller'`(預設)MUST 為 **identity clone**:MUST NOT 重新掛載任何 pod、MUST NOT 合成任何邊——pod 已由後端 payload 巢狀於其 `controller` 群組(完整 parent 鏈 `cluster > namespace > application > controller > pod`),`pod-to-node` 亦已為後端 drawn edge;此模式僅需逐一拷貝產生彼此獨立的新元素(`data` 至少淺拷貝),原 `data.parent` 與邊集合內容保持不變。`mode === 'node'` 時 MUST 回傳乾淨的基礎設施視圖(`cluster > node > pod`):對每個 `pod`,將其 `data.parent` 重設為其 `labels.node`(K8s node id),且僅當該 id 對應到**存在於 elements 的 `node` kind** 節點時才重掛——若 `labels.node` 缺漏或對應節點不存在,則 MUST 將該 pod 留在 `cluster` 下(fallback);同時 MUST 卸除所有 `namespace` / `application` / `controller` 群組節點,並將其非 pod 成員(`pvc` / `service` / `storageclass`)重新掛載至其 `cluster`;並 MUST 移除所有 `pod-to-node` 邊(該關係於 `node` 模式以巢狀表示)。`service-selects-pod` / `pod-calls-service` / `pvc-to-storageclass` 邊在兩模式皆 MUST 保留(`node` 模式僅額外移除 `pod-to-node`)。所有節點/邊變更 MUST 以 immutable 方式產生新物件,不就地修改輸入。此外,兩種模式下 `applyPodParentMode` 回傳的**每個**元素 MUST 為全新且彼此獨立的物件(`data` 至少淺拷貝),非僅變更者——因 cytoscape 會 alias 傳給 `cy.add` 的 `data` 物件,而 expand-collapse extension 於 controller 摺疊時就地改寫其 incident 邊的 `data.source` / `data.target`;若回傳共用了 `baseElements` 的物件,該就地改寫會污染正規化後的輸入(切回另一模式時將出現錯誤的邊並使整組 workload orphan/消失)。

#### Scenario: controller 模式為 identity clone

- **WHEN** `mode === 'controller'`
- **THEN** `applyPodParentMode` 不重新掛載任何 pod、不合成任何邊;pod 維持巢狀於其後端 `controller` 群組,`pod-to-node` 維持為 drawn edge;回傳的每個元素皆為新物件(referential 上不同於輸入),`data.parent` 與邊集合內容與後端 payload 相同

#### Scenario: node 模式重掛 pod 至 K8s node 並卸除 workload 群組

- **WHEN** `mode === 'node'`
- **THEN** 每個 pod 的 `data.parent` 重設為其 `labels.node`(對應到存在的 `node` kind);所有 `namespace` / `application` / `controller` 群組節點被卸除,其 `pvc` / `service` / `storageclass` 成員重新掛載至 `cluster`;所有 `pod-to-node` 邊被移除;結果為 `cluster > node > pod` 扁平視圖,回傳元素皆為新物件

#### Scenario: labels.node 不存在時 fallback 留在 cluster

- **WHEN** `mode === 'node'` 且某 pod 的 `labels.node` 缺漏,或其值未對應到任一存在的 `node` kind 節點
- **THEN** 該 pod MUST 留在其 `cluster` 下(不重掛至不存在的 node id),其餘 pod 不受影響

#### Scenario: service 與 storageclass 邊兩模式皆保留

- **WHEN** 圖中有 `service-selects-pod` / `pod-calls-service` / `pvc-to-storageclass` 邊
- **THEN** 兩模式皆保留之為 drawn edge;`node` 模式僅額外移除 `pod-to-node`(不移除上述邊)

#### Scenario: 不就地修改輸入

- **WHEN** 以同一組 elements 連續呼叫 `applyPodParentMode(elements, 'controller')` 與 `applyPodParentMode(elements, 'node')`
- **THEN** 輸入 `elements` 陣列與其節點/邊物件不被修改(referential 上產生新物件),兩次呼叫結果互不污染

### Requirement: pod-parent-mode 純函式可單測

`applyPodParentMode` 與 `drawnEdgeTypesForMode` MUST 為純函式並具備單元測試覆蓋。

#### Scenario: 純函式測試覆蓋

- **WHEN** CI 跑 `npm run test`
- **THEN** `applyPodParentMode.test.ts` 覆蓋:controller 模式為 identity clone(pod 維持巢狀於後端 `controller` 群組、不合成邊、`data.parent` 與邊集合不變、每個元素皆為新物件)、node 模式 re-parent pod 至其 `labels.node`(對應到存在的 `node` kind)、node 模式卸除 `namespace` / `application` / `controller` 群組並將 `pvc` / `service` / `storageclass` 重掛至 `cluster`、node 模式移除所有 `pod-to-node` 邊、`labels.node` 缺漏或不存在時 pod fallback 留在 cluster、`service-selects-pod` / `pod-calls-service` / `pvc-to-storageclass` 兩模式皆保留、跨 cluster `pod-calls-pod` 不受影響、兩模式回傳皆為獨立新物件(不就地修改輸入);`drawnEdgeTypesForMode.test.ts` 覆蓋兩種模式的邊集合(`node` 模式不含 `pod-to-node`),皆通過

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
