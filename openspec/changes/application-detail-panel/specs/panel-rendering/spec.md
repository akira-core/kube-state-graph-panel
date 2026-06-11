## ADDED Requirements

### Requirement: Node Detail Application 與 Containers 區塊

Panel SHALL 在 node-detail 面板中,**僅對 pod 與 workload controller**(`kind ∈ { pod, deployment, statefulset, daemonset, job, cronjob }`)節點,提供 **Application 區塊**與 **Containers 區塊**,沿用既有面板位置與版型(與 Alerts 區塊同一 sticky section 樣式)。其餘 kind(`node` / `pvc` / `service` / `external` / `switch` / `cluster` / `storageclass`)MUST NOT 顯示這兩個區塊。面板依觸發方式分流為兩個 **view**:**右鍵**開啟 `detail` view,只渲染 Application / Containers 兩區塊、MUST NOT 渲染 Alerts 表格(即使節點帶 `data.alerts`);**左鍵**開啟 `alerts` view,只渲染 Alerts 表格(行為以 `alert-occurrence-grouping` 改寫後的 Count / Last occurred / `timeRecords[]` 為基準)、MUST NOT 渲染這兩個區塊。兩 view 共用 header 與面板框架。

**資料來源**:application name 來源為節點的 `data.application`(backend 於 pod 節點輸出;controller 由 `normalizeGraph` 自子 pod 聚合);containers 來源為節點的 `data.containers`(`Array<{ name, image }>`;pod 為 backend 原樣透傳、controller 為子 pod 聚合去重——見 graph-data-integration 規格)。節點無 `data.application` 時 Application 區塊 MUST NOT 渲染;無 `data.containers`(或為空陣列)時 Containers 區塊 MUST NOT 渲染;兩者互不影響。

**觸發**:在 pod/controller 節點上**右鍵**(cytoscape `cxttap`)MUST(a)選取該節點(沿用既有單選受控狀態,與藍色高亮 / 面板開關同步,面板隨之開啟),(b)觸發該節點的兩個 URL 查詢(application-detail 與 image-detail)。右鍵 MUST 抑制瀏覽器原生 context menu(cytoscape `cxttap` 不會自動 `preventDefault` DOM `contextmenu`)。既有左鍵 `tap` 選取行為不變(左鍵 MUST NOT 觸發查詢)。

**查詢契約**:兩個查詢 MUST 共用同一組 input——ArgoCD application name、pod-controller kind、pod-controller name、current time(查詢當下時間,Unix 秒)。pod 節點的 controller kind/name 取自其 owner(`data.owner`);controller 節點取自身 kind/name;無 owner 的 standalone pod 以自身 kind(`pod`)與 name 帶入。回傳:

- **application-detail 查詢**(`GET <endpoint>/api/v1/config_changes`):回 `{ "url": string }`——**單一 URL**(該 ArgoCD application 的外部詳情頁)。
- **image-detail 查詢**(`GET <endpoint>/api/v1/code_changes`):回 `{ [containerName]: { "url": string } }`——**map(container name → URL)**,UI 端以攤平後的 map 查值;input MUST NOT 含 image 參數,一次右鍵一次呼叫涵蓋該節點所有 containers。

**查詢傳輸**:查詢 MUST 透過 Grafana runtime(`@grafana/runtime` `getBackendSrv()`)發往**同一個 graph API backend**;MUST NOT 自 `src/**` 直接以 `fetch` / `axios` / `XMLHttpRequest` 連線外部 backend(與 graph-data-integration「Datasource 整合策略」之「Panel 不直接 fetch 外部 URL」一致)。查詢端點(proxy route)MUST 由 panel option 設定;未設定時兩區塊 MUST 停用 / 不顯示且 MUST NOT 發出查詢。查詢 MUST 可中止(unmount / 換節點),MUST NOT 在 unmount 後 setState,並於 React StrictMode 雙掛載下冪等。

**呈現**:

- 查詢進行中 MUST 顯示 loading 指示,且不阻塞面板其餘區塊。
- **Application 區塊**(成功):顯示 application name 與**單一 URL 按鈕**,指向 application-detail 查詢回傳的 URL,以新分頁開啟(`target="_blank"` 且 `rel="noopener"`),MUST NOT 自動導頁(不 `window.open`)。
- **Containers 區塊**(成功):每個 container 一列,顯示 **container name 與 image**,並各帶一顆 **URL 按鈕**指向 map 中以該 container name 查得的 URL,同樣以新分頁開啟(`target="_blank"` + `rel="noopener"`)、不自動導頁;map 中**查無**該 container name 時,該列 URL 按鈕 MUST 停用或隱藏,name/image 仍照常顯示。
- 任一查詢失敗時,對應區塊 MUST 顯示錯誤 / 空狀態,且 MUST NOT 影響面板其餘區塊(header / 另一區塊)。
- 兩區塊 MUST 以 `@grafana/ui` + emotion `useStyles2` 樣式實作,元件(ApplicationTable / ContainerTable)共置於 `node-detail` feature 並 MUST 經其 `index.ts` barrel 匯出(不跨 feature 越界 import 對方內部檔案)。Application 區塊現行為單列,介面 MUST 預留可成長為多列。

