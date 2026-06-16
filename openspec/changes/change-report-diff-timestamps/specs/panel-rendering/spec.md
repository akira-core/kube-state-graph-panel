## MODIFIED Requirements

### Requirement: Node Detail Application 與 Containers 區塊

Panel SHALL 在 node-detail 面板中,**僅對 pod 與 workload controller**(`kind ∈ { pod, deployment, statefulset, daemonset, job, cronjob }`)節點,提供 **Application 區塊**與 **Containers 區塊**,沿用既有面板位置與版型(與 Alerts 區塊同一 sticky section 樣式)。其餘 kind(`node` / `pvc` / `service` / `external` / `switch` / `cluster` / `storageclass`)MUST NOT 顯示這兩個區塊。面板依觸發方式分流為兩個 **view**:**右鍵**開啟 `detail` view,只渲染 Application / Containers 兩區塊、MUST NOT 渲染 Alerts 表格(即使節點帶 `data.alerts`);**左鍵**開啟 `alerts` view,只渲染 Alerts 表格(含 Count / Last occurred 欄與 `timeRecords[]` 行為,見「Node Detail 面板」需求)、MUST NOT 渲染這兩個區塊。兩 view 共用 header 與面板框架。

**資料來源**:application name 來源為節點的 `data.application`(backend 於 pod 節點輸出;controller 由 `normalizeGraph` 自子 pod 聚合);containers 來源為節點的 `data.containers`(`Array<{ name, image }>`;pod 為 backend 原樣透傳、controller 為子 pod 聚合去重——見 graph-data-integration 規格)。節點無 `data.application` 時 Application 區塊 MUST NOT 渲染;無 `data.containers`(或為空陣列)時 Containers 區塊 MUST NOT 渲染;兩者互不影響。

**觸發**:在 pod/controller 節點上**右鍵**(cytoscape `cxttap`)MUST(a)選取該節點(沿用既有單選受控狀態,與藍色高亮 / 面板開關同步,面板隨之開啟),(b)**建立**該節點兩個 URL 查詢(application-detail 與 image-detail)所需的 input(application name, controller kind, controller name, time),並以此 input **立即併發預取(eager prefetch)** 兩查詢——`config_changes`(application)與 `code_changes`(containers)MUST 在 detail view 一開啟(`enabled` 為 true,即 input 與 endpoint 皆可解析)時、**無需任何點擊**即同時發出。右鍵 MUST 抑制瀏覽器原生 context menu(cytoscape `cxttap` 不會自動 `preventDefault` DOM `contextmenu`)。既有左鍵 `tap` 選取行為不變(左鍵 MUST NOT 建立查詢 input、MUST NOT 發出任何查詢)。

**查詢契約**:兩個查詢 MUST 共用同一組 input——ArgoCD application name、pod-controller kind、pod-controller name、time(右鍵建立 input 當下時間,Unix 秒)。pod 節點的 controller kind/name 取自其 owner(`data.owner`);controller 節點取自身 kind/name;無 owner 的 standalone pod 以自身 kind(`pod`)與 name 帶入。回傳:

- **application-detail 查詢**(`GET <base>/config_changes`,`base` 見下「查詢傳輸」):回 `{ "url": string, "current_time": string, "previous_time": string }`——`url` 為**單一 URL**(該 ArgoCD application 的外部詳情頁);`current_time` / `previous_time` 為該 deployment diff 的兩個時間戳(current → prev)。
- **image-detail 查詢**(`GET <base>/code_changes`):回 `{ [containerName]: { "url": string, "current_time": string, "previous_time": string } }`——**map(container name → entry)**,每個 entry 含該 container 的 `url`(code diff 外部詳情頁)與 `current_time` / `previous_time`(該 code diff 的兩個時間戳,current → prev);UI 端以攤平後的 map 查值;input MUST NOT 含 image 參數,一次呼叫即涵蓋該節點所有 containers。
- **時間戳契約**:`current_time` / `previous_time` MUST 為 **RFC 3339 / ISO 8601(UTC)** 字串(如 `2026-06-16T10:30:00Z`)。兩時間戳為 **best-effort**:缺漏 / 非字串 / 解析失敗時,對應時間欄 MUST 顯示 muted(`theme.colors.text.secondary`)「—」,並 MUST NOT 影響同列的 `url` anchor、其餘欄、或其餘列(沿用既有 anti-corruption 解析:格式不符即丟棄該欄;`url` 仍是「該 entry 是否可用」的唯一判準,兩時間戳缺失不影響 url anchor 的渲染與狀態)。

