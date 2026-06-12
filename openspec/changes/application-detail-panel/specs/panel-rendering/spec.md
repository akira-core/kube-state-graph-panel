## ADDED Requirements

### Requirement: Node Detail Application 與 Containers 區塊

Panel SHALL 在 node-detail 面板中,**僅對 pod 與 workload controller**(`kind ∈ { pod, deployment, statefulset, daemonset, job, cronjob }`)節點,提供 **Application 區塊**與 **Containers 區塊**,沿用既有面板位置與版型(與 Alerts 區塊同一 sticky section 樣式)。其餘 kind(`node` / `pvc` / `service` / `external` / `switch` / `cluster` / `storageclass`)MUST NOT 顯示這兩個區塊。面板依觸發方式分流為兩個 **view**:**右鍵**開啟 `detail` view,只渲染 Application / Containers 兩區塊、MUST NOT 渲染 Alerts 表格(即使節點帶 `data.alerts`);**左鍵**開啟 `alerts` view,只渲染 Alerts 表格(含 Count / Last occurred 欄與 `timeRecords[]` 行為,見「Node Detail 面板」需求)、MUST NOT 渲染這兩個區塊。兩 view 共用 header 與面板框架。

**資料來源**:application name 來源為節點的 `data.application`(backend 於 pod 節點輸出;controller 由 `normalizeGraph` 自子 pod 聚合);containers 來源為節點的 `data.containers`(`Array<{ name, image }>`;pod 為 backend 原樣透傳、controller 為子 pod 聚合去重——見 graph-data-integration 規格)。節點無 `data.application` 時 Application 區塊 MUST NOT 渲染;無 `data.containers`(或為空陣列)時 Containers 區塊 MUST NOT 渲染;兩者互不影響。

**觸發**:在 pod/controller 節點上**右鍵**(cytoscape `cxttap`)MUST(a)選取該節點(沿用既有單選受控狀態,與藍色高亮 / 面板開關同步,面板隨之開啟),(b)觸發該節點的兩個 URL 查詢(application-detail 與 image-detail)。右鍵 MUST 抑制瀏覽器原生 context menu(cytoscape `cxttap` 不會自動 `preventDefault` DOM `contextmenu`)。既有左鍵 `tap` 選取行為不變(左鍵 MUST NOT 觸發查詢)。

**查詢契約**:兩個查詢 MUST 共用同一組 input——ArgoCD application name、pod-controller kind、pod-controller name、current time(查詢當下時間,Unix 秒)。pod 節點的 controller kind/name 取自其 owner(`data.owner`);controller 節點取自身 kind/name;無 owner 的 standalone pod 以自身 kind(`pod`)與 name 帶入。回傳:

- **application-detail 查詢**(`GET <endpoint>/api/v1/config_changes`):回 `{ "url": string }`——**單一 URL**(該 ArgoCD application 的外部詳情頁)。
- **image-detail 查詢**(`GET <endpoint>/api/v1/code_changes`):回 `{ [containerName]: { "url": string } }`——**map(container name → URL)**,UI 端以攤平後的 map 查值;input MUST NOT 含 image 參數,一次右鍵一次呼叫涵蓋該節點所有 containers。

**查詢傳輸**:查詢 MUST 透過 Grafana runtime(`@grafana/runtime` `getBackendSrv()`)發往**同一個 graph API backend**;MUST NOT 自 `src/**` 直接以 `fetch` / `axios` / `XMLHttpRequest` 連線外部 backend(與 graph-data-integration「Datasource 整合策略」之「Panel 不直接 fetch 外部 URL」一致)。查詢端點(base path)MUST 依下列順序解析:(1)panel option 非空時以其為準(**覆寫**);(2)否則 SHALL 自面板查詢請求(`data.request.targets`)**自動推導**——依序檢視非隱藏(`hide` ≠ true)且帶 datasource ref 的 targets,經 Grafana runtime 的 datasource instance settings 解析其 proxied base path(`access: proxy` 的 datasource 其 instance settings `url` 即 `/api/datasources/proxy/uid/<uid>`),取**第一個解析出非空 base path** 者(隱藏 target 或解析不出 url 的 ref——如 expression——跳過續查,不視為終點);(3)兩者皆無(option 空且無任一 target 可解析出非空 base path)時,兩區塊照資料渲染但 URL 按鈕 MUST 停用,且 MUST NOT 發出任何查詢。查詢 MUST 可中止(unmount / 換節點),MUST NOT 在 unmount 後 setState,並於 React StrictMode 雙掛載下冪等。

