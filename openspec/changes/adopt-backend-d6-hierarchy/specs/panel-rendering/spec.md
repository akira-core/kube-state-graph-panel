## MODIFIED Requirements

### Requirement: 邊顏色依關係類型對應

系統 SHALL 透過 `src/shared/constants/colorByEdgeType.ts` 將 edge type(`EdgeType`)映射到不同顏色與線型,並由同一份對應表供 stylesheet 與 legend 共用。`EdgeType` 列舉涵蓋後端輸出的邊型別(`pod-to-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-storageclass` / `switch-to-switch` / `node-to-switch`),共 8 種,**皆為後端輸出**——panel 隨後端 D6 階層採用而退役兩個舊有合成邊:`pod-runs-on-node`(pod-runs-on-node 不再是巢狀或合成邊,改由後端 `pod-to-node` 邊取代)與 `controller-owns-pod`(controller 群組改由後端輸出,panel 不再自 pod `data.owner` 合成此邊,見 graph-data-integration)。`pod-to-node`(`pod → node`)MUST 以藍色 `#3b82f6`(舊 blue)實線渲染;`pvc-to-storageclass`(`pvc → storageclass`)MUST 以紫色 `#8b5cf6`(storage violet)實線渲染,且此色 MUST **刻意有別於** `pod-mounts-pvc` 的 `#a855f7`,使兩條 storage 邊在視覺上可區分。`pod-calls-service` 與 `service-selects-pod` MUST 共用與 `pod-calls-pod` **相同的橘色 `#f97316`**——一個 pod→service→pod hop 本質仍是 pod-to-pod 關係、只多一層 Service;這兩個服務型別並 MUST **自 edge legend 省略**(無獨立列、亦無額外合併列),由 `pod-calls-pod` 的單一列代表——該列渲染為 `pod ↔ pod/service`(雙向箭頭 glyph),標示其同時涵蓋直連與經 Service 的 pod-to-pod 關係(見下「圖例」需求)。所有邊皆實線,方向以**箭頭**區分;`switch-to-switch` 與 `node-to-switch`(後端 v0.0.18 物理網路 fabric)MUST **完全共用同一 infra 色與實線線型**,並走相同的正交(`taxi`)路由(見 switch-tier-layout 規格),視覺上等同——`node-to-switch` 不再使用獨立靛色或 bézier,僅以端點(`<node> → <switch>` vs `<switch> → <switch>`)區分,使 K8s node 的上行連線讀起來即為 switch fabric 的一部分。`colorByEdgeType.ts` 同時匯出 `EDGE_ENDPOINTS_BY_TYPE`(每個 edge type 的來源/目標 `NodeKind`),供 legend 將 edge type 渲染為 `<from> → <to>`;`pod-to-node` 的端點 MUST 為 `<pod> → <node>`,`pvc-to-storageclass` 為 `<pvc> → <storageclass>`,`switch-to-switch` 為 `<switch> → <switch>`,`node-to-switch` 為 `<node> → <switch>`。

#### Scenario: 已知邊類型對應到正確顏色

- **WHEN** 邊 data 帶有 `edgeType: 'pod-to-node'`(或其他已定義 type)
- **THEN** 該邊以對應顏色與線型渲染(`pod-to-node` 為藍 `#3b82f6` 實線),且與 `colorByEdgeType.ts` 定義一致

#### Scenario: 兩條 storage 邊以不同紫色區分

- **WHEN** 圖中同時存在 `pod-mounts-pvc` 與 `pvc-to-storageclass` 邊
- **THEN** `pod-mounts-pvc` 以 `#a855f7`、`pvc-to-storageclass` 以 `#8b5cf6` 渲染,兩色刻意不同使兩條 storage 邊可區分閱讀

#### Scenario: 邊顏色不與 status 顏色衝突

- **WHEN** 檢視 `EDGE_STYLE_BY_TYPE` 中任一 edge type 的顏色
- **THEN** 其顏色 MUST NOT 等於 `STATUS_COLOR` 的任一值(綠 `#73BF69` / 黃 `#F2CC0C` / 紅 `#E02F44`)——`pod-to-node` `#3b82f6`、`pvc-to-storageclass` `#8b5cf6` 與服務邊橘色 `#f97316` 皆滿足此條件

#### Scenario: node-to-switch 與 switch-to-switch 視覺一致

