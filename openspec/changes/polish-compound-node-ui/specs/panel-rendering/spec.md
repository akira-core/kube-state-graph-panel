## MODIFIED Requirements

### Requirement: 互動與選取狀態

Panel SHALL 支援節點點擊選取,選取狀態透過 cytoscape 內建 `:selected` style 視覺化,且可選地透過 `onSelect` callback 將被選節點 id 傳出供其他元件消費。

**`controller` / K8s `node` / `storageclass`,以及裝飾性 `namespace` / `application` 群組 MUST 為可選取(`selectable`)。裝飾性 `cluster` 群組 MUST NOT 可選取(`selectable: false`)。** 此可選取性的唯一目的,是讓 `cytoscape-expand-collapse` 既已啟用(`cueEnabled: true`)的 **`+/-` 摺疊 cue** 能浮現:該 cue 為 selection-driven,僅於**單一被選取**且為 `:parent`(或已收合)的節點上繪製。故使用者點選任一可選取的 compound parent → 該 parent 浮現其 `+/-` cue → 點 cue 切換該 parent 的收合 / 展開(沿用既有 expand-collapse plumbing,無新元件、無新收合機制)。

`cluster` 群組因不可選取,點擊(`tap`)它一律視同點擊背景(觸發 `onSelect(null)`,不顯示選取環、不浮現摺疊 cue)。其收合 / 展開改由**雙擊(`dbltap`)**觸發:GraphCanvas MUST 於偵測到對 `isCluster` 節點的 `dbltap` 時,直接呼叫既有 `ExpandCollapseApi`(`api.expand(node)` 或 `api.collapse(node)`,依 `isExpandable`/`isCollapsible` 判斷)切換該節點收合狀態——此路徑觸發與 cue 相同的 `expandcollapse.aftercollapse`/`afterexpand` 事件,`collapsedIds` 更新沿用既有 `onCollapsedChange` 路徑,無新收合狀態機制。

`namespace` 裝飾群組雖可被選取(顯示單選環與既有 selection-focus 視覺),但 MUST NOT 開啟 node-detail 面板:`resolveSelectedNode` 對 `isNamespace` 一律回 `null`。**`application` 群組為例外**:它現為 detail-eligible——選取時除浮現摺疊 cue 外,**亦開啟 node-detail 面板**顯示該 ArgoCD application 的 config_changes(`resolveSelectedNode` 以合成 `kind: application` + `queryTarget { kind: 'application', name: <app> }` 解析,見「Node Detail 面板」/「Node Detail Application 與 Containers 區塊」)。故 `resolveSelectedNode` 的範圍刻意較 `isDashboardEligible` 寬——後者仍排除 `application` 群組於 `/dashboard` 按鈕之外(application 群組無 per-node dashboard)。

#### Scenario: 點擊節點觸發選取與 callback

- **WHEN** 使用者點擊任一可選取節點
- **THEN** 該節點被 cytoscape 標記為 `:selected` 並套用對應樣式,若提供 `onSelect` prop 則以節點 id 呼叫之

#### Scenario: cluster 群組不可選取,點擊如同背景點擊

- **WHEN** 使用者點擊一個裝飾性 `cluster` 群組節點
- **THEN** 該節點 `selectable()` 為 `false`,`onSelect(null)` 被呼叫,不顯示選取環,`cytoscape-expand-collapse` 摺疊 cue 不浮現

#### Scenario: 雙擊 cluster 群組切換收合 / 展開

- **WHEN** 使用者對一個裝飾性 `cluster` 群組節點雙擊(`dbltap`)
- **THEN** 該節點的收合 / 展開狀態透過 `ExpandCollapseApi` 被直接切換,且 `collapsedIds` 隨之更新(經既有 `onCollapsedChange` 路徑),無論該節點目前是否被選取

#### Scenario: namespace / application 群組可被選取以浮現摺疊 cue

- **WHEN** 使用者點擊一個裝飾性 `namespace` / `application` 群組節點
- **THEN** 該節點 `selectable()` 為 `true`、被標記為 `:selected`(顯示單選環),且 `cytoscape-expand-collapse` 於其上繪製 `+/-` 摺疊 cue

#### Scenario: 選取 namespace 群組不開啟 detail 面板