**呼叫快取**:panel 開啟期間,`code_changes` 與 `config_changes` 各 MUST **最多呼叫一次**——eager 預取於 detail view 開啟時各發一次,`code_changes` 回的整包 map 由所有 container 列**共用**。僅快取**成功**回應:失敗(非 200 / 回應格式錯誤)MUST NOT 入快取(其 slot 清除,以便 remount 重取);成功 map 中查無某 container = 該列確定性「No change report」(用快取、不重發)。**換節點 / 換 endpoint / 關閉 panel(unmount / 清除選取)MUST 清除快取**(連同中止 in-flight),下次開啟重新呼叫。

**查詢傳輸**:查詢 MUST 透過 Grafana runtime(`@grafana/runtime` `getBackendSrv()`)發往**同一個 graph API backend**;MUST NOT 自 `src/**` 直接以 `fetch` / `axios` / `XMLHttpRequest` 連線外部 backend(與 graph-data-integration「Datasource 整合策略」之「Panel 不直接 fetch 外部 URL」一致)。查詢端點(base path)MUST 依下列順序解析:(1)panel option 非空時以其為準(**覆寫**);(2)否則 SHALL 自面板查詢請求(`data.request.targets`)**自動推導**,使 detail 端點成為 graph query 的 **sibling**——依序檢視非隱藏(`hide` ≠ true)且帶 datasource ref 的 targets,取**第一個**經 Grafana runtime datasource instance settings 解析出非空 proxied base path 者(`access: proxy` 的 datasource 其 instance settings `url` 即 `/api/datasources/proxy/uid/<uid>`,datasource 真實 base url 對 panel 不可見;隱藏 target 或解析不出 url 的 ref——如 expression——跳過續查,不視為終點),再於其後串接該 target graph query 路徑的**目錄**(target `url` 去 query string 後再去最後一段;單段或無 `url` 時為空、base 即裸 proxy mount)——如 graph query 為 `…/api/v1/graph/service_graph`,則 base 為 `<proxy mount>/api/v1/graph`,append `/config_changes`、`/code_changes` 後與 graph query 同目錄;(3)兩者皆無(option 空且無任一 target 可解析出非空 base path)時,兩區塊照資料渲染但連結欄 MUST 顯示「No change report」提示(`enabled` 為 false → 不發查詢、無 spinner、無 anchor),且 MUST NOT 發出任何查詢。預取查詢 MUST 可中止(unmount / 換節點 / 換 endpoint),MUST NOT 在 unmount 後 setState。

**呈現**(每個連結欄目標——Application 一個、Containers 每列一個——各自獨立狀態;eager 預取下每個目標在三態之一:**loading / ready / unavailable**):

- **loading(預取進行中)**:detail view 一開啟即併發查詢;回傳前,每個尚未解析的目標 MUST 於該列連結欄顯示進行中指示(`@grafana/ui` `Spinner` + 提示文字),該位置 MUST NOT 顯示按鈕 / anchor。每列獨立(Application 與各 container 互不影響)。
- **ready(成功,有效 URL)**:
  - **Application 區塊**:`config_changes` 回 HTTP 200 + 有效 `url` 時,連結欄(header「Deployment Changes」)MUST 渲染一個**真實 anchor**——`<a href={url} target="_blank" rel="noopener noreferrer">`(預解析 URL,故點擊為一般使用者手勢導頁,MUST NOT 以 `window.open` 程式導頁)。
  - **Containers 區塊**:某 container 列 MUST 渲染 anchor **若且唯若** `code_changes` 成功**且**該 container name 於回傳 map 有有效 URL;anchor 同為 `<a href={url} target="_blank" rel="noopener noreferrer">`(連結欄 header「Code Changes」)。
