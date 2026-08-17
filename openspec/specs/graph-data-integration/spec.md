# graph-data-integration Specification

## Purpose

TBD - created by archiving change scaffold-ksg-panel. Update Purpose after archive.
## Requirements
### Requirement: Datasource 整合策略

系統 SHALL 透過 Grafana Infinity datasource(`yesoreyeram-infinity-datasource`)消費 `kube-state-graph` 後端 API,Panel 不直接呼叫外部 HTTP URL,所有 API 流量走 Grafana datasource proxy。

#### Scenario: Panel 從 datasource 取得資料

- **WHEN** Panel 透過 Grafana 查詢機制執行 query
- **THEN** Infinity datasource 以設定的 baseURL + path 呼叫 `kube-state-graph` API,並把 response 以 Grafana `DataFrame` 形式傳給 panel

#### Scenario: Panel 不直接 fetch 外部 URL

- **WHEN** 進行 source code 掃描
- **THEN** `src/**` 內無任何直接呼叫 `fetch`、`axios`、`XMLHttpRequest` 連線到外部 backend 的程式碼;所有資料存取皆透過 Grafana runtime API

### Requirement: 上游 kube-state-graph payload 契約(cytoscape.js 形式)

上游 `kube-state-graph` 後端 `GET /v1/graph` 端點輸出 **cytoscape.js elements 形式**的 JSON,本 panel MUST 以此為唯一資料來源契約並依此 normalize。後端(design **D6**,commit `787573b`,取代舊 D31 `cluster > node > pod` 模型)現為**整個拓撲階層的唯一真實來源**。頂層形狀為:

```
{ apiVersion: string, clusters: string[], elements: { nodes: CyNode[], edges: CyEdge[] } }
```

每個 node / edge 皆以 cytoscape 慣例包在 `data` 物件中:

- `CyNode.data { id: string, name: string, type: string, parent?: string, ipaddress?: string[], owner?: { kind: string, name: string }, application?: string, containers?: Array<{ name: string; image: string }>, provisioner?: string, parameters?: Record<string,string>, labels: Record<string,string> }`
- `CyEdge.data { id: string, type: string, source: string, target: string, labels: Record<string,string>, metrics?: { rate: number, error_rate?: number, p90_server_ms?: number } }`

後端 node `type` 列舉(小寫):核心資源 `pod` / `node` / `pvc` / `service` / `storageclass` / `external`;**compound 群組節點** `cluster` / `namespace` / `application` / `controller`;以及實體網路 `switch`。`controller` 群組之 `type` 為字面值 `controller`(**非**小寫化的 workload Kind);其 Kind 僅存在於 id 路徑與子 pod 的 `owner.kind`。`storageclass` 自 D6 起為 cluster 下的**葉節點**(leaf,無子節點),帶 `provisioner`(string)與 `parameters`(`Record<string,string>`)兩個 omitempty 欄位;`node` 亦為 cluster 下的葉節點。未對應到具體 K8s 資源的端點歸入 `external`(契約無 `others` 類型)。

後端 edge `type` 列舉:`pod-to-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-storageclass`,以及實體網路 fabric `switch-to-switch` / `node-to-switch`。`pod-to-node`(pod→node)表達 pod 與其 K8s node 之關係(D6 起 pod-runs-on-node 不再以巢狀表達);`pvc-to-storageclass`(pvc→storageclass)連接 PVC 至其 StorageClass;`pod-calls-service`(pod→service)與 `service-selects-pod`(service→pod)為方向相反的一對。邊的視覺樣式(顏色/線型/箭頭)由 panel-rendering 規格定義。

**Edge `metrics`(RED)為 optional 且僅出現於 trace 衍生的邊**:後端在兩端皆解析為 `pod` 或 `service` 節點、且該邊由 `traces_service_graph_request_*` 序列產生時,才附上 `data.metrics`。實務上僅 `pod-calls-pod` 與 `pod-calls-service` 可能帶有;`service-selects-pod` / `pod-to-node` / `pod-mounts-pvc` / `pvc-to-storageclass` / fabric 邊、任一端為 `external` 的邊、以及後端合成的邊,MUST 視為**永不帶** `metrics`。三個欄位的契約為:

- `rate`:查詢視窗內的每秒請求數(**req/s**,非累計次數)。`metrics` 存在時此欄必定存在且 > 0。
- `error_rate`:失敗**比例**,值域 `[0,1]`(**非**百分比)。省略代表失敗計數器**讀取失敗**;`0` 代表**讀取成功且無失敗**——兩者語意不同,消費端 MUST NOT 把「省略」當作 `0`。
- `p90_server_ms`:server 端觀測之請求耗時 p90,單位**毫秒**。無可用 classic histogram(例如 native histogram / `vmrange`)時省略。

