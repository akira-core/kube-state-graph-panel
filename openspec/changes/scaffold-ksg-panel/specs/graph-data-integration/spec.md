## ADDED Requirements

### Requirement: Datasource 整合策略

系統 SHALL 透過 Grafana Infinity datasource(`yesoreyeram-infinity-datasource`)消費 `kube-state-graph` 後端 API,Panel 不直接呼叫外部 HTTP URL,所有 API 流量走 Grafana datasource proxy。

#### Scenario: Panel 從 datasource 取得資料

- **WHEN** Panel 透過 Grafana 查詢機制執行 query
- **THEN** Infinity datasource 以設定的 baseURL + path 呼叫 `kube-state-graph` API,並把 response 以 Grafana `DataFrame` 形式傳給 panel

#### Scenario: Panel 不直接 fetch 外部 URL

- **WHEN** 進行 source code 掃描
- **THEN** `src/**` 內無任何直接呼叫 `fetch`、`axios`、`XMLHttpRequest` 連線到外部 backend 的程式碼;所有資料存取皆透過 Grafana runtime API

### Requirement: 上游 kube-state-graph payload 契約(cytoscape.js 形式)

上游 `kube-state-graph` 後端 `GET /v1/graph` 端點輸出 **cytoscape.js elements 形式**的 JSON,本 panel MUST 以此為唯一資料來源契約並依此 normalize。頂層形狀為:

```
{ apiVersion: string, clusters: string[], elements: { nodes: CyNode[], edges: CyEdge[] } }
```

每個 node / edge 皆以 cytoscape 慣例包在 `data` 物件中:

- `CyNode.data { id: string, name: string, type: string, ipaddress?: string[], labels: Record<string,string> }`
- `CyEdge.data { id: string, type: string, source: string, target: string, labels: Record<string,string> }`

後端 node `type` 列舉(小寫):核心資源 `pod` / `node` / `pvc` / `service` / `external`,workload controller `deployment` / `statefulset` / `daemonset` / `job` / `cronjob`,以及實體網路 `switch`(後端 v0.0.18 起)。未對應到具體 K8s 資源的端點歸入 `external`(契約無 `others` 類型)。
後端 edge `type` 列舉:`pod-runs-on-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod`,以及實體網路 fabric `switch-to-switch` / `node-to-switch`(後端 v0.0.18 起)。`pod-calls-service`(pod→service)與 `service-selects-pod`(service→pod)為方向相反的一對;`switch-to-switch`(switch→switch)、`node-to-switch`(node→switch)為實體網路邊。邊的視覺樣式(顏色/線型/箭頭)由 panel-rendering 規格定義。
`ipaddress` 為**陣列**(可能多個 IP 或空);僅 `pod` / `node` / `service` node 帶有,且 IP 資料已於上游 commit `524057b` 從 `labels`(原 `pod_ip` / `host_ip` / `external_ip`)移出,改置於此專屬欄位 —— panel MUST 從 `data.ipaddress` 取 IP,**不可**再從 `labels` 讀取。

#### Scenario: 契約欄位以後端 golden fixture 為準

- **WHEN** 對 `normalizeGraph` 餵入後端 `internal/api/testdata/golden/*-cytoscape.json` 的內容
- **THEN** 正確解析出對應數量的 nodes 與 edges,且 `service` node 的 `ipaddress: ["10.0.0.5"]` 被保留

### Requirement: 內部 Graph 模型(手寫,無 codegen)

panel 內部模型 MUST 以 cytoscape 原生型別為單一來源:自訂的 node/edge `data` 欄位透過 declaration merging 定義於 `src/shared/types/cytoscape.d.ts`(擴充 `NodeDataDefinition` / `EdgeDataDefinition`),`normalize.ts` 直接產生 `cytoscape.ElementDefinition[]`(精簡版:**不採用 OpenAPI codegen**,2024-2026 trending 偏好「手寫型別 + boundary runtime 驗證」;若日後 schema 大量增長再另起 change 引入 codegen)。欄位以上游契約為準,映射至 panel 內部命名:

- node `data { id, kind, label?, namespace?, ipAddress?, labels? }`(`kind` 由上游 `data.type` 映射;`label` 由 `data.name` 映射;`namespace` 由 `data.labels.namespace` 取出;`ipAddress` 由 `data.ipaddress` 映射)
- edge `data { id, source, target, edgeType, labels? }`(`edgeType` 由上游 `data.type` 映射)

