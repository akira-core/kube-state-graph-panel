## ADDED Requirements

### Requirement: Grafana Panel Plugin 註冊

系統 SHALL 在 `src/module.ts` 預設匯出一個 `PanelPlugin` 實例,完整實作 `@grafana/data` 的 panel plugin 介面,使 Grafana 載入後可在 panel type 清單中選擇本 plugin。

#### Scenario: Plugin 於 Grafana 中被發現

- **WHEN** Grafana 啟動並掃描 `/var/lib/grafana/plugins/<plugin-id>`
- **THEN** plugin 出現在「Add panel → Visualization」清單中,plugin id 與 `plugin.json` 一致,類型為 `panel`,且 unsigned 警告不阻擋載入(開發模式下)

#### Scenario: PanelPlugin 公開 options 編輯器

- **WHEN** 使用者於 dashboard 編輯 panel
- **THEN** 右側顯示 plugin 提供的 options 編輯器,且 options schema 與 `KsgPanel.types.ts` 定義一致

### Requirement: Cytoscape 畫布渲染

Panel SHALL 透過 cytoscape.js 在指定 DOM 容器中渲染 nodes 與 edges,並使用 fcose 作為預設 layout 演算法;當使用者切換為 dagre layout 時系統 MUST 重新佈局而不重建 instance。

#### Scenario: 預設 layout 顯示節點與邊

- **WHEN** Panel 收到 ≥1 個 node 與 ≥1 個 edge 的資料
- **THEN** cytoscape canvas 顯示對應數量的節點與邊,佈局為 fcose,且無 console 錯誤或警告

#### Scenario: Layout 切換不重建 instance

- **WHEN** 使用者於 panel options 將 layout 從 `fcose` 切換為 `dagre`
- **THEN** 同一 cytoscape instance 呼叫 `cy.stop()` 後執行 `cy.layout({ name: 'dagre' }).run()`,節點透過動畫過渡到新位置,instance reference 不變

### Requirement: 節點形狀依資源類型對應

系統 SHALL 透過集中於 `src/shared/constants/shapeByKind.ts` 的對應表,將上游 kube-state-graph node 類型(`NodeKind`)映射到不同 cytoscape node shape;對應表為唯一資料源,stylesheet 與 legend 元件皆從此匯入。`NodeKind` 列舉 MUST 對齊後端輸出:`pod` / `node` / `pvc` / `service` / `others` / `external`。

#### Scenario: 已知資源類型對應到正確形狀

- **WHEN** 節點 data 帶有 `kind: 'pod'`(或其他已定義 kind)
- **THEN** 該節點以對應 shape(例如 pod=ellipse)渲染,且形狀對應與 `shapeByKind.ts` 一致

#### Scenario: 未知資源類型走 fallback

- **WHEN** 節點 data 的 `kind` 不在對應表中
- **THEN** 該節點以 fallback shape(`round-rectangle`)渲染,並於 console 以 `debug` 等級提示未對應的 kind,不拋出例外

### Requirement: 邊顏色依關係類型對應

系統 SHALL 透過 `src/shared/constants/colorByEdgeType.ts` 將上游 edge type(`EdgeType`)映射到不同顏色與線型,並由同一份對應表供 stylesheet 與 legend 共用。`EdgeType` 列舉 MUST 對齊後端輸出:`pod-runs-on-node` / `pod-mounts-pvc` / `pod-calls-pod` / `service-selects-pod`。

#### Scenario: 已知邊類型對應到正確顏色

- **WHEN** 邊 data 帶有 `edgeType: 'service-selects-pod'`(或其他已定義 type)
- **THEN** 該邊以對應顏色與線型渲染,且與 `colorByEdgeType.ts` 定義一致

#### Scenario: 未知邊類型走 fallback

- **WHEN** 邊 data 的 `edgeType` 不在對應表中
- **THEN** 該邊以 fallback 灰色實線渲染,不拋出例外

### Requirement: Grafana Theme 適配

Panel SHALL 依 Grafana 當前 theme(light/dark)動態產生 cytoscape stylesheet,當使用者切換 Grafana theme 時,panel 必須在不重建 cytoscape instance 的前提下即時更新樣式。

#### Scenario: Theme 切換不重建 instance