後端對所有數值以 **6 位有效數字**輸出,故值可能以指數表示法送達(例如 `3.86e-7`);panel MUST 依實際數值格式化,MUST NOT 假設其為小整數。`metrics` 缺席時該 key 完全不出現(非 `null`、非 0)。三個欄位皆 MUST NOT 出現在 `labels` map 中——`labels` 維持嚴格的 `Record<string,string>`。

`ipaddress` 為**陣列**(可能多個 IP 或空);僅 `pod` / `node` / `service` node 帶有,且 IP 資料已於上游 commit `524057b` 從 `labels`(原 `pod_ip` / `host_ip` / `external_ip`)移出,改置於此專屬欄位 —— panel MUST 從 `data.ipaddress` 取 IP,**不可**再從 `labels` 讀取。

**D6 parent 鏈(`data.parent`)**:`cluster > namespace > application > controller > pod`;`pvc` / `service` 直接 parent 至其 `namespace` 群組;`node` 與 `storageclass` 為 cluster 下的葉節點。`namespace` / `application` 群組 `labels:{}`、無 status、無邊,純為 `data.parent` 目標。

**Pod 控制器歸屬**:後端在 pod 節點上仍帶 `data.owner: { kind, name }`、`application:<string>` 與 `labels.node`(其 K8s node id),**即使該 pod 現以 `data.parent` 巢狀於其 `controller` 群組之下亦然**。後端現**直接輸出** `controller` / `namespace` / `application` 群組節點與 `pod-to-node` 邊——panel 不再自 `data.owner` 合成 controller 節點或 `controller-owns-pod` 邊(舊客戶端合成已移除)。一個 PVC 若無解析到的 StorageClass,後端**不**輸出對應的 `pvc-to-storageclass` 邊。

#### Scenario: 契約欄位以後端 golden fixture 為準

- **WHEN** 對 `normalizeGraph` 餵入後端 `internal/api/testdata/golden/with-storageclass-cytoscape.json` 的內容
- **THEN** 正確解析出對應數量的 nodes 與 edges,且 `service` node 的 `ipaddress: ["10.0.0.5"]` 被保留

#### Scenario: 後端 D6 階層原樣消費,pod 巢狀於 controller 仍保留 owner/application/labels.node

- **WHEN** 上游 pod node `data` 含 `owner: { kind: "StatefulSet", name: "mongo" }`、`application: "mongo"`、`labels.node: "prod/node-1"`,且其 `data.parent` 指向某 `controller` 群組
- **THEN** normalize 不再合成任何 controller 節點或 `controller-owns-pod` 邊,並保留該 pod 的 `owner` / `application` / `labels.node` 與其後端 `parent`

#### Scenario: 新增 pod-to-node 與 pvc-to-storageclass 邊

- **WHEN** 上游 edges 含 `type: 'pod-to-node'`(pod→node)與 `type: 'pvc-to-storageclass'`(pvc→storageclass)
- **THEN** 兩者皆被映射為對應 `edgeType`,不歸入未知類型 fallback

#### Scenario: 無 StorageClass 的 PVC 無 pvc-to-storageclass 邊

- **WHEN** 某 PVC 無解析到的 StorageClass(後端未輸出對應 `pvc-to-storageclass` 邊)
- **THEN** normalize 不為其產生任何 `pvc-to-storageclass` 邊

#### Scenario: RED metrics 契約以後端 golden fixture 為準

- **WHEN** 對 `normalizeGraph` 餵入後端 `internal/api/testdata/golden/with-red-metrics-cytoscape.json` 形狀的內容(同一 payload 內同時含 `metrics: { rate, error_rate, p90_server_ms }` 齊全的邊、僅 `{ rate, error_rate }` 的邊、以及完全無 `metrics` 的邊)
- **THEN** 三種邊皆被解析為 element,各自的 `metrics` 欄位分別為齊全、僅含存在的欄位、與不存在

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

`useGraphData` hook SHALL 對外公開 `{ elements, error, hasPayload }` 三個欄位;載入狀態由 `PanelProps.data.state` 直接判斷(無需 hook 重複封裝),錯誤狀態由 `PanelProps.data.errors[0]` 或 normalize 失敗訊息提供。`hasPayload` MUST 區分「frames 中完全沒有可辨識的 graph payload」(空 series、隱藏/未執行的查詢、所有字串候選皆無法解析 → `false`)與「payload 成功載入但正規化出零元素」(真正的空 graph → `true`):帶副作用的下游消費者(如 pod-list 變數匯出)據此避免把「沒拿到資料」當成「graph 是空的」。

#### Scenario: Hook 取資料並 normalize

