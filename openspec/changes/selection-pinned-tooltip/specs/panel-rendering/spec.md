## MODIFIED Requirements

### Requirement: 互動與選取狀態

Panel SHALL 支援節點點擊選取,選取狀態透過 cytoscape 內建 `:selected` style 視覺化,且可選地透過 `onSelect` callback 將被選節點 id 傳出供其他元件消費。

**所有 compound parent 節點 MUST 為可選取(`selectable`)**——含 `controller` / K8s `node` / `storageclass`,以及裝飾性 `cluster` / `namespace` / `application` 群組。`normalizeGraph` MUST NOT 再把裝飾群組標為 `selectable: false`。此可選取性的唯一目的,是讓 `cytoscape-expand-collapse` 既已啟用(`cueEnabled: true`)的 **`+/-` 摺疊 cue** 能浮現:該 cue 為 selection-driven,僅於**單一被選取**且為 `:parent`(或已收合)的節點上繪製。故使用者點選任一 compound parent → 該 parent 浮現其 `+/-` cue → 點 cue 切換該 parent 的收合 / 展開(沿用既有 expand-collapse plumbing,無新元件、無新收合機制)。

`cluster` / `namespace` 裝飾群組雖可被選取(顯示單選環與既有 selection-focus 視覺),但 MUST NOT 開啟 node-detail 面板:`resolveSelectedNode` 對 `isCluster` / `isNamespace` 一律回 `null`。**`application` 群組為例外**:它現為 detail-eligible——選取時除浮現摺疊 cue 外,**亦開啟 node-detail 面板**顯示該 ArgoCD application 的 config_changes(`resolveSelectedNode` 以合成 `kind: application` + `queryTarget { kind: 'application', name: <app> }` 解析,見「Node Detail 面板」/「Node Detail Application 與 Containers 區塊」)。故 `resolveSelectedNode` 的範圍刻意較 `isDashboardEligible` 寬——後者仍排除 `application` 群組於 `/dashboard` 按鈕之外(application 群組無 per-node dashboard)。

#### Scenario: 點擊節點觸發選取與 callback

- **WHEN** 使用者點擊任一節點
- **THEN** 該節點被 cytoscape 標記為 `:selected` 並套用對應樣式,若提供 `onSelect` prop 則以節點 id 呼叫之

#### Scenario: 裝飾群組可被選取以浮現摺疊 cue

- **WHEN** 使用者點擊一個裝飾性 `cluster` / `namespace` / `application` 群組節點
- **THEN** 該節點 `selectable()` 為 `true`、被標記為 `:selected`(顯示單選環),且 `cytoscape-expand-collapse` 於其上繪製 `+/-` 摺疊 cue

#### Scenario: 選取 cluster / namespace 群組不開啟 detail 面板

- **WHEN** 使用者選取一個裝飾性 `cluster` / `namespace` 群組節點
- **THEN** `resolveSelectedNode` 回 `null`,node-detail 面板 MUST NOT 開啟(只顯示選取環與摺疊 cue)

#### Scenario: 選取 application 群組開啟其 app-detail

- **WHEN** 使用者選取一個 `application` 群組節點
- **THEN** `resolveSelectedNode` 解析該節點(合成 `kind: application`),node-detail 面板開啟並渲染 Application 區塊(預取該 application 的 `config_changes`),tooltip 釘選於右上角;同時仍浮現摺疊 cue

#### Scenario: 點摺疊 cue 切換該 parent 收合

- **WHEN** 某 compound parent 已被選取並顯示其 `+/-` cue,使用者點擊該 cue 範圍
- **THEN** 該 parent 的收合 / 展開狀態被切換(經 expand-collapse api),且 `collapsedIds` 隨之更新(沿用既有 cue 事件 → `onCollapsedChange` 路徑)

### Requirement: Hover Tooltip 顯示元素 metadata

Panel SHALL 顯示 `HoverTooltip` 元件,具**兩種模式**:

- **(1) Hover 浮動模式(預設,無 detail 節點被選取時)**:使用者 hover 於任一 node 或 edge 時,tooltip MUST 浮動定位於被 hover 元素附近(`position: absolute`,node 取其 rendered 中心、edge 取游標 rendered 位置,加固定偏移),並夾擠 / 翻轉於 cytoscape canvas wrapper 邊界內(偏移後超出右 / 下緣時翻轉至元素左側並夾於 wrapper 內,不超出可視範圍),寬度約 280px,套用 `pointer-events: none` 以確保不阻擋下方圖形互動。**此模式行為與既往完全一致。**
- **(2) Pinned 釘選模式(當一個 detail-eligible 節點被左鍵選取時)**:tooltip 改**釘選於 canvas 右上角**(`top: 8` / `right: 8` / `left: auto`、`maxHeight: calc(50% - 16px)`、`overflowY: auto`、`pointer-events: auto` 使其內容可捲動、`zIndex: 1000` 以蓋過 cytoscape expand-collapse 的透明輸入層 `z-index: 999`),顯示**被選取節點**的完整 tooltip 內容(title + promoted attrs + 原始 labels),其內容**與 hover 模式同源同樣**(同一 `buildNodeAttributes` 與 `toLabelRows`,promoted 的 `kind` row 一併顯示)。釘選時 **hover 浮動 tooltip 全面抑制**(node 與 edge 皆不再浮動)。

被選取節點的資料源為已 gated 的 `resolveSelectedNode`(可見 + 未被收合祖先隱藏 + detail-eligible),故裝飾性 **`cluster` / `namespace`** 群組(`resolveSelectedNode` 回 `null`)**不**釘選、其 hover 行為不變;**`application` 群組現為 detail-eligible**,選取時**亦釘選**(顯示合成 `kind: application` + 其名稱)。釘選卡片**無關閉鈕**:取消選取(點背景 / 邊、切換節點、kind / edge 過濾、收合祖先、資料刷新移除)即自動清除釘選並恢復 hover 模式。樣式 MUST 使用 `@grafana/ui` theme tokens(背景半透明 `theme.colors.background.secondary` + opacity ≥ 0.85)。

#### Scenario: Hover 節點顯示節點 metadata（無選取時）

- **WHEN** 無 detail 節點被選取,使用者滑鼠 hover 於任一節點
- **THEN** `HoverTooltip` 浮動顯示節點 `name`(`data.label ?? data.id`)、`kind`、`namespace`、`ipAddress`(`data.ipAddress` 以逗號串接顯示,僅當存在且非空時)、`application`(ArgoCD application;凡 leaf 帶 `data.application`——pod / service / pvc 與聚合後的 controller——即顯示,惟裝飾性 `application` 群組節點 MUST NOT 顯示此 row 以免與其合成 `kind`/`name` 重複),以及白名單 labels(`app`、`version`、`app.kubernetes.io/name`、`app.kubernetes.io/instance`)中有值的欄位;缺漏欄位 MUST 不顯示其 row(不顯示空白 placeholder)

#### Scenario: Hover 邊顯示邊 metadata（無選取時）

- **WHEN** 無 detail 節點被選取,使用者滑鼠 hover 於任一邊
- **THEN** `HoverTooltip` 浮動顯示 `edgeType`、`source → target`(以兩端節點的 `label` 解析,而非裸 id)

#### Scenario: Tooltip 定位於 hovered 元素附近（hover 模式）

- **WHEN** 無 detail 節點被選取,使用者 hover 於某節點
- **THEN** tooltip 以該節點 rendered 位置加固定偏移定位(動態 `left` / `top`),而非固定於角落
- **AND** 當偏移後 tooltip 會超出 canvas 右 / 下緣時,翻轉至節點左側並夾擠於 wrapper 邊界內

#### Scenario: Tooltip 不阻擋圖形互動（hover 模式）

- **WHEN** Hover 浮動 tooltip 顯示中,使用者點擊 tooltip DOM 覆蓋區域底下的節點
- **THEN** 該節點被選取(觸發既有 `:selected` 樣式與 `onSelect` callback),hover tooltip 不攔截 click 事件(`pointer-events: none` 生效)

