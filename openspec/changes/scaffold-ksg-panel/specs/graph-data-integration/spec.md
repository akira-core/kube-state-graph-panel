## ADDED Requirements

### Requirement: Datasource 整合策略

系統 SHALL 透過 Grafana Infinity datasource(`yesoreyeram-infinity-datasource`)消費 `kube-state-graph` 後端 API,Panel 不直接呼叫外部 HTTP URL,所有 API 流量走 Grafana datasource proxy。

#### Scenario: Panel 從 datasource 取得資料

- **WHEN** Panel 透過 Grafana 查詢機制執行 query
- **THEN** Infinity datasource 以設定的 baseURL + path 呼叫 `kube-state-graph` API,並把 response 以 Grafana `DataFrame` 形式傳給 panel

#### Scenario: Panel 不直接 fetch 外部 URL

- **WHEN** 進行 source code 掃描
- **THEN** `src/**` 內無任何直接呼叫 `fetch`、`axios`、`XMLHttpRequest` 連線到外部 backend 的程式碼;所有資料存取皆透過 Grafana runtime API

### Requirement: 內部 Graph 模型(手寫,無 codegen)

內部 `GraphNode` / `GraphEdge` / `GraphPayload` 型別 MUST 在 `src/shared/types/graph.ts` 集中定義並手動維護(精簡版:**不採用 OpenAPI codegen**,2024-2026 trending 偏好「手寫型別 + boundary runtime 驗證」;若日後 schema 大量增長再另起 change 引入 codegen)。

至少包含:
- `GraphNode { id, kind, label?, namespace?, labels? }`
- `GraphEdge { id, source, target, edgeType, weight? }`
- `GraphPayload { nodes, edges }`

#### Scenario: 型別保留必要欄位

- **WHEN** 對 `src/shared/types/graph.ts` 編譯
- **THEN** TypeScript 編譯通過,且 `GraphNode` 與 `GraphEdge` 包含上述列出之欄位

### Requirement: Boundary Normalize 函式

系統 SHALL 在 `src/features/graph-data/normalize.ts` 提供純函式 `normalizeGraph(raw: unknown): { elements: cytoscape.ElementDefinition[]; errors: string[] }`,負責 (a) 驗證上游 payload 形狀;(b) 把資料映射為 cytoscape 元素;(c) 略過不合法項目並收集警告於 `errors`。

#### Scenario: Normalize 為純函式

- **WHEN** 對 `normalizeGraph()` 以相同 input 多次呼叫
- **THEN** 回傳值結構完全一致,函式無副作用(無 I/O、無 mutation 外部變數)

#### Scenario: 不合法資料不中斷渲染

- **WHEN** 上游 payload 含一個缺 `id` 欄位的 node
- **THEN** `normalizeGraph` 略過該 node,於 `errors` 加入描述字串,其餘合法資料正常映射

### Requirement: 載入與錯誤狀態傳遞

`useGraphData` hook SHALL 對外公開 `{ elements, error }` 兩個欄位;載入狀態由 `PanelProps.data.state` 直接判斷(無需 hook 重複封裝),錯誤狀態由 `PanelProps.data.errors[0]` 或 normalize 失敗訊息提供。

#### Scenario: Hook 取資料並 normalize

- **WHEN** Panel mount 並收到 `PanelProps.data.series` 含 JSON 欄位(Infinity datasource 預設形式)
- **THEN** `useGraphData` 解析該欄位、套 `normalizeGraph`,回傳 `{ elements: [...], error: undefined }`

#### Scenario: Hook 在 normalize 失敗時公開 error

- **WHEN** `normalizeGraph` 回傳含 errors 的結果(payload 形狀錯誤)
- **THEN** `useGraphData` 回傳 `{ elements: [], error: '<first error message>' }`

### Requirement: Datasource Provisioning

`provisioning/datasources/` 目錄 SHALL 包含一份 YAML,於 docker-compose 啟動 Grafana 時自動建立指向 `kube-state-graph` backend 的 Infinity datasource 實例。

#### Scenario: Grafana 啟動後 datasource 已就緒

- **WHEN** 執行 `docker compose up -d` 並等待 Grafana 啟動完成
- **THEN** Grafana UI 中 Datasources 清單已包含名為 `kube-state-graph` 的 Infinity datasource,URL 指向 `http://kube-state-graph:8080`

### Requirement: 範例 Dashboard Provisioning

`provisioning/dashboards/` SHALL 提供一份 demo dashboard JSON,內含至少一個本 plugin panel。

#### Scenario: Demo dashboard 自動載入

- **WHEN** Grafana 啟動完成且 backend 已可回應 API
- **THEN** Grafana UI 「Dashboards」清單存在 `KSG Demo` dashboard,開啟後 panel 顯示對應內容(若無資料則顯示 EmptyState)

### Requirement: 多 instance 支援(v1 範圍限定)

v1 範圍內每個 panel 例項 MUST 綁定單一 datasource 實例;Panel 不負責跨 cluster 聚合。

#### Scenario: Panel options 不提供 cluster 切換

- **WHEN** 開啟 panel options 編輯器
- **THEN** Options 表單不含 cluster 選擇欄位