- **WHEN** 使用者於 Grafana 全域切換 dark ↔ light theme
- **THEN** `useGraphTheme` hook 取得新 `GrafanaTheme2`,以新 theme 重算 stylesheet 並呼叫 `cy.style(stylesheet).update()`;`cyRef.current` 引用不變

### Requirement: 元件設計遵循 feature-first 結構與 co-location

所有 React 元件 MUST 遵循 design.md 「React 元件設計」決策:採 feature-first 目錄結構、元件 co-location(每個元件一個資料夾、含同名 `.tsx` / `.types.ts` / `.test.tsx` / `index.ts`)、function component only、禁止 default export(`module.ts` 除外)、跨 feature 不可越界 import 對方內部檔案。

#### Scenario: 結構 lint 通過

- **WHEN** CI 執行 `npm run lint`
- **THEN** ESLint 對 `src/**` 的目錄結構與 import 邊界規則(`import-x/no-default-export`、`import-x/no-restricted-paths`)通過,零警告

#### Scenario: 每個元件具備同名測試與型別檔

- **WHEN** 對 `src/features/**/components/*/` 進行檔案掃描
- **THEN** 每個元件資料夾皆同時存在 `<Name>.tsx`、`<Name>.types.ts`、`<Name>.test.tsx`、`index.ts` 四個檔案

### Requirement: Cytoscape × React 整合慣例

cytoscape 的整合 MUST 遵循 design.md 「Cytoscape.js × React × TypeScript 整合慣例」14 條規則;尤其是「instance 為單一真實狀態源」、「init 與 update effect 拆分」、「diff-and-patch 更新」、「extension 只在 module top-level 註冊一次」、「StrictMode cleanup 完整呼叫 `removeAllListeners` + `destroy`」。

#### Scenario: StrictMode 下無 listener 殘留與重複註冊警告

- **WHEN** 開發環境(React StrictMode 啟用)mount panel
- **THEN** cytoscape 完成 mount → unmount → re-mount 三步流程後,console 無 "Extension already registered" 警告,且 instance listener 數量等於初次 mount 後的數量

#### Scenario: 元素更新走 diff-and-patch

- **WHEN** props `elements` 從 N 個變為 N+M 個(M 個新增),且既有 N 個未變
- **THEN** cytoscape 對既有 N 個節點不執行 remove / re-add,僅新增 M 個節點;layout 平滑過渡而非全圖重排

### Requirement: 容器尺寸響應

Panel SHALL 使用 `ResizeObserver` 監聽 cytoscape 容器尺寸變化,並以 debounce(預設 100ms)觸發 `cy.resize()` 與 `cy.fit(undefined, padding)`,確保 Grafana panel 大小調整時 graph 自動適配。

#### Scenario: Panel 尺寸變化後自動 fit

- **WHEN** 使用者拖曳 Grafana panel 改變大小
- **THEN** `ResizeObserver` 在 debounce 後呼叫 `cy.resize()` 與 `cy.fit()`,所有節點仍在可視範圍內

### Requirement: 互動與選取狀態

Panel SHALL 支援節點點擊選取,選取狀態透過 cytoscape 內建 `:selected` style 視覺化,且可選地透過 `onSelect` callback 將被選節點 id 傳出供其他元件消費。

#### Scenario: 點擊節點觸發選取與 callback

- **WHEN** 使用者點擊任一節點
- **THEN** 該節點被 cytoscape 標記為 `:selected` 並套用對應樣式,若提供 `onSelect` prop 則以節點 id 呼叫之

### Requirement: 圖例 (Legend)

Panel SHALL 提供 legend 元件,顯示當前圖中出現的節點形狀與邊類型對應說明,legend 的形狀/顏色資料源 MUST 與 cytoscape stylesheet 共用同一份對應表(`shapeByKind.ts` / `colorByEdgeType.ts`)。

#### Scenario: Legend 與圖中元素一致

- **WHEN** Panel 收到含 pod / service / node 節點與 pod-runs-on-node / service-selects-pod 邊的資料
- **THEN** Legend 區域顯示三種節點形狀與兩種邊顏色的對應說明,且形狀/顏色與 canvas 中渲染一致

### Requirement: Hover Tooltip 顯示元素 metadata

