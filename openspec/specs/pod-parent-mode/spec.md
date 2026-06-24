# pod-parent-mode Specification

## Purpose

TBD - created by archiving change scaffold-ksg-panel. Update Purpose after archive.
## Requirements
### Requirement: Pod-parent 模式切換控制

Panel SHALL 在 legend **最上方**(早於 `ClusterLegend` 等所有 section)提供一個 **layout 分段控制**(segmented,如 `@grafana/ui` `RadioButtonGroup`,兩選項 `Node` / `Controller`,標籤 `Layout`),用以在 `node` 與 `controller`(預設)兩種 pod compound 拓樸間切換,並高亮反映目前模式。此控制 MUST 取代既有「置於 `EdgeLegend` header 的 `IconButton` 切換鈕」——`EdgeLegend` 不再接收 `mode` / `onToggleMode` props,只負責列邊。模式狀態 MUST 為 `KsgPanel` 的 local React state(比照 `collapsedIds`),預設 `'controller'`,且 MUST NOT 實作為 Grafana panel option(runtime 不可由 panel UI 回寫 options)。切換 MUST 即時生效(無需進入 dashboard 編輯模式)。此處「layout」指 compound 群組拓樸(`cluster > node > pod` ⇄ `cluster > namespace > controller > pod`),與 fcose / dagre 的佈局演算法選擇(panel option)為**不同概念**。controller 模式的 namespace 層由 `applyNamespaceGrouping` 於 `applyPodParentMode` 之後在 controller 模式插入;`node` 模式不繪製 namespace(維持 `cluster > node > pod`)。

#### Scenario: 分段控制切換模式

- **WHEN** 使用者點擊 legend 最上方 layout 分段控制的 `Controller` 段
- **THEN** `KsgPanel` 的 `podParentMode` 變為 `'controller'`,圖形即時重繪為 `cluster > namespace > controller > pod` 拓樸;再點 `Node` 段則切回 `node`(`cluster > node > pod`,無 namespace),皆無需進入 dashboard 編輯模式

#### Scenario: 控制置於 legend 最上方、EdgeLegend 不再有切換鈕

- **WHEN** 渲染 legend
- **THEN** layout 分段控制出現在所有 legend section 之上;`EdgeLegend` 不再渲染任何模式切換按鈕(僅列邊)

#### Scenario: 預設為 controller 模式

- **WHEN** Panel 初次載入(使用者尚未切換)
- **THEN** `podParentMode` 為 `'controller'`,layout 分段控制預設高亮 `Controller`;pod 巢狀於其 owning controller(`cluster > namespace > controller > pod`,namespace 層由 `applyNamespaceGrouping` 在 controller 模式插入)、`controller-owns-pod` 不繪製(以巢狀表示)、合成 `pod-runs-on-node` 為 drawn edge;且圖中所有 controller 容器於初次載入即預設全摺疊(pod 聚合)

### Requirement: 模式相依的可繪製邊集合與 legend / stylesheet 適配

