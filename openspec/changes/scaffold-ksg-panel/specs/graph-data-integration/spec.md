## ADDED Requirements

### Requirement: Datasource 整合策略

系統 SHALL 透過 Grafana Infinity datasource(`yesoreyeram-infinity-datasource`)消費 `kube-state-graph` 後端 API,Panel 不直接呼叫外部 HTTP URL,所有 API 流量走 Grafana datasource proxy。

#### Scenario: Panel 從 datasource 取得資料

- **WHEN** Panel 透過 Grafana 查詢機制執行 query
- **THEN** Infinity datasource 以設定的 baseURL + path 呼叫 `kube-state-graph` API,並把 response 以 Grafana `DataFrame` 形式傳給 panel

#### Scenario: Panel 不直接 fetch 外部 URL

- **WHEN** 進行 source code 掃描
- **THEN** `src/**` 內無任何直接呼叫 `fetch`、`axios`、`XMLHttpRequest` 連線到外部 backend 的程式碼;所有資料存取皆透過 Grafana runtime API

### Requirement: OpenAPI → TypeScript 型別自動生成

專案 SHALL 提供 `npm run codegen:api` script,透過 `openapi-typescript` 從上游 `kube-state-graph` 的 OpenAPI 規格產生 `src/shared/types/api.generated.ts`;產物 MUST 納入 git 版本控制,且檔案 header 標註「DO NOT EDIT — auto-generated」。

#### Scenario: codegen script 可重複執行產生穩定輸出

- **WHEN** 連續執行兩次 `npm run codegen:api`
- **THEN** `src/shared/types/api.generated.ts` 內容完全一致(byte-for-byte),`git diff` 無變化

#### Scenario: 手動編輯 generated 檔案被 CI 阻擋

- **WHEN** PR 中含對 `api.generated.ts` 的手動修改且 `npm run codegen:api` 後產物不一致
- **THEN** CI 的 `codegen-drift` 檢查失敗,阻擋 merge

### Requirement: 上游 schema 漂移偵測

CI SHALL 每週自動執行 codegen,若上游 OpenAPI 有變動則自動開 PR 更新 generated types;type 變動造成 build 失敗時必須明確標示為「upstream schema drift」。

#### Scenario: 上游 schema 變動觸發自動 PR

- **WHEN** 排程 GitHub Action 執行 codegen 並偵測到 `api.generated.ts` 有變動
- **THEN** Action 自動開出 PR,標題包含 `chore: sync upstream OpenAPI`,並在 description 列出 schema diff 摘要

### Requirement: Anti-Corruption Layer (Normalize)

系統 SHALL 在 `src/features/graph-data/normalize.ts` 提供純函式,將上游 API response 映射為內部 graph 模型(`GraphNode` / `GraphEdge`);Panel UI 元件 MUST 僅使用內部模型,不得直接消費 generated API types。

#### Scenario: Normalize 為純函式

- **WHEN** 對 `normalize()` 以相同 input 多次呼叫
- **THEN** 回傳值結構完全一致,函式無副作用(無 I/O、無 mutation 外部變數)

#### Scenario: UI 元件不依賴 generated types

- **WHEN** 對 `src/features/graph-canvas/**` 與 `src/panels/**` 進行 import 分析
- **THEN** 上述目錄無任何 import 來自 `src/shared/types/api.generated.ts`(由 `import-x/no-restricted-paths` 強制)

### Requirement: 載入與錯誤狀態傳遞

`useGraphData` hook SHALL 對外公開 `{ data, isLoading, error }` 三個狀態欄位,並在資料尚未就緒、進行中、或錯誤時提供對應值,讓 panel 元件渲染對應 UI(已於 panel-rendering spec 規範)。

#### Scenario: Hook 初次載入時的狀態流轉

- **WHEN** Panel 首次 mount 並觸發 query
- **THEN** `useGraphData` 回傳序列為 `{ isLoading: true, data: undefined, error: null }` → `{ isLoading: false, data: <normalized>, error: null }`

#### Scenario: Hook 在 API 錯誤時公開 error

- **WHEN** 後端回傳 HTTP 5xx 或網路失敗
- **THEN** `useGraphData` 回傳 `{ isLoading: false, data: undefined, error: <Error> }`,且 error 物件 message 為非空字串

### Requirement: 內部模型 Schema 穩定性

內部 `GraphNode` / `GraphEdge` 型別 MUST 在 `src/shared/types/graph.ts` 集中定義,並至少包含:`GraphNode { id, kind, name, namespace?, labels? }` 與 `GraphEdge { id, source, target, edgeType, weight? }`;此型別變更 MUST 視為 breaking,需經 PR review。

#### Scenario: 型別保留必要欄位

- **WHEN** 對 `src/shared/types/graph.ts` 編譯
- **THEN** TypeScript 編譯通過,且 `GraphNode` 與 `GraphEdge` 包含上述列出之欄位

### Requirement: Datasource Provisioning

`provisioning/datasources/` 目錄 SHALL 包含一份 YAML,於 docker-compose 啟動 Grafana 時自動建立指向 `kube-state-graph` backend 的 Infinity datasource 實例,使用者無需手動設定即可看到 demo dashboard。

#### Scenario: Grafana 啟動後 datasource 已就緒

- **WHEN** 執行 `npm run dev:up` 並等待 Grafana 啟動完成
- **THEN** Grafana UI 中 Datasources 清單已包含名為 `kube-state-graph` 的 Infinity datasource,URL 指向 `http://kube-state-graph:8080`,測試連線成功

### Requirement: 範例 Dashboard Provisioning

`provisioning/dashboards/` SHALL 提供一份 demo dashboard JSON,內含至少一個本 plugin panel,使用預設 query 顯示 kind cluster 內 sample workloads 的拓樸圖。

#### Scenario: Demo dashboard 自動載入

- **WHEN** Grafana 啟動完成且 kind cluster 已部署 sample workloads
- **THEN** Grafana UI 「Dashboards」清單存在 `KSG Demo` dashboard,開啟後 panel 顯示節點與邊,無錯誤

### Requirement: 多 instance 支援(v1 範圍限定)

v1 範圍內每個 panel 例項 MUST 綁定單一 datasource 實例;Panel 不負責跨 cluster 聚合,跨 cluster 對比由使用者自行於 dashboard 放置多個 panel 達成。

#### Scenario: Panel options 不提供 cluster 切換

- **WHEN** 開啟 panel options 編輯器
- **THEN** Options 表單不含 cluster 選擇欄位;cluster 切換以更換 datasource 的方式達成
