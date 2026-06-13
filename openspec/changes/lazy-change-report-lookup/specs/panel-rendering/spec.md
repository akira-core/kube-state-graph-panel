## MODIFIED Requirements

### Requirement: Node Detail Application 與 Containers 區塊

Panel SHALL 在 node-detail 面板中,**僅對 pod 與 workload controller**(`kind ∈ { pod, deployment, statefulset, daemonset, job, cronjob }`)節點,提供 **Application 區塊**與 **Containers 區塊**,沿用既有面板位置與版型(與 Alerts 區塊同一 sticky section 樣式)。其餘 kind(`node` / `pvc` / `service` / `external` / `switch` / `cluster` / `storageclass`)MUST NOT 顯示這兩個區塊。面板依觸發方式分流為兩個 **view**:**右鍵**開啟 `detail` view,只渲染 Application / Containers 兩區塊、MUST NOT 渲染 Alerts 表格(即使節點帶 `data.alerts`);**左鍵**開啟 `alerts` view,只渲染 Alerts 表格(含 Count / Last occurred 欄與 `timeRecords[]` 行為,見「Node Detail 面板」需求)、MUST NOT 渲染這兩個區塊。兩 view 共用 header 與面板框架。

**資料來源**:application name 來源為節點的 `data.application`(backend 於 pod 節點輸出;controller 由 `normalizeGraph` 自子 pod 聚合);containers 來源為節點的 `data.containers`(`Array<{ name, image }>`;pod 為 backend 原樣透傳、controller 為子 pod 聚合去重——見 graph-data-integration 規格)。節點無 `data.application` 時 Application 區塊 MUST NOT 渲染;無 `data.containers`(或為空陣列)時 Containers 區塊 MUST NOT 渲染;兩者互不影響。

**觸發**:在 pod/controller 節點上**右鍵**(cytoscape `cxttap`)MUST(a)選取該節點(沿用既有單選受控狀態,與藍色高亮 / 面板開關同步,面板隨之開啟),(b)**建立**該節點兩個 URL 查詢(application-detail 與 image-detail)所需的 input(供之後按鈕點擊時使用),但 **MUST NOT 於右鍵當下發出任何查詢**。查詢僅於使用者**點擊對應 Change Report 按鈕**時才發出(lazy,見「呈現」)。右鍵 MUST 抑制瀏覽器原生 context menu(cytoscape `cxttap` 不會自動 `preventDefault` DOM `contextmenu`)。既有左鍵 `tap` 選取行為不變(左鍵 MUST NOT 觸發查詢、亦不建立查詢 input)。

**查詢契約**:兩個查詢 MUST 共用同一組 input——ArgoCD application name、pod-controller kind、pod-controller name、time(右鍵建立 input 當下時間,Unix 秒)。pod 節點的 controller kind/name 取自其 owner(`data.owner`);controller 節點取自身 kind/name;無 owner 的 standalone pod 以自身 kind(`pod`)與 name 帶入。回傳:

- **application-detail 查詢**(`GET <endpoint>/api/v1/config_changes`):回 `{ "url": string }`——**單一 URL**(該 ArgoCD application 的外部詳情頁)。
- **image-detail 查詢**(`GET <endpoint>/api/v1/code_changes`):回 `{ [containerName]: { "url": string } }`——**map(container name → URL)**,UI 端以攤平後的 map 查值;input MUST NOT 含 image 參數,一次呼叫即涵蓋該節點所有 containers。

**呼叫快取**:panel 開啟期間,`code_changes` 與 `config_changes` 各 MUST **最多呼叫一次**——`code_changes` 回的整包 map 由所有 container 列**共用**(第一次點擊發出、其餘 container 點擊重用該次結果,MUST NOT 重發);`config_changes` 同(單一 application 按鈕,重複點擊重用快取)。僅快取**成功**回應:失敗(非 200 / 回應格式錯誤)MUST NOT 入快取(該按鈕仍可重試、重試會重新發出查詢);成功 map 中查無某 container = 該列確定性「Not Found」(用快取、不重發)。**換節點 / 關閉 panel(unmount / 清除選取)MUST 清除快取**(連同中止 in-flight),下次開啟重新呼叫。