#### Scenario: 取消 hover 後浮動 tooltip 淡出並從 DOM 移除

- **WHEN** 無選取時,使用者滑鼠移出原 hovered 元素且未進入其他元素
- **THEN** `HoverTooltip` 以 opacity transition(≥ 100ms ≤ 200ms)淡出,動畫結束後 tooltip 不渲染任何 DOM(避免空 box 佔位)

#### Scenario: Hovered 元素被移除時清空浮動 tooltip

- **WHEN** 一個元素 hover 中(無選取),該元素因 data refresh 從 cytoscape instance 中被 remove
- **THEN** `useHoverElement` 收到 `remove` 事件後清空 store,`HoverTooltip` 立即消失,不渲染參照已不存在元素的內容

#### Scenario: Hover 不觸發 GraphCanvas 重渲染

- **WHEN** 連續 hover 多個元素
- **THEN** 透過 `useSyncExternalStore` 訂閱的 `HoverTooltip` 元件重新渲染,但 `GraphCanvas` 與 cytoscape instance reference 不變(React DevTools profiler 驗證 `GraphCanvas` render count 不增加)

#### Scenario: 左鍵選取 detail 節點將 tooltip 釘選於右上角

- **WHEN** 使用者左鍵選取一個 detail-eligible 節點(leaf 含 storageclass / k8s-node / controller)
- **THEN** `HoverTooltip` 進入 pinned 模式:於 canvas 右上角(`top:8` / `right:8`、`pointer-events:auto`、`zIndex:1000`、`maxHeight: calc(50% - 16px)` 可捲動)釘選顯示**該節點**的 title + promoted attrs(含 `kind` row)+ 原始 labels(`toLabelRows` 過濾掉已 promote 的 `namespace`)
- **AND** 釘選內容與 hover 該節點時的內容完全一致(同源)

#### Scenario: 釘選時抑制 hover 浮動

- **WHEN** 一個 detail 節點已被選取(tooltip 釘選中),使用者 hover 於其他 node 或 edge
- **THEN** 浮動 hover tooltip MUST NOT 顯示(pinned 模式抑制 hover);右上角僅持續顯示被選取節點的釘選卡片

#### Scenario: 釘選 tooltip 即使游標不在任何元素上仍顯示

- **WHEN** 一個 detail 節點被選取,且游標未 hover 於任何元素(`useHoverElement` 回 `null`)
- **THEN** 釘選卡片仍 MUST 顯示(pinned 模式不依賴 hovered 元素;渲染早於 hover 的 `hovered === null` 早退)

#### Scenario: 取消選取清除釘選並恢復 hover

- **WHEN** 釘選中,使用者取消選取(點背景 / 邊、切換到另一節點、kind/edge 過濾掉該節點、收合其祖先、或資料刷新移除該節點)
- **THEN** `resolveSelectedNode` 回 `null` → 釘選卡片消失,tooltip 恢復 hover 浮動模式

#### Scenario: 選取 storageclass 釘選 provisioner 與 parameters

- **WHEN** 使用者左鍵選取一個 storageclass leaf
- **THEN** tooltip 釘選顯示 `kind: storageclass` + `provisioner` + 每個 backing-storage parameter(key 排序、值換行);底部 detail 面板因無 change-report / alerts 區塊而不渲染(除非有 ready dashboard URL,見「Node Detail 面板」)

### Requirement: Node Detail 面板

Panel SHALL 在**左鍵**點擊節點時,於 canvas 底部以浮層(不縮放 graph)開啟 detail 面板,header 顯示節點 name、kind、status 三項;並在點擊背景 / 邊、切換到另一節點、或按關閉鈕時關閉。cytoscape 單選的藍色高亮 MUST 與面板開關同步。裝飾性 **cluster / namespace** 群組**可被選取**(顯示選取環與摺疊 cue,見「互動與選取狀態」)但 `resolveSelectedNode` 回 `null`,故 MUST NOT 開啟此 detail 面板、亦 MUST NOT 釘選 tooltip。**`application` 群組為例外**:它現為 detail-eligible(kind-less,以合成 `kind: application` 解析),選取時**開啟面板**渲染該 ArgoCD application 的 Application config_changes 區塊(見「Node Detail Application 與 Containers 區塊」)並**釘選 tooltip**,同時仍浮現其摺疊 cue。

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