**呈現**:

- 查詢進行中 MUST 於每列 URL 按鈕**右側**顯示進行中指示(spinner + 提示文字),按鈕停用,且不阻塞面板其餘區塊。
- **Application 區塊**(成功):顯示 application name 與**單一 URL 按鈕**,指向 application-detail 查詢回傳的 URL,以新分頁開啟(`target="_blank"` 且 `rel="noopener"`),MUST NOT 自動導頁(不 `window.open`)。
- **Containers 區塊**(成功):每個 container 一列,顯示 **container name 與 image**,並各帶一顆 **URL 按鈕**指向 map 中以該 container name 查得的 URL,同樣以新分頁開啟(`target="_blank"` + `rel="noopener"`)、不自動導頁;map 中**查無**該 container name 時,該列 URL 按鈕 MUST 停用,name/image 仍照常顯示。
- 任一查詢失敗時,對應區塊每列的 Change Report 欄 MUST 僅以錯誤色顯示失敗訊息(**不渲染按鈕**;過長截斷、完整值入 `title`;表格 header 與列照常渲染),且 MUST NOT 影響面板其餘區塊(header / 另一區塊)。
- **表格版型**:兩區塊 MUST 比照 Alerts 表格以**帶 column header 的表格版型**渲染(同一 `@grafana/ui` `InteractiveTable` 元件)——Application 區塊欄位為 **Name / Change Report**,Containers 區塊欄位為 **Name / Image / Change Report**;每欄 MUST 有 header、各列內容 MUST 沿欄整齊對齊,MUST NOT 以無 header 的自由 flex 列呈現。Change Report 欄 MUST 不隨內容成長(`disableGrow`),由 Application 的 Name 欄 / Containers 的 Image 欄填滿剩餘寬度,使**兩區塊的 Change Report 欄同樣靠右、上下對齊**。查詢狀態顯示於 Change Report 欄 cell 內——成功:按鈕 + 右側解析 URL(次要色);進行中:停用按鈕 + 右側 spinner 提示;**失敗:MUST 僅顯示錯誤色失敗訊息、不渲染按鈕**;idle 或 map 缺 key:僅停用按鈕、槽位空白;文字過長截斷、完整值入 `title`。header 與列的渲染不受查詢狀態影響;按鈕語意不變(成功帶 `href` + `target="_blank"` + `rel="noopener"`、無 URL 停用)。
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

#### Scenario: 查詢進行中顯示 loading

- **WHEN** 右鍵已觸發、查詢尚未回傳
- **THEN** 兩區塊每列 URL 按鈕右側顯示進行中指示(spinner + 提示文字),按鈕停用,且不阻塞面板其餘區塊的顯示

#### Scenario: Application 查詢成功顯示單一 URL 按鈕(新分頁)

- **WHEN** application-detail 查詢成功回傳 URL `u`
- **THEN** Application 區塊顯示 application name 與單一 URL 按鈕指向 `u`,以 `target="_blank"` + `rel="noopener"` 開啟
- **AND** 系統不自動導頁(不 `window.open`)

#### Scenario: Containers 查詢成功每列綁定對應 URL

- **WHEN** 節點 `data.containers` 為 `[{ name: "app", image: "repo/app:1.2" }, { name: "sidecar", image: "repo/sc:0.9" }]`,且 image-detail 查詢回傳 `{ "app": { "url": "https://x/app" }, "sidecar": { "url": "https://x/sc" } }`
- **THEN** Containers 區塊渲染兩列,各顯示 name 與 image,URL 按鈕分別指向 `https://x/app` 與 `https://x/sc`(`target="_blank"` + `rel="noopener"`)