- **unavailable(失敗 / 查無 / 無 URL)**:
  - **Application**:`config_changes` 失敗(非 200 / 回應格式錯誤 / 無有效 url)時,連結欄 MUST 以次要(muted)文字顯示「No change report」提示(MUST NOT 渲染 anchor / 按鈕;過長截斷、完整失敗訊息入 `title` 以保留錯誤可見性)。
  - **Containers**:`code_changes` 失敗,或成功但該 container name 不在 map(或該 name 無有效 URL)時,該列 MUST 顯示「No change report」提示(同上;name/image 仍照常顯示)。
- **失敗隔離**:任一目標 unavailable MUST NOT 影響 header、另一區塊、或同區塊其他列;header 與表格列照常渲染。
- **時間欄呈現(Current / Previous)**:Application 與 Containers 兩區塊各新增 **Current** 與 **Previous** 兩欄,呈現該 change diff 的 current → prev 時間戳。每格 MUST 以 `@grafana/data` `dateTimeFormat` 依**面板 `timeZone`** 將 RFC 3339 原字串格式化為**在地化絕對時間**(如 `2026-06-16 10:30:00`),並把**完整 ISO 原字串**入該 cell 的 `title`;`timeZone` 缺省時採 Grafana 預設時區(沿用 Alerts 表格時間欄之 `dateTimeFormat` 慣例與傳遞路徑:`KsgPanel` → `NodeDetailPanel` → 表格)。無值(缺漏 / 非字串)或 `dateTimeFormat` 判定為非法日期時,該格 MUST 顯示 muted(`theme.colors.text.secondary`)「—」且 MUST NOT 設 `title`,MUST NOT 顯示 `Invalid date`。時間欄 MUST NOT 影響同列連結欄狀態與 anchor;反之連結欄失敗亦 MUST NOT 影響時間欄(同列三欄——Current / Previous / 連結欄——各自獨立 best-effort 降級)。
- **對齊**:連結欄內容(spinner / anchor / 提示)MUST 釘於該欄**右緣**(`disableGrow` 欄 + `justifyContent: flex-end`),使 Application 與 Containers 兩區塊各列的連結欄在 loading / ready / unavailable 任一(含混合)狀態下皆**上下對齊、不左右漂移**。
- **表格版型**:兩區塊 MUST 比照 Alerts 表格以**帶 column header 的表格版型**渲染(同一 `@grafana/ui` `InteractiveTable` 元件)——Application 區塊欄位依序為 **Name / Current / Previous / Deployment Changes**,Containers 區塊欄位依序為 **Name / Image / Current / Previous / Code Changes**;每欄 MUST 有 header、各列內容 MUST 沿欄整齊對齊,MUST NOT 以無 header 的自由 flex 列呈現。連結欄(Application 為「Deployment Changes」、Containers 為「Code Changes」)MUST 維持為最右欄、MUST 不隨內容成長(`disableGrow`);新增的 `Current` / `Previous` 兩欄亦 MUST `disableGrow`(時間字串寬度固定、不撐表);由 Application 的 Name 欄 / Containers 的 Image 欄填滿剩餘寬度,使**兩區塊的連結欄同樣靠右、上下對齊**。連結欄維持為最右(last-child),既有右對齊規則對連結欄 header 持續成立。header 與列的渲染不受查詢狀態影響。
- 兩區塊 MUST 以 `@grafana/ui` + emotion `useStyles2` 樣式實作,元件(ApplicationTable / ContainerTable)共置於 `node-detail` feature 並 MUST 經其 `index.ts` barrel 匯出(不跨 feature 越界 import 對方內部檔案)。Application 區塊現行為單列,介面 MUST 預留可成長為多列。