- **WHEN** Panel mount 並收到 `PanelProps.data.series` 含 JSON 欄位(Infinity datasource 預設形式)
- **THEN** `useGraphData` 的 `extractJsonFromFrames` 掃描所有 frame/field,挑出**看起來像 graph payload 的值**(物件含 `elements` 或同時含 `nodes`/`edges`,或可 `JSON.parse` 為此形狀的字串),套 `normalizeGraph`,回傳 `{ elements: [...], error: undefined, hasPayload: true }`;掃描 MUST 略過 `apiVersion`(字串)與 `clusters`(陣列)等非 graph 欄位,避免誤取

#### Scenario: Hook 在 normalize 失敗時公開 error

- **WHEN** `normalizeGraph` 回傳含 errors 的結果(payload 形狀錯誤)
- **THEN** `useGraphData` 回傳 `{ elements: [], error: '<first error message>', hasPayload: true }`

#### Scenario: 無 payload 與空 graph 可區分

- **WHEN** `data.series` 為空陣列(隱藏/未執行的查詢),或所有候選字串皆無法解析
- **THEN** `useGraphData` 回傳 `hasPayload: false`;而收到 `{ nodes: [], edges: [] }` 的合法空 payload 時回傳 `hasPayload: true`

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

### Requirement: StorageClass compound 容器之正規化(真 NodeKind + 容器旗標)

自後端 design **D6** 起,`storageclass` 不再是包住 PVC 的 compound 群組,而是 cluster 下的**普通葉節點**(leaf)。`normalizeGraph` SHALL 將 `data.type === 'storageclass'` 的上游節點正規化為 `kind: 'storageclass'` 的葉節點,**不**再賦予 `isStorageClass` 旗標(該旗標連同 `NodeIdentity` union 成員、`parseNodes` 區域變數與 alerts-suppression 項一併移除),其 `parent`(指向 cluster 容器)原樣穿透。後端不送 `status`,故省略 `status`。系統 MUST 於 `provisioner` 為非空字串時透傳 `provisioner`(string),於 `parameters` 通過既有 `isStringRecord` guard(`Record<string,string>`)時透傳 `parameters`;兩者皆為 omitempty——被引用但未定義的 storageclass 可不帶任何欄位(bare storageclass)。`storageclass` 已是帶 icon 且歸於 `Storage` category 的 `NodeKind`,故於 `NodeLegend` 自動呈現;且為**可選取**(selectable)的 detail-eligible 葉節點。

#### Scenario: storageclass 正規化為葉節點並透傳 provisioner / parameters

- **WHEN** 上游節點 `data.type === 'storageclass'`(`parent` 指向其 cluster 容器)帶 `provisioner: "rook-ceph.rbd.csi.ceph.com"` 與 `parameters: { pool: "kube", fs: "ext4" }`
- **THEN** normalize 賦予 `kind: 'storageclass'`,**不**帶 `isStorageClass`、**不**帶 `status`,並透傳 `provisioner: "rook-ceph.rbd.csi.ceph.com"` 與 `parameters: { pool: "kube", fs: "ext4" }`,其 `parent` 與 `label`(= `name`)原樣保留

#### Scenario: bare storageclass(無 provisioner / parameters)

- **WHEN** 上游 storageclass 節點無 `provisioner` 亦無 `parameters`(被引用但未定義)
- **THEN** normalize 產出 `kind: 'storageclass'` 葉節點,MUST NOT 帶 `provisioner` 與 `parameters`(`exactOptionalPropertyTypes`:不寫 `undefined` 值)

#### Scenario: parameters 形狀不符時丟棄

- **WHEN** 上游 storageclass 的 `parameters` 未通過 `isStringRecord`(非 `Record<string,string>`)
- **THEN** normalize 省略 `parameters` 欄,其餘欄位正常正規化

### Requirement: 告警 (alerts) 正規化與 time_records 解析

`normalizeGraph` SHALL 在 anti-corruption boundary(`parseAlerts`)將上游 leaf node 的選用欄位 `alerts`(陣列)正規化為 panel 內部 `NodeAlert[]`,並以 `timeRecords: number[]` 承載同一 alert 的**所有發生時間**(取代既有的單一 `time` scalar)。規則:

- 每筆 alert MUST 至少帶非空 `name` 與非空 `severity`(自由字串),否則丟棄。
- 發生時間自上游 wire 欄位 `time_records`(數字陣列)取得:MUST 僅保留有限(`Number.isFinite`)且 ≥ 0 的值,並**升序排序**後存為 `timeRecords`。
- **相容舊後端**:缺 `time_records`(或其元素全部無效)時,MUST 退讀 legacy scalar 欄位 `time`(Unix 秒,須有限且 ≥ 0)→ `timeRecords: [time]`。
- 經上述過濾後 `timeRecords` 仍為空的 alert MUST 丟棄(沿用 partial-parse 契約,不拋例外)。
- `pod` / `service` / `id` 為選用字串,缺值則省略。
- 分組容器(`cluster` / `namespace` / `application` / `controller`)MUST NOT 攜帶自身 `alerts`(即使上游帶亦丟棄;controller 的 alerts 改由 enrichment 自子 pod 聚合——見「controller 告警(alerts)自子 pod 聚合」)。

下游(`AlertTable`)由 `timeRecords` 衍生:Count = `timeRecords.length`、Last occurred = `max(timeRecords)`(因升序故為末元素),不另存欄位。

#### Scenario: time_records 解析為升序 timeRecords

- **WHEN** 上游 node `alerts` 含 `{ name: 'HighMem', severity: 'critical', time_records: [1717500300, 1717500000] }`
- **THEN** 產出 `NodeAlert.timeRecords` 為 `[1717500000, 1717500300]`(升序);其 Count 衍生為 `2`、last occurred 衍生為 `1717500300`

#### Scenario: 相容 legacy scalar time

- **WHEN** 上游 alert 僅帶 `time: 1717500000`(無 `time_records`)
- **THEN** 產出 `timeRecords: [1717500000]`(等價單次發生),不報錯

#### Scenario: 過濾非有限 / 負值發生時間

- **WHEN** 上游 alert `time_records: [1717500000, -5, NaN, 1717500300]`
- **THEN** 產出 `timeRecords: [1717500000, 1717500300]`(濾掉 `-5` 與 `NaN`,升序)

#### Scenario: 丟棄無有效發生時間的 alert

- **WHEN** 上游 alert 的 `time_records` 為 `[]` 或元素全部非有限 / 負值,且無有效 scalar `time`
- **THEN** 該 alert 被丟棄,不出現於 `data.alerts`;同節點其餘合法 alert 不受影響

#### Scenario: 缺 name / severity 的 alert 丟棄

- **WHEN** 上游 alert 缺 `name` 或 `severity` 為空字串
- **THEN** 該 alert 被丟棄(即使 `time_records` 有效),其餘合法 alert 正常解析

#### Scenario: 分組容器不帶 alerts

- **WHEN** 上游 `cluster` 或 `storageclass` 節點帶 `alerts`
- **THEN** 正規化結果該節點 MUST NOT 有 `data.alerts`

### Requirement: pod / service / pvc `application`、pod `containers` 透傳與 controller 聚合

`normalizeGraph` SHALL 於 anti-corruption boundary 承載 backend 在 pod 節點輸出的兩個欄位——**`application?: string`**(ArgoCD application name)與 **`containers?: Array<{ name: string; image: string }>`**(container 與其 image)——並為 backend **直接輸出**的 `controller` 群組節點自子 pod 聚合兩者。自 backend D6 起,**service 與 pvc leaf 亦可帶 `application`**(backend 自其 annotation tracking-id 解析,並將該 leaf nest 於對應 application 群組);`normalizeGraph` MUST 以與 pod 相同規則透傳該欄。controller 不再由 panel 合成,改為 **enrich**(豐富化)後端送來的 `type: "controller"` 群組節點。兩欄位經 `src/shared/types/cytoscape.d.ts` declaration merging 宣告於 `NodeDataDefinition`,供 node-detail 面板顯示與 URL 查詢使用。URL 查詢本身**非** normalize 職責——它是 UI 端的非同步動作,經 Grafana runtime 發出(見 panel-rendering「Node Detail Application 與 Containers 區塊」)。規則:

- **pod `application`**:backend 值為非空字串時原樣透傳;缺失或空字串時 MUST 省略該欄(`exactOptionalPropertyTypes`:不寫 `undefined` 值)。
- **service / pvc `application`**(backend D6):service 與 pvc leaf 帶 backend 解析的 ArgoCD `application` 時,MUST 以**與 pod `application` 完全相同**的規則透傳(非空字串保留、缺失或空字串省略)。`containers` 與 typed `owner` 仍**僅限 pod**——service / pvc 即使 backend 誤送這兩欄,normalize MUST NOT 帶上。
- **pod `containers`**:逐項驗證——`name` 與 `image` 皆為非空字串的項目保留,形狀不符的項目 MUST 丟棄(anti-corruption);驗證後為空陣列或欄位缺失時 MUST 省略該欄。
- **controller `kind`**:後端 `controller` 群組之 `type` 為字面值 `controller`、不帶 `kind`;normalize MUST 自其**任一子 pod**(`pod.parent === controllerId`)的 `owner.kind` **小寫化**推導出 controller 的 `kind`(如 `StatefulSet` → `statefulset`),並標 `isController: true`,使 controller 成為 Workloads kind 並保留 detail 面板。
- **controller `application`**(enrich,backend 不送):MUST 自其**子 pod**(`pod.parent === controllerId`)的 `application` 聚合——取任一帶值的子 pod(以穩定排序確定性選取**首個**);無任何子 pod 帶值時 MUST 省略該欄。
- **controller `containers`**:MUST 自其**所有子 pod** 的 `containers` 聯集聚合,以 **(name, image)** 去重、穩定排序;無任何子 pod 帶 containers 時 MUST 省略該欄。
- 解析 / 聚合 MUST 為純函式、確定性、immutable(產生新元素,不就地修改輸入)。
- 兩欄位 MUST NOT 影響 `worstStatus` 彙整或 alerts 聚合。
- 舊版 backend(不送這兩欄位)MUST 完全不受影響——產出與現行相同,無錯誤、無多餘欄位。

