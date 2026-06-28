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

系統 SHALL 透過 `src/shared/constants/colorByEdgeType.ts` 將 edge type(`EdgeType`)映射到不同顏色與線型,並由同一份對應表供 stylesheet 與 legend 共用。`EdgeType` 列舉涵蓋後端輸出的邊型別(`pod-runs-on-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `switch-to-switch` / `node-to-switch`),外加 panel 自 pod `data.owner` 合成的 `controller-owns-pod`(此型別**非**後端輸出,見 graph-data-integration),共 8 種。`pod-calls-service` 與 `service-selects-pod` MUST 共用與 `pod-calls-pod` **相同的橘色 `#f97316`**——一個 pod→service→pod hop 本質仍是 pod-to-pod 關係、只多一層 Service;這兩個服務型別並 MUST **自 edge legend 省略**(無獨立列、亦無額外合併列),由 `pod-calls-pod` 的單一列代表——該列渲染為 `pod ↔ pod/service`(雙向箭頭 glyph),標示其同時涵蓋直連與經 Service 的 pod-to-pod 關係(見下「圖例」需求)。(歷史:曾為綠 `#10b981`,撞 status-normal 綠;再短暫為靛;最終統一為 pod-calls-pod 橘。)所有邊皆實線,方向以**箭頭**區分;`switch-to-switch` 與 `node-to-switch`(後端 v0.0.18 物理網路 fabric)MUST **完全共用同一 infra 色與實線線型**,並走相同的正交(`taxi`)路由(見 switch-tier-layout 規格),視覺上等同——`node-to-switch` 不再使用獨立靛色或 bézier,僅以端點(`<node> → <switch>` vs `<switch> → <switch>`)區分,使 K8s node 的上行連線讀起來即為 switch fabric 的一部分。`colorByEdgeType.ts` 同時匯出 `EDGE_ENDPOINTS_BY_TYPE`(每個 edge type 的來源/目標 `NodeKind`),供 legend 將 edge type 渲染為 `<from> → <to>`;`controller-owns-pod` 的端點 MUST 為 `<controller> → <pod>`,`switch-to-switch` 為 `<switch> → <switch>`,`node-to-switch` 為 `<node> → <switch>`。

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

**所有 compound parent 節點 MUST 為可選取(`selectable`)**——含 `controller` / K8s `node` / `storageclass`,以及裝飾性 `cluster` / `namespace` / `application` 群組。`normalizeGraph` MUST NOT 再把裝飾群組標為 `selectable: false`。此可選取性的唯一目的,是讓 `cytoscape-expand-collapse` 既已啟用(`cueEnabled: true`)的 **`+/-` 摺疊 cue** 能浮現:該 cue 為 selection-driven,僅於**單一被選取**且為 `:parent`(或已收合)的節點上繪製。故使用者點選任一 compound parent → 該 parent 浮現其 `+/-` cue → 點 cue 切換該 parent 的收合 / 展開(沿用既有 expand-collapse plumbing,無新元件、無新收合機制)。

裝飾群組雖可被選取(顯示單選環與既有 selection-focus 視覺),但 MUST NOT 開啟 node-detail 面板:`resolveSelectedNode` 經 `isDashboardEligible` 對 `isCluster` / `isNamespace` / `isApplication` 一律回 `null`,此守衛不變。

#### Scenario: 點擊節點觸發選取與 callback

- **WHEN** 使用者點擊任一節點
- **THEN** 該節點被 cytoscape 標記為 `:selected` 並套用對應樣式,若提供 `onSelect` prop 則以節點 id 呼叫之

#### Scenario: 裝飾群組可被選取以浮現摺疊 cue

- **WHEN** 使用者點擊一個裝飾性 `cluster` / `namespace` / `application` 群組節點
- **THEN** 該節點 `selectable()` 為 `true`、被標記為 `:selected`(顯示單選環),且 `cytoscape-expand-collapse` 於其上繪製 `+/-` 摺疊 cue

#### Scenario: 選取裝飾群組不開啟 detail 面板

- **WHEN** 使用者選取一個裝飾性 `cluster` / `namespace` / `application` 群組節點
- **THEN** `resolveSelectedNode` 回 `null`,node-detail 面板 MUST NOT 開啟(只顯示選取環與摺疊 cue)

#### Scenario: 點摺疊 cue 切換該 parent 收合

- **WHEN** 某 compound parent 已被選取並顯示其 `+/-` cue,使用者點擊該 cue 範圍
- **THEN** 該 parent 的收合 / 展開狀態被切換(經 expand-collapse api),且 `collapsedIds` 隨之更新(沿用既有 cue 事件 → `onCollapsedChange` 路徑)

### Requirement: 收合的裝飾群組顯示 folder icon

裝飾性 `cluster` / `namespace` / `application` 群組在**收合**(`.cy-expand-collapse-collapsed-node`)時 MUST 於框中央顯示一個 **folder glyph**,以該群組的 accent 色(`clusterColor` / `namespaceColor` / `applicationColor`)上色(`background-fit: contain`)。**展開**時維持現狀——無中央 icon 的 labelled 容器(`background-image: 'none'`)。此 folder icon 為 gap-fill:具 `kind` 的 compound(`controller` / k8s `node` / `storageclass`)在收合時本就回退顯示其 kind icon(base `node` 規則),MUST NOT 受影響(folder 選擇器僅匹配 `isCluster` / `isNamespace` / `isApplication`)。folder glyph 為 `NodeKind` 之外的獨立 SVG(`FOLDER_ICON_SVG`,裝飾 kind 非 `NodeKind`,不入 `ICON_SVG_BY_KIND`)。

#### Scenario: 收合的裝飾群組顯示 folder icon

- **WHEN** 一個 `cluster` / `namespace` / `application` 裝飾群組被收合
- **THEN** 其 `background-image` 為 folder glyph(以該群組 accent 色 tinted),而非 `'none'`

#### Scenario: 展開的裝飾群組無中央 icon

- **WHEN** 該裝飾群組為展開狀態(`:parent`,其下有可見子節點)
- **THEN** 其 `background-image` 為 `'none'`(labelled 容器,無中央 folder icon)

#### Scenario: 收合的 kind-ful compound 維持 kind icon

- **WHEN** 一個 `controller` / k8s `node` / `storageclass` compound 被收合
- **THEN** 其中央 icon 維持為該 kind 的 icon,folder 選擇器 MUST NOT 套用其上

### Requirement: Legend 面板可收合至側邊

當 `options.showLegend` 為 true 時,Panel SHALL 提供一顆 `<` 收合鈕(`angle-left` `IconButton`,testid `legend-collapse`),置於 `LayoutModeControl` 的「Layout」標籤列右端(經其 `action` slot)——而非獨立的 header 列,以省去額外的 rail 高度與分隔線。點擊後將**整個** legend `<aside>` 自版面移除,使畫布(`canvasArea`,既有 `flex: 1`)取回釋出的寬度。收合狀態下 Panel MUST 僅渲染一顆浮動的 `>` 還原鈕(`angle-right` `IconButton`,testid `legend-expand`),絕對定位於 `canvasArea` 左上角、疊於畫布之上,點擊後還原 legend `<aside>`。該還原鈕的 `z-index` MUST 高於 `cytoscape-expand-collapse` 的 overlay canvas(`.expand-collapse-canvas`,`z-index: 999`)——否則該 canvas 會吃掉點擊使還原鈕失效;同時 MUST 維持低於 Grafana 的 panel menu / tooltip 層(`theme.zIndex` ≥ 1030)。此收合狀態為 panel-local 且 ephemeral(`useState`,**不**寫入 panel options、不跨 reload 保存)。整個收合 / 還原機制 MUST 受 `options.showLegend` 管轄:`showLegend` 為 false 時既無 legend、亦無任一收合 / 還原鈕。

#### Scenario: 收合 legend 面板

- **WHEN** legend 面板顯示中,使用者點擊「Layout」列右端的 `<` 收合鈕(`legend-collapse`)
- **THEN** legend `<aside>` 自 DOM 移除(畫布取回其寬度),且改為僅渲染浮動的 `>` 還原鈕(`legend-expand`)

#### Scenario: 還原 legend 面板

- **WHEN** legend 面板已收合,使用者點擊浮動的 `>` 還原鈕(`legend-expand`)
- **THEN** legend `<aside>` 連同其全部區段重新渲染,浮動還原鈕消失,「Layout」列的 `<` 收合鈕回歸

#### Scenario: showLegend 關閉時無收合鈕

- **WHEN** `options.showLegend` 為 false
- **THEN** legend `<aside>` 與 `<` 收合鈕、`>` 還原鈕皆 MUST NOT 渲染

### Requirement: 圖例 (Legend)

Panel SHALL 提供 legend 元件,顯示**圖中實際呈現的**節點 icon 與邊類型對應說明。Node legend 的 icon / 顏色資料源 MUST 與 cytoscape stylesheet 共用同一份對應表(`iconSvgByKind.ts` / `colorByEdgeType.ts`)。Node legend 的 kind 集合 MUST 由 collapse-aware 的 `deriveLegendKinds`(見「Node-kinds 圖例 collapse-aware」requirement)導出——只列出**目前以 glyph 呈現於畫布**的 kind(drawn leaf + 收合容器;展開容器與被收合祖先隱藏的子節點不列);Edge legend MUST 只列出**目前資料中出現的 edge type**,惟 `pod-calls-service` / `service-selects-pod` 一律**省略**(本質為 pod-to-pod,由 `pod-calls-pod` 的 `pod ↔ pod/service` 雙向列代表——見下);兩者於對應集合為空時 MUST 不渲染(`return null`)。Node legend MUST 以隨主題上色的 icon glyph(取代既有 `ShapeGlyph`)呈現各 kind,並依 panel-owned 的 `kind → 超大類`(`categoryByKind.ts`:Workloads / Networking / Storage / Cluster / Other)查表**分組**,只渲染含 ≥1 個出現 kind 的大類;顏色 MUST NOT 編碼大類(顏色保留給狀態)。kind 列的文字標籤預設為 kind 字串本身,惟 MUST 支援 display-name 覆寫(`NodeLegend` 內的查表):`network` MUST 顯示為 `physical network`。Edge legend 每列 MUST 渲染為 `<from> [箭頭 glyph] <to>`:箭頭 glyph(`EdgeGlyph`,帶該 edge 的顏色與線型)置於兩端 `NodeKind` 標籤中間以取代動詞,端點標籤由 `EDGE_ENDPOINTS_BY_TYPE` 解析(`service` 縮寫為 `svc`),且 MUST NOT 顯示額外的 nesting 說明文字。例外:`pod-calls-pod` 列 MUST 渲染為 `pod ↔ pod/service`(雙向箭頭 glyph,兩端皆有箭頭),代表被省略的服務邊對。legend 區段的垂直順序 MUST 為:`Layout`(Node|Controller 切換,置頂)→ `Node Kinds` → `Edge Types` → `Status` → 三個 swatch 區段(`Clusters` → `Nodes`|`Controllers` → `Storage Classes`);亦即 swatch 區段置於 `Status` **之後**(legend 底部)。所有區段標題 MUST 為 Title Case(`Node Kinds` / `Edge Types` / `Status` / `Clusters` / `Storage Classes`)。

#### Scenario: Node legend 只列出以 glyph 呈現的 kind,依大類分組

- **WHEN** Panel 收到 pod / service / pvc / node 皆為 drawn leaf(無巢狀容器、無收合)且無 workload / switch 的資料
- **THEN** Node legend 只以 icon glyph 呈現 pod / service / pvc / node 並依大類分組(pod→Workloads、service→Networking、pvc→Storage、node→Cluster),未出現的 kind(deployment / switch …)不列出;顏色不用於區分大類
- **AND**(見 collapse-aware requirement)若 `node` 改為裝載 pod 的展開容器,則 `node` 不列於 Node legend(改於「Nodes」swatch 區段),收合後才以 glyph 回到 Node legend

#### Scenario: Edge legend 只列出圖中出現且未省略的 edge type

- **WHEN** 圖中存在 `pod-mounts-pvc` 與 `pod-calls-pod` 邊,但無 `switch-to-switch`
- **THEN** Edge legend 以 `<from> → <to>`(箭頭 glyph 置中)只呈現 `pod-mounts-pvc` / `pod-calls-pod`,`switch-to-switch` / `node-to-switch` 不列出;顏色/線型與 canvas 中渲染一致

#### Scenario: 服務邊自 edge legend 省略(本質為 pod-to-pod)

- **WHEN** 圖中存在 `pod-calls-service` / `service-selects-pod` 邊
- **THEN** 該兩型別 MUST NOT 出現於 edge legend(無獨立列、亦無額外合併列);它們在 canvas 以與 `pod-calls-pod` 相同的橘色繪製,於 legend 由 `pod-calls-pod` 列代表——該列渲染為 `pod ↔ pod/service`(雙向箭頭 glyph)

#### Scenario: 對應集合為空時不渲染

- **WHEN** 圖中無任何節點(或無任何 drawn 邊)
- **THEN** Node legend(或 Edge legend)`return null`,不渲染空標題

### Requirement: Hover Tooltip 顯示元素 metadata

Panel SHALL 在使用者 hover 於任一 node 或 edge 時顯示 `HoverTooltip` 元件;tooltip MUST 浮動定位於被 hover 元素附近(`position: absolute`,node 取其 rendered 中心、edge 取游標 rendered 位置,加固定偏移),並夾擠 / 翻轉於 cytoscape canvas wrapper 邊界內(偏移後超出右 / 下緣時翻轉至元素左側並夾於 wrapper 內,不超出可視範圍),寬度約 280px,套用 `pointer-events: none` 以確保不阻擋下方圖形互動,且樣式 MUST 使用 `@grafana/ui` theme tokens(背景半透明 `theme.colors.background.secondary` + opacity ≥ 0.85)。

#### Scenario: Hover 節點顯示節點 metadata

- **WHEN** 使用者滑鼠 hover 於任一節點
- **THEN** `HoverTooltip` 顯示節點 `name`(`data.label ?? data.id`)、`kind`、`namespace`、`ipAddress`(`data.ipAddress` 以逗號串接顯示,僅當存在且非空時)、`application`(ArgoCD application;凡 leaf 帶 `data.application`——pod / service / pvc 與聚合後的 controller——即顯示,惟裝飾性 `application` 群組節點 MUST NOT 顯示此 row 以免與其合成 `kind`/`name` 重複),以及白名單 labels(`app`、`version`、`app.kubernetes.io/name`、`app.kubernetes.io/instance`)中有值的欄位;缺漏欄位 MUST 不顯示其 row(不顯示空白 placeholder)

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

Panel SHALL 透過 Grafana panel options 提供兩個 `MultiSelect` 欄位 —— `visibleKinds`(可見的 `NodeKind` 集合)與 `visibleEdgeTypes`(可見的 `EdgeType` 集合)—— 預設為對應表(`ICON_SVG_BY_KIND` / 當前模式的 `drawnEdgeTypesForMode`)的全部 keys,惟 `network` MUST 自 `visibleKinds` 的選項與預設(`ALL_KINDS`)排除:虛擬 fabric wrapper 不是可過濾的資源 kind,`computeVisibility` MUST 對 `network` kind 一律視為可見——cytoscape 的有效可見性為元素與其所有祖先的 AND,藏掉 wrapper 會連帶藏掉其下所有 switch(包含 dashboard 在該 kind 存在前已儲存 `visibleKinds` 清單的情境);wrapper 仍會在其 switch 全被過濾後經 orphan 級聯收掉。被過濾的元素 MUST 以 `visibility: hidden` 隱藏(保留位置,不觸發 cytoscape 重新 layout),且過濾邏輯 MUST 集中於純函式 `computeVisibility(elements, visibleKinds, visibleEdgeTypes)` 以利單測。

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

Panel SHALL 依節點 `data.status` 渲染狀態外框,顏色取自單一資料源 `STATUS_COLOR`(`normal`→綠、`warning`→黃、`critical`→紅)。狀態外框 MUST 套用於**任何後端有回報 `data.status` 的 kind**(資料驅動,不再硬編碼 `pod`/`node`/`pvc` 清單);status 缺值或非法值時 `normalize` MUST NOT 寫入 `status` 欄——該節點維持主題中性外框,detail 面板亦不顯示狀態 badge(惟父容器的 worstStatus 聚合計算中,無 status 的子節點仍以 `normal` 計)。Legend MUST 顯示三色 status 說明(`StatusLegend`)。

#### Scenario: 依 status 顯示外框

- **WHEN** 任一節點(含 workload kind 如 `deployment`)帶有後端回報的 `data.status`
- **THEN** 該節點以對應 `STATUS_COLOR` 顏色渲染外框
- **WHEN** `status` 缺值或不在列舉中
- **THEN** `normalize` 不寫入 `status` 欄,節點維持主題中性外框(無狀態外框),detail 面板不顯示狀態 badge

#### Scenario: 外框不影響選取與容器

- **WHEN** 節點被選取
- **THEN** 選取高亮(`node:selected`)覆蓋 status 外框
- **AND** 身為 compound parent 的 K8s `node` 或 controller 仍顯示 status 外框(選擇器排序覆蓋 `node:parent`)

### Requirement: Node Detail 面板

Panel SHALL 在**左鍵**點擊節點時,於 canvas 底部以浮層(不縮放 graph)開啟**單一統合** detail 面板,header 顯示節點 name、kind、status 三項;並在點擊背景 / 邊、切換到另一節點、或按關閉鈕時關閉。cytoscape 單選的藍色高亮 MUST 與面板開關同步。裝飾性 cluster / namespace / application 群組**可被選取**(顯示選取環與摺疊 cue,見「互動與選取狀態」)但 MUST NOT 開啟此 detail 面板(`resolveSelectedNode` 回 `null`)。

header 除節點 name / kind / status 外,當該節點(**leaf / k8s-node / controller**;**cluster / namespace / storageclass 除外**)的 `/dashboard` 查詢回傳可用 URL 時,MUST 於 name 旁顯示一顆 **Dashboard 按鈕**;按鈕的查詢時機、參數組裝、200-gated 可用性與新分頁開啟行為見 `node-dashboard-url` capability。

面板**不再有 `view` 分流**(舊 `alerts` / `detail` 雙 view 取消;`NodeDetailPanel` 不再收 `view` prop):body 區塊一律以**資料有無**閘控,依序為——(1)**屬性(Properties)區塊**(`node-detail-section-properties`):**恆顯**,kv-row 版型呈現節點 promoted attributes;(2)**Application / Containers change-report 區塊**:僅 workload kind 且帶對應資料時顯示(見「Node Detail Application 與 Containers 區塊」需求);(3)**Alerts 區塊**(`node-detail-section-alerts`):節點帶非空 `data.alerts` 時渲染告警表,**無告警時整段不渲染**(取消舊「No alerts」訊息)。

**屬性區塊**MUST 以 kv-row(label 欄 + 換行值欄,沿用 storageclass 既有版型)呈現一組 promoted attributes,其**資料來源 MUST 與 hover tooltip 同源**——由**單一純函式**導出 node attrs(合成 kind、`namespace`、`application`、`ipAddress`、`provisioner`、storageclass `parameters`(key-sorted);只輸出**有值**者,故 MUST NOT 產生空列)。屬性區塊 **MUST 恆顯**(即使其他區塊皆無資料),作為節點的預設資訊面;`kind` 既已於 header badge 呈現,屬性區塊 MUST 略過 `kind` row 以免重複。此屬性區塊**吸收**舊有的專屬 Storage Class 區塊(`node-detail-section-storageclass`)與 service/pvc 輕量 Application 列(`node-detail-section-app-info`)——provisioner / parameters / application 皆為 promoted attr,故兩段專屬 JSX 移除。

面板高度 MUST 隨內容增長,僅在超過上限(canvas 高度的 `50%`)時才捲動(header 釘住);內容短於上限時 MUST NOT 出現捲動。**捲動 MUST 集中於單一容器(面板 body,`node-detail-scroll`):body 為唯一 scroll authority(`overflowY: auto`),各區塊一律為 content-height(`flex: 0 0 auto`)且 MUST NOT 各自擁有內部捲動。**統合面板現可同時堆疊多個區塊(Properties + Application + Containers + Alerts),若任一區塊自帶內部捲動(舊 `view` 分流時僅其一存在故無虞),多個 fill 區塊會在受限高度下互相重疊且皆無法捲動——故 single-body-scroll 為唯一可組合的模型。

告警資料來自上游 graph JSON 節點的選用欄位 `alerts: NodeAlert[]`(`normalizeGraph` 攜帶至 `data.alerts`,缺值或空陣列→該區塊不渲染)。每筆 `NodeAlert` 以 `timeRecords: number[]`(Unix 秒,升序)表示重複發生;後端已把同一 alert 分組為**單筆**,故告警表格**一列代表一個 alert**。**Count** 欄 MUST 顯示 `timeRecords.length`,並 MUST 透過 `@grafana/ui` `Tooltip` 列出全部發生時間(依 `timeZone` 格式化)。**Last occurred** 欄 MUST 顯示 `max(timeRecords)`(格式化)且 MUST 可點擊:點擊時以 `t = max(timeRecords)`(Unix 秒)為中心、固定 ±5 分鐘(300 秒),呼叫 `onChangeTimeRange({ from: (t-300)*1000, to: (t+300)*1000 })` 倒帶 dashboard 時間範圍。`severity` 為自由字串:`info` / `warning` / `critical` 取 `SEVERITY_COLOR` 對應色,其餘自訂標籤 MUST 原樣保留並以 `FALLBACK_SEVERITY_COLOR`(critical 色)著色。告警表格的 **Pod / Service 缺值格 MUST 顯示 muted「n/a」**(統一缺值占位 `MISSING_VALUE_PLACEHOLDER`,見「Node Detail Application 與 Containers 區塊」)。

#### Scenario: 左鍵點節點開啟統合面板

- **WHEN** 使用者**左鍵**點擊任一非裝飾節點
- **THEN** 底部浮層顯示該節點 label、kind badge、status badge,覆蓋於 graph 之上且不改變 graph 尺寸,並渲染恆顯的屬性區塊
- **AND** 該節點的選取高亮與開啟的面板同步

#### Scenario: 點外面或關閉鈕關閉

- **WHEN** 使用者點擊 graph 背景或邊,或按下關閉鈕
- **THEN** detail 面板關閉,且選取高亮清除

#### Scenario: 切換節點

- **WHEN** 面板開啟時使用者點擊另一個節點
- **THEN** 面板切換為新點擊的節點

#### Scenario: 屬性區塊恆顯

- **WHEN** 開啟任一節點的 detail 面板,即使該節點無 application / containers / alerts 任何資料
- **THEN** 屬性區塊(`node-detail-section-properties`)仍 MUST 渲染,以 kv-row 呈現該節點有值的 promoted attributes

#### Scenario: 屬性內容比照 hover tooltip 同源

- **WHEN** 一個節點帶 `namespace`、`application`、`ipAddress` 等 attr,且其 hover tooltip 顯示這些 promoted attrs
- **THEN** 屬性區塊以**相同的單一純函式**導出並呈現同一組 attrs(kv-row 版型),不另起平行實作;只渲染有值的 attr(無空列)
- **AND** 屬性區塊略過 `kind` row(kind 已於 header badge)

#### Scenario: 屬性區塊吸收 storageclass provisioner / parameters

- **WHEN** 開啟一個帶 `provisioner` 與 `parameters` 的 storageclass 節點面板
- **THEN** provisioner 與每個 parameter 以 kv-row 呈現於屬性區塊內(key-sorted、值換行),MUST NOT 另渲染舊的專屬 `node-detail-section-storageclass` 區塊

#### Scenario: service / pvc 的 application 呈現於屬性區塊

- **WHEN** 開啟一個帶 `data.application` 的 `service` 或 `pvc` 節點面板
- **THEN** 該 application 名稱以 kv-row(`application`)呈現於屬性區塊內,MUST NOT 另渲染舊的 `node-detail-section-app-info` 輕量列,亦 MUST NOT 渲染 change-report 的 `ApplicationTable`(service/pvc 非 workload kind)

#### Scenario: Dashboard 按鈕顯示於名稱旁

- **WHEN** 開啟某 leaf / k8s-node / controller 節點的 detail 面板,且其 `/dashboard` 查詢回傳 200 + 非空 url
- **THEN** header 於節點名稱旁顯示 Dashboard 按鈕
- **AND** cluster / namespace / storageclass 節點不開啟面板,故不顯示此按鈕

#### Scenario: 顯示告警表格(分組,一列一個 alert)

- **WHEN** 選取的節點帶非空 `data.alerts`(一或多筆)
- **THEN** Alerts 區塊以 `InteractiveTable` 逐列顯示告警,**一列代表一個 alert**,欄位為 Pod / Service / Alert / Severity / Count / Last occurred

#### Scenario: 告警 Pod / Service 缺值顯示 n/a

- **WHEN** 某告警列的 Pod 或 Service 缺值
- **THEN** 該格顯示 muted「n/a」(`MISSING_VALUE_PLACEHOLDER`)

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

#### Scenario: 多區塊以單一 body 捲動且不重疊

- **WHEN** 統合面板同時渲染多個高區塊(如帶 application + 多 container + 多 alert 的 pod,Containers 與 Alerts 區塊皆高於上限)
- **THEN** 面板 body(`node-detail-scroll`)為唯一捲動容器(`overflowY: auto`),各區塊 `flex-grow: 0`(content-height)且其表格 slot MUST NOT 自帶 `overflowY: auto`
- **AND** 區塊上下堆疊、彼此 MUST NOT 重疊;內容超過上限時 body 捲動整個堆疊(header 釘住),內容短於上限時不出現捲動

#### Scenario: 無告警時 Alerts 區塊整段不渲染

- **WHEN** 選取的節點無 `alerts` 欄位或為空陣列
- **THEN** Alerts 區塊(`node-detail-section-alerts`)MUST NOT 渲染(不顯示表格、亦不顯示舊的「No alerts」訊息);屬性區塊與其他有資料區塊照常渲染

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
- hover tooltip MUST 顯示 context:`kind: storageclass`(因已有 kind 而自然顯示)+ 其 cluster(`useHoverElement` 自父 cluster 容器讀)+ `provisioner` + 其 backing-storage `parameters`(typed string map;每個 entry 一列、key 排序、值換行——值如 selector 可能長)。

#### Scenario: 展開的 storageclass 群組為無 icon 的 cluster 上色容器

- **WHEN** 圖中有一個展開的 `isStorageClass` 容器,巢狀於某 cluster 容器、其下有 PVC 子節點
- **THEN** 該容器以 `round-rectangle` 渲染、`background-image` 為 `none`、底色取父 cluster accent;其下 PVC 仍各自攜帶 pvc icon

#### Scenario: 收合 / leaf 的 storageclass 群組顯示 storage glyph

- **WHEN** 該 storageclass 節點為收合或 childless(非 `:parent`)
- **THEN** 其 `background-image` 為 theme 上色的 `storageclass` kind icon(`ICON_SVG_BY_KIND.storageclass`,三層磁碟堆疊),比照收合的 K8s `node` 容器

#### Scenario: 無 storageclass 時不渲染該區段

- **WHEN** 資料中無任何 storageclass 容器
- **THEN** 「Storage classes」legend 區段 `return null`,不渲染空標題

#### Scenario: storageclass hover 顯示 provisioner 與 parameters(D6 leaf)

- **WHEN** 滑鼠移至一個 storageclass leaf(巢狀於某 cluster)
- **THEN** tooltip 顯示其名稱(title)、`kind: storageclass`、`cluster: <name>`、`provisioner: <name>`,以及每個 backing-storage 參數一列(如 `pool: kube`、`selector: tier=fast`;key 排序、值換行)
- **AND** MUST NOT 顯示舊的合成 `PVCs (N)` 清單(storageclass 已是 leaf,PVC 以 `pvc-to-storageclass` 邊相連而非巢狀)

#### Scenario: storageclass 容器預設收合(mode-independent)

- **WHEN** Panel 首次載入且圖中含 storageclass 容器
- **THEN** 所有 storageclass 容器 MUST 預設**收合**(`node` / `controller` 兩模式皆然),其 id 於首次載入即併入 `collapsedIds` 推給 GraphCanvas;ref 守衛使後續 data refresh **不**重收(使用者展開的 storageclass 保持展開)
- **AND** 因預設已收合,「Storage classes」collapse 切換鈕(`storageclass-collapse-toggle`)首次點擊作為「全部展開」動作

### Requirement: 收合容器(controller / k8s node)邊框依最差子節點 status 上色

當一個**容器收合**時(controller 或 k8s `node`),其矩形邊框 MUST 以它**收合後會隱藏的最差 status** 對應的 `STATUS_COLOR`(`normal` 綠 `#73BF69` / `warning` 黃 / `critical` 紅)上色——**含 `normal`**:旗下全健康的容器收合時 MUST 畫 `normal` 綠框(明確的好消息,而非中性無框)。資料來源為 normalize 彙整於該節點的 `data.worstStatus`(見 graph-data-integration:controller = 子 pod 最差 status,**一律寫入**;k8s node = 自身 status 與子 pod status 之最差,worst-wins,**有 status 資訊時寫入**——自身無 status 且無任何子 pod 的 node 無此欄,收合維持中性邊框,「無資訊」不得偽裝成 normal)。stylesheet MUST 以 `node[worstStatus="<status>"].cy-expand-collapse-collapsed-node` 選擇器實作,宣告於 `statusSelectors`(資料驅動的 `node[status="<s>"]`——**任何帶 `status` 的節點**畫自身 status 邊框,非 pod/node/pvc 白名單;normalize 只在後端實際給 status 時才寫該欄,故 service / external / cluster / storageclass 等無 status 者維持中性邊框)**之後**,使**收合的 k8s node** 的最差子節點 status 能覆寫其自身 status 邊框;controller 無 status 邊框,故此為其唯一上色。`node:selected` 以 outline/underlay 呈現故不影響此邊框色。**展開**的容器不套此選擇器(controller 維持中性 `:parent` 容器邊框、k8s node 維持自身 status 邊框)。採 **status**(非 alert severity):`info` 僅存在於 alert、不在 status 量尺,故收合框永不為 info(`SEVERITY_COLOR` 仍只服務 detail panel 的 alert 表)。

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

#### Scenario: 全 normal 容器收合畫 normal 綠框

- **WHEN** 某容器(controller 或 k8s node)收合後會隱藏的最差 status 為 `normal`(子節點皆 normal,缺 status 視為 normal)
- **THEN** 收合的容器矩形邊框以 `STATUS_COLOR.normal`(綠)上色——controller 一律;k8s node 因自身或子 pod 至少其一帶 status 資訊

#### Scenario: 無 status 資訊的 k8s node 收合維持中性邊框

- **WHEN** 某 k8s `node` 自身無 `status` 且無任何子 pod
- **THEN** 該 node 無 `data.worstStatus`,收合時維持中性容器邊框(「無資訊」不是「正常」)

### Requirement: Node-kinds 圖例 collapse-aware(只列實際以 glyph 呈現者)

icon「Node Kinds」圖例的 kind 集合 MUST 由純函式 `deriveLegendKinds(elements, collapsedIds)` 導出,只列出**目前以 glyph 呈現於畫布**的 kind——而非單純「資料中出現過」的 kind。判定規則(對每個非 cluster、帶 `kind` 的節點):被收合祖先隱藏者**不**計入;**展開的**容器(其 id 為他人 `parent` 且自身未收合)**不**計入(它在 Clusters / Nodes|Controllers / Storage Classes swatch 區段呈現);其餘(drawn leaf 或**收合的**容器)計入其 kind。`cluster`(無 kind)永不計入。此規則取代舊有的 `presentKinds` + `deriveContainers.showNodeKindIcon`,使 node / controller / storageclass 三種容器一致。

#### Scenario: 收合 storageclass 時 Node-kinds 以 storageclass 取代 pvc

- **WHEN** 某 storageclass 容器(其下 PVC)被收合
- **THEN** 其 PVC 因被收合祖先隱藏而退出 Node-kinds 圖例,收合的 storageclass 顯示其 glyph 而進入——即 STORAGE 大類由 `pvc` 變為 `storageclass`;展開後還原為 `pvc`

#### Scenario: 收合容器時其子 kind 退出、容器 kind 進入(node / controller 同理)

- **WHEN** 某 K8s `node`(或 controller)容器被收合,其下 pod 全被聚合隱藏
- **THEN** `pod` 退出 Node-kinds 圖例、`node`(或對應 controller kind)以其 glyph 進入;展開的容器則不出現在 Node-kinds(僅於其 swatch 區段)

#### Scenario: 收合虛擬 network compound 時 Node-kinds 以 network 取代 switch

- **WHEN** 包裹 switch fabric 的虛擬 `network` compound(見 switch-tier-layout 規格)被收合
- **THEN** 其下 `switch` 因被收合祖先隱藏而退出 Node-kinds 圖例,收合的 `network` 以其 wifi glyph 進入(NETWORKING 大類由 `switch` 變為 `network`,標籤顯示為 `physical network`);展開後還原為 `switch`

### Requirement: Node Detail Application 與 Containers 區塊

Panel SHALL 在 node-detail 面板中,**僅對 pod 與 workload controller**(`kind ∈ { pod, deployment, statefulset, daemonset, job, cronjob }`)節點,提供帶 change-report 查詢的 **Application 區塊**與 **Containers 區塊**,沿用既有面板位置與版型(與 Alerts 區塊同一 sticky section 樣式)。其餘 kind(`node` / `pvc` / `service` / `external` / `switch` / `cluster` / `storageclass`)MUST NOT 顯示這兩個 change-report 區塊。**service / pvc leaf 若帶 `data.application`**,其 ArgoCD application 名稱改由**屬性區塊**呈現(見「Node Detail 面板」需求),**不**再以專屬輕量列、亦 MUST NOT 觸發 change-report 查詢;凡屬 workload kind 走 change-report 表、否則(含 service/pvc)其 application 走屬性區塊。

面板**為單一統合面板,不再有 view 分流**:change-report 的 Application / Containers 兩區塊純以 **workload kind + 對應資料有無**閘控,與 Alerts 區塊(資料閘控)及恆顯的屬性區塊共存於同一**左鍵**面板。

**資料來源**:application name 來源為節點的 `data.application`(backend 於 pod 節點輸出;controller 由 `normalizeGraph` 自子 pod 聚合);containers 來源為節點的 `data.containers`(`Array<{ name, image }>`)。節點無 `data.application` 時 Application 區塊 MUST NOT 渲染;無 `data.containers`(或為空陣列)時 Containers 區塊 MUST NOT 渲染;兩者互不影響。

**觸發**:在 pod/controller 節點上**左鍵**(cytoscape `tap`)MUST(a)選取該節點(沿用既有單選受控狀態,與藍色高亮 / 面板開關同步,面板隨之開啟),(b)**建立**該節點兩個 URL 查詢(application-detail 與 image-detail)所需的 input(application name, controller kind, controller name, time——time 為左鍵選取當下時間,Unix 秒),並以此 input **立即併發預取(eager prefetch)** 兩查詢——`config_changes`(application)與 `code_changes`(containers)MUST 在面板因左鍵選取 workload 節點而開啟(`enabled` 為 true,即 input 與 endpoint 皆可解析)時、**無需任何後續點擊**即同時發出。**右鍵(`cxttap`)不再開啟 detail 面板、不再建立查詢 input、不再發出任何查詢**(舊右鍵 detail 觸發與其原生 context menu 抑制一併移除)。非 workload 節點(無 `queryTarget`)左鍵選取 MUST NOT 建立查詢 input、MUST NOT 發出任何查詢(只顯屬性 / Alerts)。

**查詢契約**:兩個查詢 MUST 共用同一組 input——ArgoCD application name、pod-controller kind、pod-controller name、time。pod 節點的 controller kind/name 取自其 owner(`data.owner`);controller 節點取自身 kind/name;無 owner 的 standalone pod 以自身 kind(`pod`)與 name 帶入。回傳:

- **application-detail 查詢**(`GET <base>/config_changes`):回 `{ "url": string, "current_time": string, "previous_time": string }`——`url` 為該 ArgoCD application 的外部詳情頁;`current_time` / `previous_time` 為該 deployment diff 的兩個時間戳。
- **image-detail 查詢**(`GET <base>/code_changes`):回 `{ [containerName]: { "url": string, "current_time": string, "previous_time": string, "result_type": string } }`——map(container name → entry);input MUST NOT 含 image 參數,一次呼叫即涵蓋該節點所有 containers。
- **時間戳契約**:`current_time` / `previous_time` MUST 為 **RFC 3339 / ISO 8601(UTC)** 字串。兩時間戳為 **best-effort**:缺漏 / 非字串 / 解析失敗時,對應時間欄 MUST 顯示 muted(`theme.colors.text.secondary`)「n/a」(`MISSING_VALUE_PLACEHOLDER`),並 MUST NOT 影響同列的 `url` anchor、其餘欄、或其餘列。
- **變更型別契約(`result_type`,僅 `code_changes`)**:每個 container entry MAY 帶 `result_type` 字串,已知列舉值為 **`UNCHANGED` / `UPDATED` / `REPLACED` / `ADDED` / `REMOVED` / `RENAMED`**(大寫)。`result_type` 為 **best-effort**:缺漏 / 非字串 / 空字串時,該列 Change Type 欄 MUST 顯示 muted(`theme.colors.text.secondary`)「n/a」(`MISSING_VALUE_PLACEHOLDER`);**未知值**(非上述六個)MUST 照原字串渲染(visible-by-default),以中性灰 fallback 色呈現。`config_changes`(application)**不含** `result_type`,Application 區塊 MUST NOT 有 Change Type 欄。

**缺值占位單一來源**:面板內所有「有列但缺格」的缺值占位(change time、Change Type、Alert 的 Pod/Service)MUST 取自單一常數 `MISSING_VALUE_PLACEHOLDER = 'n/a'`,以 muted 樣式呈現(取代舊有分散硬編的 em-dash「—」)。

**呼叫快取**:panel 開啟期間,`code_changes` 與 `config_changes` 各 MUST **最多呼叫一次**——eager 預取於面板開啟時各發一次,`code_changes` 回的整包 map 由所有 container 列**共用**。僅快取**成功**回應:失敗 MUST NOT 入快取。**換節點 / 換 endpoint / 關閉 panel(unmount / 清除選取)MUST 清除快取**(連同中止 in-flight)。

**查詢傳輸**:查詢 MUST 透過 Grafana runtime(`@grafana/runtime` `getBackendSrv()`)發往**同一個 graph API backend**;MUST NOT 自 `src/**` 直接以 `fetch` / `axios` / `XMLHttpRequest` 連線外部 backend。查詢端點(base path)MUST 依序解析:(1)panel option 非空時以其為準(覆寫);(2)否則 SHALL 自面板查詢請求(`data.request.targets`)自動推導為 graph query 的 **sibling**(取第一個經 Grafana runtime datasource instance settings 解析出非空 proxied base path 的 target,於其後串接 graph query 路徑的目錄,再 append `/config_changes`、`/code_changes`);(3)兩者皆無時,兩區塊照資料渲染但連結欄 MUST 顯示「Not found」提示(`enabled` 為 false → 不發查詢),且 MUST NOT 發出任何查詢。預取查詢 MUST 可中止,MUST NOT 在 unmount 後 setState。

**呈現**(每個連結欄目標各自獨立狀態,三態之一:**loading / ready / unavailable**):

- **loading**:面板一開啟即併發查詢;回傳前,每個尚未解析的目標 MUST 於該列連結欄顯示 `Spinner` + 提示文字,該位置 MUST NOT 顯示 anchor。
- **ready**:`config_changes` / `code_changes` 回 200 + 有效 `url` 時,連結欄 MUST 渲染真實 anchor `<a href={url} target="_blank" rel="noopener noreferrer">`(預解析 URL,MUST NOT `window.open`)。
- **unavailable**:失敗 / 查無 / 無 URL 時,連結欄 MUST 以次要(muted)文字顯示「Not found」提示(過長截斷、完整失敗訊息入 `title`)。
- **失敗隔離**:任一目標 unavailable MUST NOT 影響 header、另一區塊、或同區塊其他列。
- **時間欄呈現(Current / Previous)**:兩區塊各新增 **Current Change Time** 與 **Previous Change Time** 兩欄,以 `@grafana/data` `dateTimeFormat` 依面板 `timeZone` 將 RFC 3339 原字串格式化為在地化絕對時間,完整 ISO 入 `title`;無值或非法日期時該格顯示 muted「n/a」(`MISSING_VALUE_PLACEHOLDER`)且 MUST NOT 設 `title`、MUST NOT 顯示 `Invalid date`。
- **變更型別欄呈現(Change Type,僅 Containers)**:Containers 區塊的 **Change Type** 欄呈現 `result_type`,以單一來源色彩映射(`colorByResultType.ts`)的彩色文字渲染(`ADDED`=綠 / `REMOVED`=紅 / `UPDATED`=藍 / `REPLACED`=橘 / `RENAMED`=紫 / `UNCHANGED`=灰);未知值以中性灰照原字串渲染;缺漏 / 非字串 / 空字串顯示 muted「n/a」。色彩查找對大小寫不敏感、顯示一律大寫。Application 區塊 MUST NOT 有此欄。
- **對齊**:連結欄內容 MUST 釘於該欄右緣(`disableGrow` + `justifyContent: flex-end`),使兩區塊各列連結欄上下對齊、不左右漂移。
- **表格版型**:兩區塊 MUST 以帶 column header 的 `InteractiveTable` 渲染——Application 欄位依序 **Name / Current Change Time / Previous Change Time / Deployment Changes**,Containers 欄位依序 **Name / Image / Change Type / Current Change Time / Previous Change Time / Code Changes**;連結欄維持最右(`disableGrow`),`Change Type` / `Current` / `Previous` 亦 `disableGrow`,由 Name / Image 欄填滿剩餘寬度。
- 兩區塊 MUST 以 `@grafana/ui` + emotion `useStyles2` 實作,元件(ApplicationTable / ContainerTable)共置於 `node-detail` feature 並經其 `index.ts` barrel 匯出。

#### Scenario: 左鍵 pod/controller 選取並立即併發預取兩查詢

- **WHEN** 使用者於一個帶 `data.application` 的 pod(或 controller)節點按**左鍵**,且 endpoint 可解析(`enabled`)
- **THEN** 該節點被選取(藍色高亮與面板開啟同步),系統建立兩查詢所需 input(application name, controller kind, controller name, time)
- **AND** 系統 MUST **無需任何後續點擊**,即經 `getBackendSrv()` **同時併發**發出 application-detail(`config_changes`)與 image-detail(`code_changes`)兩查詢

#### Scenario: 右鍵不再開啟 detail 面板或查詢

- **WHEN** 使用者於 pod/controller 節點按**右鍵**(`cxttap`)
- **THEN** 系統 MUST NOT 因此開啟 detail 面板、MUST NOT 建立查詢 input、MUST NOT 發出任何 change-report 查詢(右鍵 detail 觸發已移除)

#### Scenario: pod 的 controller kind/name 取自 owner

- **WHEN** 左鍵的節點為 pod 且其 `data.owner` 為 `{ kind: "deployment", name: "gateway" }`
- **THEN** 該節點預取查詢的 input 之 controller kind/name 為 `deployment` / `gateway`

#### Scenario: controller 節點以自身 kind/name 查詢

- **WHEN** 左鍵的節點為 controller(如 `statefulset` `mongo`)
- **THEN** 該節點預取查詢的 input 之 controller kind/name 為 `statefulset` / `mongo`

#### Scenario: 區塊僅對 pod/controller 顯示

- **WHEN** 使用者**左鍵**選取的節點 `kind` 為 `pod` 或 controller 且帶對應資料(`data.application` / 非空 `data.containers`)
- **THEN** 面板渲染 change-report 的 Application 區塊與 Containers 區塊

#### Scenario: 非 pod/controller kind 不顯示 change-report 區塊

- **WHEN** 選取的節點 `kind` 為 `node` / `pvc` / `service` / `external` / `switch` / `cluster` / `storageclass`
- **THEN** 帶 change-report 的 Application 與 Containers 區塊(`node-detail-section-application` / `node-detail-section-containers`)MUST NOT 渲染(即使該節點偶帶 `application` / `containers` 資料);若為 service/pvc 帶 `application`,其名稱改由屬性區塊呈現(見「Node Detail 面板」需求)

#### Scenario: 無 application 時僅隱藏 Application 區塊

- **WHEN** **左鍵**選取的 pod/controller 節點無 `data.application`,但帶非空 `data.containers`
- **THEN** Application 區塊 MUST NOT 渲染,Containers 區塊照常渲染並預取 `code_changes`

#### Scenario: 無 containers 時僅隱藏 Containers 區塊

- **WHEN** **左鍵**選取的 pod/controller 節點帶 `data.application`,但無 `data.containers`(或為空陣列)
- **THEN** Containers 區塊 MUST NOT 渲染,Application 區塊照常渲染並預取 `config_changes`

#### Scenario: 預取進行中顯示 loading spinner

- **WHEN** 左鍵開啟面板且 endpoint 可解析,預取查詢尚未回傳
- **THEN** Application 與 Containers 兩區塊每列連結欄顯示 `Spinner` + 提示文字,該位置不顯示 anchor

#### Scenario: Application 預取成功渲染 anchor

- **WHEN** application-detail(`config_changes`)查詢成功回傳有效 URL `u`
- **THEN** Application 區塊連結欄(header「Deployment Changes」)渲染 `<a href="u" target="_blank" rel="noopener noreferrer">`,點擊以一般使用者手勢於新分頁開啟 `u`(MUST NOT `window.open`)

#### Scenario: Container 預取成功為有 URL 的列渲染 anchor

- **WHEN** 節點 `data.containers` 含 `{ name: "app", image: "repo/app:1.2" }`,且 image-detail(`code_changes`)成功回傳 `{ "app": { "url": "https://x/app" } }`
- **THEN** `app` 列連結欄(header「Code Changes」)渲染 `<a href="https://x/app" target="_blank" rel="noopener noreferrer">`

#### Scenario: Application 區塊以帶 header 表格渲染

- **WHEN** 左鍵開啟的面板渲染 Application 區塊(節點帶 `data.application`)
- **THEN** 區塊以 `InteractiveTable` 依序呈現 column headers **Name** / **Current Change Time** / **Previous Change Time** / **Deployment Changes**

#### Scenario: Containers 區塊以帶 header 表格渲染且沿欄對齊

- **WHEN** 左鍵開啟的面板渲染 Containers 區塊(節點帶兩個以上、name 長度不一的 containers)
- **THEN** 區塊以 `InteractiveTable` 依序呈現 column headers **Name** / **Image** / **Change Type** / **Current Change Time** / **Previous Change Time** / **Code Changes**,沿欄對齊(欄界不隨 name 長度漂移)

#### Scenario: 連結欄 header 正名

- **WHEN** 面板同時渲染 Application 與 Containers 區塊
- **THEN** Application 區塊連結欄 header 為「Deployment Changes」,Containers 區塊連結欄 header 為「Code Changes」(皆 MUST NOT 顯示「Change Report」)

#### Scenario: config_changes 帶兩時間戳時 Application 顯示在地化絕對時間

- **WHEN** application-detail(`config_changes`)成功回傳 `{ "url": "u", "current_time": "2026-06-16T10:30:00Z", "previous_time": "2026-06-10T08:00:00Z" }`
- **THEN** Application 列 Current / Previous 欄顯示依面板 `timeZone` 格式化的在地化絕對時間,各以完整 ISO 入 `title`,同列連結欄仍渲染 `u` 的 anchor

#### Scenario: code_changes 某 container entry 帶兩時間戳時該列顯示之

- **WHEN** image-detail(`code_changes`)成功回傳 `{ "app": { "url": "https://x/app", "current_time": "2026-06-16T10:30:00Z", "previous_time": "2026-06-10T08:00:00Z" } }`,節點 `data.containers` 含 `{ name: "app", image: "repo/app:1.2" }`
- **THEN** `app` 列 Current / Previous 欄分別顯示兩時間戳在地化絕對時間、各以完整 ISO 入 `title`,該列連結欄渲染 `https://x/app` 的 anchor

#### Scenario: code_changes entry 帶 result_type 時該列 Change Type 顯示彩色型別

- **WHEN** image-detail(`code_changes`)成功回傳 `{ "app": { "url": "https://x/app", "result_type": "UPDATED" } }`,節點 `data.containers` 含 `{ name: "app", image: "repo/app:1.2" }`
- **THEN** `app` 列 Change Type 欄顯示 `UPDATED`,以該已知列舉值對應的語義色(藍)彩色文字渲染,該列連結欄仍渲染 anchor

#### Scenario: result_type 為未知值時照原字串以中性灰渲染

- **WHEN** 某 container `code_changes` entry 的 `result_type` 為非列舉值(如 `"MIGRATED"`)
- **THEN** 該列 Change Type 欄照原字串顯示 `MIGRATED`(MUST NOT 靜默丟棄),以中性灰 fallback 色渲染

#### Scenario: result_type 缺漏 / 非字串 / 空字串時 Change Type 降級為 muted「n/a」

- **WHEN** 某 container `code_changes` entry 成功回傳有效 `url` 但 `result_type` 缺漏 / 為非字串 / 為空字串
- **THEN** 該列 Change Type 欄顯示 muted(`theme.colors.text.secondary`)「n/a」(`MISSING_VALUE_PLACEHOLDER`),同列 url anchor、時間欄、其餘欄與其餘列 MUST NOT 受影響

#### Scenario: Application 區塊無 Change Type 欄

- **WHEN** 面板渲染 Application 區塊
- **THEN** Application 區塊欄位依序為 Name / Current Change Time / Previous Change Time / Deployment Changes,MUST NOT 含 Change Type 欄

#### Scenario: 時間戳缺漏或非 RFC 3339 時時間欄降級為 muted「n/a」

- **WHEN** `config_changes`(或某 container 的 `code_changes` entry)成功回傳有效 `url`,但 `current_time` 缺漏 / 為非字串 / 為非 RFC 3339 字串(如 `"not-a-date"`),`previous_time` 正常
- **THEN** 該目標 Current 欄顯示 muted(`theme.colors.text.secondary`)「n/a」(`MISSING_VALUE_PLACEHOLDER`)且無 `title`,Previous 欄照常顯示在地化絕對時間,同列 url anchor 與其餘欄、其餘列皆 MUST NOT 受影響(MUST NOT 顯示 `Invalid date`)

#### Scenario: 開啟期間 code_changes 只呼叫一次、各 container 共用結果

- **WHEN** 面板開啟、`code_changes` 預取完成,且有多個 container 列
- **THEN** 系統僅對 `code_changes` 發出**一次**呼叫,所有 container 列以該次回傳的 map 取值
- **AND** 關閉 panel / 換節點後快取 MUST 清除,下次開啟重新呼叫一次

#### Scenario: 失敗的查詢不入快取(remount 重取)

- **WHEN** 某次 `code_changes`(或 `config_changes`)失敗,其後面板對同節點重新掛載(remount)
- **THEN** 系統重新發出該查詢(失敗結果未被快取)

#### Scenario: 連結欄跨區塊與跨狀態上下對齊

- **WHEN** 面板同時顯示 Application 與 Containers 區塊,且部分目標為 loading、部分為 ready、部分為 unavailable(混合狀態)
- **THEN** 兩區塊每列的連結欄內容皆釘於欄右緣、彼此上下對齊

#### Scenario: map 缺 container key 時顯示「Not found」

- **WHEN** `code_changes` 成功,但某 container name 不存在於回傳 map(或該 name 無有效 URL)
- **THEN** 該列連結欄顯示「Not found」提示(無 anchor),name 與 image 仍照常顯示

#### Scenario: 查詢失敗顯示「Not found」且不波及其餘

- **WHEN** `config_changes`(或 `code_changes`)查詢失敗
- **THEN** 對應目標連結欄以次要色顯示「Not found」提示(無 anchor;過長截斷、完整失敗訊息入 `title`)
- **AND** 面板 header 與另一區塊 / 其他列仍正常顯示

#### Scenario: endpoint 自 panel datasource 自動推導(預取發往 sibling 段)

- **WHEN** panel option 未設定查詢 endpoint,且面板查詢 target 帶 datasource ref(`access: proxy`)、其 graph query 路徑為 `/api/v1/graph/service_graph`,使用者左鍵開啟 workload 節點面板
- **THEN** 預取查詢發往與 graph query 同目錄的 sibling 段(`…/api/v1/graph/config_changes` 與 `…/api/v1/graph/code_changes`)

#### Scenario: panel option 覆寫自動推導

- **WHEN** panel option 設定 endpoint 為 `/foo`,使用者左鍵開啟 workload 節點面板
- **THEN** 預取查詢發往 `/foo/config_changes` 與 `/foo/code_changes`(option 優先)

#### Scenario: 未設定 endpoint 且無法推導時不查詢並顯示「Not found」

- **WHEN** panel option 未設定查詢 endpoint,且自查詢 targets 推導不出 datasource proxy path
- **THEN** 左鍵開啟的面板中兩區塊照資料渲染,連結欄顯示「Not found」提示(`enabled` 為 false),且 MUST NOT 發出任何查詢

#### Scenario: 非 workload 節點左鍵不觸發查詢

- **WHEN** 使用者以左鍵 `tap` 選取一個非 workload 節點(如 `service` / `pvc` / `node`,無 `queryTarget`)
- **THEN** 面板照常開啟(屬性 / Alerts 區塊照資料渲染),但 MUST NOT 建立查詢 input、MUST NOT 發出 application-detail / image-detail 查詢

#### Scenario: 換節點 / 關閉 panel 清除狀態與快取並中止 in-flight

- **WHEN** 面板開啟且預取 in-flight,使用者切換到另一節點、或關閉 panel(unmount / 清除選取)
- **THEN** 系統中止 in-flight 查詢(`AbortController`)、清除兩端點快取與每目標狀態,且中止後 MUST NOT 對舊節點 setState

#### Scenario: 查詢經 Grafana runtime 而非直連外部

- **WHEN** 對 `src/**` 進行 source code 掃描
- **THEN** 查詢僅經 `getBackendSrv()`;`src/**` 內無任何直接 `fetch` / `axios` / `XMLHttpRequest` 連線外部 backend 的程式碼

### Requirement: 圖例節點種類顯示/隱藏切換

Panel SHALL 在 Node Kinds 圖例的**每一列**(icon + 名稱)提供一顆**顯示/隱藏切換按鈕**(`eye` / `eye-slash`),點擊切換該 kind 節點在畫布上的可見性。切換 MUST 寫入 panel option `visibleKinds`(經 `onOptionsChange` 部分更新)——options editor 的 kind multi-select 與圖例按鈕為**同一狀態**的兩個介面,MUST 雙向同步。隱藏一個 kind 時,**任一端點為該 kind 節點的邊** MUST 隨之隱藏(既有 `computeVisibility` 端點規則),且無可見邊與可見子節點的節點 MUST 被孤兒級聯隱藏(既有 `hideOrphans`)。

**圖例列表**:圖例 kind 列表 MUST 為「實際以 glyph 渲染的 kinds」(既有收合感知推導)與「存在於當前(mode 轉換後)elements 但被 `visibleKinds` 濾掉的 kinds」之**聯集**——被隱藏的 kind 其圖例列 MUST 保留(淡化樣式 + `eye-slash`),否則無法從圖例還原。切換按鈕 MUST 僅渲染於**可過濾的已知 kind**:`network` 虛擬 wrapper(永不 kind-過濾)與未知 kind(預設恆可見)的列 MUST NOT 帶按鈕。

**與既有切換的互動**:

- **收合切換(cluster / nodes-or-controllers / storage classes 的 collapse-all 與單一容器收合)**:收合狀態(`collapsedIds`)與可見性(`visibleKinds`)為獨立兩層——隱藏 kind MUST NOT 變更任何容器的收合狀態;重新顯示後收合狀態 MUST 原樣呈現。
- **收合互換語意不變**:收合容器在圖例以容器 kind 列代表(如收合 storageclass → 列 `storageclass` 非 `pvc`),按鈕切換的是該列的 kind;容器 kind 隱藏時其後代節點 MUST 一併不可見(有效可見性 = 自身 AND 祖先)。
- **pod-parent 模式切換**:`visibleKinds` 為跨模式全域集合,作用於 mode 轉換後的 elements;模式切換 MUST NOT 清除隱藏設定——在另一模式無對應節點的設定無視覺效果但保留,切回後恢復生效。

切換寫回 option 時 MUST 維持 canonical kind 順序(以全 kind 宇宙的固定順序重建陣列)——隱藏/還原往返不得重排持久化的 `visibleKinds`(dashboard JSON 與 editor multi-select 順序穩定)。

全部可切換 kind 均隱藏時,畫布 MUST 顯示既有 `All node types filtered` 空狀態,圖例 MUST 仍列出全部(隱藏的)kind 供還原;畫布因**邊類型過濾**(孤兒級聯)而清空、但仍有可切換 kind 未隱藏時,MUST NOT 歸咎節點種類——顯示一般化的 `All elements filtered out`。

#### Scenario: 切換隱藏一個 kind 及其相關邊

- **WHEN** 圖中有 `service` 節點與 `service-selects-pod` 邊,使用者點擊圖例 `service` 列的切換按鈕
- **THEN** 所有 `service` 節點與所有以 `service` 節點為端點的邊(如 `pod-calls-service` / `service-selects-pod`)自畫布隱藏
- **AND** `service` 列保留於圖例(淡化 + `eye-slash`),再次點擊後節點與邊恢復顯示

#### Scenario: 圖例按鈕與 options editor 同步

- **WHEN** 使用者點擊圖例 `pvc` 列的切換按鈕隱藏 `pvc`
- **THEN** panel option `visibleKinds` 不再含 `pvc`(editor multi-select 同步反映);反之自 editor 取消勾選某 kind 時,圖例對應列同步呈現隱藏狀態

#### Scenario: 隱藏不清除收合狀態

- **WHEN** 某 storageclass 容器處於收合狀態,使用者隱藏 `storageclass` kind 後再重新顯示
- **THEN** 該 storageclass 容器恢復顯示且**維持收合**(收合狀態未被切換動作清除)

#### Scenario: controller 模式隱藏 pod 觸發孤兒級聯

- **WHEN** controller 模式下使用者隱藏 `pod` kind,且某 controller 盒除 `controller-owns-pod` 外無其他可見邊與可見子節點
- **THEN** `controller-owns-pod` 邊隨 pod 端點隱藏,該 controller 盒被孤兒級聯一併隱藏

#### Scenario: 模式切換保留隱藏設定

- **WHEN** controller 模式下隱藏 `deployment`,切換至 node 模式再切回 controller 模式
- **THEN** node 模式期間設定無視覺效果(圖中無 controller 節點),切回 controller 模式後 `deployment` 仍為隱藏

#### Scenario: 不可過濾的列無按鈕

- **WHEN** 圖例列出 `network`(虛擬 fabric wrapper)或一個未知 kind(backend 新增、不在已知 kind 集合)
- **THEN** 該列照常顯示 glyph 與名稱,但不渲染顯示/隱藏切換按鈕

#### Scenario: 全部隱藏顯示空狀態且可還原

- **WHEN** 使用者將圖例列出的全部 kind 切換為隱藏
- **THEN** 畫布顯示 `All node types filtered` 空狀態,圖例仍列出全部 kind(淡化 + `eye-slash`),點擊任一列即可還原該 kind

#### Scenario: 邊類型過濾清空畫布不歸咎節點種類

- **WHEN** 全部 kind 均為顯示,但使用者於 options editor 取消全部邊類型,孤兒級聯使所有節點自畫布消失
- **THEN** 畫布顯示 `All elements filtered out`(而非 `All node types filtered`),圖例 kind 列維持顯示狀態(`Hide` affordance)

#### Scenario: 隱藏/還原往返不重排 visibleKinds

- **WHEN** 使用者隱藏再還原同一 kind
- **THEN** 寫回的 `visibleKinds` 與原陣列逐項相等(canonical 順序,不在尾端追加)

### Requirement: 左鍵選取非 normal pod 匯出至 selectedPodVariable

啟用 `selectedPodVariable`(非空)時,Panel 的**左鍵**節點選取路徑(`alerts` view,`detailRequest === null`)除了開啟 detail 面板(見「Node Detail 面板」需求)外,MUST 在所選節點為 **pod** 且 `status` ∈ `{ warning, critical }` 時,額外將該 pod 的 `data.label` 寫入 `selectedPodVariable`;否則(normal / status 缺值 / 非 pod / 取消選取 / 右鍵)MUST 清除該變數。完整契約見 `selected-pod-export` capability;此需求僅釘住「左鍵選取會驅動該匯出」這一整合點,與既有開面板行為並存、互不干擾。

#### Scenario: 左鍵 critical pod 同時開面板並匯出

- **WHEN** `selectedPodVariable=selected_pod`,使用者左鍵點擊一個 `status:'critical'` 的 pod
- **THEN** detail 面板以 `alerts` view 開啟(既有行為),且 `var-selected_pod` 寫入該 pod 的 `label`

#### Scenario: 左鍵 normal pod 開面板但不匯出

- **WHEN** 使用者左鍵點擊一個 `status:'normal'` 的 pod
- **THEN** detail 面板照常開啟,但 `selectedPodVariable` 被清除(不寫入該 pod 名)

