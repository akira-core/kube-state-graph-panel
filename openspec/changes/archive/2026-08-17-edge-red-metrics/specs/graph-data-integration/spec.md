# graph-data-integration delta — edge-red-metrics

## MODIFIED Requirements

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

## ADDED Requirements

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