**查詢傳輸**:查詢 MUST 透過 Grafana runtime(`@grafana/runtime` `getBackendSrv()`)發往**同一個 graph API backend**;MUST NOT 自 `src/**` 直接以 `fetch` / `axios` / `XMLHttpRequest` 連線外部 backend(與 graph-data-integration「Datasource 整合策略」之「Panel 不直接 fetch 外部 URL」一致)。查詢端點(base path)MUST 依下列順序解析:(1)panel option 非空時以其為準(**覆寫**);(2)否則 SHALL 自面板查詢請求(`data.request.targets`)**自動推導**——依序檢視非隱藏(`hide` ≠ true)且帶 datasource ref 的 targets,經 Grafana runtime 的 datasource instance settings 解析其 proxied base path(`access: proxy` 的 datasource 其 instance settings `url` 即 `/api/datasources/proxy/uid/<uid>`),取**第一個解析出非空 base path** 者(隱藏 target 或解析不出 url 的 ref——如 expression——跳過續查,不視為終點);(3)兩者皆無(option 空且無任一 target 可解析出非空 base path)時,兩區塊照資料渲染但 Change Report 按鈕 MUST 停用,且 MUST NOT 發出任何查詢。點擊觸發的查詢 MUST 可中止(unmount / 換節點),MUST NOT 在 unmount 後 setState。

**呈現**(每顆 Change Report 按鈕——Application 一顆、Containers 每列一顆——各自獨立狀態):

- **預設(idle)**:右鍵開啟 detail view 後,在 endpoint 可解析(`enabled`)下,每列 Change Report 欄 MUST 顯示一顆**可點的按鈕**,且 MUST NOT 發出任何查詢、MUST NOT 顯示「Not Found」。endpoint 未設且推導不出(`enabled` 為 false)時按鈕停用。
- **點擊查詢進行中(loading)**:點擊某列按鈕後、查詢回傳前,該列 MUST 將按鈕停用並於其**左側**顯示進行中指示(spinner + 提示文字),且只影響該列(其餘列與面板其餘區塊不受影響)。
- **Application 區塊(點擊成功,HTTP 200 + 有效 URL)**:MUST 以 `window.open(url, '_blank', 'noopener,noreferrer')` 於**新分頁**開啟 application-detail 回傳的 URL,按鈕隨後回到可點(idle,可再次開啟)。
- **Containers 區塊(點擊成功)**:點擊某列按鈕查 image-detail,於回傳 map 以該 container name 取 URL:取得有效 URL → 以 `window.open(url, '_blank', 'noopener,noreferrer')` 開新分頁、按鈕回 idle;map 中**查無**該 name(或該 name 無有效 URL)→ 該列顯示「Not Found」、按鈕保留可重試;name/image 仍照常顯示。
- **失敗(非 200 / 回應格式錯誤)**:對應列 Change Report 欄 MUST 於**按鈕左側**以錯誤色顯示失敗訊息(預設「Not Found」;過長截斷、完整值入 `title`),**按鈕保留且可再點重試**(非停用的死按鈕),且 MUST NOT 影響面板其餘區塊(header / 另一區塊)與其他列。
- **對齊**:Change Report 按鈕 MUST 釘於該欄**右緣**,loading/error 提示一律顯示於按鈕**左側**——使按鈕位置**不因提示出現而左右漂移**,Application 與 Containers 兩區塊各列的按鈕在 idle / loading / error 任一(含混合)狀態下皆**上下對齊**。
- **彈窗被擋**:點擊成功但 `window.open` 回 `null`(被瀏覽器攔截)時,該列 MUST 顯示「Pop-up blocked」錯誤提示,按鈕保留可重試。
- **表格版型**:兩區塊 MUST 比照 Alerts 表格以**帶 column header 的表格版型**渲染(同一 `@grafana/ui` `InteractiveTable` 元件)——Application 區塊欄位為 **Name / Change Report**,Containers 區塊欄位為 **Name / Image / Change Report**;每欄 MUST 有 header、各列內容 MUST 沿欄整齊對齊,MUST NOT 以無 header 的自由 flex 列呈現。Change Report 欄 MUST 不隨內容成長(`disableGrow`),由 Application 的 Name 欄 / Containers 的 Image 欄填滿剩餘寬度,使**兩區塊的 Change Report 欄同樣靠右、上下對齊**。查詢狀態顯示於 Change Report 欄 cell 內,按鈕**釘於欄右緣**、提示一律於按鈕**左側**——idle:**可點按鈕**;loading:停用按鈕 + 左側 spinner 提示;成功:開新分頁(欄內按鈕回可點,**不**於面板 inline 顯示 URL);失敗 / pop-up 被擋:**按鈕保留** + 左側錯誤色訊息;endpoint 無法解析:按鈕停用。按鈕右緣對齊使兩區塊各列按鈕跨狀態上下對齊;header 與列的渲染不受查詢狀態影響。
- 兩區塊 MUST 以 `@grafana/ui` + emotion `useStyles2` 樣式實作,元件(ApplicationTable / ContainerTable)共置於 `node-detail` feature 並 MUST 經其 `index.ts` barrel 匯出(不跨 feature 越界 import 對方內部檔案)。Application 區塊現行為單列,介面 MUST 預留可成長為多列。