#### Scenario: 右鍵 pod/controller 選取並立即併發預取兩查詢

- **WHEN** 使用者於一個帶 `data.application` 的 pod(或 controller)節點按右鍵,且 endpoint 可解析(`enabled`)
- **THEN** 該節點被選取(藍色高亮與面板開啟同步),系統建立兩查詢所需 input(application name, controller kind, controller name, time)
- **AND** 系統 MUST **無需任何點擊**,即經 `getBackendSrv()` **同時併發**發出 application-detail(`config_changes`)與 image-detail(`code_changes`)兩查詢
- **AND** 瀏覽器原生右鍵選單不出現

#### Scenario: pod 的 controller kind/name 取自 owner

- **WHEN** 右鍵的節點為 pod 且其 `data.owner` 為 `{ kind: "deployment", name: "gateway" }`
- **THEN** 該節點預取查詢的 input 之 controller kind/name 為 `deployment` / `gateway`

#### Scenario: controller 節點以自身 kind/name 查詢

- **WHEN** 右鍵的節點為 controller(如 `statefulset` `mongo`)
- **THEN** 該節點預取查詢的 input 之 controller kind/name 為 `statefulset` / `mongo`

#### Scenario: 區塊僅對 pod/controller 顯示

- **WHEN** 使用者**右鍵**選取的節點 `kind` 為 `pod` 或 controller(`deployment` / `statefulset` / `daemonset` / `job` / `cronjob`)且帶對應資料(`data.application` / 非空 `data.containers`)
- **THEN** node-detail 面板渲染 Application 區塊與 Containers 區塊

#### Scenario: 非 pod/controller kind 不顯示區塊

- **WHEN** 選取的節點 `kind` 為 `node` / `pvc` / `service` / `external` / `switch` / `cluster` / `storageclass`
- **THEN** Application 與 Containers 區塊 MUST NOT 渲染(即使該節點偶帶 `application` / `containers` 資料)

#### Scenario: 無 application 時僅隱藏 Application 區塊

- **WHEN** **右鍵**選取的 pod/controller 節點無 `data.application`,但帶非空 `data.containers`
- **THEN** Application 區塊 MUST NOT 渲染,Containers 區塊照常渲染並預取 `code_changes`

#### Scenario: 無 containers 時僅隱藏 Containers 區塊

- **WHEN** **右鍵**選取的 pod/controller 節點帶 `data.application`,但無 `data.containers`(或為空陣列)
- **THEN** Containers 區塊 MUST NOT 渲染,Application 區塊照常渲染並預取 `config_changes`

#### Scenario: 預取進行中顯示 loading spinner

- **WHEN** 右鍵開啟 detail view 且 endpoint 可解析,預取查詢尚未回傳
- **THEN** Application 與 Containers 兩區塊每列連結欄顯示進行中指示(`Spinner` + 提示文字),該位置不顯示 anchor / 按鈕

#### Scenario: Application 預取成功渲染 anchor

- **WHEN** application-detail(`config_changes`)查詢成功回傳有效 URL `u`
- **THEN** Application 區塊連結欄(header「Deployment Changes」)渲染 `<a href="u" target="_blank" rel="noopener noreferrer">`,點擊以一般使用者手勢於新分頁開啟 `u`(MUST NOT `window.open`)

#### Scenario: Container 預取成功為有 URL 的列渲染 anchor

- **WHEN** 節點 `data.containers` 含 `{ name: "app", image: "repo/app:1.2" }`,且 image-detail(`code_changes`)成功回傳 `{ "app": { "url": "https://x/app" } }`
- **THEN** `app` 列連結欄(header「Code Changes」)渲染 `<a href="https://x/app" target="_blank" rel="noopener noreferrer">`

#### Scenario: Application 區塊以帶 header 表格渲染