- **WHEN** 圖中同時有 `node-to-switch` 與 `switch-to-switch` 邊
- **THEN** 兩者以相同 infra 色、相同實線線型、相同 `taxi` 正交路由渲染(僅端點不同);`node-to-switch` 不再以獨立靛色或 bézier 呈現

#### Scenario: 未知邊類型走 fallback

- **WHEN** 邊 data 的 `edgeType` 不在對應表中
- **THEN** 該邊以 fallback 灰色實線渲染,不拋出例外

### Requirement: 圖例 (Legend)

Panel SHALL 提供 legend 元件,顯示**圖中實際呈現的**節點 icon 與邊類型對應說明。Node legend 的 icon / 顏色資料源 MUST 與 cytoscape stylesheet 共用同一份對應表(`iconSvgByKind.ts` / `colorByEdgeType.ts`)。Node legend 的 kind 集合 MUST 由 collapse-aware 的 `deriveLegendKinds`(見「Node-kinds 圖例 collapse-aware」requirement)導出——只列出**目前以 glyph 呈現於畫布**的 kind(drawn leaf + 收合容器;展開容器與被收合祖先隱藏的子節點不列);Edge legend MUST 只列出**目前資料中出現的 edge type**,惟 `pod-calls-service` / `service-selects-pod` 一律**省略**(本質為 pod-to-pod,由 `pod-calls-pod` 的 `pod ↔ pod/service` 雙向列代表——見下);兩者於對應集合為空時 MUST 不渲染(`return null`)。Node legend MUST 以隨主題上色的 icon glyph(取代既有 `ShapeGlyph`)呈現各 kind,並依 panel-owned 的 `kind → 超大類`(`categoryByKind.ts`:Workloads / Networking / Storage / Cluster / Other)查表**分組**,只渲染含 ≥1 個出現 kind 的大類;顏色 MUST NOT 編碼大類(顏色保留給狀態)。kind 列的文字標籤預設為 kind 字串本身,惟 MUST 支援 display-name 覆寫(`NodeLegend` 內的查表):`network` MUST 顯示為 `physical network`。Edge legend 每列 MUST 渲染為 `<from> [箭頭 glyph] <to>`:箭頭 glyph(`EdgeGlyph`,帶該 edge 的顏色與線型)置於兩端 `NodeKind` 標籤中間以取代動詞,端點標籤由 `EDGE_ENDPOINTS_BY_TYPE` 解析(`service` 縮寫為 `svc`),且 MUST NOT 顯示額外的 nesting 說明文字。例外:`pod-calls-pod` 列 MUST 渲染為 `pod ↔ pod/service`(雙向箭頭 glyph,兩端皆有箭頭),代表被省略的服務邊對。

legend 區段的垂直順序 MUST 為:`Layout`(Node|Controller 切換,置頂)→ `Node Kinds` → `Edge Types` → `Status` → swatch 區段(`Clusters` → `Nodes`|`Controllers` → `Namespaces` → `Applications`);亦即 swatch 區段置於 `Status` **之後**(legend 底部)。其中 `Namespaces`(`NamespaceLegend`)與 `Applications`(`ApplicationLegend`,標題 `Applications` / 應用程式)為 **mode-gated**:僅在 `controller` 模式渲染(`node` 模式剝除 namespace / application 群組,故兩區段 MUST `return null`);`NamespaceLegend` 由後端 `isNamespace` 群組節點餵入(以 `namespaceColor` accent 上色)、`ApplicationLegend` 由後端 `isApplication` 群組節點餵入(以 `applicationColor` accent 上色,`applicationPalette` 衍生)。舊有的 `StorageClassLegend`(`Storage Classes` swatch 區段)MUST **移除**——`storageclass` 於後端 D6 階層改為 cluster 下的一般 leaf,故 MUST 改以其 `storageclass` glyph 列於 `NodeLegend` 的 `Storage` 大類(經既有 `categoryByKind` wiring),不再有獨立 swatch 區段。所有區段標題 MUST 為 Title Case(`Node Kinds` / `Edge Types` / `Status` / `Clusters` / `Namespaces` / `Applications`)。

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

#### Scenario: Applications swatch 區段列出後端 application 群組(mode-gated)

- **WHEN** `controller` 模式下圖中含後端 `isApplication` 群組節點
- **THEN** `ApplicationLegend`(標題 `Applications`)以各 application 名稱列出 swatch,顏色取自 `applicationColor`(`applicationPalette` accent);切換為 `node` 模式時 application 群組被剝除,該區段 `return null`(與 `Namespaces` 區段一致 mode-gated)