#### Scenario: 右鍵 pod/controller 選取並建立查詢 input 但不發查詢

- **WHEN** 使用者於一個帶 `data.application` 的 pod(或 controller)節點按右鍵
- **THEN** 該節點被選取(藍色高亮與面板開啟同步),系統建立兩查詢所需 input(application name, controller kind, controller name, time)
- **AND** MUST NOT 發出任何 application-detail / image-detail 查詢
- **AND** 瀏覽器原生右鍵選單不出現

#### Scenario: pod 的 controller kind/name 取自 owner

- **WHEN** 右鍵的節點為 pod 且其 `data.owner` 為 `{ kind: "deployment", name: "gateway" }`
- **THEN** 該節點按鈕點擊時查詢的 input 之 controller kind/name 為 `deployment` / `gateway`

#### Scenario: controller 節點以自身 kind/name 查詢

- **WHEN** 右鍵的節點為 controller(如 `statefulset` `mongo`)
- **THEN** 該節點按鈕點擊時查詢的 input 之 controller kind/name 為 `statefulset` / `mongo`

#### Scenario: 區塊僅對 pod/controller 顯示

- **WHEN** 使用者**右鍵**選取的節點 `kind` 為 `pod` 或 controller(`deployment` / `statefulset` / `daemonset` / `job` / `cronjob`)且帶對應資料(`data.application` / 非空 `data.containers`)
- **THEN** node-detail 面板渲染 Application 區塊與 Containers 區塊

#### Scenario: 非 pod/controller kind 不顯示區塊

- **WHEN** 選取的節點 `kind` 為 `node` / `pvc` / `service` / `external` / `switch` / `cluster` / `storageclass`
- **THEN** Application 與 Containers 區塊 MUST NOT 渲染(即使該節點偶帶 `application` / `containers` 資料)

#### Scenario: 無 application 時僅隱藏 Application 區塊

- **WHEN** **右鍵**選取的 pod/controller 節點無 `data.application`,但帶非空 `data.containers`
- **THEN** Application 區塊 MUST NOT 渲染,Containers 區塊照常渲染

#### Scenario: 無 containers 時僅隱藏 Containers 區塊

- **WHEN** **右鍵**選取的 pod/controller 節點帶 `data.application`,但無 `data.containers`(或為空陣列)
- **THEN** Containers 區塊 MUST NOT 渲染,Application 區塊照常渲染

#### Scenario: 預設不發查詢、只顯示可點按鈕(無 Not Found)

- **WHEN** 右鍵開啟 detail view 且 endpoint 可解析,使用者尚未點擊任何 Change Report 按鈕
- **THEN** Application 與 Containers 兩區塊每列 Change Report 欄顯示**可點的按鈕**,且未發出任何查詢、未顯示「Not Found」或任何錯誤訊息

#### Scenario: 點擊按鈕才發查詢並於該列顯示 loading

- **WHEN** 使用者點擊某列 Change Report 按鈕
- **THEN** 系統經 `getBackendSrv()` 發出該列對應查詢,該列按鈕停用並於右側顯示進行中指示(spinner + 提示文字)
- **AND** 其餘列與面板其餘區塊不受影響

#### Scenario: Application 點擊成功以新分頁開啟 URL

- **WHEN** 使用者點擊 Application 區塊按鈕且 application-detail 查詢成功回傳 URL `u`
- **THEN** 系統以 `window.open(u, '_blank', 'noopener,noreferrer')` 於新分頁開啟 `u`,按鈕回到可點狀態

#### Scenario: Containers 點擊成功以新分頁開啟對應 URL

- **WHEN** 節點 `data.containers` 含 `{ name: "app", image: "repo/app:1.2" }`,使用者點擊該列按鈕且 image-detail 回傳 `{ "app": { "url": "https://x/app" } }`
- **THEN** 系統以 `window.open("https://x/app", '_blank', 'noopener,noreferrer')` 於新分頁開啟,按鈕回到可點狀態

#### Scenario: Application 區塊以帶 header 表格渲染

- **WHEN** 右鍵開啟的 detail view 渲染 Application 區塊(節點帶 `data.application`)
- **THEN** 區塊以 `InteractiveTable` 呈現 column headers **Name** 與 **Change Report**,application name 落於 Name 欄、Change Report 按鈕落於 Change Report 欄

#### Scenario: Containers 區塊以帶 header 表格渲染且沿欄對齊