#### Scenario: pod application 原樣透傳

- **WHEN** backend 某 pod 節點 `data.application` 為 `"checkout"`
- **THEN** 正規化後該 pod element 之 `data.application` 為 `"checkout"`

#### Scenario: service / pvc application 原樣透傳(backend D6)

- **WHEN** backend 某 service 或 pvc 節點 `data.application` 為 `"mongodb"`
- **THEN** 正規化後該 element 之 `data.application` 為 `"mongodb"`;且該 leaf MUST NOT 因此帶 `data.containers` 或 `data.owner`(僅限 pod)

#### Scenario: 欄位缺失或空值時省略

- **WHEN** backend 某 pod 節點無 `application`(或為空字串)且無 `containers`(或驗證後為空)
- **THEN** 該 pod element MUST NOT 帶 `data.application` 與 `data.containers`

#### Scenario: pod containers 原樣透傳

- **WHEN** backend 某 pod 節點 `data.containers` 為 `[{ name: "app", image: "repo/app:1.2" }]`
- **THEN** 正規化後該 pod element 之 `data.containers` 等值保留

#### Scenario: 形狀不符的 container 項目被丟棄

- **WHEN** backend 某 pod 的 `containers` 為 `[{ name: "app", image: "repo/app:1.2" }, { name: "", image: "x" }, { name: "noimg" }]`
- **THEN** 正規化後僅保留 `{ name: "app", image: "repo/app:1.2" }`

#### Scenario: controller kind 自子 pod owner.kind 推導

- **WHEN** backend `controller` 群組(`type: "controller"`,無 `kind`)旗下某子 pod 帶 `owner: { kind: "StatefulSet", name: "mongo" }`
- **THEN** enrich 後該 controller 節點 `data.kind` 為 `'statefulset'`(小寫化)且 `data.isController === true`

#### Scenario: controller 自子 pod 聚合 application

- **WHEN** 某 backend `controller` 群組旗下有子 pod 帶 `data.application: "mongo"`
- **THEN** enrich 後該 controller 節點 `data.application` 為 `"mongo"`(controller 本身 backend 不送此欄)

#### Scenario: controller 聚合 containers 並以 (name, image) 去重

- **WHEN** 某 controller 旗下三個子 pod 皆帶 `containers: [{ name: "app", image: "repo/app:1.2" }]`,其中一個另帶 `{ name: "sidecar", image: "repo/sc:0.9" }`
- **THEN** enrich 後該 controller 節點 `data.containers` 為兩項:`app`/`repo/app:1.2` 與 `sidecar`/`repo/sc:0.9`(去重後、穩定排序)

#### Scenario: controller 無子 pod 帶值時省略

- **WHEN** 某 controller 旗下無任一子 pod 帶 `application` 或 `containers`
- **THEN** enrich 後該 controller 節點 MUST NOT 帶 `data.application` 與 `data.containers`

#### Scenario: 聚合為純函式且確定性

- **WHEN** 以相同 input 多次呼叫 `normalizeGraph`,且某 controller 有多個子 pod 帶不同 `application` 值
- **THEN** 每次選取的 `data.application` 一致(穩定排序確定性選取),且輸入未被就地修改

#### Scenario: 舊版 backend 不受影響

- **WHEN** backend 回應的 pod 節點皆不含 `application` / `containers` 欄位
- **THEN** `normalizeGraph` 產出無相關欄位,`errors` 不含相關錯誤

### Requirement: controller 告警(alerts)自子 pod 聚合