Panel SHALL 在使用者 hover 於任一 node 或 edge 時顯示 `HoverTooltip` 元件;tooltip MUST 固定渲染於 cytoscape canvas wrapper 右上角(`position: absolute; top: 8px; right: 8px`),寬度約 280px,套用 `pointer-events: none` 以確保不阻擋下方圖形互動,且樣式 MUST 使用 `@grafana/ui` theme tokens(背景半透明 `theme.colors.background.secondary` + opacity ≥ 0.85)。

#### Scenario: Hover 節點顯示節點 metadata

- **WHEN** 使用者滑鼠 hover 於任一節點
- **THEN** `HoverTooltip` 顯示節點 `name`(`data.label ?? data.id`)、`kind`、`namespace`、`ipAddress`(`data.ipAddress` 以逗號串接顯示,僅當存在且非空時),以及白名單 labels(`app`、`version`、`app.kubernetes.io/name`、`app.kubernetes.io/instance`)中有值的欄位;缺漏欄位 MUST 不顯示其 row(不顯示空白 placeholder)

#### Scenario: Hover 邊顯示邊 metadata

- **WHEN** 使用者滑鼠 hover 於任一邊
- **THEN** `HoverTooltip` 顯示 `edgeType`、`source → target`(以兩端節點的 `label` 解析,而非裸 id)

#### Scenario: Tooltip 不阻擋圖形互動

- **WHEN** Tooltip 顯示中,使用者點擊 tooltip DOM 覆蓋區域底下的節點
- **THEN** 該節點被選取(觸發既有 `:selected` 樣式與 `onSelect` callback),tooltip 不攔截 click 事件(`pointer-events: none` 生效)

#### Scenario: 取消 hover 後 tooltip 淡出並從 DOM 移除

- **WHEN** 使用者滑鼠移出原 hovered 元素且未進入其他元素
- **THEN** `HoverTooltip` 以 opacity transition(≥ 100ms ≤ 200ms)淡出,動畫結束後 tooltip 不渲染任何 DOM(避免空 box 佔位)

#### Scenario: Hovered 元素被移除時清空 tooltip

- **WHEN** 一個元素 hover 中,該元素因 data refresh 從 cytoscape instance 中被 remove
- **THEN** `useHoverElement` 收到 `remove` 事件後清空 store,`HoverTooltip` 立即消失,不渲染參照已不存在元素的內容

#### Scenario: Hover 不觸發 GraphCanvas 重渲染

- **WHEN** 連續 hover 多個元素
- **THEN** 透過 `useSyncExternalStore` 訂閱的 `HoverTooltip` 元件重新渲染,但 `GraphCanvas` 與 cytoscape instance reference 不變(React DevTools profiler 驗證 `GraphCanvas` render count 不增加)

### Requirement: Node Kind / Edge Type 過濾

Panel SHALL 透過 Grafana panel options 提供兩個 `MultiSelect` 欄位 —— `visibleKinds`(可見的 `NodeKind` 集合)與 `visibleEdgeTypes`(可見的 `EdgeType` 集合)—— 預設為對應表(`SHAPE_BY_KIND` / 當前模式的 `drawnEdgeTypesForMode`)的全部 keys。被過濾的元素 MUST 以 `visibility: hidden` 隱藏(保留位置,不觸發 cytoscape 重新 layout),且過濾邏輯 MUST 集中於純函式 `computeVisibility(elements, visibleKinds, visibleEdgeTypes)` 以利單測。

`computeVisibility` 在 kind-pass 與 edge-pass 之後 MUST 再執行 **orphan 級聯隱藏**:任一 kind 可見的節點,若既無可見 incident drawn-edge(在 `visibleEdgeIds` 中以其為 source 或 target 的邊),又無可見子節點(`data.parent` 指向它且仍可見的節點),則 MUST 自 `visibleNodeIds` 移除,並一併移出以其為端點的邊。此判定 MUST 以 fixed-point 迭代直到穩定——移除節點後變空的父容器(K8s `node`、`cluster` 容器)MUST 在後續迭代中遞迴隱藏。orphan 級聯**永遠開啟、無開關**,且作用於最終可見集合,不區分節點是「資料本來就孤立」或「因過濾才孤立」。`cluster` 容器不因 kind 過濾隱藏,但 MUST 在其所有子節點皆不可見時被收掉。meta-edge(expand-collapse 合成)不在 `elements` 內,不參與 orphan 判定;被 collapse 視覺隱藏的子節點仍視為「可見子節點」(未自 `visibleNodeIds` 移除),故 collapsed 父容器 MUST NOT 被誤判為 orphan。