#### Scenario: storageclass 以 NodeLegend glyph 呈現、無獨立 swatch 區段

- **WHEN** 圖中含 storageclass leaf 節點
- **THEN** `storageclass` 以其 glyph 列於 `NodeLegend` 的 `Storage` 大類;legend MUST NOT 渲染任何 `Storage Classes` swatch 區段(`StorageClassLegend` 已移除)

#### Scenario: 對應集合為空時不渲染

- **WHEN** 圖中無任何節點(或無任何 drawn 邊)
- **THEN** Node legend(或 Edge legend)`return null`,不渲染空標題

### Requirement: Hover Tooltip 顯示元素 metadata

Panel SHALL 在使用者 hover 於任一 node 或 edge 時顯示 `HoverTooltip` 元件;tooltip MUST 浮動定位於被 hover 元素附近(`position: absolute`,node 取其 rendered 中心、edge 取游標 rendered 位置,加固定偏移),並夾擠 / 翻轉於 cytoscape canvas wrapper 邊界內(偏移後超出右 / 下緣時翻轉至元素左側並夾於 wrapper 內,不超出可視範圍),寬度約 280px,套用 `pointer-events: none` 以確保不阻擋下方圖形互動,且樣式 MUST 使用 `@grafana/ui` theme tokens(背景半透明 `theme.colors.background.secondary` + opacity ≥ 0.85)。`storageclass` leaf 節點 MUST 走**一般 node-tooltip 路徑**——它於後端 D6 階層自帶 `kind`(`storageclass`)、`labels.cluster` 與 `provisioner`,故 tooltip 直接顯示這些自帶欄位;舊有「自子節點合成 context」路徑(`gatherStorageClassContext`、`HoveredElement.storageClass` 欄、`HoverTooltip` 的 `isStorageClass` 分支)MUST 移除,tooltip MAY 額外顯示 `provisioner`。

#### Scenario: Hover 節點顯示節點 metadata

- **WHEN** 使用者滑鼠 hover 於任一節點
- **THEN** `HoverTooltip` 顯示節點 `name`(`data.label ?? data.id`)、`kind`、`namespace`、`ipAddress`(`data.ipAddress` 以逗號串接顯示,僅當存在且非空時),以及白名單 labels(`app`、`version`、`app.kubernetes.io/name`、`app.kubernetes.io/instance`)中有值的欄位;缺漏欄位 MUST 不顯示其 row(不顯示空白 placeholder)

#### Scenario: Hover storageclass leaf 顯示自帶 metadata

- **WHEN** 使用者 hover 於一個 storageclass leaf 節點(自帶 `kind: storageclass`、`labels.cluster`、`provisioner`)
- **THEN** `HoverTooltip` 以一般 node 路徑顯示其 `name` 與 `kind`(`storageclass`),並 MAY 顯示 `provisioner`;MUST NOT 以子 PVC 節點合成 `PVCs (N)` 清單(該合成路徑已隨 storageclass 改為 leaf 而移除)

#### Scenario: Hover kind-less 群組(namespace / application)顯示合成 kind

- **WHEN** 使用者 hover 於一個 backend `namespace` 或 `application` 群組節點(kind-less:無 `data.kind`,僅帶 `isNamespace` / `isApplication` 旗標)
- **THEN** `HoverTooltip` MUST 由該旗標推導出一個合成 `kind` row(`isApplication` → `application`、`isNamespace` → `namespace`)並顯示,使 hover 不致只剩裸 name;此 row 為純呈現,MUST NOT 於 `data` 寫入 `kind`(群組維持 kind-less,對 kind filter / icon legend 不可見)。`cluster` 群組於 `useHoverElement` 上游略過、不顯示 tooltip,故不適用

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

### Requirement: Node Detail 面板