#### Scenario: Application 區塊以帶 header 表格渲染

- **WHEN** 右鍵開啟的 detail view 渲染 Application 區塊(節點帶 `data.application`)
- **THEN** 區塊以 `InteractiveTable` 呈現 column headers **Name** 與 **Change Report**,application name 落於 Name 欄、URL 按鈕落於 Change Report 欄

#### Scenario: Containers 區塊以帶 header 表格渲染且沿欄對齊

- **WHEN** 右鍵開啟的 detail view 渲染 Containers 區塊(節點帶兩個以上、name 長度不一的 containers)
- **THEN** 區塊以 `InteractiveTable` 呈現 column headers **Name** / **Image** / **Change Report**,每列的 container name / image / URL 按鈕分別落於對應欄、沿欄對齊(欄界不隨 name 長度漂移)

#### Scenario: 查詢結果顯示於 Change Report 欄

- **WHEN** 任一 URL 查詢回傳結果(成功 URL `u` 或失敗訊息 `m`)
- **THEN** 對應區塊每列 Change Report 欄顯示結果——成功:URL 按鈕 + 右側次要色 `u`;失敗:欄內**僅**顯示錯誤色 `m`(不渲染按鈕);皆過長截斷、完整值入 `title`

#### Scenario: map 缺 container key 時該列按鈕停用

- **WHEN** 某 container name 不存在於 image-detail 查詢回傳的 map
- **THEN** 該列照常顯示 name 與 image,但 URL 按鈕停用

#### Scenario: 查詢失敗顯示錯誤狀態且不波及其餘

- **WHEN** 任一查詢失敗(網路 / HTTP 錯誤)
- **THEN** 對應區塊每列 Change Report 欄僅以錯誤色顯示失敗訊息(不渲染按鈕;表格 header 與列照常渲染),面板 header 與另一區塊仍正常顯示

#### Scenario: endpoint 自 panel datasource 自動推導

- **WHEN** panel option 未設定查詢 endpoint,且面板查詢 target 帶 datasource ref(如 uid `ksg-default`、`access: proxy`)
- **THEN** 右鍵觸發後,兩查詢發往該 datasource 的 proxied base path 下的固定子路徑(`/api/datasources/proxy/uid/ksg-default/api/v1/config_changes` 與 `/api/datasources/proxy/uid/ksg-default/api/v1/code_changes`)

#### Scenario: panel option 覆寫自動推導

- **WHEN** panel option 設定 endpoint 為 `/foo`,且面板查詢 target 亦帶 datasource ref
- **THEN** 兩查詢發往 `/foo/api/v1/config_changes` 與 `/foo/api/v1/code_changes`(option 優先,不使用推導值)

#### Scenario: 未設定 endpoint 且無法推導時停用

- **WHEN** panel option 未設定查詢 endpoint,且自查詢 targets 推導不出 datasource proxy path(無 targets / 無 datasource ref / 所有 ref 查無 instance settings 或其 `url` 為空)
- **THEN** 右鍵開啟的 detail view 中兩區塊照資料渲染但 URL 按鈕停用,且 MUST NOT 發出任何查詢

#### Scenario: 左鍵選取不觸發查詢

- **WHEN** 使用者以左鍵 `tap` 選取 pod/controller 節點
- **THEN** 面板照常開啟(既有行為),但 MUST NOT 發出 application-detail / image-detail 查詢

#### Scenario: 查詢經 Grafana runtime 而非直連外部

- **WHEN** 對 `src/**` 進行 source code 掃描
- **THEN** 查詢僅經 `getBackendSrv()`(Grafana runtime);`src/**` 內無任何直接 `fetch` / `axios` / `XMLHttpRequest` 連線外部 backend 的程式碼

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

## MODIFIED Requirements

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
