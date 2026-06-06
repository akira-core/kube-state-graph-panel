## ADDED Requirements

### Requirement: Pod-parent 模式切換控制

Panel SHALL 提供一個 legend 互動按鈕,在 `node`(預設)與 `service` 兩種 pod compound 模式間切換。模式狀態 MUST 為 `KsgPanel` 的 local React state(比照 `collapsedIds`),預設 `'node'`,且 MUST NOT 實作為 Grafana panel option(runtime 不可由 panel UI 回寫 options)。切換按鈕的外觀與互動 MUST 與既有 legend collapse 按鈕一致(放置於 legend 區、即時生效)。

#### Scenario: 按鈕切換模式

- **WHEN** 使用者點擊 legend 的 pod-parent 切換按鈕
- **THEN** `KsgPanel` 的 `podParentMode` local state 在 `'node'` 與 `'service'` 間翻轉,圖形即時依新模式重繪,無需進入 dashboard 編輯模式

#### Scenario: 預設為 node 模式

- **WHEN** Panel 初次載入(使用者尚未切換)
- **THEN** `podParentMode` 為 `'node'`,圖形與本功能加入之前的行為完全一致(pod 巢狀於 K8s node、`service-selects-pod` 為 drawn edge、`pod-runs-on-node` 不繪製)

### Requirement: Service 模式重新掛載 pod 至 service

系統 SHALL 提供純函式 `applyPodParentMode(elements, mode)`,於 `normalizeGraph` 之後、傳入 `GraphCanvas` 之前套用;`normalizeGraph` 本身 MUST 維持純 anti-corruption,不接受模式參數。`mode === 'node'` 時 MUST 原樣回傳輸入(referential 相同)。`mode === 'service'` 時,對每個「存在至少一條 `service-selects-pod` 邊指向它(`target = pod`)」的 pod,系統 MUST:(1) 以 `source`(service id)字典序最小者為新 parent,將該 pod 的 `data.parent` 重設為該 service id;(2) 合成一條 `edgeType: 'pod-runs-on-node'` 的 drawn edge,`source = pod`、`target = 該 pod 在 node 模式下的原 parent(K8s node)`,邊 id 為 `ppm:pod-runs-on-node:<podId>`(僅當原 parent 存在時)。此外系統 MUST 移除**所有** `service-selects-pod` 邊——該關係在 `service` 模式以巢狀表示,不繪製。對沒有任何 `service-selects-pod` 邊指向的 pod(例如 headless service 無 Service node、或獨立 pod),系統 MUST 不變更其 parent、不合成 pod-to-node edge。所有節點/邊變更 MUST 以 immutable 方式產生新物件,不就地修改輸入。

#### Scenario: 有 service 的 pod 巢狀進 service

- **WHEN** `mode === 'service'` 且某 pod 有恰一條 `service-selects-pod` 邊來自 service `S`
- **THEN** 該 pod 的 `data.parent` 變為 `S` 的 id;新增一條 `pod-runs-on-node` drawn edge 由該 pod 指向其原 K8s node;該 `S → pod` 的 `service-selects-pod` 邊自 elements 移除

#### Scenario: 多 service 取字典序最小者

- **WHEN** `mode === 'service'` 且某 pod 同時被 service `b-svc` 與 `a-svc` 選取(兩條 `service-selects-pod` 邊)
- **THEN** 該 pod 巢狀於 `a-svc`(id 字典序最小);`service-selects-pod` 在 service 模式不繪製,故 `a-svc → pod` 與 `b-svc → pod` 的 select 邊皆移除;合成 `pod-runs-on-node` 邊由 pod 指向其原 K8s node

#### Scenario: 無對應 service 的 pod 維持掛在 node

- **WHEN** `mode === 'service'` 且某 pod 無任何 `service-selects-pod` 邊指向它(例:headless service 後端不產生 Service node)
- **THEN** 該 pod 的 `data.parent` 不變(續掛 K8s node);不為其合成 pod-to-node edge

#### Scenario: node 模式為 passthrough

- **WHEN** `mode === 'node'`
- **THEN** `applyPodParentMode` 回傳的 elements 與輸入等價(parent 與邊集合不變)

#### Scenario: 不就地修改輸入

- **WHEN** 以同一組 elements 連續呼叫 `applyPodParentMode(elements, 'service')` 與 `applyPodParentMode(elements, 'node')`
- **THEN** 輸入 `elements` 陣列與其節點/邊物件不被修改(referential 上產生新物件),兩次呼叫結果互不污染

### Requirement: 模式相依的可繪製邊集合與 legend / stylesheet 適配