Panel SHALL 在點擊節點時,於 canvas 底部以浮層(不縮放 graph)開啟 detail 面板,顯示節點 name、kind、status 三項;並在點擊背景 / 邊、切換到另一節點、或按關閉鈕時關閉。cytoscape 單選的藍色高亮 MUST 與面板開關同步。cluster 容器不可點選。header 除節點 name / kind / status 外,當該節點(**leaf / k8s-node / controller**;**cluster / namespace 除外**——這些 compound 本就不開啟 detail 面板;`storageclass` 於後端 D6 階層改為可選取的 leaf,**已不再排除**)的 `/dashboard` 查詢回傳可用 URL 時,MUST 於 name 旁顯示一顆 **Dashboard 按鈕**,且 `alerts` 與 `detail` **兩 view 皆顯示**(header 為兩 view 共用,單一放置即滿足);按鈕的查詢時機、參數組裝、200-gated 可用性與新分頁開啟行為見 `node-dashboard-url` capability。面板內容依觸發方式分流(`NodeDetailPanel` 的 `view` prop):**左鍵** → `alerts` view,渲染**告警表格**(`@grafana/ui` `InteractiveTable`,欄位 Pod / Service / Alert / Severity / **Count** / **Last occurred**),不渲染 Application / Containers;**右鍵** → `detail` view,只渲染 Application / Containers 區塊(見 application-detail-panel change),不渲染告警表格。面板高度 MUST 隨內容增長,僅在超過上限(`min(50% of canvas, 380px)`)時才於內文區捲動(header 釘住);內容短於上限時 MUST NOT 出現捲動。

對 `kind === 'storageclass'` 的 leaf 節點,Panel SHALL 使其**可選取**並開啟 detail 面板(`isStorageClass` 的排除已隨旗標退役),且 MUST 渲染一個 **Storage Class 區塊**:一個固定高度的 key/value 區塊,gated on `node.kind === 'storageclass'`,含一列 `provisioner` 與 `parameters` map(逐列以**通用方式**渲染 key/value——key 由 provisioner 決定,MUST NOT 硬編碼);`provisioner` / `parameters` 缺值時對應列 MUST NOT 渲染。此 Storage Class 區塊 MUST **僅**在 `node.kind === 'storageclass'` 時出現,其餘 kind MUST NOT 顯示;`provisioner` / `parameters` 為結構欄位、MUST 併入 `assembleDashboardParams` 的 DENYLIST(非 query 參數)。

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

#### Scenario: Dashboard 按鈕顯示於名稱旁(both views)

- **WHEN** 開啟某 leaf / k8s-node / controller 節點的 detail 面板,且其 `/dashboard` 查詢回傳 200 + 非空 url
- **THEN** header 於節點名稱旁顯示 Dashboard 按鈕,`alerts`(左鍵)與 `detail`(右鍵)兩 view 皆然
- **AND** cluster / namespace 節點不開啟面板,故不顯示此按鈕(storageclass 已改為可開啟 detail 的 leaf)

#### Scenario: storageclass leaf 可選取並開啟 detail 面板

- **WHEN** 使用者點擊一個 `kind === 'storageclass'` 的 leaf 節點
- **THEN** detail 面板開啟並顯示其 name / kind(storageclass 不再被排除於可選取 / detail-eligible 之外)

#### Scenario: Storage Class 區塊顯示 provisioner 與 parameters

- **WHEN** 選取的 storageclass leaf 帶有 `provisioner` 與 `parameters`(如 `{pool, fs, cluster_id, selector}`)
- **THEN** detail 面板渲染 Storage Class 區塊,含 `provisioner` 列與逐列的 `parameters` key/value(key 通用、不硬編碼);某欄缺值時該列 MUST NOT 渲染

#### Scenario: 非 storageclass kind 不顯示 Storage Class 區塊

- **WHEN** 選取的節點 `kind` 非 `storageclass`(如 `pod` / `node` / `service`)
- **THEN** detail 面板 MUST NOT 渲染 Storage Class 區塊

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

`NodeContainerLegend`(以 cluster 色上色的 compound 容器清單,含「全部摺疊 / 展開」切換)列出的容器來源 MUST 隨 `podParentMode` 切換:`node` 模式列出 K8s `node` 容器(`cluster > node > pod` 的中間層);`controller` 模式改列 controller 容器(`cluster > controller > pod` 的中間層)。controller 容器來源 MUST 為**後端 `controller` 群組節點**(經 enrichment 標 `isController: true`、kind 衍生自子 pod 的 `owner.kind`),而非 panel 合成(`synthesizeControllers` 已移除);`deriveNodeContainers` 於 controller 模式以 `d.isController === true` 認定容器。兩模式皆以容器所屬 cluster 的 accent 色上色(與 canvas 容器底色同源),且「全部摺疊」切換 MUST 作用於**當前模式**的容器集合(經 `deriveNodeContainers` 等單一來源導出,使切換鈕與 canvas 容器永遠指向同一組)。容器圖例 MUST 在當前模式無任何 compound 容器時 `return null`。