- **WHEN** 使用者選取一個裝飾性 `namespace` 群組節點
- **THEN** `resolveSelectedNode` 回 `null`,node-detail 面板 MUST NOT 開啟(只顯示選取環與摺疊 cue)

#### Scenario: 選取 application 群組開啟其 app-detail

- **WHEN** 使用者選取一個 `application` 群組節點
- **THEN** `resolveSelectedNode` 解析該節點(合成 `kind: application`),node-detail 面板開啟並渲染 Application 區塊(預取該 application 的 `config_changes`),tooltip 釘選於右上角;同時仍浮現摺疊 cue

#### Scenario: 點摺疊 cue 切換該 parent 收合

- **WHEN** 某可選取的 compound parent(`controller` / K8s `node` / `storageclass` / `namespace` / `application`)已被選取並顯示其 `+/-` cue,使用者點擊該 cue 範圍
- **THEN** 該 parent 的收合 / 展開狀態被切換(經 expand-collapse api),且 `collapsedIds` 隨之更新(沿用既有 cue 事件 → `onCollapsedChange` 路徑)

### Requirement: Node Detail 面板

Panel SHALL 在**左鍵**點擊節點時,於 canvas 底部以浮層(不縮放 graph)開啟 detail 面板,header 顯示節點 name、kind、status 三項;並在點擊背景 / 邊、切換到另一節點、或按關閉鈕時關閉。cytoscape 單選的藍色高亮 MUST 與面板開關同步。裝飾性 **cluster** 群組**不可被選取**(見「互動與選取狀態」:tap 視同背景點擊、無選取環、無摺疊 cue,收合改由 dbltap 觸發),裝飾性 **namespace** 群組**可被選取**(顯示選取環與摺疊 cue,見「互動與選取狀態」)——兩者 `resolveSelectedNode` 皆回 `null`,故 MUST NOT 開啟此 detail 面板、亦 MUST NOT 釘選 tooltip。**`application` 群組為例外**:它現為 detail-eligible(kind-less,以合成 `kind: application` 解析),選取時**開啟面板**渲染該 ArgoCD application 的 Application config_changes 區塊(見「Node Detail Application 與 Containers 區塊」)並**釘選 tooltip**,同時仍浮現其摺疊 cue。

header 除節點 name / kind / status 外,當該節點(任一 detail-eligible 節點:**leaf 含 storageclass / k8s-node / controller**;**僅裝飾性 cluster / namespace / application 除外**)的 `/dashboard` 查詢回傳可用 URL 時,MUST 於 name 旁顯示一顆 **Dashboard 按鈕**;按鈕的查詢時機、參數組裝、200-gated 可用性與新分頁開啟行為見 `node-dashboard-url` capability。

面板 body 一律以**資料有無**閘控,依序為——(1)**Application change-report 區塊**:帶 `data.application` 的節點即顯示(**含 `service` / `pvc`**——見「Node Detail Application 與 Containers 區塊」需求);**Containers change-report 區塊**僅 workload kind 且帶 `data.containers` 時顯示;(2)**Alerts 區塊**(`node-detail-section-alerts`):節點帶非空 `data.alerts` 時渲染告警表,**無告警時整段不渲染**。**面板不再有恆顯的屬性(Properties)區塊**——節點的 promoted attributes(合成 kind、`namespace`、`application`、`ipAddress`、`provisioner`、storageclass `parameters`)改由**右上角釘選 tooltip** 呈現(見「Hover Tooltip」pinned 模式,與 hover 同源)。

**面板 ALWAYS 渲染**(只要左鍵選取一個 detail-eligible 節點):**header**(節點 name + kind / status badge + 關閉鈕,以及 `/dashboard` 查詢回 `ready` + 非空 `urls` 時的 Dashboard 按鈕)為最小渲染;body 區塊(Application / Containers / Alerts)各自以資料有無閘控。無任何 body 內容的節點(如純 `storageclass`、無 `application` 的 `service` / `pvc`)左鍵選取後**仍渲染 header-only 面板**;其 promoted attributes 由右上角釘選 tooltip 承載(不重複於面板)。釘選卡片本身**不含** Dashboard 按鈕,故 header 是 dashboard 入口的唯一處——因 header 恆顯,入口必然可達。