系統 SHALL 以單一 master 樣式來源 `EDGE_STYLE_BY_TYPE` 涵蓋全部 4 種 `EdgeType`(含 `pod-runs-on-node`),並導出純函式 `drawnEdgeTypesForMode(mode)`:`node` 模式回傳 `['pod-mounts-pvc', 'pod-calls-pod', 'service-selects-pod']`;`service` 模式回傳 `['pod-mounts-pvc', 'pod-calls-pod', 'pod-runs-on-node']`。`getStylesheet` 的 colorMap MUST 用 master `EDGE_STYLE_BY_TYPE`(mode-agnostic——可為任一存在的邊上色;某模式不存在的型別為惰性,不影響輸出)。`ALL_EDGE_TYPES` 與預設 `visibleEdgeTypes` MUST = 全部 4 種 `EdgeType`,使兩種模式的邊預設皆可見(避免切到 service 模式時 `pod-runs-on-node` 被預設過濾)。`EdgeLegend` 列出的邊與其巢狀註解 MUST 由 `drawnEdgeTypesForMode(當前模式)` 決定,並說明當前哪一種 pod 關係退為巢狀(`node` 模式:`pod-runs-on-node` 以巢狀表示;`service` 模式:`service-selects-pod` 以巢狀表示)。

#### Scenario: node 模式的 drawn 邊集合

- **WHEN** `mode === 'node'`
- **THEN** `EdgeLegend` 顯示 `pod-mounts-pvc` / `pod-calls-pod` / `service-selects-pod` 三種邊,且註解說明 `pod-runs-on-node` 以巢狀表示;canvas 不繪製任何 `pod-runs-on-node` 邊

#### Scenario: service 模式的 drawn 邊集合

- **WHEN** `mode === 'service'`
- **THEN** `EdgeLegend` 顯示 `pod-mounts-pvc` / `pod-calls-pod` / `pod-runs-on-node` 三種邊,且註解說明 `service-selects-pod` 以巢狀表示;合成的 `pod-runs-on-node` 邊以 master 樣式來源定義的顏色/線型繪製

#### Scenario: 未知邊類型仍走 fallback

- **WHEN** 任一模式下,邊 `data.edgeType` 不在 master 樣式來源中
- **THEN** 該邊以 fallback 灰色實線渲染,不拋出例外(沿用既有 forward-compat 行為)

### Requirement: 模式切換觸發重新佈局

模式切換改變 compound 結構(`data.parent` 與邊集合),系統 MUST 在套用 diff-patch 後觸發**恰一次**重新佈局。既有 collapse 專用的 render-phase run token 機制 MUST 一般化,使其在 `podParentMode` 變動時亦遞增 token,由 `useGraphLayout` 重跑 layout;visibility-only 的變更仍 MUST NOT 觸發重新佈局。

#### Scenario: 切換模式重跑 layout

- **WHEN** 使用者切換 `podParentMode`
- **THEN** run token 遞增,`useGraphLayout` 呼叫 `cy.stop()` 後 `cy.layout(opts).run()` 一次;cytoscape instance reference 不變;collapse 狀態經 `reconcileCollapse`(desired ∩ present)保留

#### Scenario: 模式未變不重跑 layout

- **WHEN** 其他 props 變更但 `podParentMode` 與 collapsed-id 內容皆未變
- **THEN** run token 不遞增,layout 不重跑

#### Scenario: 切換與還原皆實際改變 compound 巢狀

- **WHEN** 使用者切到 `service` 模式,之後再切回 `node` 模式
- **THEN** pod 在 `service` 模式 MUST 實際巢狀於其 service 容器,切回 `node` 模式後 MUST 實際巢狀回其 K8s node 容器,雙向皆生效。因為 cytoscape 只在 `add()` 時可靠地建立 compound 巢狀(動態 `data('parent')` / `move()` 在 batch + expand-collapse extension 下不可靠),`useCytoscape` 偵測到 `podParentMode` 改變時 MUST 以整批重建(`cy.elements().remove()` + `cy.add(elements)`)套用新階層,而非 diff-patch;模式切換同時 bump layout run token,重建後重新佈局

### Requirement: pod-parent-mode 純函式可單測

`applyPodParentMode` 與 `drawnEdgeTypesForMode` MUST 為純函式並具備單元測試覆蓋。

#### Scenario: 純函式測試覆蓋

- **WHEN** CI 跑 `npm run test`
- **THEN** `applyPodParentMode.test.ts` 覆蓋:node 模式 passthrough、service 模式單一 service re-parent + 合成 edge + 移除 select 邊、多 service tie-break、無 service pod 不動、跨 cluster `pod-calls-pod` 不受影響、不就地修改輸入;`drawnEdgeTypesForMode.test.ts` 覆蓋兩種模式的邊集合,皆通過