#### Scenario: node 模式列 K8s node 容器

- **WHEN** `podParentMode === 'node'` 且圖中有裝載 pod 的 K8s node
- **THEN** `NodeContainerLegend` 列出這些 K8s node(以各自 cluster 色),「全部摺疊」作用於該 node 容器集合

#### Scenario: controller 模式列 controller 容器

- **WHEN** `podParentMode === 'controller'` 且圖中有裝載 pod 的後端 `controller` 群組(`isController: true`)
- **THEN** `NodeContainerLegend` 改列這些 controller(以各自 cluster 色);「全部摺疊」改作用於 controller 容器集合

#### Scenario: 當前模式無容器時不渲染

- **WHEN** 當前模式下圖中無任何 compound 容器(例:無 owner 的裸 pod 在 controller 模式)
- **THEN** `NodeContainerLegend` `return null`,不渲染空標題

### Requirement: 收合容器(controller / k8s node)邊框依最差子節點 status 上色

當一個**容器收合**時(controller 或 k8s `node`),其矩形邊框 MUST 以它**收合後會隱藏的最差 status** 對應的 `STATUS_COLOR`(`normal` 綠 `#73BF69` / `warning` 黃 / `critical` 紅)上色——**含 `normal`**:旗下全健康的容器收合時 MUST 畫 `normal` 綠框(明確的好消息,而非中性無框)。資料來源為 normalize 彙整於該節點的 `data.worstStatus`(見 graph-data-integration:controller = 自子 pod(`pod.parent === controllerId`)聚合之最差 status,**一律寫入**;k8s node = 自身 status 與**其 pod** status 之最差,worst-wins——`controller` 視圖下 pod 不再巢狀於 node,故 node 的 pod 改以**經 `pod-to-node` 邊可達的 pod** 認定(D8),`node` 視圖下 pod 重新巢狀於 node 則沿用子節點認定;**有 status 資訊時寫入**——自身無 status 且無任何(可達或巢狀)pod 的 node 無此欄,收合維持中性邊框,「無資訊」不得偽裝成 normal)。stylesheet MUST 以 `node[worstStatus="<status>"].cy-expand-collapse-collapsed-node` 選擇器實作,宣告於 `statusSelectors`(資料驅動的 `node[status="<s>"]`——**任何帶 `status` 的節點**畫自身 status 邊框,非 pod/node/pvc 白名單;normalize 只在後端實際給 status 時才寫該欄,故 service / external / cluster / storageclass 等無 status 者維持中性邊框)**之後**,使**收合的 k8s node** 的最差子節點 status 能覆寫其自身 status 邊框;controller 無 status 邊框,故此為其唯一上色。`node:selected` 以 outline/underlay 呈現故不影響此邊框色。**展開**的容器不套此選擇器(controller 維持中性 `:parent` 容器邊框、k8s node 維持自身 status 邊框)。採 **status**(非 alert severity):`info` 僅存在於 alert、不在 status 量尺,故收合框永不為 info(`SEVERITY_COLOR` 仍只服務 detail panel 的 alert 表)。

#### Scenario: 收合 controller 顯示最差子 pod status

- **WHEN** 某 controller 旗下有 pod `status: critical`,使用者**收合**該 controller
- **THEN** 收合的 controller 矩形邊框以 `STATUS_COLOR.critical`(紅)上色
- **WHEN** 同一 controller **展開**
- **THEN** 邊框回到中性 `:parent` 容器色

#### Scenario: k8s node worstStatus 經 pod-to-node 邊計算

- **WHEN** `controller` 視圖下,某 k8s `node` 自身 `status: normal`、且有 pod 經 `pod-to-node` 邊指向它、該 pod `status: critical`(此時 pod 巢狀於 controller、非 node)
- **THEN** normalize 將 `data.worstStatus` 寫為 `critical`(自 `pod-to-node` 邊可達 pod 取最差);`node` 視圖下 pod 重新巢狀於 node 時,以子節點認定亦得相同結果

#### Scenario: 收合 k8s node 以最差子 status 覆寫自身 status 邊框