`normalizeGraph` SHALL 於 **enrich** backend 直接輸出的 `controller` 群組節點時,自其**子 pod**(`pod.parent === controllerId`)的 `data.alerts` 聚合出該 controller 的 `data.alerts`(`NodeAlert[]`),使 node-detail 面板的告警表格對 controller 顯示旗下所有 pod 的告警。聚合僅及於 backend `controller` 群組(enrich 後 `isController === true`);k8s `node` 容器與其他 backend 實體節點不在此列。規則:

- **順序**:以子 pod 的穩定排序(podId 升冪)串接各 pod 的 alerts,pod 內保持解析後順序——對相同輸入確定性。
- **pod 歸屬**:聚合項目缺 `pod` 欄時 MUST 以來源 pod 的 label 回填;已帶 `pod` 的項目 MUST 保留原值。回填 MUST 作用於新物件——來源 pod 元素自身的 `alerts` MUST NOT 被修改。
- **去重**:帶 `id` 的項目 MUST 跨 pod 以 `id` 去重(穩定順序下首見者勝);無 `id` 的項目一律保留。
- **省略**:無任一子 pod 帶 alerts 時,controller MUST NOT 帶 `alerts` 欄(不寫 `undefined` 值)。
- **顏色不受影響**:此聚合 MUST NOT 改變 `worstStatus` 彙整(**status 仍為唯一節點上色來源**;alerts 不參與 stylesheet)。

#### Scenario: controller 聚合子 pod 告警

- **WHEN** 某 backend `controller` 群組旗下兩個 pod(`pod.parent === controllerId`)各帶一筆 alert(`HighMem` / `CrashLoop`)
- **THEN** enrich 後該 controller 節點 `data.alerts` 含兩筆(podId 升冪串接),node-detail 告警表格對該 controller 顯示兩列

#### Scenario: 缺 pod 欄的告警以來源 pod 回填

- **WHEN** 子 pod(label `mongo-0`)的 alert 不帶 `pod` 欄
- **THEN** controller 上的聚合副本 `pod` 為 `"mongo-0"`;該 pod 自身元素的 alert 仍不帶 `pod` 欄(輸入與 pod 元素未被修改)

#### Scenario: 帶 id 的告警跨 pod 去重

- **WHEN** 兩個子 pod 各帶 `id: "alert-1"` 的同一筆 alert
- **THEN** controller 的 `data.alerts` 僅含一筆 `id: "alert-1"`(穩定順序首見者)

#### Scenario: 無子 pod 帶告警時省略

- **WHEN** 某 controller 旗下無任一子 pod 帶 `alerts`
- **THEN** enrich 後該 controller 節點 MUST NOT 帶 `data.alerts`(告警表格顯示「No alerts」)

#### Scenario: 告警聚合不影響 status 上色

- **WHEN** 某 controller 旗下唯一 pod `status: normal` 但帶一筆 `severity: 'critical'` 的 alert
- **THEN** controller 的 `data.alerts` 含該筆 alert,但 `worstStatus` 仍為 `normal`(alert 不升級 status——顏色仍由 status 決定)

### Requirement: Backend 群組節點識別(namespace / application / controller)與著色

`normalizeGraph` SHALL 辨識 backend 直接輸出的三種 compound 群組節點(`data.type` 為 `namespace` / `application` / `controller`),比照既有 `cluster` flag-group 正規化為**裝飾性 compound parent**——除 `controller` 外**不**賦予 `kind`(故對 kind filter 與 icon legend 不可見,並由 `computeVisibility` 略過:無 kind ⇒ 恆可見,僅受 orphan cascade 影響)。其 `data.parent` 一律**原樣穿透**(panel 結構無關,僅指派 accent 顏色)。**可選取性由 panel-rendering「互動與選取狀態」規範**:`namespace` / `application` 群組與 `controller` 皆維持可選取(selection-driven 摺疊 cue 賴此浮現;`namespace` 選取不開啟 detail 面板、`application` 為 detail-eligible 例外),僅 `cluster` 群組為 `selectable: false`——normalize MUST NOT 對 `namespace` / `application` / `controller` 設 `selectable: false`,否則 canvas 的 tap 守門(`single.selectable()`)會丟棄其點擊,摺疊 cue 永不浮現、controller / application 的 detail 面板永不開啟。映射:

- `namespace` → `{ isNamespace, namespace: <label>, namespaceColor }`——**重用**既有 `isNamespace` 旗標、stylesheet selector 與 `NamespaceLegend`;accent 色為 per-kind 固定色(見 panel-rendering「裝飾性 compound 群組使用 per-kind 固定色彩與 kind 前綴標籤」)。
- `application` → `{ isApplication, application: <label>, applicationColor }`——**新增** `isApplication` 旗標、`applicationPalette.ts`、stylesheet selector 與 `ApplicationLegend`;accent 色同為 per-kind 固定色。
- `controller` → `{ isController: true, kind: <子 pod owner.kind 小寫> }`(見「pod / service / pvc `application`、pod `containers` 透傳與 controller 聚合」):controller 攜帶 real `kind` 以保留 detail 面板,既是 compound parent 又有 glyph(收合時畫該 kind icon)。