#### Scenario: 過濾節點 kind 後對應節點不可見且位置保留

- **WHEN** 使用者於 panel options 將 `visibleKinds` 中的 `pod` 取消勾選
- **THEN** 所有 `data.kind === 'pod'` 的節點以 `visibility: hidden` 隱藏;其餘節點位置不變(不觸發 layout 重排);cytoscape instance reference 不變

#### Scenario: 過濾邊 type 後對應邊不可見

- **WHEN** 使用者於 panel options 將 `visibleEdgeTypes` 中的 `service-selects-pod` 取消勾選
- **THEN** 所有 `data.edgeType === 'service-selects-pod'` 的邊以 `visibility: hidden` 隱藏;其他邊不受影響;未因此變孤立(仍有其他可見邊或可見子節點)的節點維持可見

#### Scenario: 邊在任一端點被隱藏時自動隱藏

- **WHEN** 邊的 source 或 target 節點因 `visibleKinds` 過濾而被隱藏
- **THEN** 該邊 MUST 也被隱藏(無懸空線),即使該邊的 `edgeType` 仍在 `visibleEdgeTypes` 中

#### Scenario: 過濾後失去所有可見連線的節點級聯隱藏

- **WHEN** 使用者過濾 edge type(或後端 `edge_type` scope 不回傳),導致某節點在 `visibleEdgeIds` 中再無任何以其為端點的邊,且該節點無可見子節點
- **THEN** 該節點 MUST 以 `visibility: hidden` 隱藏;以其為端點的邊一併隱藏;不觸發 layout 重排

#### Scenario: 變空的容器遞迴隱藏

- **WHEN** 某 K8s `node` 容器底下所有 pod 子節點皆因 orphan 級聯被隱藏,且該 `node` 無其他可見邊
- **THEN** 該 `node` 容器 MUST 在後續迭代中一併隱藏;若該動作使其所屬 `cluster` 容器再無任何可見子節點,則 `cluster` 容器亦 MUST 隱藏

#### Scenario: 有可見子節點的容器保留

- **WHEN** 某容器(K8s `node` 或 `cluster`)自身無可見 incident edge,但其底下仍有至少一個可見子節點
- **THEN** 該容器 MUST 維持可見(不被當作 orphan 隱藏)

#### Scenario: 資料本來就孤立的節點預設隱藏

- **WHEN** 上游回傳一個既無任何邊、又無任何子節點的節點(即使使用者未做任何過濾)
- **THEN** 該節點 MUST 被 orphan 級聯隱藏(規則一致,不保留無連線的孤立節點)

#### Scenario: 過濾不重跑 layout

- **WHEN** 使用者切換 `visibleKinds` 或 `visibleEdgeTypes`(含因此觸發的 orphan 級聯)
- **THEN** `useElementFilter` 透過 `cy.batch()` 套用 `style('visibility', ...)`;**不**呼叫 `cy.layout(...).run()`;節點位置保持原狀(座標不變)

#### Scenario: 全部 node kind 被過濾顯示 EmptyState

- **WHEN** 使用者將 `visibleKinds` 設為空陣列
- **THEN** 所有節點隱藏,Panel 覆蓋顯示 `EmptyState` 並顯示文字「All node types filtered」,canvas 本身保留(不重建 instance)

#### Scenario: 未知 kind 預設可見

- **WHEN** 上游回傳節點 `data.kind` 不在 `SHAPE_BY_KIND` keys 中(例:`CustomResource`),且使用者未對該 kind 做特別設定
- **THEN** 該節點 MUST 預設可見(`computeVisibility` 對 unknown kind 回傳可見),避免上游新增資源類型時資料無聲消失

#### Scenario: Legend 不受 filter 影響