面板高度 MUST 隨內容增長,僅在超過上限(canvas 高度的 `50%`)時才捲動(header 釘住);內容短於上限時 MUST NOT 出現捲動。**捲動 MUST 集中於單一容器(面板 body,`node-detail-scroll`):body 為唯一 scroll authority(`overflowY: auto`),各區塊一律為 content-height(`flex: 0 0 auto`)且 MUST NOT 各自擁有內部捲動。**面板可同時堆疊多個區塊(Application + Containers + Alerts),若任一區塊自帶內部捲動,多個 fill 區塊會在受限高度下互相重疊且皆無法捲動——故 single-body-scroll 為唯一可組合的模型。

告警資料來自上游 graph JSON 節點的選用欄位 `alerts: NodeAlert[]`(`normalizeGraph` 攜帶至 `data.alerts`,缺值或空陣列→該區塊不渲染)。每筆 `NodeAlert` 以 `timeRecords: number[]`(Unix 秒,升序)表示重複發生;後端已把同一 alert 分組為**單筆**,故告警表格**一列代表一個 alert**。**Count** 欄 MUST 顯示 `timeRecords.length`,並 MUST 透過 `@grafana/ui` `Tooltip` 列出全部發生時間(依 `timeZone` 格式化)。**Last occurred** 欄 MUST 顯示 `max(timeRecords)`(格式化)且 MUST 可點擊:點擊時以 `t = max(timeRecords)`(Unix 秒)為中心、固定 ±5 分鐘(300 秒),呼叫 `onChangeTimeRange({ from: (t-300)*1000, to: (t+300)*1000 })` 倒帶 dashboard 時間範圍。`severity` 為自由字串:`info` / `warning` / `critical` 取 `SEVERITY_COLOR` 對應色,其餘自訂標籤 MUST 原樣保留並以 `FALLBACK_SEVERITY_COLOR`(critical 色)著色。告警表格的 **Pod / Service 缺值格 MUST 顯示 muted「n/a」**(統一缺值占位 `MISSING_VALUE_PLACEHOLDER`,見「Node Detail Application 與 Containers 區塊」)。

#### Scenario: 左鍵點任一 detail-eligible 節點開啟面板

- **WHEN** 使用者**左鍵**點擊任一非裝飾 detail-eligible 節點
- **THEN** 底部浮層渲染 header(節點 label、kind badge、status badge、關閉鈕),覆蓋於 graph 之上且不改變 graph 尺寸;有資料的 body 區塊隨之顯示
- **AND** 該節點的選取高亮與開啟的面板同步,且其屬性同時釘選於右上角 tooltip

#### Scenario: 點外面或關閉鈕關閉

- **WHEN** 使用者點擊 graph 背景或邊,或按下關閉鈕
- **THEN** detail 面板關閉,且選取高亮清除(右上角釘選 tooltip 一併消失)

#### Scenario: 切換節點

- **WHEN** 面板開啟時使用者點擊另一個節點
- **THEN** 面板切換為新點擊的節點(釘選 tooltip 同步切換)

#### Scenario: 裸節點仍渲染 header-only 面板

- **WHEN** 使用者左鍵選取一個 detail-eligible 但無 application / containers / alerts、亦無 ready dashboard URL 的節點(如純 `storageclass`、無 `application` 的 `service` / `pvc`)
- **THEN** `NodeDetailPanel` **仍渲染**,只含 header(節點 name + kind / status badge + 關閉鈕),無任何 body 區塊
- **AND** 該節點的 promoted attributes 由右上角釘選 tooltip 承載(不重複於面板)

#### Scenario: header 顯示 Dashboard 按鈕(後端有 URL 時)

- **WHEN** 使用者左鍵選取的節點 `/dashboard` 查詢回傳 ready + 非空 url(不論是否有 body 內容)
- **THEN** header 於節點 name 旁顯示 Dashboard 按鈕;若無任何 body 內容則為 header-only 面板
- **AND** Dashboard 按鈕可達(其僅存在於 header,不在釘選卡片)

#### Scenario: Dashboard 按鈕顯示於名稱旁

