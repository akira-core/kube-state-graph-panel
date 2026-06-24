## MODIFIED Requirements

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
