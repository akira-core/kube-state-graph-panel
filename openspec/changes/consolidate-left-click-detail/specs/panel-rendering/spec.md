## MODIFIED Requirements

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