`namespace` / `application` 群組 `labels:{}`、無 status、無邊,純為 `data.parent` 目標。

對裝飾性群組(`cluster` / `namespace` / `application`),`normalizeGraph` MUST 將 `data.label` 設為上游裸名稱(`data.name`,或缺則 id),**MUST NOT** 寫入 kind 前綴(`Cluster:` / `Namespace:` / `Release Unit:`)。畫布上的前綴標籤由 stylesheet render-only mapper 負責(見 panel-rendering);裸 `data.label` 供 tooltip title 與其他 identity 消費端使用。

#### Scenario: namespace 群組正規化並著色

- **WHEN** 上游節點 `data.type === 'namespace'`、`name === 'shop'`、`parent` 指向其 cluster 容器
- **THEN** normalize 產出 `isNamespace: true`、`namespace: 'shop'`、`label: 'shop'`(裸名,無 `Namespace:` 前綴)、`namespaceColor` 為 per-kind 固定 accent 色,**不**帶 `kind`、**不**設 `selectable: false`(維持可選取,cue-driven——見 panel-rendering「互動與選取狀態」),且 `parent` 原樣穿透

#### Scenario: application 群組正規化並著色

- **WHEN** 上游節點 `data.type === 'application'`、`name === 'checkout'`、`parent` 指向其 namespace 群組
- **THEN** normalize 產出 `isApplication: true`、`application: 'checkout'`、`label: 'checkout'`(裸名,無 `Release Unit:` 前綴)、`applicationColor` 為 per-kind 固定 accent 色,**不**帶 `kind`、**不**設 `selectable: false`(維持可選取;application 為 detail-eligible——見 panel-rendering),且 `parent` 原樣穿透

#### Scenario: cluster 群組正規化為裸 label

- **WHEN** 上游節點 `data.type === 'cluster'`、`name === 'prod'`
- **THEN** normalize 產出 `isCluster: true`、`cluster: 'prod'`、`label: 'prod'`(裸名,無 `Cluster:` 前綴)、`clusterColor` 為 per-kind 固定 accent 色,且 `selectable: false`

#### Scenario: controller 群組標 isController 並由子 pod 取得 kind(維持可選取)

- **WHEN** 上游節點 `data.type === 'controller'`(無 `kind`),其旗下子 pod `owner.kind === 'StatefulSet'`
- **THEN** normalize 產出 `isController: true`、`kind: 'statefulset'`,`parent` 原樣穿透,且 **MUST NOT** 設 `selectable: false`(controller 為 detail-eligible,須維持可選取以開啟 detail 面板)

#### Scenario: 無 kind 的群組對 kind filter / icon legend 不可見

- **WHEN** 對 `namespace` / `application` 群組執行 `computeVisibility` 與 icon legend 推導
- **THEN** 兩者皆因無 `kind` 被 `computeVisibility` 略過(恆可見,僅受 orphan cascade 影響),亦不出現於 icon legend

### Requirement: Node worstStatus 依 pod-to-node 邊聚合

自 design **D6** 起 pod 不再巢狀於 k8s `node` 之下(`pod-runs-on-node` 改以 `pod-to-node` 邊表達),故 `controller` 視圖中 node 的收合邊框顏色無法再自子節點計算。`normalizeGraph` SHALL 將每個 `node` 的 `data.worstStatus` 重算為:**經 `pod-to-node` 邊連結的 pod 之中最差 status**(worst-wins,並納入 node 自身 status;排序 critical > warning > normal;status 取自 pod 的 `data.status`,缺值 / 不合法預設 `normal`)。於**有 status 資訊**時寫入(node 自身帶合法 status,或至少有一條 `pod-to-node` 邊連到的 pod);自身無 status 且無任何連結 pod 時 MUST 省略此欄(「無資訊」不得偽裝成 `normal`)。此欄供 getStylesheet 對**收合的** node 邊框上色(見 panel-rendering 規格)。`node` 視圖中 pod 重新巢狀於 node 之下,既有以子節點計算的 worstStatus 亦成立。

#### Scenario: node worstStatus 取 pod-to-node 連結 pod 之最差

- **WHEN** 某 `node`(自身 `status: normal`)經 `pod-to-node` 邊連到兩個 pod,分別 `status: warning` 與 `status: critical`
- **THEN** 該 node `data.worstStatus` 為 `critical`(critical > warning)

#### Scenario: node 自身 status 不被連結 pod 降級