- **WHEN** 右鍵開啟的 detail view 渲染 Containers 區塊(節點帶兩個以上、name 長度不一的 containers)
- **THEN** 區塊以 `InteractiveTable` 呈現 column headers **Name** / **Image** / **Change Report**,每列的 container name / image / 按鈕分別落於對應欄、沿欄對齊(欄界不隨 name 長度漂移)

#### Scenario: 開啟期間 code_changes 只呼叫一次、各 container 共用結果

- **WHEN** 使用者於同一節點先後點擊多個 container 的 Change Report 按鈕
- **THEN** 系統僅對 `code_changes` 發出**一次**呼叫,其餘 container 以該次回傳的 map 取值(MUST NOT 重發)
- **AND** 關閉 panel / 換節點後快取 MUST 清除,下次點擊重新呼叫

#### Scenario: 失敗的查詢不入快取(重試會重發)

- **WHEN** 某次 `code_changes`(或 `config_changes`)失敗(非 200 / 格式錯誤),使用者再次點擊該按鈕
- **THEN** 系統重新發出該查詢(失敗結果未被快取)

#### Scenario: Change Report 按鈕跨區塊與跨狀態上下對齊

- **WHEN** detail view 同時顯示 Application 與 Containers 區塊,且部分按鈕為 idle、部分已點擊呈現 loading / Not Found(混合狀態)
- **THEN** 兩區塊每列的 Change Report 按鈕皆釘於欄右緣、彼此上下對齊(按鈕位置不因 loading/error 提示出現而左右漂移;提示顯示於按鈕左側)

#### Scenario: map 缺 container key 時點擊顯示 Not Found 且按鈕可重試

- **WHEN** 某 container name 不存在於 image-detail 查詢回傳的 map,使用者點擊該列按鈕
- **THEN** 該列於按鈕旁顯示「Not Found」,按鈕保留可重試,name 與 image 仍照常顯示

#### Scenario: 查詢失敗顯示 Not Found、按鈕可重試且不波及其餘

- **WHEN** 某列點擊後查詢失敗(非 200 / 網路錯誤 / 回應格式錯誤)
- **THEN** 該列 Change Report 欄於**按鈕旁**以錯誤色顯示失敗訊息(預設「Not Found」;過長截斷、完整值入 `title`),**按鈕保留可再點重試**
- **AND** 面板 header 與另一區塊 / 其他列仍正常顯示

#### Scenario: 成功但彈窗被擋時退化為提示

- **WHEN** 點擊查詢成功回傳有效 URL,但 `window.open` 回 `null`(被瀏覽器攔截)
- **THEN** 該列顯示「Pop-up blocked」錯誤提示,按鈕保留可重試

#### Scenario: endpoint 自 panel datasource 自動推導

- **WHEN** panel option 未設定查詢 endpoint,且面板查詢 target 帶 datasource ref(如 uid `ksg-default`、`access: proxy`),使用者點擊 Change Report 按鈕
- **THEN** 該查詢發往該 datasource 的 proxied base path 下的固定子路徑(`/api/datasources/proxy/uid/ksg-default/api/v1/config_changes` 或 `/api/datasources/proxy/uid/ksg-default/api/v1/code_changes`)

#### Scenario: panel option 覆寫自動推導

- **WHEN** panel option 設定 endpoint 為 `/foo`,且面板查詢 target 亦帶 datasource ref,使用者點擊 Change Report 按鈕
- **THEN** 查詢發往 `/foo/api/v1/config_changes` 或 `/foo/api/v1/code_changes`(option 優先,不使用推導值)

#### Scenario: 未設定 endpoint 且無法推導時停用

- **WHEN** panel option 未設定查詢 endpoint,且自查詢 targets 推導不出 datasource proxy path(無 targets / 無 datasource ref / 所有 ref 查無 instance settings 或其 `url` 為空)
- **THEN** 右鍵開啟的 detail view 中兩區塊照資料渲染但 Change Report 按鈕停用,且點擊與否皆 MUST NOT 發出任何查詢

#### Scenario: 左鍵選取不觸發查詢

- **WHEN** 使用者以左鍵 `tap` 選取 pod/controller 節點
- **THEN** 面板照常開啟(既有 alerts view 行為),但 MUST NOT 建立查詢 input、MUST NOT 發出 application-detail / image-detail 查詢

#### Scenario: 查詢經 Grafana runtime 而非直連外部

- **WHEN** 對 `src/**` 進行 source code 掃描
- **THEN** 查詢僅經 `getBackendSrv()`(Grafana runtime);`src/**` 內無任何直接 `fetch` / `axios` / `XMLHttpRequest` 連線外部 backend 的程式碼