#### Scenario: 右鍵 pod/controller 選取並觸發兩個查詢

- **WHEN** 使用者於一個帶 `data.application` 的 pod(或 controller)節點按右鍵
- **THEN** 該節點被選取(藍色高亮與面板開啟同步),系統以(application name, controller kind, controller name, current time)經 `getBackendSrv()` 發出 application-detail 與 image-detail 兩個查詢
- **AND** 瀏覽器原生右鍵選單不出現

#### Scenario: pod 的 controller kind/name 取自 owner

- **WHEN** 右鍵的節點為 pod 且其 `data.owner` 為 `{ kind: "deployment", name: "gateway" }`
- **THEN** 兩個查詢的 input 之 controller kind/name 為 `deployment` / `gateway`

#### Scenario: controller 節點以自身 kind/name 查詢

- **WHEN** 右鍵的節點為 controller(如 `statefulset` `mongo`)
- **THEN** 兩個查詢的 input 之 controller kind/name 為 `statefulset` / `mongo`

#### Scenario: 區塊僅對 pod/controller 顯示

- **WHEN** 選取的節點 `kind` 為 `pod` 或 controller(`deployment` / `statefulset` / `daemonset` / `job` / `cronjob`)且帶對應資料(`data.application` / 非空 `data.containers`)
- **THEN** node-detail 面板渲染 Application 區塊與 Containers 區塊

#### Scenario: 非 pod/controller kind 不顯示區塊

- **WHEN** 選取的節點 `kind` 為 `node` / `pvc` / `service` / `external` / `switch` / `cluster` / `storageclass`
- **THEN** Application 與 Containers 區塊 MUST NOT 渲染(即使該節點偶帶 `application` / `containers` 資料)

#### Scenario: 無 application 時僅隱藏 Application 區塊

- **WHEN** 選取的 pod/controller 節點無 `data.application`,但帶非空 `data.containers`
- **THEN** Application 區塊 MUST NOT 渲染,Containers 區塊照常渲染

#### Scenario: 無 containers 時僅隱藏 Containers 區塊

- **WHEN** 選取的 pod/controller 節點帶 `data.application`,但無 `data.containers`(或為空陣列)
- **THEN** Containers 區塊 MUST NOT 渲染,Application 區塊照常渲染

#### Scenario: 查詢進行中顯示 loading

- **WHEN** 右鍵已觸發、查詢尚未回傳
- **THEN** 兩區塊顯示 loading 指示,且不阻塞面板其餘區塊的顯示

#### Scenario: Application 查詢成功顯示單一 URL 按鈕(新分頁)

- **WHEN** application-detail 查詢成功回傳 URL `u`
- **THEN** Application 區塊顯示 application name 與單一 URL 按鈕指向 `u`,以 `target="_blank"` + `rel="noopener"` 開啟
- **AND** 系統不自動導頁(不 `window.open`)

#### Scenario: Containers 查詢成功每列綁定對應 URL

- **WHEN** 節點 `data.containers` 為 `[{ name: "app", image: "repo/app:1.2" }, { name: "sidecar", image: "repo/sc:0.9" }]`,且 image-detail 查詢回傳 `{ "app": { "url": "https://x/app" }, "sidecar": { "url": "https://x/sc" } }`
- **THEN** Containers 區塊渲染兩列,各顯示 name 與 image,URL 按鈕分別指向 `https://x/app` 與 `https://x/sc`(`target="_blank"` + `rel="noopener"`)

#### Scenario: map 缺 container key 時該列按鈕停用

- **WHEN** 某 container name 不存在於 image-detail 查詢回傳的 map
- **THEN** 該列照常顯示 name 與 image,但 URL 按鈕停用或隱藏

#### Scenario: 查詢失敗顯示錯誤狀態且不波及其餘

- **WHEN** 任一查詢失敗(網路 / HTTP 錯誤)
- **THEN** 對應區塊顯示錯誤 / 空狀態,面板 header 與另一區塊仍正常顯示

#### Scenario: 未設定 endpoint 時停用

- **WHEN** panel option 未設定查詢 endpoint
- **THEN** Application 與 Containers 區塊停用 / 不顯示,且 MUST NOT 發出任何查詢

#### Scenario: 左鍵選取不觸發查詢

- **WHEN** 使用者以左鍵 `tap` 選取 pod/controller 節點
- **THEN** 面板照常開啟(既有行為),但 MUST NOT 發出 application-detail / image-detail 查詢

#### Scenario: 查詢經 Grafana runtime 而非直連外部

- **WHEN** 對 `src/**` 進行 source code 掃描
- **THEN** 查詢僅經 `getBackendSrv()`(Grafana runtime);`src/**` 內無任何直接 `fetch` / `axios` / `XMLHttpRequest` 連線外部 backend 的程式碼