- **WHEN** 右鍵開啟的 detail view 渲染 Application 區塊(節點帶 `data.application`)
- **THEN** 區塊以 `InteractiveTable` 依序呈現 column headers **Name** / **Current** / **Previous** / **Deployment Changes**,application name 落於 Name 欄、兩時間戳落於 Current / Previous 欄、連結欄內容(spinner / anchor / 提示)落於最右的 Deployment Changes 欄

#### Scenario: Containers 區塊以帶 header 表格渲染且沿欄對齊

- **WHEN** 右鍵開啟的 detail view 渲染 Containers 區塊(節點帶兩個以上、name 長度不一的 containers)
- **THEN** 區塊以 `InteractiveTable` 依序呈現 column headers **Name** / **Image** / **Current** / **Previous** / **Code Changes**,每列的 container name / image / 兩時間戳 / 連結欄內容分別落於對應欄、沿欄對齊(欄界不隨 name 長度漂移)

#### Scenario: 連結欄 header 正名

- **WHEN** 右鍵開啟的 detail view 同時渲染 Application 與 Containers 區塊
- **THEN** Application 區塊連結欄 header 為「Deployment Changes」,Containers 區塊連結欄 header 為「Code Changes」(兩者皆 MUST NOT 顯示「Change Report」)

#### Scenario: config_changes 帶兩時間戳時 Application 顯示在地化絕對時間

- **WHEN** application-detail(`config_changes`)成功回傳 `{ "url": "u", "current_time": "2026-06-16T10:30:00Z", "previous_time": "2026-06-10T08:00:00Z" }`
- **THEN** Application 列 Current 欄顯示依面板 `timeZone` 格式化的在地化絕對時間(如 `2026-06-16 10:30:00`)、其 `title` 為完整 ISO `2026-06-16T10:30:00Z`,Previous 欄同理顯示 `2026-06-10T08:00:00Z` 的在地化絕對時間、`title` 為其完整 ISO
- **AND** 同列連結欄仍渲染 `u` 的 anchor(時間欄與連結欄互不影響)

#### Scenario: code_changes 某 container entry 帶兩時間戳時該列顯示之

- **WHEN** image-detail(`code_changes`)成功回傳 `{ "app": { "url": "https://x/app", "current_time": "2026-06-16T10:30:00Z", "previous_time": "2026-06-10T08:00:00Z" } }`,節點 `data.containers` 含 `{ name: "app", image: "repo/app:1.2" }`
- **THEN** `app` 列 Current / Previous 欄分別顯示兩時間戳依面板 `timeZone` 的在地化絕對時間、各以完整 ISO 原字串入 `title`,該列連結欄渲染 `https://x/app` 的 anchor

#### Scenario: 時間戳缺漏或非 RFC 3339 時時間欄降級為 muted「—」

- **WHEN** `config_changes`(或某 container 的 `code_changes` entry)成功回傳有效 `url`,但 `current_time` 缺漏 / 為非字串 / 為非 RFC 3339 字串(如 `"not-a-date"`),`previous_time` 正常
- **THEN** 該目標 Current 欄顯示 muted(`theme.colors.text.secondary`)「—」且無 `title`,Previous 欄照常顯示其在地化絕對時間,同列 url anchor 與其餘欄、其餘列皆 MUST NOT 受影響(MUST NOT 顯示 `Invalid date`)

#### Scenario: 開啟期間 code_changes 只呼叫一次、各 container 共用結果

- **WHEN** detail view 開啟、`code_changes` 預取完成,且有多個 container 列
- **THEN** 系統僅對 `code_changes` 發出**一次**呼叫,所有 container 列以該次回傳的 map 取值(MUST NOT 重發)
- **AND** 關閉 panel / 換節點後快取 MUST 清除,下次開啟重新呼叫一次

#### Scenario: 失敗的查詢不入快取(remount 重取)

