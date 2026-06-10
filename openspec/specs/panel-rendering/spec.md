# panel-rendering Specification

## Purpose

TBD - created by archiving change scaffold-ksg-panel. Update Purpose after archive.

## Requirements

### Requirement: Grafana Panel Plugin 註冊

系統 SHALL 在 `src/module.ts` 以具名 export `plugin`(`export const plugin = new PanelPlugin<KsgPanelOptions>(KsgPanel)`)提供一個 `PanelPlugin` 實例,完整實作 `@grafana/data` 的 panel plugin 介面,使 Grafana 載入後可在 panel type 清單中選擇本 plugin。(`@grafana/create-plugin` 的 webpack runtime 以具名 `plugin` export 載入 panel,故本檔不使用 default export。)

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

### Requirement: 邊顏色依關係類型對應

系統 SHALL 透過 `src/shared/constants/colorByEdgeType.ts` 將 edge type(`EdgeType`)映射到不同顏色與線型,並由同一份對應表供 stylesheet 與 legend 共用。`EdgeType` 列舉涵蓋後端輸出的邊型別(`pod-runs-on-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `switch-to-switch` / `node-to-switch`),外加 panel 自 pod `data.owner` 合成的 `controller-owns-pod`(此型別**非**後端輸出,見 graph-data-integration),共 8 種。`pod-calls-service` 與 `service-selects-pod` MUST 共用與 `pod-calls-pod` **相同的橘色 `#f97316`**——一個 pod→service→pod hop 本質仍是 pod-to-pod 關係、只多一層 Service;這兩個服務型別並 MUST **自 edge legend 省略**(由 `pod → pod` 列代表,見下「圖例」需求),既不獨立列、也不合併為 `pod ↔ svc` 列。(歷史:曾為綠 `#10b981`,撞 status-normal 綠;再短暫為靛;最終統一為 pod-calls-pod 橘。)所有邊皆實線,方向以**箭頭**區分;`switch-to-switch` 與 `node-to-switch`(後端 v0.0.18 物理網路 fabric)MUST **完全共用同一 infra 色與實線線型**,並走相同的正交(`taxi`)路由(見 switch-tier-layout 規格),視覺上等同——`node-to-switch` 不再使用獨立靛色或 bézier,僅以端點(`<node> → <switch>` vs `<switch> → <switch>`)區分,使 K8s node 的上行連線讀起來即為 switch fabric 的一部分。`colorByEdgeType.ts` 同時匯出 `EDGE_ENDPOINTS_BY_TYPE`(每個 edge type 的來源/目標 `NodeKind`),供 legend 將 edge type 渲染為 `<from> → <to>`;`controller-owns-pod` 的端點 MUST 為 `<controller> → <pod>`,`switch-to-switch` 為 `<switch> → <switch>`,`node-to-switch` 為 `<node> → <switch>`。

#### Scenario: 已知邊類型對應到正確顏色

- **WHEN** 邊 data 帶有 `edgeType: 'controller-owns-pod'`(或其他已定義 type)
- **THEN** 該邊以對應顏色與線型渲染,且與 `colorByEdgeType.ts` 定義一致

#### Scenario: 邊顏色不與 status 顏色衝突

- **WHEN** 檢視 `EDGE_STYLE_BY_TYPE` 中任一 edge type 的顏色
- **THEN** 其顏色 MUST NOT 等於 `STATUS_COLOR` 的任一值(綠 `#73BF69` / 黃 `#F2CC0C` / 紅 `#E02F44`)——特別是服務邊改用與 `pod-calls-pod` 相同的橘色(非綠色),以免與健康狀態邊框混淆

#### Scenario: node-to-switch 與 switch-to-switch 視覺一致

- **WHEN** 圖中同時有 `node-to-switch` 與 `switch-to-switch` 邊
- **THEN** 兩者以相同 infra 色、相同實線線型、相同 `taxi` 正交路由渲染(僅端點不同);`node-to-switch` 不再以獨立靛色或 bézier 呈現

#### Scenario: 未知邊類型走 fallback

- **WHEN** 邊 data 的 `edgeType` 不在對應表中
- **THEN** 該邊以 fallback 灰色實線渲染,不拋出例外

### Requirement: Grafana Theme 適配

Panel SHALL 依 Grafana 當前 theme(light/dark)動態產生 cytoscape stylesheet,當使用者切換 Grafana theme 時,panel 必須在不重建 cytoscape instance 的前提下即時更新樣式。

#### Scenario: Theme 切換不重建 instance

- **WHEN** 使用者於 Grafana 全域切換 dark ↔ light theme
- **THEN** `useGraphTheme` hook 取得新 `GrafanaTheme2`,以新 theme 重算 stylesheet 並呼叫 `cy.style(stylesheet).update()`;`cyRef.current` 引用不變

### Requirement: 元件設計遵循 feature-first 結構與 co-location

所有 React 元件 MUST 遵循 design.md 「React 元件設計」決策:採 feature-first 目錄結構、元件 co-location(每個元件一個資料夾、含同名 `.tsx` / `.types.ts` / `.test.tsx` / `index.ts`)、function component only、`src/**` 一律禁止 default export 且全面採具名 export(`module.ts` 亦以具名 `plugin` export 提供 `PanelPlugin`,不再是 default-export 例外)、跨 feature 不可越界 import 對方內部檔案。

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

Panel SHALL 提供 legend 元件,顯示**圖中實際呈現的**節點 icon 與邊類型對應說明。Node legend 的 icon / 顏色資料源 MUST 與 cytoscape stylesheet 共用同一份對應表(`iconSvgByKind.ts` / `colorByEdgeType.ts`)。Node legend 的 kind 集合 MUST 由 collapse-aware 的 `deriveLegendKinds`(見「Node-kinds 圖例 collapse-aware」requirement)導出——只列出**目前以 glyph 呈現於畫布**的 kind(drawn leaf + 收合容器;展開容器與被收合祖先隱藏的子節點不列);Edge legend MUST 只列出**目前資料中出現的 edge type**,惟 `pod-calls-service` / `service-selects-pod` 一律**省略**(本質為 pod-to-pod,由 `pod → pod` 列代表——見下);兩者於對應集合為空時 MUST 不渲染(`return null`)。Node legend MUST 以隨主題上色的 icon glyph(取代既有 `ShapeGlyph`)呈現各 kind,並依 panel-owned 的 `kind → 超大類`(`categoryByKind.ts`:Workloads / Networking / Storage / Cluster / Other)查表**分組**,只渲染含 ≥1 個出現 kind 的大類;顏色 MUST NOT 編碼大類(顏色保留給狀態)。Edge legend 每列 MUST 渲染為 `<from> [箭頭 glyph] <to>`:箭頭 glyph(`EdgeGlyph`,帶該 edge 的顏色與線型)置於兩端 `NodeKind` 標籤中間以取代動詞,端點標籤由 `EDGE_ENDPOINTS_BY_TYPE` 解析(`service` 縮寫為 `svc`),且 MUST NOT 顯示額外的 nesting 說明文字。legend 區段的垂直順序 MUST 為:`Layout`(Node|Controller 切換,置頂)→ `Node Kinds` → `Edge Types` → `Status` → 三個 swatch 區段(`Clusters` → `Nodes`|`Controllers` → `Storage Classes`);亦即 swatch 區段置於 `Status` **之後**(legend 底部)。所有區段標題 MUST 為 Title Case(`Node Kinds` / `Edge Types` / `Status` / `Clusters` / `Storage Classes`)。

#### Scenario: Node legend 只列出以 glyph 呈現的 kind,依大類分組

- **WHEN** Panel 收到 pod / service / pvc / node 皆為 drawn leaf(無巢狀容器、無收合)且無 workload / switch 的資料
- **THEN** Node legend 只以 icon glyph 呈現 pod / service / pvc / node 並依大類分組(pod→Workloads、service→Networking、pvc→Storage、node→Cluster),未出現的 kind(deployment / switch …)不列出;顏色不用於區分大類
- **AND**(見 collapse-aware requirement)若 `node` 改為裝載 pod 的展開容器,則 `node` 不列於 Node legend(改於「Nodes」swatch 區段),收合後才以 glyph 回到 Node legend

#### Scenario: Edge legend 只列出圖中出現且未省略的 edge type

- **WHEN** 圖中存在 `pod-mounts-pvc` 與 `pod-calls-pod` 邊,但無 `switch-to-switch`
- **THEN** Edge legend 以 `<from> → <to>`(箭頭 glyph 置中)只呈現 `pod-mounts-pvc` / `pod-calls-pod`,`switch-to-switch` / `node-to-switch` 不列出;顏色/線型與 canvas 中渲染一致

#### Scenario: 服務邊自 edge legend 省略(本質為 pod-to-pod)

- **WHEN** 圖中存在 `pod-calls-service` / `service-selects-pod` 邊
- **THEN** 該兩型別 MUST NOT 出現於 edge legend(無獨立列、亦無合併的 `pod ↔ svc` 列);它們在 canvas 以與 `pod-calls-pod` 相同的橘色繪製,於 legend 由 `pod → pod` 列代表

#### Scenario: 對應集合為空時不渲染

- **WHEN** 圖中無任何節點(或無任何 drawn 邊)
- **THEN** Node legend(或 Edge legend)`return null`,不渲染空標題

### Requirement: Hover Tooltip 顯示元素 metadata

Panel SHALL 在使用者 hover 於任一 node 或 edge 時顯示 `HoverTooltip` 元件;tooltip MUST 浮動定位於被 hover 元素附近(`position: absolute`,node 取其 rendered 中心、edge 取游標 rendered 位置,加固定偏移),並夾擠 / 翻轉於 cytoscape canvas wrapper 邊界內(偏移後超出右 / 下緣時翻轉至元素左側並夾於 wrapper 內,不超出可視範圍),寬度約 280px,套用 `pointer-events: none` 以確保不阻擋下方圖形互動,且樣式 MUST 使用 `@grafana/ui` theme tokens(背景半透明 `theme.colors.background.secondary` + opacity ≥ 0.85)。

#### Scenario: Hover 節點顯示節點 metadata

- **WHEN** 使用者滑鼠 hover 於任一節點
- **THEN** `HoverTooltip` 顯示節點 `name`(`data.label ?? data.id`)、`kind`、`namespace`、`ipAddress`(`data.ipAddress` 以逗號串接顯示,僅當存在且非空時),以及白名單 labels(`app`、`version`、`app.kubernetes.io/name`、`app.kubernetes.io/instance`)中有值的欄位;缺漏欄位 MUST 不顯示其 row(不顯示空白 placeholder)

#### Scenario: Hover 邊顯示邊 metadata

- **WHEN** 使用者滑鼠 hover 於任一邊
- **THEN** `HoverTooltip` 顯示 `edgeType`、`source → target`(以兩端節點的 `label` 解析,而非裸 id)

#### Scenario: Tooltip 定位於 hovered 元素附近

- **WHEN** 使用者 hover 於某節點
- **THEN** tooltip 以該節點 rendered 位置加固定偏移定位(動態 `left` / `top`),而非固定於角落
- **AND** 當偏移後 tooltip 會超出 canvas 右 / 下緣時,翻轉至節點左側並夾擠於 wrapper 邊界內

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

Panel SHALL 透過 Grafana panel options 提供兩個 `MultiSelect` 欄位 —— `visibleKinds`(可見的 `NodeKind` 集合)與 `visibleEdgeTypes`(可見的 `EdgeType` 集合)—— 預設為對應表(`ICON_SVG_BY_KIND` / 當前模式的 `drawnEdgeTypesForMode`)的全部 keys。被過濾的元素 MUST 以 `visibility: hidden` 隱藏(保留位置,不觸發 cytoscape 重新 layout),且過濾邏輯 MUST 集中於純函式 `computeVisibility(elements, visibleKinds, visibleEdgeTypes)` 以利單測。

`computeVisibility` 在 kind-pass 與 edge-pass 之後 MUST 再執行 **orphan 級聯隱藏**:任一 kind 可見的節點,若既無可見 incident drawn-edge(在 `visibleEdgeIds` 中以其為 source 或 target 的邊),又無可見子節點(`data.parent` 指向它且仍可見的節點),則 MUST 自 `visibleNodeIds` 移除,並一併移出以其為端點的邊。此判定 MUST 以 fixed-point 迭代直到穩定——移除節點後變空的父容器(K8s `node`、controller、`cluster` 容器)MUST 在後續迭代中遞迴隱藏。orphan 級聯**永遠開啟、無開關**,且作用於最終可見集合,不區分節點是「資料本來就孤立」或「因過濾才孤立」。`cluster` 容器不因 kind 過濾隱藏,但 MUST 在其所有子節點皆不可見時被收掉。meta-edge(expand-collapse 合成)不在 `elements` 內,不參與 orphan 判定;被 collapse 視覺隱藏的子節點仍視為「可見子節點」(未自 `visibleNodeIds` 移除),故 collapsed 父容器 MUST NOT 被誤判為 orphan。

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

- **WHEN** 某容器(K8s `node`、controller 或 `cluster`)自身無可見 incident edge,但其底下仍有至少一個可見子節點
- **THEN** 該容器 MUST 維持可見(不被當作 orphan 隱藏)

#### Scenario: controller 子 pod 全被過濾時 controller 一併隱藏

- **WHEN** `controller` 模式下某 controller 容器底下所有 pod 子節點皆因 kind / edge **過濾**(`visibility: hidden`,而非 collapse)自 `visibleNodeIds` 移除,且該 controller 無其他可見 incident edge
- **THEN** 該 controller 容器 MUST 被 orphan 級聯隱藏——**filter-hidden 子節點不計為「可見子節點」(與 collapse-hidden 不同**);若其 `cluster` 因此再無可見子節點,`cluster` 亦遞迴隱藏

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

- **WHEN** 上游回傳節點 `data.kind` 不在 `ICON_SVG_BY_KIND` keys 中(例:`ingress`),且使用者未對該 kind 做特別設定
- **THEN** 該節點 MUST 預設可見(`computeVisibility` 對 unknown kind 回傳可見),避免上游新增資源類型時資料無聲消失

#### Scenario: Legend 反映資料、不受 filter 影響

- **WHEN** 使用者過濾任何 kind / edgeType
- **THEN** `NodeLegend` / `EdgeLegend` 列出的集合 MUST 不受 filter 影響——`EdgeLegend` 取自**資料中出現的** edge type、`NodeLegend` 取自 collapse-aware 的 `deriveLegendKinds`(吃 `elements` + `collapsedIds`,**不**吃 `visibleKinds`);被過濾的元素仍在 `elements` 內(僅 `visibility: hidden`)、collapse 狀態亦不變,故 legend 仍列出,使用者可知曉目前隱藏了哪些類型。(注:legend 隨 **collapse** 變動是另一回事,見「Node-kinds 圖例 collapse-aware」requirement)

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

Panel SHALL 依節點 `data.status` 渲染狀態外框,顏色取自單一資料源 `STATUS_COLOR`(`normal`→綠、`warning`→黃、`critical`→紅),缺值或非法值正規化為 `normal`。狀態外框 MUST 套用於**任何後端有回報 `data.status` 的 kind**(資料驅動,不再硬編碼 `pod`/`node`/`pvc` 清單);後端未回報 status 的節點維持主題中性外框,但仍攜帶 `status`(預設 `normal`)供 detail 面板使用。Legend MUST 顯示三色 status 說明(`StatusLegend`)。

#### Scenario: 依 status 顯示外框

- **WHEN** 任一節點(含 workload kind 如 `deployment`)帶有後端回報的 `data.status`
- **THEN** 該節點以對應 `STATUS_COLOR` 顏色渲染外框
- **WHEN** `status` 缺值或不在列舉中
- **THEN** 一律以 `normal`(綠)渲染

#### Scenario: 外框不影響選取與容器

- **WHEN** 節點被選取
- **THEN** 選取高亮(`node:selected`)覆蓋 status 外框
- **AND** 身為 compound parent 的 K8s `node` 或 controller 仍顯示 status 外框(選擇器排序覆蓋 `node:parent`)

### Requirement: Node Detail 面板

Panel SHALL 在點擊節點時,於 canvas 底部以浮層(不縮放 graph)開啟 detail 面板,顯示節點 name、kind、status 三項,以及一個**告警表格**(`@grafana/ui` `InteractiveTable`,欄位 Pod / Service / Alert / Severity / **Count** / **Last occurred**);並在點擊背景 / 邊、切換到另一節點、或按關閉鈕時關閉。cytoscape 單選的藍色高亮 MUST 與面板開關同步。cluster 容器不可點選。

告警資料來自上游 graph JSON 節點的選用欄位 `alerts: NodeAlert[]`(`normalizeGraph` 攜帶至 `data.alerts`,缺值或空陣列→無列)。每筆 `NodeAlert` 以 `timeRecords: number[]`(Unix 秒,升序,同一 alert 的所有發生時間)表示重複發生;後端已把同一 alert 分組為**單筆**(panel **不**再去重),故告警表格**一列代表一個 alert**。**Count** 欄 MUST 顯示 `timeRecords.length`(發生次數),並 MUST 透過 `@grafana/ui` `Tooltip` 列出全部發生時間(依 `timeZone` 格式化)——即完整的「occur time」清單。**Last occurred** 欄 MUST 顯示最後發生時間 `max(timeRecords)`(格式化),且 MUST 為可點擊元素:點擊時以 `t = max(timeRecords)`(Unix 秒)為中心、固定 ±5 分鐘(300 秒),呼叫 `onChangeTimeRange({ from: (t-300)*1000, to: (t+300)*1000 })`(毫秒)倒帶 dashboard 時間範圍。`severity` 為自由字串:`info` / `warning` / `critical` 取單一資料源 `SEVERITY_COLOR` 對應色,其餘自訂標籤 MUST 原樣保留並以 `FALLBACK_SEVERITY_COLOR`(critical 色)著色,不報錯。節點無告警時 MUST 顯示「No alerts」訊息而非空表格。

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

#### Scenario: 顯示告警表格(分組,一列一個 alert)

- **WHEN** 選取的節點帶有 `data.alerts`(一或多筆)
- **THEN** detail 面板以 `InteractiveTable` 逐列顯示告警,**一列代表一個 alert**,欄位為 Pod / Service / Alert / Severity / Count / Last occurred
- **AND** Pod 或 Service 缺值時該格顯示 `—`

#### Scenario: Count 徽章與發生時間 Tooltip

- **WHEN** 某 alert 的 `timeRecords` 含 N 個發生時間
- **THEN** 該列 Count 欄顯示 `N`(= `timeRecords.length`)
- **AND** hover Count 時以 `@grafana/ui` `Tooltip` 列出全部 N 個發生時間(依 `timeZone` 格式化)

#### Scenario: Severity 著色(自由字串 + SEVERITY_COLOR)

- **WHEN** 告警 `severity` 為 `info` / `warning` / `critical`
- **THEN** 該列 Severity 以對應 `SEVERITY_COLOR` 著色徽章呈現
- **WHEN** `severity` 不在 `SEVERITY_COLOR` 中(自訂標籤,如 `fatal`)
- **THEN** 以 `FALLBACK_SEVERITY_COLOR`(critical 色)著色、且徽章原樣保留該標籤文字,不報錯

#### Scenario: 點 Last occurred 倒帶時間範圍

- **WHEN** 使用者點擊某列的 Last occurred 欄,該 alert `timeRecords` 的最大值為 `t`(Unix 秒)
- **THEN** panel 呼叫 `onChangeTimeRange({ from: (t-300)*1000, to: (t+300)*1000 })`(±5 分鐘,毫秒)
- **AND** dashboard 時間範圍倒帶至該窗(以最後發生時間為中心)

#### Scenario: 無告警空狀態

- **WHEN** 選取的節點無 `alerts` 欄位或為空陣列
- **THEN** detail 面板顯示「No alerts」訊息,不渲染表格

### Requirement: 容器圖例(NodeContainerLegend)隨 pod-parent 模式切換容器來源

`NodeContainerLegend`(以 cluster 色上色的 compound 容器清單,含「全部摺疊 / 展開」切換)列出的容器來源 MUST 隨 `podParentMode` 切換:`node` 模式列出 K8s `node` 容器(`cluster > node > pod` 的中間層);`controller` 模式改列 controller 容器(`cluster > controller > pod` 的中間層)。兩模式皆以容器所屬 cluster 的 accent 色上色(與 canvas 容器底色同源),且「全部摺疊」切換 MUST 作用於**當前模式**的容器集合(經 `deriveNodeContainers` 等單一來源導出,使切換鈕與 canvas 容器永遠指向同一組)。容器圖例 MUST 在當前模式無任何 compound 容器時 `return null`。

#### Scenario: node 模式列 K8s node 容器

- **WHEN** `podParentMode === 'node'` 且圖中有裝載 pod 的 K8s node
- **THEN** `NodeContainerLegend` 列出這些 K8s node(以各自 cluster 色),「全部摺疊」作用於該 node 容器集合

#### Scenario: controller 模式列 controller 容器

- **WHEN** `podParentMode === 'controller'` 且圖中有裝載 pod 的 controller
- **THEN** `NodeContainerLegend` 改列這些 controller(以各自 cluster 色);「全部摺疊」改作用於 controller 容器集合

#### Scenario: 當前模式無容器時不渲染

- **WHEN** 當前模式下圖中無任何 compound 容器(例:無 owner 的裸 pod 在 controller 模式)
- **THEN** `NodeContainerLegend` `return null`,不渲染空標題

### Requirement: StorageClass compound 容器渲染與圖例(**完全比照 K8s node 容器**)

StorageClass 群組(`data.type === 'storageclass'`)MUST 為一個**真的 `NodeKind`**(`'storageclass'` ∈ `NodeKind`、∈ `ICON_SVG_BY_KIND`、`categoryByKind` → `Storage`),同時由 normalize 標 `isStorageClass: true`。它 MUST 與 K8s `node` 容器**完全對等**地渲染與處理:

- stylesheet MUST **不**含任何 storageclass 專屬選擇器:它走 base `node`(由 `kind` 解析 icon)+ `node:parent`。故**展開**(為 `:parent`)時是不帶 icon、取**父 cluster** accent 的純分組 backplate;**收合 / leaf**(非 `:parent`)時顯示其 `storageclass` kind icon(三層磁碟堆疊 glyph)——與收合的 K8s `node` 容器一致。它 MUST 保持可互動、可收合(無 `events:'no'`)。MUST NOT 攜帶 status / alerts。
- `isStorageClass` 旗標 MUST 僅驅動三項非樣式行為:(a)獨立「Storage classes」swatch legend 區段;(b)`resolveSelectedNode` 排除(純分組盒、無 detail);(c)hover context 合成。
- Panel MUST 提供**獨立**的「Storage classes」swatch legend 區段(`StorageClassLegend`,經純函式 `deriveStorageClassContainers` 導出、以父 cluster 色上色、name 去重、childless 者視為 leaf 不列入),含「全部摺疊 / 展開」切換。此區段 MUST 為 **mode-independent**(`node` / `controller` 兩模式皆顯示),且無 storageclass 容器時 MUST `return null`。
- hover tooltip MUST 顯示 context:`kind: storageclass`(因已有 kind 而自然顯示)+ 其 cluster(`useHoverElement` 自父 cluster 容器讀)+ 群組 PVC 清單(自子節點 label 讀、排序;長清單換行)。

#### Scenario: 展開的 storageclass 群組為無 icon 的 cluster 上色容器

- **WHEN** 圖中有一個展開的 `isStorageClass` 容器,巢狀於某 cluster 容器、其下有 PVC 子節點
- **THEN** 該容器以 `round-rectangle` 渲染、`background-image` 為 `none`、底色取父 cluster accent;其下 PVC 仍各自攜帶 pvc icon

#### Scenario: 收合 / leaf 的 storageclass 群組顯示 storage glyph

- **WHEN** 該 storageclass 節點為收合或 childless(非 `:parent`)
- **THEN** 其 `background-image` 為 theme 上色的 `storageclass` kind icon(`ICON_SVG_BY_KIND.storageclass`,三層磁碟堆疊),比照收合的 K8s `node` 容器

#### Scenario: 無 storageclass 時不渲染該區段

- **WHEN** 資料中無任何 storageclass 容器
- **THEN** 「Storage classes」legend 區段 `return null`,不渲染空標題

#### Scenario: storageclass hover 顯示合成 context

- **WHEN** 滑鼠移至一個 storageclass 群組(其下有數個 PVC、巢狀於某 cluster)
- **THEN** tooltip 顯示其名稱(title)、`kind: storageclass`、`cluster: <name>`、以及 `PVCs (N): <逗號分隔、排序的 PVC 名稱>`

#### Scenario: storageclass 容器預設收合(mode-independent)

- **WHEN** Panel 首次載入且圖中含 storageclass 容器
- **THEN** 所有 storageclass 容器 MUST 預設**收合**(`node` / `controller` 兩模式皆然),其 id 於首次載入即併入 `collapsedIds` 推給 GraphCanvas;ref 守衛使後續 data refresh **不**重收(使用者展開的 storageclass 保持展開)
- **AND** 因預設已收合,「Storage classes」collapse 切換鈕(`storageclass-collapse-toggle`)首次點擊作為「全部展開」動作

### Requirement: 收合容器(controller / k8s node)邊框依最差子節點 status 上色

當一個**容器收合**時(controller 或 k8s `node`),其矩形邊框 MUST 以它**收合後會隱藏的最差 status** 對應的 `STATUS_COLOR`(`normal` 綠 `#73BF69` / `warning` 黃 / `critical` 紅)上色。資料來源為 normalize 彙整於該節點的 `data.worstStatus`(見 graph-data-integration:controller = 子 pod 最差 status;k8s node = 自身 status 與子 pod status 之最差,worst-wins)。stylesheet MUST 以 `node[worstStatus="<status>"].cy-expand-collapse-collapsed-node` 選擇器實作,宣告於 `statusSelectors`(資料驅動的 `node[status="<s>"]`——**任何帶 `status` 的節點**畫自身 status 邊框,非 pod/node/pvc 白名單;normalize 只在後端實際給 status 時才寫該欄,故 service / external / cluster / storageclass 等無 status 者維持中性邊框)**之後**,使**收合的 k8s node** 的最差子節點 status 能覆寫其自身 status 邊框;controller 無 status 邊框,故此為其唯一上色。`node:selected` 以 outline/underlay 呈現故不影響此邊框色。**展開**的容器不套此選擇器(controller 維持中性 `:parent` 容器邊框、k8s node 維持自身 status 邊框)。最差為 `normal`(無 `worstStatus`)的容器收合時 MUST 維持原邊框(controller 中性 / node 自身 `normal` 綠)。採 **status**(非 alert severity):`info` 僅存在於 alert、不在 status 量尺,故收合框永不為 info(`SEVERITY_COLOR` 仍只服務 detail panel 的 alert 表)。

#### Scenario: 收合 controller 顯示最差子 pod status

- **WHEN** 某 controller 旗下有 pod `status: critical`,使用者**收合**該 controller
- **THEN** 收合的 controller 矩形邊框以 `STATUS_COLOR.critical`(紅)上色
- **WHEN** 同一 controller **展開**
- **THEN** 邊框回到中性 `:parent` 容器色

#### Scenario: 收合 k8s node 以最差子 status 覆寫自身 status 邊框

- **WHEN** 某 k8s `node` 自身 `status: normal`、旗下有 pod `status: critical`,使用者**收合**該 node
- **THEN** 收合的 node 矩形邊框以 `STATUS_COLOR.critical`(紅)上色(覆寫其自身 normal 綠)
- **WHEN** 同一 node **展開**
- **THEN** 邊框回到自身 status(`normal` 綠);其子 pod 各自顯示自身 status 邊框

#### Scenario: 子節點皆 normal 的容器收合維持原邊框

- **WHEN** 某容器(controller 或 node)收合後會隱藏的最差 status 為 `normal`(故無 `worstStatus`)
- **THEN** controller 維持中性容器色、k8s node 維持自身 `normal` status 邊框(皆不額外上色)

### Requirement: Node-kinds 圖例 collapse-aware(只列實際以 glyph 呈現者)

icon「Node Kinds」圖例的 kind 集合 MUST 由純函式 `deriveLegendKinds(elements, collapsedIds)` 導出,只列出**目前以 glyph 呈現於畫布**的 kind——而非單純「資料中出現過」的 kind。判定規則(對每個非 cluster、帶 `kind` 的節點):被收合祖先隱藏者**不**計入;**展開的**容器(其 id 為他人 `parent` 且自身未收合)**不**計入(它在 Clusters / Nodes|Controllers / Storage Classes swatch 區段呈現);其餘(drawn leaf 或**收合的**容器)計入其 kind。`cluster`(無 kind)永不計入。此規則取代舊有的 `presentKinds` + `deriveContainers.showNodeKindIcon`,使 node / controller / storageclass 三種容器一致。

#### Scenario: 收合 storageclass 時 Node-kinds 以 storageclass 取代 pvc

- **WHEN** 某 storageclass 容器(其下 PVC)被收合
- **THEN** 其 PVC 因被收合祖先隱藏而退出 Node-kinds 圖例,收合的 storageclass 顯示其 glyph 而進入——即 STORAGE 大類由 `pvc` 變為 `storageclass`;展開後還原為 `pvc`

#### Scenario: 收合容器時其子 kind 退出、容器 kind 進入(node / controller 同理)

- **WHEN** 某 K8s `node`(或 controller)容器被收合,其下 pod 全被聚合隱藏
- **THEN** `pod` 退出 Node-kinds 圖例、`node`(或對應 controller kind)以其 glyph 進入;展開的容器則不出現在 Node-kinds(僅於其 swatch 區段)