- **WHEN** 某 k8s `node` 自身 `status: normal`、旗下有 pod `status: critical`(經 `pod-to-node` 邊或巢狀認定),使用者**收合**該 node
- **THEN** 收合的 node 矩形邊框以 `STATUS_COLOR.critical`(紅)上色(覆寫其自身 normal 綠)
- **WHEN** 同一 node **展開**
- **THEN** 邊框回到自身 status(`normal` 綠);其子 pod 各自顯示自身 status 邊框

#### Scenario: 全 normal 容器收合畫 normal 綠框

- **WHEN** 某容器(controller 或 k8s node)收合後會隱藏的最差 status 為 `normal`(子節點皆 normal,缺 status 視為 normal)
- **THEN** 收合的容器矩形邊框以 `STATUS_COLOR.normal`(綠)上色——controller 一律;k8s node 因自身或子 pod 至少其一帶 status 資訊

#### Scenario: 無 status 資訊的 k8s node 收合維持中性邊框

- **WHEN** 某 k8s `node` 自身無 `status` 且無任何(可達或巢狀)pod
- **THEN** 該 node 無 `data.worstStatus`,收合時維持中性容器邊框(「無資訊」不是「正常」)

### Requirement: Node-kinds 圖例 collapse-aware(只列實際以 glyph 呈現者)

icon「Node Kinds」圖例的 kind 集合 MUST 由純函式 `deriveLegendKinds(elements, collapsedIds)` 導出,只列出**目前以 glyph 呈現於畫布**的 kind——而非單純「資料中出現過」的 kind。判定規則(對每個非 cluster、帶 `kind` 的節點):被收合祖先隱藏者**不**計入;**展開的**容器(其 id 為他人 `parent` 且自身未收合)**不**計入(它在 Clusters / Nodes|Controllers swatch 區段呈現);其餘(drawn leaf 或**收合的**容器)計入其 kind。`cluster`(無 kind)永不計入。此規則取代舊有的 `presentKinds` + `deriveContainers.showNodeKindIcon`,使 node / controller 容器一致;`storageclass` 於後端 D6 階層改為 cluster 下的 leaf、**不再是容器**,恆以其 glyph(drawn leaf)計入,不再因「收合 / 展開」而於 Node-kinds 圖例進退。

#### Scenario: storageclass 恆以 leaf glyph 計入 Node-kinds

- **WHEN** 圖中含 storageclass leaf(後端 D6 階層下 storageclass 為 cluster 下的 leaf,非容器)且其鄰近有 pvc leaf
- **THEN** Node-kinds 圖例的 `Storage` 大類同時列出 `pvc` 與 `storageclass` 兩個 glyph;`storageclass` 不再因「收合」而與 `pvc` 互換(它從不是容器)

#### Scenario: 收合容器時其子 kind 退出、容器 kind 進入(node / controller 同理)

- **WHEN** 某 K8s `node`(或 controller)容器被收合,其下 pod 全被聚合隱藏
- **THEN** `pod` 退出 Node-kinds 圖例、`node`(或對應 controller kind)以其 glyph 進入;展開的容器則不出現在 Node-kinds(僅於其 swatch 區段)

#### Scenario: 收合虛擬 network compound 時 Node-kinds 以 network 取代 switch

- **WHEN** 包裹 switch fabric 的虛擬 `network` compound(見 switch-tier-layout 規格)被收合
- **THEN** 其下 `switch` 因被收合祖先隱藏而退出 Node-kinds 圖例,收合的 `network` 以其 wifi glyph 進入(NETWORKING 大類由 `switch` 變為 `network`,標籤顯示為 `physical network`);展開後還原為 `switch`

## REMOVED Requirements

### Requirement: StorageClass compound 容器渲染與圖例(**完全比照 K8s node 容器**)

**Reason:** `storageclass` 於後端 D6 階層改為 cluster 下的一般 `kind:'storageclass'` leaf(自帶 `provisioner` / `parameters`),不再是 boxing PVC 的 compound 容器;`isStorageClass` 旗標、`deriveStorageClassContainers`、`StorageClassLegend` 與 storageclass 專屬的 stylesheet / hover / 容器渲染行為一併退役。對等行為改見:`圖例 (Legend)`(storageclass 改以 NodeLegend glyph 列於 Storage 大類)、`Node Detail 面板`(Storage Class 區塊)、`Hover Tooltip 顯示元素 metadata`(自帶 metadata 的一般 node 路徑)。