### Requirement: Node Detail Application 與 Containers 區塊

Panel SHALL 在 node-detail 面板中提供帶 change-report 查詢的 **Application 區塊**與 **Containers 區塊**,沿用既有面板位置與版型(與 Alerts 區塊同一 sticky section 樣式)。**Application 區塊**對**任一帶 `data.application` 的節點**顯示——pod / workload controller(`kind ∈ { pod, deployment, statefulset, daemonset, job, cronjob }`),屬於某 ArgoCD application 的 `service` / `pvc` leaf,**以及 ArgoCD `application` 群組節點本身**(kind-less,以合成 `kind: application` 解析)——其 `config_changes`(Deployment Changes)查詢以該節點的識別發出(`service` / `pvc` 用自身 kind/name;`application` 群組用 `{ kind: 'application', name: <app> }`)。**Containers 區塊**MUST **僅對 pod 與 workload controller**且帶 `data.containers` 時顯示;`service` / `pvc` / `application` 群組 / `node` / `external` 等無 containers,Containers 區塊永不對其渲染。service / pvc 的 application 名稱**同時**以 promoted attr 出現於右上角釘選 tooltip(見「Hover Tooltip」),兩處互補:tooltip 顯示名稱,Application 區塊提供 config_changes 連結。

面板 body 純以**各區塊資料有無**閘控:**Application 區塊**以 `data.application` 有無閘控(任一帶 application 的節點,含 service / pvc);**Containers 區塊**以 **workload kind + 非空 `data.containers`** 閘控;兩者與 Alerts 區塊(資料閘控)共存於同一**左鍵**面板;面板**不再有恆顯的屬性區塊**(promoted attributes 改由釘選 tooltip 承載,見「Node Detail 面板」),且 header **恆顯**(面板 ALWAYS 渲染,見「Node Detail 面板」)。

**資料來源**:application name 來源為節點的 `data.application`(backend 於 pod 節點輸出;controller 由 `normalizeGraph` 自子 pod 聚合);containers 來源為節點的 `data.containers`(`Array<{ name, image }>`)。節點無 `data.application` 時 Application 區塊 MUST NOT 渲染;無 `data.containers`(或為空陣列)時 Containers 區塊 MUST NOT 渲染;兩者互不影響。

**觸發**:在 pod/controller 節點上**左鍵**(cytoscape `tap`)MUST(a)選取該節點(沿用既有單選受控狀態,與藍色高亮 / 面板開關同步,面板隨之開啟),(b)**建立**該節點兩個 URL 查詢(application-detail 與 image-detail)所需的 input(application name, controller kind, controller name, time——time 為左鍵選取當下時間,Unix 秒),並以此 input **立即併發預取(eager prefetch)** 兩查詢——`config_changes`(application)與 `code_changes`(containers)MUST 在面板因左鍵選取 workload 節點而開啟(`enabled` 為 true,即 input 與 endpoint 皆可解析)時、**無需任何後續點擊**即同時發出。**右鍵(`cxttap`)不再開啟 detail 面板、不再建立查詢 input、不再發出任何查詢**(舊右鍵 detail 觸發與其原生 context menu 抑制一併移除)。**屬於某 ArgoCD application 的 `service` / `pvc`**(帶 `data.application`)左鍵選取時亦建立查詢 input——`kind` / `name` 取**該節點自身**——並預取 `config_changes`(驅動其 Application 區塊);其 `code_changes` 雖由共用預取一併發出,但 service / pvc 無 containers,回傳結果不被使用(Containers 區塊不渲染)。**無 `data.application` 的非 workload 節點(無 `queryTarget`)左鍵選取 MUST NOT 建立查詢 input、MUST NOT 發出任何查詢**(其屬性由釘選 tooltip 承載,Alerts 視資料顯示)。

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