- **WHEN** 開啟某 detail-eligible 節點的面板(因其帶 change-report / alerts,或僅因有 ready dashboard 而成 header-only),且其 `/dashboard` 查詢回傳 200 + 非空 url
- **THEN** header 於節點名稱旁顯示 Dashboard 按鈕
- **AND** 裝飾性 cluster / namespace / application 群組 `resolveSelectedNode` 回 null、不開啟面板,故無此按鈕;storageclass 等 detail-eligible leaf 若有 dashboard URL 則以 header-only 面板顯示此按鈕

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

- **WHEN** 面板同時渲染多個高區塊(如帶 application + 多 container + 多 alert 的 pod,Containers 與 Alerts 區塊皆高於上限)
- **THEN** 面板 body(`node-detail-scroll`)為唯一捲動容器(`overflowY: auto`),各區塊 `flex-grow: 0`(content-height)且其表格 slot MUST NOT 自帶 `overflowY: auto`
- **AND** 區塊上下堆疊、彼此 MUST NOT 重疊;內容超過上限時 body 捲動整個堆疊(header 釘住),內容短於上限時不出現捲動

#### Scenario: 無告警時 Alerts 區塊整段不渲染

- **WHEN** 選取的節點無 `alerts` 欄位或為空陣列
- **THEN** Alerts 區塊(`node-detail-section-alerts`)MUST NOT 渲染(不顯示表格、亦不顯示舊的「No alerts」訊息);其他有資料區塊照常渲染,若無其他 body 區塊則面板仍渲染 header-only

## ADDED Requirements

### Requirement: 裝飾性 compound 群組使用 per-kind 固定色彩與 kind 前綴標籤

裝飾性 `cluster` / `namespace` / `application` 群組的 accent 色(`clusterColor` / `namespaceColor` / `applicationColor`)MUST 為**依群組種類(kind)固定的單一色彩**——同種類的所有群組節點(不論其名稱)共用同一色彩,不再依名稱雜湊(hash)產生每一實例各異的色彩。三種 kind 的色彩 MUST 彼此不同,且 MUST 與既有邊色彩表(`EDGE_STYLE_BY_TYPE`)及 status 色彩(normal 綠、warning 黃、critical 紅)有足夠對比,確保邊線經過任一 compound 背板時仍清晰可辨。

裝飾性 `cluster` / `namespace` / `application` 群組的 `data.label` MUST 以其 kind 為前綴,格式為 `${kind}:${name}`(例如名稱 `prod` 的 `cluster` 群組標籤為 `cluster:prod`,名稱 `checkout` 的 `namespace` 群組標籤為 `namespace:checkout`,名稱 `mongo` 的 `application` 群組標籤為 `application:mongo`)。此前綴由 `normalizeGraph` 產生,非 stylesheet 渲染時串接,故 legend、tooltip 等所有讀取 `data.label` 的消費端皆自動取得前綴後的名稱。此要求僅適用於三種裝飾性 compound 群組,不影響任何 leaf 節點(pod / service / pvc / node / storageclass)或 `controller` compound 的標籤格式。

#### Scenario: 同 kind 的多個 cluster 群組共用同一色彩

- **WHEN** 圖中存在兩個以上不同名稱的 `cluster` 群組節點
- **THEN** 所有 `cluster` 群組節點的 `data.clusterColor` 皆為同一固定值,不因名稱不同而異

#### Scenario: 三種 kind 的固定色彩彼此不同且與邊色彩有對比

- **WHEN** Panel 渲染 `cluster` / `namespace` / `application` 群組
- **THEN** 三者的固定色彩彼此互異,且皆非 `EDGE_STYLE_BY_TYPE` 中任一邊色彩或 status 色彩(綠 `#73BF69` / 黃 `#F2CC0C` / 紅 `#E02F44`)的完全相同色值

#### Scenario: 裝飾性群組標籤以 kind 為前綴

- **WHEN** 一個名稱為 `prod` 的 `cluster` 群組、名稱為 `checkout` 的 `namespace` 群組、名稱為 `mongo` 的 `application` 群組被正規化
- **THEN** 三者的 `data.label` 依序為 `cluster:prod`、`namespace:checkout`、`application:mongo`

#### Scenario: 非裝飾性節點標籤不受影響

- **WHEN** 一個 `pod` / `service` / `pvc` / `node` / `storageclass` leaf 節點或 `controller` compound 節點被正規化
- **THEN** 其 `data.label` 維持原名稱,不套用任何 kind 前綴