- **WHEN** 某次 `code_changes`(或 `config_changes`)失敗(非 200 / 格式錯誤),其後 detail view 對同節點重新掛載(remount)
- **THEN** 系統重新發出該查詢(失敗結果未被快取)

#### Scenario: 連結欄跨區塊與跨狀態上下對齊

- **WHEN** detail view 同時顯示 Application 與 Containers 區塊,且部分目標為 loading、部分為 ready(anchor)、部分為 unavailable(提示)(混合狀態)
- **THEN** 兩區塊每列的連結欄內容皆釘於欄右緣、彼此上下對齊(位置不因提示 / anchor / spinner 寬度差異而左右漂移)

#### Scenario: map 缺 container key 時顯示「No change report」

- **WHEN** `code_changes` 成功,但某 container name 不存在於回傳 map(或該 name 無有效 URL)
- **THEN** 該列連結欄顯示「No change report」提示(無 anchor),name 與 image 仍照常顯示

#### Scenario: 查詢失敗顯示「No change report」且不波及其餘

- **WHEN** `config_changes`(或 `code_changes`)查詢失敗(非 200 / 網路錯誤 / 回應格式錯誤)
- **THEN** 對應目標連結欄以次要色顯示「No change report」提示(無 anchor;過長截斷、完整失敗訊息入 `title` 以保留錯誤可見性)
- **AND** 面板 header 與另一區塊 / 其他列仍正常顯示

#### Scenario: endpoint 自 panel datasource 自動推導(預取發往 sibling 段)

- **WHEN** panel option 未設定查詢 endpoint,且面板查詢 target 帶 datasource ref(如 uid `ksg-default`、`access: proxy`)、其 graph query 路徑為 `/api/v1/graph/service_graph`,使用者右鍵開啟 detail view
- **THEN** 預取查詢發往與 graph query **同目錄的 sibling 段**(`/api/datasources/proxy/uid/ksg-default/api/v1/graph/config_changes` 與 `…/api/v1/graph/code_changes`),經 proxy 轉發即 `<backend>/api/v1/graph/{config_changes,code_changes}`

#### Scenario: panel option 覆寫自動推導

- **WHEN** panel option 設定 endpoint 為 `/foo`,且面板查詢 target 亦帶 datasource ref,使用者右鍵開啟 detail view
- **THEN** 預取查詢發往 `/foo/config_changes` 與 `/foo/code_changes`(option 優先,不使用推導值與 graph query 目錄)

#### Scenario: 未設定 endpoint 且無法推導時不查詢並顯示「No change report」

- **WHEN** panel option 未設定查詢 endpoint,且自查詢 targets 推導不出 datasource proxy path(無 targets / 無 datasource ref / 所有 ref 查無 instance settings 或其 `url` 為空)
- **THEN** 右鍵開啟的 detail view 中兩區塊照資料渲染,連結欄顯示「No change report」提示(`enabled` 為 false),且 MUST NOT 發出任何查詢

#### Scenario: 左鍵選取不觸發查詢

- **WHEN** 使用者以左鍵 `tap` 選取 pod/controller 節點
- **THEN** 面板照常開啟(既有 alerts view 行為),但 MUST NOT 建立查詢 input、MUST NOT 發出 application-detail / image-detail 查詢

#### Scenario: 換節點 / 關閉 panel 清除狀態與快取並中止 in-flight

- **WHEN** detail view 開啟且預取 in-flight,使用者切換到另一節點、或關閉 panel(unmount / 清除選取)
- **THEN** 系統中止 in-flight 查詢(`AbortController`)、清除兩端點快取與每目標狀態,且中止後 MUST NOT 對舊節點 setState

#### Scenario: 查詢經 Grafana runtime 而非直連外部

- **WHEN** 對 `src/**` 進行 source code 掃描
- **THEN** 查詢僅經 `getBackendSrv()`(Grafana runtime);`src/**` 內無任何直接 `fetch` / `axios` / `XMLHttpRequest` 連線外部 backend 的程式碼