系統 SHALL 以單一 master 樣式來源 `EDGE_STYLE_BY_TYPE` 涵蓋全部 8 種 `EdgeType`(`pod-runs-on-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `controller-owns-pod` / `switch-to-switch` / `node-to-switch`),並導出純函式 `drawnEdgeTypesForMode(mode)`:`node` 模式回傳 `['pod-mounts-pvc', 'pod-calls-pod', 'pod-calls-service', 'service-selects-pod', 'switch-to-switch', 'node-to-switch']`;`controller` 模式回傳 `['pod-mounts-pvc', 'pod-calls-pod', 'pod-calls-service', 'service-selects-pod', 'pod-runs-on-node', 'switch-to-switch', 'node-to-switch']`。`controller-owns-pod` 為 synthesis-internal,不屬於任一模式的 drawn-set(node 模式被 `applyPodParentMode` 過濾,controller 模式以巢狀表示)。`service-selects-pod` 與 `pod-calls-service` 兩模式皆繪製(service 不再當 compound parent);實體網路 fabric 邊 `switch-to-switch` / `node-to-switch` **兩模式皆繪製**(以 `...SWITCH_EDGES` 併入兩模式回傳集)。`getStylesheet` 的 colorMap MUST 用 master `EDGE_STYLE_BY_TYPE`(mode-agnostic——可為任一存在的邊上色;某模式不存在的型別為惰性,不影響輸出)。`ALL_EDGE_TYPES` 與預設 `visibleEdgeTypes` MUST = 全部 8 種 `EdgeType`,使兩種模式的邊(含 switch fabric)預設皆可見(避免切到 controller 模式時 `pod-runs-on-node` 被預設過濾,或 `switch-to-switch` / `node-to-switch` 被排除於預設可見集)。`EdgeLegend` 列出的邊 MUST 由 `drawnEdgeTypesForMode(當前模式)` ∩ 圖中實際出現的邊決定,並以既有的 `<from> → <to>`(箭頭 glyph 置中)格式呈現,MUST NOT 顯示額外的 nesting 說明文字。

#### Scenario: node 模式的 drawn 邊集合

- **WHEN** `mode === 'node'`
- **THEN** drawable 邊集含 `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod`,以及兩模式常駐的 `switch-to-switch` / `node-to-switch`;canvas 不繪製任何 `pod-runs-on-node` 邊(以巢狀表示),亦不繪製 `controller-owns-pod`(合成 controller 與其 owns 邊在 node 模式被 `applyPodParentMode` 整體過濾)

#### Scenario: controller 模式的 drawn 邊集合

- **WHEN** `mode === 'controller'`
- **THEN** drawable 邊集含 `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pod-runs-on-node`,以及兩模式常駐的 `switch-to-switch` / `node-to-switch`;canvas 不繪製任何 `controller-owns-pod` 邊(以巢狀表示);合成的 `pod-runs-on-node` 邊以 master 樣式來源定義的顏色/線型繪製

#### Scenario: switch fabric 邊兩模式常駐

- **WHEN** 圖中存在 `switch-to-switch` 或 `node-to-switch` 邊
- **THEN** 兩種 pod-parent 模式皆繪製之(不因模式切換消失),且預設可見(`visibleEdgeTypes` 預設涵蓋之)

#### Scenario: 未知邊類型仍走 fallback

- **WHEN** 任一模式下,邊 `data.edgeType` 不在 master 樣式來源中
- **THEN** 該邊以 fallback 灰色實線渲染,不拋出例外(沿用既有 forward-compat 行為)

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

### Requirement: pod-parent-mode 純函式可單測

`applyPodParentMode` 與 `drawnEdgeTypesForMode` MUST 為純函式並具備單元測試覆蓋。

#### Scenario: 純函式測試覆蓋

- **WHEN** CI 跑 `npm run test`
- **THEN** `applyPodParentMode.test.ts` 覆蓋:node 模式過濾掉合成 controller 節點與 `controller-owns-pod` 邊、controller 模式單一 controller re-parent + 合成 `pod-runs-on-node` edge + 移除 `controller-owns-pod` 邊、多 controller tie-break、無 controller 的 pod 不動、`service-selects-pod`/`pod-calls-service` 兩模式皆保留、跨 cluster `pod-calls-pod` 不受影響、兩模式回傳皆為獨立新物件(不就地修改輸入);`drawnEdgeTypesForMode.test.ts` 覆蓋兩種模式的邊集合(node 模式不含 `controller-owns-pod`),皆通過

### Requirement: Controller 模式重新掛載 pod 至 controller

系統 SHALL 提供純函式 `applyPodParentMode(elements, mode)`,於 `normalizeGraph` 之後、傳入 `GraphCanvas` 之前套用;`normalizeGraph` 本身 MUST 維持純 anti-corruption,不接受模式參數。`mode === 'node'` 時 MUST 回傳乾淨的基礎設施視圖(`cluster > node > pod`):過濾掉所有合成 controller 節點(`data.isController === true`)與所有 `controller-owns-pod` 邊(此兩者僅屬 controller 視圖),`pod-runs-on-node` 以巢狀表示;node 模式因此不再 referential passthrough,而是回傳已過濾且每個元素皆為新物件的副本。`mode === 'controller'` 時,對每個「存在至少一條 `controller-owns-pod` 邊指向它(`target = pod`)」的 pod,系統 MUST:(1) 以 `source`(controller id)字典序最小者為新 parent,將該 pod 的 `data.parent` 重設為該 controller id;(2) 合成一條 `edgeType: 'pod-runs-on-node'` 的 drawn edge,`source = pod`、`target = 該 pod 在 node 模式下的原 parent(K8s node)`,邊 id 為 `ppm:pod-runs-on-node:<podId>`。**原 parent MUST 於 re-parent 前擷取**(re-parent 後該 pod 的 `data.parent` 已改指 controller);且僅當該原 parent 為**存在於 elements 的 K8s `node` kind** 時才合成此邊——原 parent 為 `cluster` 容器(K8s node 不在 scope)或不存在時 MUST NOT 合成 pod-to-node edge(該 pod 仍 re-parent 至其 controller)。此外系統 MUST 移除**所有** `controller-owns-pod` 邊——該關係在 `controller` 模式以巢狀表示,不繪製。對沒有任何 `controller-owns-pod` 邊指向的 pod(例如獨立 pod、或後端未發 owner 關係),系統 MUST 不變更其 parent、不合成 pod-to-node edge。`service-selects-pod` 與 `pod-calls-service` 邊在兩模式皆 MUST 保留(不移除)。所有節點/邊變更 MUST 以 immutable 方式產生新物件,不就地修改輸入。此外,兩種模式下 `applyPodParentMode` 回傳的**每個**元素 MUST 為全新且彼此獨立的物件(`data` 至少淺拷貝),非僅變更者——因 cytoscape 會 alias 傳給 `cy.add` 的 `data` 物件,而 expand-collapse extension 於 controller 摺疊時就地改寫其 incident 邊的 `data.source` / `data.target`;若回傳共用了 `baseElements` 的物件,該就地改寫會污染正規化後的輸入(切回 node 模式時將出現錯誤的 `controller→pvc` 邊並使整組 workload orphan/消失)。

#### Scenario: 有 controller 的 pod 巢狀進 controller

- **WHEN** `mode === 'controller'` 且某 pod 有恰一條 `controller-owns-pod` 邊來自 controller `C`(如 Deployment)
- **THEN** 該 pod 的 `data.parent` 變為 `C` 的 id;新增一條 `pod-runs-on-node` drawn edge 由該 pod 指向其原 K8s node;該 `C → pod` 的 `controller-owns-pod` 邊自 elements 移除

#### Scenario: 多 controller 取字典序最小者

- **WHEN** `mode === 'controller'` 且某 pod 同時被 controller `b-ctrl` 與 `a-ctrl` 擁有(兩條 `controller-owns-pod` 邊)
- **THEN** 該 pod 巢狀於 `a-ctrl`(id 字典序最小);`controller-owns-pod` 在 controller 模式不繪製,故 `a-ctrl → pod` 與 `b-ctrl → pod` 的 owns 邊皆移除;合成 `pod-runs-on-node` 邊由 pod 指向其原 K8s node

#### Scenario: 無對應 controller 的 pod 維持掛在 node

- **WHEN** `mode === 'controller'` 且某 pod 無任何 `controller-owns-pod` 邊指向它(例:裸 pod,或後端未發 owner)
- **THEN** 該 pod 的 `data.parent` 不變(續掛 K8s node);不為其合成 pod-to-node edge

#### Scenario: 原 parent 非 K8s node 的 pod 不合成 pod-runs-on-node

- **WHEN** `mode === 'controller'` 且某有 owner 的 pod 在 node 模式下的原 parent 是 `cluster` 容器(K8s node 不在 scope),非 K8s `node`
- **THEN** 該 pod re-parent 至其 controller,但 MUST NOT 合成 `pod-runs-on-node` 邊(不可指向 cluster 容器)

#### Scenario: service 邊兩模式皆保留

- **WHEN** `mode === 'controller'` 且某 pod 有 `service-selects-pod` 與 `pod-calls-service` 邊
- **THEN** 這兩條邊 MUST 保留為 drawn edge(controller 模式不移除 service 相關邊),pod 仍巢狀於其 controller

#### Scenario: node 模式過濾掉 controller

- **WHEN** `mode === 'node'`
- **THEN** `applyPodParentMode` 回傳乾淨的 `cluster > node > pod` 視圖:所有合成 controller 節點(`data.isController === true`)與所有 `controller-owns-pod` 邊被移除,其餘 pod / node / service / pvc / 邊與其原 parent 不變;回傳元素皆為新物件(非 referential 相同)

#### Scenario: 不就地修改輸入

- **WHEN** 以同一組 elements 連續呼叫 `applyPodParentMode(elements, 'controller')` 與 `applyPodParentMode(elements, 'node')`
- **THEN** 輸入 `elements` 陣列與其節點/邊物件不被修改(referential 上產生新物件),兩次呼叫結果互不污染

### Requirement: Controller 模式預設聚合(摺疊)controller 容器

為使 `controller` 模式預設呈現「pod 已聚合進其控制器」的精簡視圖,**於初次載入(controller 為預設模式)以及每次切入 `controller` 模式時**,系統 MUST 在該模式下首次出現 controller 容器的那一個 render 將圖中**所有 controller 容器**(合成 controller 節點)加入 `collapsedIds`,使其預設為 collapsed;此預設摺疊 MUST 以 ref 守衛,使其在同一次 controller-mode 期間至多觸發一次——之後的 data refresh MUST NOT 重新摺疊(使用者已展開的 controller 維持展開),離開 controller 模式時重置守衛使再入時重新全摺疊。使用者可再自行展開個別 controller 以檢視其 pod。切回 `node` 模式時 controller 不再是容器,其 id 經既有 `reconcileCollapse`(desired ∩ present)自然自 collapsed 集合淘汰;**再次**切入 `controller` 模式時 MUST 重新將所有 controller 容器摺疊(即每次進入皆全摺疊,不保留上次的展開狀態)。此預設聚合 MUST 僅作用於 controller 容器,不影響使用者對 `cluster` / K8s `node` 容器既有的 collapse 選擇。

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
- **THEN** 該單 pod controller 同樣被預設摺疊(預設聚合作用於**每個**合成 controller 容器,不論子 pod 數量,無 `>1` 例外)

#### Scenario: 預設摺疊的 controller 不被 orphan 級聯隱藏

- **WHEN** 切入 `controller` 模式、所有 controller 預設摺疊,且某 controller 自身無 incident drawn edge(`controller-owns-pod` 在此模式已收為巢狀)
- **THEN** 該 controller MUST NOT 被 orphan 級聯隱藏——其子 pod 經 `computeVisibility` 仍在 `visibleNodeIds` 中(collapse 為 cy 層視覺操作、不自可見集移除),故依 panel-rendering 的 orphan 規則「有可見子節點的容器保留」,collapsed controller 視為有可見子節點而留存