#### Scenario: Containers 僅對 workload;service/pvc 帶 application 顯示 Application

- **WHEN** 選取的節點 `kind` 為 `service` / `pvc` 且帶 `data.application`
- **THEN** **Application 區塊**(`node-detail-section-application`)渲染並預取 `config_changes`(以該節點自身 kind/name);**Containers 區塊**(`node-detail-section-containers`)MUST NOT 渲染(service/pvc 無 containers,即使資料偶帶 `containers`)
- **WHEN** 選取的節點 `kind` 為 `node` / `external` / `switch` / `cluster` / `storageclass`,或為無 `data.application` 的 `service` / `pvc`
- **THEN** Application 與 Containers 區塊皆 MUST NOT 渲染

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

#### Scenario: 帶 application 的 service/pvc 左鍵預取 config_changes

- **WHEN** 使用者左鍵選取一個帶 `data.application` 的 `service` 或 `pvc`,且 endpoint 可解析
- **THEN** 系統以該節點**自身 kind/name** + application 建立查詢 input,預取 `config_changes`(驅動 Application 區塊的 Deployment Changes 連結)
- **AND** Containers 區塊不渲染(無 containers;`code_changes` 的回傳結果不被使用)

#### Scenario: 選取 application 群組預取其 config_changes

- **WHEN** 使用者左鍵選取一個 ArgoCD `application` 群組節點(kind-less,帶 `application`),且 endpoint 可解析
- **THEN** 系統以 `{ application: <app>, kind: 'application', name: <app>, time }` 建立查詢 input,預取 `config_changes`;Application 區塊渲染該 application 的 Deployment Changes 連結(header badge 顯示合成 `application` kind)
- **AND** Containers 區塊不渲染(application 群組無 containers)

#### Scenario: 無 application 的非 workload 節點左鍵不觸發查詢

- **WHEN** 使用者以左鍵 `tap` 選取一個非 workload、**無 `data.application`** 的節點(如 `node` / `external`,或無 application 的 `service` / `pvc`;無 `queryTarget`)
- **THEN** 面板仍渲染(header-only 或含 Alerts),節點屬性由右上角釘選 tooltip 承載,但 MUST NOT 建立查詢 input、MUST NOT 發出 application-detail / image-detail 查詢

#### Scenario: 換節點 / 關閉 panel 清除狀態與快取並中止 in-flight

- **WHEN** 面板開啟且預取 in-flight,使用者切換到另一節點、或關閉 panel(unmount / 清除選取)
- **THEN** 系統中止 in-flight 查詢(`AbortController`)、清除兩端點快取與每目標狀態,且中止後 MUST NOT 對舊節點 setState

#### Scenario: 查詢經 Grafana runtime 而非直連外部

- **WHEN** 對 `src/**` 進行 source code 掃描
- **THEN** 查詢僅經 `getBackendSrv()`;`src/**` 內無任何直接 `fetch` / `axios` / `XMLHttpRequest` 連線外部 backend 的程式碼

### Requirement: StorageClass compound 容器渲染與圖例(**完全比照 K8s node 容器**)

StorageClass 群組(`data.type === 'storageclass'`)MUST 為一個**真的 `NodeKind`**(`'storageclass'` ∈ `NodeKind`、∈ `ICON_SVG_BY_KIND`、`categoryByKind` → `Storage`),同時由 normalize 標 `isStorageClass: true`。它 MUST 與 K8s `node` 容器**完全對等**地渲染與處理:

- stylesheet MUST **不**含任何 storageclass 專屬選擇器:它走 base `node`(由 `kind` 解析 icon)+ `node:parent`。故**展開**(為 `:parent`)時是不帶 icon、取**父 cluster** accent 的純分組 backplate;**收合 / leaf**(非 `:parent`)時顯示其 `storageclass` kind icon(三層磁碟堆疊 glyph)——與收合的 K8s `node` 容器一致。它 MUST 保持可互動、可收合(無 `events:'no'`)。MUST NOT 攜帶 status / alerts。
- `isStorageClass` 旗標 MUST 僅驅動兩項非樣式行為:(a)獨立「Storage classes」swatch legend 區段;(b)tooltip context 合成(provisioner / parameters)。storageclass 為 **detail-eligible**(`isDashboardEligible` 僅排除裝飾性 `cluster` / `namespace` / `application`,**不**排除 storageclass):左鍵選取時其 `kind` / `provisioner` / `parameters` 由**右上角釘選 tooltip** 呈現(見「Hover Tooltip」pinned 模式),底部 detail 面板因無 change-report / alerts 區塊而 `return null`(除非有 ready dashboard URL,見「Node Detail 面板」)。
- Panel MUST 提供**獨立**的「Storage classes」swatch legend 區段(`StorageClassLegend`,經純函式 `deriveStorageClassContainers` 導出、以父 cluster 色上色、name 去重、childless 者視為 leaf 不列入),含「全部摺疊 / 展開」切換。此區段 MUST 為 **mode-independent**(`node` / `controller` 兩模式皆顯示),且無 storageclass 容器時 MUST `return null`。
- tooltip MUST 顯示 context(**未選取時 hover 浮動、選取時釘選於右上角,內容相同**):`kind: storageclass`(因已有 kind 而自然顯示)+ 其 cluster(`useHoverElement` 自父 cluster 容器讀)+ `provisioner` + 其 backing-storage `parameters`(typed string map;每個 entry 一列、key 排序、值換行——值如 selector 可能長)。

#### Scenario: 展開的 storageclass 群組為無 icon 的 cluster 上色容器

- **WHEN** 圖中有一個展開的 `isStorageClass` 容器,巢狀於某 cluster 容器、其下有 PVC 子節點
- **THEN** 該容器以 `round-rectangle` 渲染、`background-image` 為 `none`、底色取父 cluster accent;其下 PVC 仍各自攜帶 pvc icon

#### Scenario: 收合 / leaf 的 storageclass 群組顯示 storage glyph

- **WHEN** 該 storageclass 節點為收合或 childless(非 `:parent`)
- **THEN** 其 `background-image` 為 theme 上色的 `storageclass` kind icon(`ICON_SVG_BY_KIND.storageclass`,三層磁碟堆疊),比照收合的 K8s `node` 容器

#### Scenario: 無 storageclass 時不渲染該區段

- **WHEN** 資料中無任何 storageclass 容器
- **THEN** 「Storage classes」legend 區段 `return null`,不渲染空標題

#### Scenario: storageclass hover 顯示 provisioner 與 parameters(D6 leaf,未選取)

- **WHEN** 無選取時,滑鼠移至一個 storageclass leaf(巢狀於某 cluster)
- **THEN** tooltip 浮動顯示其名稱(title)、`kind: storageclass`、`cluster: <name>`、`provisioner: <name>`,以及每個 backing-storage 參數一列(如 `pool: kube`、`selector: tier=fast`;key 排序、值換行)
- **AND** MUST NOT 顯示舊的合成 `PVCs (N)` 清單(storageclass 已是 leaf,PVC 以 `pvc-to-storageclass` 邊相連而非巢狀)
- **AND** 左鍵選取該 storageclass 時,同一內容改釘選於右上角(見「Hover Tooltip」pinned 模式)

#### Scenario: storageclass 容器預設收合(mode-independent)

- **WHEN** Panel 首次載入且圖中含 storageclass 容器
- **THEN** 所有 storageclass 容器 MUST 預設**收合**(`node` / `controller` 兩模式皆然),其 id 於首次載入即併入 `collapsedIds` 推給 GraphCanvas;ref 守衛使後續 data refresh **不**重收(使用者展開的 storageclass 保持展開)
- **AND** 因預設已收合,「Storage classes」collapse 切換鈕(`storageclass-collapse-toggle`)首次點擊作為「全部展開」動作