#### Scenario: cytoscape data augmentation 保留必要欄位

- **WHEN** 對 `src/shared/types/cytoscape.d.ts` 與 `src/features/graph-data/normalize.ts` 編譯
- **THEN** TypeScript 編譯通過,且 normalize 產出的 node `data` 含 `id`/`kind`/`ipAddress`、edge `data` 含 `id`/`source`/`target`/`edgeType`

### Requirement: Boundary Normalize 函式

系統 SHALL 在 `src/features/graph-data/normalize.ts` 提供純函式 `normalizeGraph(raw: unknown): { elements: cytoscape.ElementDefinition[]; errors: string[] }`,作為 anti-corruption layer,負責 (a) 驗證上游 payload 形狀;(b) 把上游 cytoscape `data` 映射為 panel 內部 cytoscape 元素;(c) 略過不合法項目並收集警告於 `errors`。

normalize MUST 同時容忍下列頂層形狀(因 Infinity datasource table flatten 行為不確定):完整回應 `{ elements: { nodes, edges } }`、或已解包的 `{ nodes, edges }`。每個 node/edge 條目 MUST 容忍 cytoscape 包裝 `{ data: {...} }` 與扁平物件兩種形式(優先取 `entry.data`,否則用 entry 本身)。

欄位映射:node `type → data.kind`、`name → data.label`(缺則 fallback 為 id)、`labels.namespace → data.namespace`、`ipaddress → data.ipAddress`(僅當為非空字串陣列時)、`labels → data.labels`;edge `type → data.edgeType`。

#### Scenario: Normalize 為純函式

- **WHEN** 對 `normalizeGraph()` 以相同 input 多次呼叫
- **THEN** 回傳值結構完全一致,函式無副作用(無 I/O、無 mutation 外部變數)

#### Scenario: 映射上游 cytoscape data 至內部欄位

- **WHEN** 上游 node `data` 為 `{ id, name: 'checkout', type: 'pod', labels: { namespace: 'shop' } }`
- **THEN** 產出 cytoscape node element `data` 含 `kind: 'pod'`、`label: 'checkout'`、`namespace: 'shop'`;edge `data.type` 映射為 `edgeType`

#### Scenario: ipAddress 從專屬欄位取出而非 labels

- **WHEN** 上游 `service` node `data` 含 `ipaddress: ['10.0.0.5']`
- **THEN** 產出 element `data.ipAddress` 為 `['10.0.0.5']`;即使 `labels` 不含 `pod_ip`/`host_ip`/`external_ip` 亦不影響

#### Scenario: 容忍 wrapped 與 unwrapped 頂層形狀

- **WHEN** 餵入 `{ elements: { nodes, edges } }` 或已解包的 `{ nodes, edges }`
- **THEN** 兩者皆解析出相同的 cytoscape elements

#### Scenario: 不合法資料不中斷渲染

- **WHEN** 上游 payload 含一個缺 `id` 欄位的 node
- **THEN** `normalizeGraph` 略過該 node,於 `errors` 加入描述字串,其餘合法資料正常映射

### Requirement: 載入與錯誤狀態傳遞

`useGraphData` hook SHALL 對外公開 `{ elements, error }` 兩個欄位;載入狀態由 `PanelProps.data.state` 直接判斷(無需 hook 重複封裝),錯誤狀態由 `PanelProps.data.errors[0]` 或 normalize 失敗訊息提供。

#### Scenario: Hook 取資料並 normalize

- **WHEN** Panel mount 並收到 `PanelProps.data.series` 含 JSON 欄位(Infinity datasource 預設形式)
- **THEN** `useGraphData` 的 `extractJsonFromFrames` 掃描所有 frame/field,挑出**看起來像 graph payload 的值**(物件含 `elements` 或同時含 `nodes`/`edges`,或可 `JSON.parse` 為此形狀的字串),套 `normalizeGraph`,回傳 `{ elements: [...], error: undefined }`;掃描 MUST 略過 `apiVersion`(字串)與 `clusters`(陣列)等非 graph 欄位,避免誤取

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