- **WHEN** 使用者過濾任何 kind / edgeType
- **THEN** `NodeLegend` 與 `EdgeLegend` 仍顯示完整對應表(讀取 `SHAPE_BY_KIND` / `COLOR_BY_EDGE_TYPE`),使用者可知曉目前隱藏了哪些類型

#### Scenario: Tooltip 不會顯示被過濾元素

- **WHEN** 元素已被過濾隱藏(`visibility: hidden`)
- **THEN** cytoscape 不對該元素觸發 `mouseover`;`HoverTooltip` 不會顯示該元素 metadata

#### Scenario: 缺欄位 dashboard 升級走 defaults

- **WHEN** Panel 載入舊 dashboard,其 `panelOptions` 缺 `visibleKinds` / `visibleEdgeTypes` 欄位
- **THEN** `defaultOptions` fallback 生效(全部可見),行為等同未過濾,不拋例外

#### Scenario: `computeVisibility` 純函式可單測

- **WHEN** CI 跑 `npm run test`
- **THEN** `computeVisibility.test.ts` 覆蓋以下案例皆通過:全部可見、過濾單一 kind、過濾單一 edgeType、過濾節點同時造成邊端點失效、空 elements、unknown kind 預設可見、單層 orphan(節點失去唯一邊)、遞迴 orphan(pod→node→cluster 連鎖變空)、有可見子節點的容器保留、資料本來就孤立的節點被隱藏

### Requirement: 空狀態與錯誤狀態渲染

當資料為空、載入中、或上游 API 回傳錯誤時,Panel MUST 顯示對應狀態 UI(empty / loading / error),不可顯示空白 canvas 或拋例外到 React 樹外。

#### Scenario: 資料為空時顯示 empty state

- **WHEN** Panel 收到 `elements: []`
- **THEN** Panel 顯示 `EmptyState` 元件,文字提示無資料,canvas 區域留白

#### Scenario: API 錯誤時顯示 error 提示

- **WHEN** datasource query 失敗
- **THEN** Panel 顯示 `@grafana/ui` 風格的錯誤 banner,內含錯誤訊息與重試提示,不顯示破損的 cytoscape canvas

### Requirement: Status 外框

Panel SHALL 依節點 `data.status` 對 `pod` / `node` / `pvc` 渲染狀態外框,顏色取自單一資料源 `STATUS_COLOR`(`normal`→綠、`warning`→黃、`critical`→紅),缺值或非法值正規化為 `normal`。其餘 node kind 維持主題中性外框,但仍攜帶 `status` 供 detail 面板使用。Legend MUST 顯示三色 status 說明(`StatusLegend`)。

#### Scenario: 依 status 顯示外框

- **WHEN** 一個 `pod` / `node` / `pvc` 節點帶有 `data.status`
- **THEN** 該節點以對應 `STATUS_COLOR` 顏色渲染外框
- **WHEN** `status` 缺值或不在列舉中
- **THEN** 一律以 `normal`(綠)渲染

#### Scenario: 外框不影響選取與容器

- **WHEN** 節點被選取
- **THEN** 選取高亮(`node:selected`)覆蓋 status 外框
- **AND** 身為 compound parent 的 K8s `node` 仍顯示 status 外框(選擇器排序覆蓋 `node:parent`)

### Requirement: Node Detail 面板

Panel SHALL 在點擊節點時,於 canvas 底部以浮層(不縮放 graph)開啟 detail 面板,顯示節點 name、kind、status 三項,以及 `Alert Name` / `Alert Content` 兩個預留空區段;並在點擊背景 / 邊、切換到另一節點、或按關閉鈕時關閉。cytoscape 單選的藍色高亮 MUST 與面板開關同步。cluster 容器不可點選。

#### Scenario: 點節點開啟面板

- **WHEN** 使用者點擊任一節點
- **THEN** 底部浮層顯示該節點 label、kind badge、status badge,覆蓋於 graph 之上且不改變 graph 尺寸
- **AND** 該節點的選取高亮與開啟的面板同步

#### Scenario: 點外面或關閉鈕關閉

- **WHEN** 使用者點擊 graph 背景或邊,或按下關閉鈕
- **THEN** detail 面板關閉,且選取高亮清除

#### Scenario: 切換節點

- **WHEN** 面板開啟時使用者點擊另一個節點
- **THEN** 面板切換為新點擊的節點
