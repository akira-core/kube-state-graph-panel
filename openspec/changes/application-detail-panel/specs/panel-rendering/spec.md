## ADDED Requirements

### Requirement: Node Detail ArgoCD Application 區塊

Panel SHALL 在 node-detail 面板中,**僅對 pod 與 workload controller**(`kind ∈ { pod, deployment, statefulset, daemonset, job, cronjob }`)節點,提供一個 **Application 區塊**,顯示該節點對應 ArgoCD application 的可跳轉連結。其餘 kind(`node` / `pvc` / `service` / `external` / `switch` / `cluster` / `storageclass`)MUST NOT 顯示此區塊。此 ADDED 區塊與既有「Node Detail 面板」需求(header + 告警表格)正交,不改變其行為。

application name 來源為節點的 `data.argoAppName`(由 `normalizeGraph` 自固定 label `argocd.argoproj.io/instance` 解析;pod 取自身、controller 自子 pod 聚合——見 graph-data-integration 規格)。節點無 `argoAppName` 時,Application 區塊 MUST NOT 渲染。

**觸發**:在 pod/controller 節點上**右鍵**(cytoscape `cxttap`)MUST(a)選取該節點(沿用既有單選受控狀態,與藍色高亮 / 面板開關同步,面板隨之開啟),(b)觸發該節點 ArgoCD application 的 URL 查詢。右鍵 MUST 抑制瀏覽器原生 context menu(cytoscape `cxttap` 不會自動 `preventDefault` DOM `contextmenu`)。既有左鍵 `tap` 選取行為不變。

**查詢傳輸**:URL 查詢 MUST 透過 Grafana runtime(`@grafana/runtime` `getBackendSrv()`)發出,以 application name 為輸入、回傳參考 URL;MUST NOT 自 `src/**` 直接以 `fetch` / `axios` / `XMLHttpRequest` 連線外部 backend(與 graph-data-integration「Datasource 整合策略」之「Panel 不直接 fetch 外部 URL」一致)。查詢端點(proxy route)MUST 由 panel option 設定;未設定時 Application 區塊 MUST 停用 / 不顯示且不發出查詢。

**呈現**:查詢進行中 MUST 顯示 loading 指示;成功時 MUST 以**單一可點擊連結**呈現回傳 URL,連結 MUST 以新分頁開啟(`target="_blank"` 且 `rel="noopener"`),且 MUST NOT 自動導頁(不 `window.open`);失敗時 MUST 顯示錯誤 / 空狀態,且 MUST NOT 影響面板其餘區塊(header / 告警表格)。此區塊 MUST 以 `@grafana/ui` + emotion `useStyles2` 樣式、沿用既有 sticky section 版式,並 MUST 經 `node-detail` feature 的 `index.ts` barrel 匯出(不跨 feature 越界 import 對方內部檔案)。單一連結為現行範圍,介面 MUST 預留可成長為多列(未來 N application)。

#### Scenario: 右鍵 pod/controller 選取並觸發查詢

- **WHEN** 使用者於一個帶 `data.argoAppName` 的 pod(或 controller)節點按右鍵
- **THEN** 該節點被選取(藍色高亮與面板開啟同步),系統以該 `argoAppName` 經 `getBackendSrv()` 發出 ArgoCD URL 查詢
- **AND** 瀏覽器原生右鍵選單不出現

#### Scenario: Application 區塊僅對 pod/controller 顯示

- **WHEN** 選取的節點 `kind` 為 `pod` 或 controller(`deployment` / `statefulset` / `daemonset` / `job` / `cronjob`)且帶 `data.argoAppName`
- **THEN** node-detail 面板渲染 Application 區塊

#### Scenario: 非 pod/controller kind 不顯示區塊

- **WHEN** 選取的節點 `kind` 為 `node` / `pvc` / `service` / `external` / `switch` / `cluster` / `storageclass`
- **THEN** Application 區塊 MUST NOT 渲染(即使該節點偶帶 `argoAppName`)

#### Scenario: 無 application name 不顯示區塊

- **WHEN** 選取的 pod/controller 節點無 `data.argoAppName`
- **THEN** Application 區塊 MUST NOT 渲染

#### Scenario: 查詢進行中顯示 loading

- **WHEN** ArgoCD URL 查詢尚未回傳
- **THEN** Application 區塊顯示 loading 指示,且不阻塞面板其餘區塊的顯示

#### Scenario: 查詢成功顯示單一連結(新分頁)

- **WHEN** ArgoCD URL 查詢成功回傳 URL `u`
- **THEN** Application 區塊顯示單一可點擊連結指向 `u`,以 `target="_blank"` + `rel="noopener"` 開啟
- **AND** 系統不自動導頁(不 `window.open`)

#### Scenario: 查詢失敗顯示錯誤狀態

- **WHEN** ArgoCD URL 查詢失敗(網路 / HTTP 錯誤)
- **THEN** Application 區塊顯示錯誤 / 空狀態,且面板 header 與告警表格仍正常顯示

#### Scenario: 未設定 endpoint 時停用

- **WHEN** panel option 未設定 ArgoCD 查詢 endpoint
- **THEN** Application 區塊停用 / 不顯示,且 MUST NOT 發出任何查詢

#### Scenario: 查詢經 Grafana runtime 而非直連外部

- **WHEN** 對 `src/**` 進行 source code 掃描
- **THEN** ArgoCD URL 查詢僅經 `getBackendSrv()`(Grafana runtime);`src/**` 內無任何直接 `fetch` / `axios` / `XMLHttpRequest` 連線外部 backend 的程式碼