- **WHEN** 某 `node` 自身 `status: critical`,其經 `pod-to-node` 連到的 pod 皆 `normal`
- **THEN** 該 node `data.worstStatus` 為 `critical`(worst-wins,不被子節點降級)

#### Scenario: 無 status 資訊時省略 worstStatus

- **WHEN** 某 `node` 自身無 `status` 且無任何 `pod-to-node` 邊連結的 pod
- **THEN** 該 node MUST 省略 `worstStatus`(無 status 資訊)

### Requirement: Edge RED metrics 正規化與逐欄降級

`normalizeGraph` MUST 把上游 edge 的 `data.metrics` 以**同名同單位**帶到產出的 cytoscape edge `data.metrics`(`rate` / `errorRate` / `p90ServerMs`,其中後兩者為 optional),並在 `src/shared/types/cytoscape.d.ts` 以 declaration merging 定義其型別。此為**純透傳 + 驗證**:panel MUST NOT 在此層做單位換算、百分比換算、四捨五入或補值——顯示層才負責格式化。

驗證與降級規則(RED 為附加資訊層,**任何 RED 問題皆 MUST NOT 使該邊消失**):

- `metrics` 非 plain object → 整個 `metrics` 丟棄,邊照常產出。
- `rate` 缺失、非 `number`、或非有限值(`NaN` / `±Infinity`) → 整個 `metrics` 丟棄(`rate` 是 RED 的必要欄位),邊照常產出。
- `error_rate` / `p90_server_ms` 存在但非 `number` 或非有限值 → **僅丟棄該欄**,其餘 `metrics` 保留。
- 上游未送出的 optional 欄位 MUST 維持不存在(**不得**補 `0`、`null` 或任何 placeholder)。
- 數值 MUST 原樣保留,含指數表示法之極小值(例如 `3.86e-7`)與 `0`。

RED 的驗證失敗 MUST NOT 寫入 `normalizeGraph` 的 `errors` 陣列(該通道用於會影響拓撲正確性的 partial-parse 警示;RED 缺損不影響拓撲,寫入只會讓警示橫幅噪音化)。

#### Scenario: 合法 metrics 原樣帶入 edge data

- **WHEN** 上游 edge `data` 為 `{ id, source, target, type: 'pod-calls-service', labels: {}, metrics: { rate: 5, error_rate: 0.2, p90_server_ms: 45 } }`(兩端節點皆存在)
- **THEN** 產出的 edge element `data.metrics` 為 `{ rate: 5, errorRate: 0.2, p90ServerMs: 45 }`,數值未經換算或四捨五入

#### Scenario: 無 metrics 的邊不產生該欄位

- **WHEN** 上游 edge `data` 無 `metrics` key(例如 `pod-mounts-pvc` 邊)
- **THEN** 產出的 edge element `data` 亦無 `metrics` key(非 `undefined` 明寫、非空物件)

#### Scenario: error_rate 省略與 0 為不同狀態

- **WHEN** 上游一邊為 `metrics: { rate: 3 }`(無 `error_rate`),另一邊為 `metrics: { rate: 1, error_rate: 0 }`
- **THEN** 前者產出的 `data.metrics` 無 `errorRate` key;後者為 `errorRate: 0`

#### Scenario: 單一非法欄位不牽連其餘 metrics

- **WHEN** 上游 edge `metrics` 為 `{ rate: 5, error_rate: 'high', p90_server_ms: 45 }`
- **THEN** 產出的 `data.metrics` 為 `{ rate: 5, p90ServerMs: 45 }`(丟棄 `errorRate`),邊本身照常產出

#### Scenario: rate 不可用時丟棄整個 metrics 但保留邊

- **WHEN** 上游 edge `metrics` 為 `{ error_rate: 0.1, p90_server_ms: 45 }`(缺 `rate`),或 `{ rate: null, ... }`,或 `metrics` 為字串
- **THEN** 產出的 edge element 無 `metrics` key,但該 edge element 仍存在於 elements 中且 `edgeType` / `labels` 不受影響

#### Scenario: 極小值以指數表示法原樣保留

- **WHEN** 上游 edge `metrics` 為 `{ rate: 3.86e-7, error_rate: 6.7e-8 }`
- **THEN** 產出的 `data.metrics.rate` 嚴格等於 `3.86e-7`、`data.metrics.errorRate` 嚴格等於 `6.7e-8`(未被截為 `0`)

#### Scenario: RED 缺損不進入 errors 通道

- **WHEN** 上游 payload 中有邊帶著非法 `metrics`(如上述各種形式)
- **THEN** `normalizeGraph` 回傳的 `errors` 陣列 MUST NOT 因此新增任何項目

