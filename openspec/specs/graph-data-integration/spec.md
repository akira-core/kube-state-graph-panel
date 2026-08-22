# graph-data-integration Specification

## Purpose

TBD - created by archiving change scaffold-ksg-panel. Update Purpose after archive.
## Requirements

### Requirement: Datasource integration strategy

The panel SHALL consume its graph through the Grafana Infinity datasource
(`yesoreyeram-infinity-datasource`) and SHALL NOT issue HTTP requests of its own. All data
reaches the panel as Grafana `DataFrame`s through the standard query mechanism.

Infinity's `inline` source and its `url` source are **indistinguishable to the panel**:
`useGraphData` receives a `PanelData` either way and `normalizeGraph` validates the same
payload shape. This repository provisions only an `inline` target — see the dev-environment
capability — but nothing in `src/**` knows or may assume that. A deployment binding the same
panel to a `url` target pointed at a real kube-state-graph server MUST work unchanged.

#### Scenario: The panel reads from the datasource, whatever its source

- **WHEN** the panel executes a query through the Grafana query mechanism
- **THEN** Infinity supplies the response as a `DataFrame`, and the panel's parsing path is the same for an `inline` target and a `url` target

#### Scenario: No direct network access from panel source

- **WHEN** scanning the source
- **THEN** `src/**` contains no `fetch`, `axios`, or `XMLHttpRequest` call to any backend; every data access goes through the Grafana runtime API

### Requirement: Upstream kube-state-graph payload contract (cytoscape.js shape)

The upstream `kube-state-graph` backend's `GET /v1/graph` endpoint emits JSON in **cytoscape.js elements shape**, and this panel MUST treat it as the sole data-source contract and normalize accordingly. The backend (design **D6**, commit `787573b`, replacing the old D31 `cluster > node > pod` model) is now the **single source of truth for the entire topology hierarchy**. The top-level shape is:

```
{ apiVersion: string, clusters: string[], elements: { nodes: CyNode[], edges: CyEdge[] } }
```

Each node and edge is wrapped in a `data` object per cytoscape convention:

- `CyNode.data { id: string, name: string, type: string, parent?: string, ipaddress?: string[], owner?: { kind: string, name: string }, application?: string, containers?: Array<{ name: string; image: string }>, storageclass?: string, health?: string, usage?: { used_bytes?: number, capacity_bytes?: number }, labels: Record<string,string> }`
- `CyEdge.data { id: string, type: string, source: string, target: string, labels: Record<string,string>, metrics?: EdgeMetricsUnion }`

The backend's node `type` enum (lowercase): the core resources `pod` / `node` / `pvc` / `service` / `external`; **physical storage** `netapp-aggr` / `netapp-node`; the **compound group nodes** `cluster` / `storage-cluster` / `namespace` / `application` / `controller`; and physical networking `switch`. A `controller` group's `type` is the literal string `controller` (**not** a lowercased workload Kind); its Kind lives only in the id path and in its child pods' `owner.kind`. A `node` is a leaf under its cluster. An endpoint that maps to no concrete K8s resource becomes `external` (the contract has no `others` type). `storageclass` **has been removed from the contract** — the backend no longer emits that node type, and a claim's StorageClass name now rides on the PVC's own `data.storageclass` (string, omitempty).

**The NetApp storage chain.** `netapp-aggr` (an ONTAP aggregate, id `netapp/<ontap-cluster>/aggr/<aggr>`) is the physical unit a PVC actually lands on, and its `labels` are exactly `{ontap_cluster, node}` (`node` = the controller currently owning the aggregate); `netapp-node` (an ONTAP controller, id `netapp/<ontap-cluster>/<node>`) has `labels` of exactly `{ontap_cluster}`. Neither carries a `cluster` label (they belong to no K8s cluster and never appear in the top-level `clusters[]`), so the panel's cluster accent and cluster filtering do not apply to them. Both may carry `health` (exactly `"online"` or `"degraded"`, omitempty); `netapp-aggr` may additionally carry `usage`. **An absent `health` is not the same as `"degraded"`** — absence means the backend has no status data for it, and consumers MUST NOT read absence as `"degraded"`.

**The `usage` field** has the shape `{ used_bytes?: number, capacity_bytes?: number }` (bytes, JSON numbers) and appears on both `pvc` (from kubelet volume stats) and `netapp-aggr` (from Harvest aggregate space) with an **identical shape**. The object itself appears when at least one field resolved; a field that did not resolve is simply absent (never filled with `0`).

The backend's edge `type` enum: `pod-to-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-netapp-aggr`, plus the physical-network fabric edges `switch-to-switch` / `node-to-switch`. `pod-to-node` (pod→node) expresses a pod's relationship to its K8s node (since D6, pod-runs-on-node is no longer expressed as nesting); `pvc-to-netapp-aggr` (pvc→netapp-aggr) connects a PVC to the ONTAP aggregate holding its FlexVol (replacing the removed `pvc-to-storageclass`); `pod-calls-service` (pod→service) and `service-selects-pod` (service→pod) are a pair pointing in opposite directions. Edge visuals (colour, line style, arrowheads) are defined by the panel-rendering spec.

**Edge `metrics` is a union of two mutually exclusive families.** A single edge carries one family or the other, never a mixture:

1. **The RED family** (trace-derived edges): attached when the backend resolved both endpoints to a `pod` or `service` node and the edge came from `traces_service_graph_request_*` series. In practice only `pod-calls-pod` and `pod-calls-service` can carry it. Its fields are `rate` / `error_rate` / `p90_server_ms`.
2. **The I/O family** (`pvc-to-netapp-aggr` edges only): six **measurement** fields — `read_ops` / `write_ops` / `read_latency_us` / `write_latency_us` / `read_bytes_per_sec` / `write_bytes_per_sec` — plus two **declared-ceiling** fields, `max_iops` / `max_bytes_per_sec`. All eight are **independently** optional (each corresponds to its own Harvest series family, and a missing family costs only its own field). ops are per-second counts, latency is an average in microseconds, and throughput is bytes per second — all values the backend passes through verbatim.

   The measurement fields and the ceiling fields come from **two different hops** of the backend's NetApp join and degrade independently: the six measurements come from the Harvest QoS workload families (hop B), while the two ceilings come from the QoS fixed-policy families (hop C), joined to an already-matched workload series on the `(ontap_cluster, svm, policy_group)` triple. The backend therefore guarantees that **a ceiling field can never appear without at least one measurement field** — the panel MAY rely on that invariant, but MUST NOT assume the converse: a measured volume that belongs to no QoS policy group carries no ceiling at all, and that is a normal state, not an error.

The `service-selects-pod` / `pod-to-node` / `pod-mounts-pvc` / fabric edges, any edge with an `external` endpoint, and every backend-synthesised edge MUST be treated as **never carrying** `metrics`. The per-field contract is:

- `rate`: requests per second over the query window (**req/s**, not a cumulative count). **When the RED family is present** this field is always present and > 0; but because `metrics` is now a union, consumers MUST NOT assume `rate` exists on an arbitrary `metrics` object (the I/O family never has it).
- `error_rate`: the failure **ratio**, in `[0,1]` (**not** a percentage). Absence means the failure counter **could not be read**; `0` means **it was read successfully and there were no failures** — two different states, and consumers MUST NOT treat absence as `0`.
- `p90_server_ms`: the p90 request duration observed server-side, in **milliseconds**. Absent when no classic histogram is available (for example a native histogram or `vmrange`).
- `read_ops` / `write_ops`: reads and writes per second.
- `read_latency_us` / `write_latency_us`: average read and write latency, in **microseconds** (µs).
- `read_bytes_per_sec` / `write_bytes_per_sec`: read and write throughput, in **bytes per second** (decimal). **Not** a cumulative byte count, and not KB or MB.
- `max_iops`: the IOPS ceiling declared by the QoS policy group the volume belongs to (operations per second), passed through verbatim by the backend.
- `max_bytes_per_sec`: the throughput ceiling declared by that same policy group, in **bytes per second**. This is the **one field the backend converts** (from Harvest's megabytes-per-second figure, multiplied by `1048576`), precisely so it carries the same unit as `read_bytes_per_sec` / `write_bytes_per_sec` and the two compare directly. The panel MUST NOT apply any further unit conversion.
- **Absence semantics for both ceiling fields**: absence means the volume has **no declared ceiling** (it belongs to no QoS policy group, or that policy does not set this dimension). It MUST NOT be rendered as `0`, MUST NOT be rendered as an `∞` / `unlimited` sentinel, and MUST NOT be used to derive a utilisation percentage — an absent ceiling renders no row at all.

The backend emits every number at **6 significant digits**, so values may arrive in exponent form (for example `3.86e-7`); the panel MUST format from the actual value and MUST NOT assume small integers. When `metrics` is absent the key does not appear at all (not `null`, not `0`). None of these numeric fields may appear in the `labels` map — `labels` stays a strict `Record<string,string>`.

`ipaddress` is an **array** (possibly several IPs, possibly empty), carried only by `pod` / `node` / `service` nodes. Upstream commit `524057b` moved IP data out of `labels` (formerly `pod_ip` / `host_ip` / `external_ip`) into this dedicated field, so the panel MUST read IPs from `data.ipaddress` and **MUST NOT** read them from `labels`.

**The D6 parent chain (`data.parent`).** The workload chain is `cluster > namespace > application > controller > pod`; `pvc` / `service` parent directly onto their `namespace` group; `node` is a leaf under its cluster. **The storage chain is `storage-cluster > netapp-node > netapp-aggr`** — and its middle tier, `netapp-node`, is a **real node** (it has a kind, an icon, and is selectable) rather than a decorative group. This is the one place in the contract where a real node acts as a compound parent, and the panel MUST build the nesting verbatim from `data.parent` rather than re-expressing it as an edge because the parent happens to be a real kind. The `namespace` / `application` / `storage-cluster` groups have `labels: {}`, no status, and no edges; they exist purely as `data.parent` targets.

**Pod controller attribution.** The backend still carries `data.owner: { kind, name }`, `application: <string>`, and `labels.node` (its K8s node id) on the pod node **even though that pod is now nested under its `controller` group via `data.parent`**. The backend now **emits directly** the `controller` / `namespace` / `application` group nodes and the `pod-to-node` edge — the panel no longer synthesises a controller node or a `controller-owns-pod` edge from `data.owner` (that client-side synthesis has been removed). A PVC that did not join a NetApp aggregate (no `volumename`, no matching Harvest series, or a matched series with an empty `aggr`) gets **no** `pvc-to-netapp-aggr` edge from the backend.

#### Scenario: Contract fields anchored on the backend golden fixture

- **WHEN** `normalizeGraph` is fed the contents of the backend's `internal/api/testdata/golden/with-netapp-storage-cytoscape.json`
- **THEN** it parses the corresponding number of nodes and edges, and the three node types `netapp-aggr` / `netapp-node` / `storage-cluster` and the `pvc-to-netapp-aggr` edge are all mapped correctly

#### Scenario: The backend D6 hierarchy is consumed verbatim, and a pod nested under a controller keeps owner / application / labels.node

- **WHEN** an upstream pod node's `data` carries `owner: { kind: "StatefulSet", name: "mongo" }`, `application: "mongo"`, and `labels.node: "prod/node-1"`, with its `data.parent` pointing at a `controller` group
- **THEN** normalize synthesises no controller node and no `controller-owns-pod` edge, and preserves that pod's `owner` / `application` / `labels.node` along with its backend `parent`

#### Scenario: pod-to-node and pvc-to-netapp-aggr edges are mapped

- **WHEN** the upstream edges include `type: 'pod-to-node'` (pod→node) and `type: 'pvc-to-netapp-aggr'` (pvc→netapp-aggr; replacing the removed `pvc-to-storageclass` this scenario originally named)
- **THEN** both map to their corresponding `edgeType` and neither falls into the unknown-type fallback

#### Scenario: A PVC with no aggregate join has no storage edge

- **WHEN** a PVC did not join a NetApp aggregate (the backend emitted no corresponding `pvc-to-netapp-aggr` edge; the `pvc-to-storageclass` edge type this scenario originally described has been removed from the contract)
- **THEN** normalize produces no storage edge for it, and the PVC remains an ordinary node

#### Scenario: RED metrics contract anchored on the backend golden fixture

- **WHEN** `normalizeGraph` is fed content shaped like the backend's `internal/api/testdata/golden/with-red-metrics-cytoscape.json` (one payload holding an edge with a complete `metrics: { rate, error_rate, p90_server_ms }`, an edge with only `{ rate, error_rate }`, and an edge with no `metrics` at all)
- **THEN** all three edges parse into elements whose `metrics` field is respectively complete, restricted to the fields present, and absent

#### Scenario: NetApp nodes carry no cluster label and stay out of clusters[]

- **WHEN** the upstream payload holds `netapp-aggr` and `netapp-node` nodes whose `labels` are `{ontap_cluster, node}` and `{ontap_cluster}` respectively
- **THEN** neither has a `cluster` label, normalize assigns neither a cluster accent, and the top-level `clusters[]` contains no ONTAP cluster name

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

### Requirement: Datasource provisioning

`provisioning/datasources/` SHALL provision one Infinity datasource with the uid the
provisioned dashboard references, created automatically when Grafana starts under
`docker compose`.

The datasource SHALL carry **no `url`**. The only provisioned target is `source: "inline"`,
which parses a JSON string embedded in the dashboard and never issues a request — but an
inline target is still routed through a datasource, so the instance must exist for the uid to
resolve. A `url` here would address a service this repository does not contain.

#### Scenario: Datasource ready, addressing nothing

- **WHEN** running `docker compose up -d` and waiting for Grafana to start
- **THEN** the Datasources list contains the `kube-state-graph` Infinity datasource with uid `ksg-default`, and its configuration carries no URL

### Requirement: Example dashboard provisioning

`provisioning/dashboards/` SHALL provide exactly **one** demo dashboard, `KSG Showcase`
(`/d/ksg-switch-demo`), containing one instance of this plugin's panel fed by a single
Infinity `inline` target.

Opening it SHALL render a populated graph with no other container running. The EmptyState
path is therefore **not** reachable from the provisioned demo, and is covered by unit tests
instead — the previous second dashboard, which showed a datasource error whenever the backend
stack was not started, is removed.

#### Scenario: The demo dashboard renders a populated graph on its own

- **WHEN** Grafana finishes starting from a plain `docker compose up -d`
- **THEN** the Dashboards list contains `KSG Showcase`, and opening it renders graph elements rather than an EmptyState or a datasource error

### Requirement: 多 instance 支援(v1 範圍限定)

v1 範圍內每個 panel 例項 MUST 綁定單一 datasource 實例;Panel 不負責跨 cluster 聚合。

#### Scenario: Panel options 不提供 cluster 切換

- **WHEN** 開啟 panel options 編輯器
- **THEN** Options 表單不含 cluster 選擇欄位

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

### Requirement: Recognition and colouring of backend group nodes (namespace / application / controller)

`normalizeGraph` SHALL recognise the four compound group nodes the backend emits directly (`data.type` of `namespace` / `application` / `controller` / `storage-cluster`) and normalize them into **decorative compound parents** the same way the existing `cluster` flag-group is handled — giving none of them a `kind` except `controller` (so they are invisible to the kind filter and the icon legend, and `computeVisibility` skips them: no kind ⇒ always visible, subject only to the orphan cascade). Their `data.parent` always **passes through verbatim** (the panel does not restructure; it only assigns an accent colour). **Selectability is governed by panel-rendering's "Interaction and selection state"**: the `namespace` / `application` groups and `controller` all stay selectable (the selection-driven collapse cue depends on it; selecting a `namespace` opens no detail panel, while `application` is a detail-eligible exception), and the `cluster` and `storage-cluster` groups are `selectable: false`. normalize MUST NOT set `selectable: false` on `namespace` / `application` / `controller` — the canvas's tap gate (`single.selectable()`) would then discard their clicks, so the collapse cue would never appear and the controller / application detail panel would never open. The mapping is:

- `namespace` → `{ isNamespace, namespace: <label>, namespaceColor }` — **reusing** the existing `isNamespace` flag, stylesheet selector, and `NamespaceLegend`; the accent is a fixed per-kind colour (see panel-rendering, "Decorative compound groups use fixed per-kind colours and a kind-prefixed label").
- `application` → `{ isApplication, application: <label>, applicationColor }` — **adding** the `isApplication` flag, `applicationPalette.ts`, a stylesheet selector, and `ApplicationLegend`; the accent is likewise a fixed per-kind colour.
- `storage-cluster` → `{ isStorageCluster, storageCluster: <label>, storageClusterColor }` — the decorative frame around an ONTAP cluster, accent likewise a fixed per-kind colour; `selectable: false` like `cluster` (the selectable real nodes are the `netapp-node` / `netapp-aggr` beneath it).
- `controller` → `{ isController: true, kind: <the child pod's owner.kind, lowercased> }` (see "pod / service / pvc `application` and pod `containers` passthrough, and controller aggregation"): a controller carries a real `kind` so it keeps its detail panel, making it both a compound parent and a glyph-bearing node (drawing that kind's icon when collapsed).

The `namespace` / `application` / `storage-cluster` groups have `labels: {}`, no status, and no edges; they exist purely as `data.parent` targets.

For the decorative groups (`cluster` / `storage-cluster` / `namespace` / `application`), `normalizeGraph` MUST set `data.label` to the bare upstream name (`data.name`, falling back to the id) and **MUST NOT** write a kind prefix (`Cluster:` / `Storage:` / `Namespace:` / `Release Unit:`). The prefixed on-canvas label is the stylesheet's render-only mapper's job (see panel-rendering); the bare `data.label` serves the tooltip title and other identity consumers.

#### Scenario: A namespace group is normalized and coloured

- **WHEN** an upstream node has `data.type === 'namespace'`, `name === 'shop'`, and a `parent` pointing at its cluster container
- **THEN** normalize produces `isNamespace: true`, `namespace: 'shop'`, `label: 'shop'` (bare, with no `Namespace:` prefix), and `namespaceColor` as the fixed per-kind accent; it carries **no** `kind`, does **not** set `selectable: false` (it stays selectable, cue-driven — see panel-rendering, "Interaction and selection state"), and its `parent` passes through verbatim

#### Scenario: An application group is normalized and coloured

- **WHEN** an upstream node has `data.type === 'application'`, `name === 'checkout'`, and a `parent` pointing at its namespace group
- **THEN** normalize produces `isApplication: true`, `application: 'checkout'`, `label: 'checkout'` (bare, with no `Release Unit:` prefix), and `applicationColor` as the fixed per-kind accent; it carries **no** `kind`, does **not** set `selectable: false` (it stays selectable; `application` is detail-eligible — see panel-rendering), and its `parent` passes through verbatim

#### Scenario: A cluster group is normalized to a bare label

- **WHEN** an upstream node has `data.type === 'cluster'` and `name === 'prod'`
- **THEN** normalize produces `isCluster: true`, `cluster: 'prod'`, `label: 'prod'` (bare, with no `Cluster:` prefix), `clusterColor` as the fixed per-kind accent, and `selectable: false`

#### Scenario: A storage-cluster group is normalized to a bare label

- **WHEN** an upstream node has `data.type === 'storage-cluster'` and `name === 'ontap-prod'` (with no `parent`)
- **THEN** normalize produces `isStorageCluster: true`, `storageCluster: 'ontap-prod'`, `label: 'ontap-prod'` (bare, no prefix), and `storageClusterColor` as the fixed per-kind accent; it carries **no** `kind` and is `selectable: false`

#### Scenario: A controller group is flagged isController and takes its kind from a child pod (staying selectable)

- **WHEN** an upstream node has `data.type === 'controller'` (with no `kind`) and one of its child pods has `owner.kind === 'StatefulSet'`
- **THEN** normalize produces `isController: true` and `kind: 'statefulset'`, passes `parent` through verbatim, and **MUST NOT** set `selectable: false` (a controller is detail-eligible and must stay selectable to open the detail panel)

#### Scenario: Kind-less groups are invisible to the kind filter and the icon legend

- **WHEN** `computeVisibility` and the icon-legend derivation run over the `namespace` / `application` / `storage-cluster` groups
- **THEN** all three are skipped by `computeVisibility` for having no `kind` (always visible, subject only to the orphan cascade) and none appears in the icon legend

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

### Requirement: Edge metrics normalization and per-field degradation

`normalizeGraph` MUST carry an upstream edge's `data.metrics` onto the produced cytoscape edge's `data.metrics` **under the same names and the same units**, with its type declared in `src/shared/types/cytoscape.d.ts` via declaration merging. `metrics` is a union of two mutually exclusive families (see "Upstream kube-state-graph payload contract"): the RED family `rate` / `errorRate` / `p90ServerMs`, and the I/O family `readOps` / `writeOps` / `readLatencyUs` / `writeLatencyUs` / `readBytesPerSec` / `writeBytesPerSec` / `maxIops` / `maxBytesPerSec` (snake_case → camelCase, nothing else changed). This is **pure passthrough plus validation**: the panel MUST NOT convert units, convert to percentages, round, or fill in defaults at this layer — formatting belongs to the rendering layer.

Validation and degradation rules (metrics are an additional information layer, so **no metrics problem may ever make an edge disappear**):

- `metrics` is not a plain object → discard the whole `metrics`; the edge is produced as usual.
- `rate` is present but is not a `number` or is not finite (`NaN` / `±Infinity`) → discard the whole `metrics` (`rate` is the RED family's required field); the edge is produced as usual.
- **A missing `rate` MUST NOT discard the whole `metrics`**: parse it as the I/O family instead — if any of the eight I/O fields is a finite `number`, keep the family; otherwise discard the whole `metrics`. This is the only behavioural difference introduced by the union.
- Any optional field (`error_rate` / `p90_server_ms` / the eight I/O fields) that is present but not a finite `number` → **drop that field only**, keeping the rest of `metrics`.
- The two ceiling fields (`max_iops` / `max_bytes_per_sec`) go through **exactly the same** per-field guard as the six measurement fields. normalize MUST NOT additionally enforce "a ceiling never appears alone": that invariant is the backend's (see the hop B / hop C note in the upstream contract), and re-checking it here would silently drop data the moment the backend's behaviour changes.
- If fields from both families appear (impossible per the contract), the RED family MUST win and the I/O fields MUST be discarded — never produce a mixed object a consumer cannot discriminate.
- An optional field the upstream did not send MUST stay absent (**never** filled with `0`, `null`, or any placeholder).
- Values MUST be preserved verbatim, including exponent-form tiny values (for example `3.86e-7`) and `0`.

A metrics validation failure MUST NOT be written to `normalizeGraph`'s `errors` array — that channel is for partial-parse warnings that affect topological correctness, and a metrics gap does not affect topology, so writing to it would only turn the warning banner into noise.

#### Scenario: Valid metrics pass through into edge data

- **WHEN** an upstream edge's `data` is `{ id, source, target, type: 'pod-calls-service', labels: {}, metrics: { rate: 5, error_rate: 0.2, p90_server_ms: 45 } }` (both endpoint nodes exist)
- **THEN** the produced edge element's `data.metrics` is `{ rate: 5, errorRate: 0.2, p90ServerMs: 45 }`, with no unit conversion and no rounding

#### Scenario: An edge with no metrics produces no such field

- **WHEN** an upstream edge's `data` has no `metrics` key (for example a `pod-mounts-pvc` edge)
- **THEN** the produced edge element's `data` likewise has no `metrics` key (not an explicit `undefined`, not an empty object)

#### Scenario: An absent error_rate and a zero error_rate are different states

- **WHEN** one upstream edge carries `metrics: { rate: 3 }` (no `error_rate`) and another carries `metrics: { rate: 1, error_rate: 0 }`
- **THEN** the former's `data.metrics` has no `errorRate` key, while the latter's is `errorRate: 0`

#### Scenario: One invalid field does not take the rest of metrics with it

- **WHEN** an upstream edge's `metrics` is `{ rate: 5, error_rate: 'high', p90_server_ms: 45 }`
- **THEN** the produced `data.metrics` is `{ rate: 5, p90ServerMs: 45 }` (dropping `errorRate`) and the edge itself is produced as usual

#### Scenario: An unusable rate discards metrics but keeps the edge

- **WHEN** an upstream edge's `metrics` is `{ rate: null, error_rate: 0.1 }` (`rate` present but invalid), or `metrics` is a string, or `{ error_rate: 0.1, p90_server_ms: 45 }` (no `rate` and no valid I/O field either)
- **THEN** the produced edge element has no `metrics` key, but the edge element still exists in `elements` with its `edgeType` / `labels` unaffected

#### Scenario: Tiny exponent-form values are preserved verbatim

- **WHEN** an upstream edge's `metrics` is `{ rate: 3.86e-7, error_rate: 6.7e-8 }`
- **THEN** the produced `data.metrics.rate` is strictly equal to `3.86e-7` and `data.metrics.errorRate` strictly equal to `6.7e-8` (neither truncated to `0`)

#### Scenario: A RED gap never reaches the errors channel

- **WHEN** the upstream payload holds edges with invalid `metrics` in any of the forms above
- **THEN** the `errors` array `normalizeGraph` returns MUST NOT gain any entry as a result

#### Scenario: I/O family metrics pass through onto the storage edge

- **WHEN** an upstream `pvc-to-netapp-aggr` edge carries `metrics: { read_ops: 150, write_ops: 40, read_latency_us: 830, write_latency_us: 1200, read_bytes_per_sec: 5242880, write_bytes_per_sec: 1048576, max_iops: 5000, max_bytes_per_sec: 262144000 }` (no `rate`)
- **THEN** the produced `data.metrics` is `{ readOps: 150, writeOps: 40, readLatencyUs: 830, writeLatencyUs: 1200, readBytesPerSec: 5242880, writeBytesPerSec: 1048576, maxIops: 5000, maxBytesPerSec: 262144000 }`, with no `rate` key and no conversion at this layer (nothing is converted to MB/s here; `maxBytesPerSec` was already converted out of MB/s by the backend)

#### Scenario: The I/O family degrades per field

- **WHEN** an upstream storage edge's `metrics` is `{ read_ops: 150, write_ops: 'many', read_bytes_per_sec: 5242880 }` (only some of the family's fields, one of them invalid)
- **THEN** the produced `data.metrics` is `{ readOps: 150, readBytesPerSec: 5242880 }`, the edge is produced as usual, and `errors` gains nothing

#### Scenario: Measurements present, no declared ceiling

- **WHEN** an upstream storage edge carries `metrics: { read_ops: 150, write_ops: 40, read_bytes_per_sec: 5242880 }` (the volume belongs to no QoS policy group, so the backend sent no ceiling)
- **THEN** the produced `data.metrics` has no `maxIops` and no `maxBytesPerSec` key (never `0`, `null`, or an unlimited sentinel), and every other field is carried through as usual

#### Scenario: Ceiling fields degrade per field

- **WHEN** an upstream storage edge carries `metrics: { read_ops: 150, max_iops: 5000, max_bytes_per_sec: 'unlimited' }`
- **THEN** the produced `data.metrics` is `{ readOps: 150, maxIops: 5000 }` — the invalid `max_bytes_per_sec` drops that field only, leaves the rest of the family intact, and adds nothing to `errors`

### Requirement: Normalization of NetApp nodes and PVC storage fields (health / usage / storageclass)

`normalizeGraph` SHALL normalize upstream nodes with `data.type === 'netapp-aggr'` and `data.type === 'netapp-node'` into **real leaf-semantics nodes** of the corresponding `kind` (icon-bearing, selectable, in the `Storage` category), passing their `parent` through verbatim — including the case where a `netapp-aggr`'s parent is the id of a **real** `netapp-node` (see the storage chain in "Upstream kube-state-graph payload contract"). The backend sends no `status`, so `status` is omitted.

Three new node fields pass through under independent per-field guards, so none takes another down with it:

- `health` (`netapp-aggr` / `netapp-node`): passed through when the value is the string `"online"` or `"degraded"`; **any other string also passes through verbatim** (an unknown backend value must never fail the node); a non-string or empty string is omitted. An absent `health` MUST NOT be filled with `"degraded"` or any other default.
- `usage` (`netapp-aggr` / `pvc`): `used_bytes` / `capacity_bytes` each pass through as `usedBytes` / `capacityBytes` when they are a finite `number` and `>= 0`; if neither qualifies, the whole `usage` is omitted.
- `storageclass` (`pvc`): passed through when it is a non-empty string.

**Deriving `usageRatio`.** When `usage` holds both a qualifying `usedBytes` and a qualifying `capacityBytes` with `capacityBytes > 0`, normalize MUST additionally write the derived field `usageRatio` (`usedBytes / capacityBytes`, clamped to `[0,1]`). This field exists **solely for the stylesheet's node usage visual** — a cytoscape selector can read neither nested `data` nor perform division — so it has to be flattened at normalize. When `capacityBytes` is `0`, when either field is missing, or when the ratio cannot be computed, `usageRatio` MUST NOT be written (absence = draw no usage visual). This derivation is **kind-independent**: any node with a qualifying `usage` gets a `usageRatio`, so `pvc` and `netapp-aggr` go through one rule and any future usage-bearing kind is covered automatically.

`netapp-aggr` and `netapp-node` are both icon-bearing `NodeKind`s in the `Storage` category, so they appear in `NodeLegend` automatically; both are **selectable**, detail-eligible nodes — `netapp-node` stays selectable despite being a compound parent, exactly like the `controller` and k8s `node` containers.

#### Scenario: netapp-aggr is normalized, passes health / usage through, and derives usageRatio

- **WHEN** an upstream node has `data.type === 'netapp-aggr'`, a `parent` pointing at a real `netapp-node` id, `health: "online"`, and `usage: { used_bytes: 700000000000, capacity_bytes: 1000000000000 }`
- **THEN** normalize produces `kind: 'netapp-aggr'`, `health: 'online'`, `usage: { usedBytes: 700000000000, capacityBytes: 1000000000000 }`, and `usageRatio: 0.7`, carries **no** `status`, and preserves its `parent` and `label` (= `name`) verbatim

#### Scenario: netapp-node is a real compound parent and stays selectable

- **WHEN** an upstream node has `data.type === 'netapp-node'`, a `parent` pointing at a `storage-cluster` group, and `health: "degraded"`, and another `netapp-aggr` node's `parent` points at it
- **THEN** normalize produces `kind: 'netapp-node'` and `health: 'degraded'`, **MUST NOT** set `selectable: false`, and that `netapp-aggr`'s `parent` still points at this node's id (cytoscape builds the nesting from `data.parent`)

#### Scenario: An absent health is not filled in

- **WHEN** an upstream `netapp-aggr` or `netapp-node` has no `health` field (or its value is an empty string or not a string)
- **THEN** the produced element's `data` has no `health` key (under `exactOptionalPropertyTypes`, no `undefined` value is written) and it MUST NOT be filled with `'degraded'`

#### Scenario: A PVC passes storageclass and usage through

- **WHEN** an upstream `pvc` node carries `storageclass: "netapp-nas"` and `usage: { used_bytes: 5368709120, capacity_bytes: 10737418240 }`
- **THEN** normalize produces `storageclass: 'netapp-nas'`, `usage: { usedBytes: 5368709120, capacityBytes: 10737418240 }`, and `usageRatio: 0.5`

#### Scenario: usage degrades per field

- **WHEN** an upstream node's `usage` is `{ capacity_bytes: 1000 }` (capacity only) or `{ used_bytes: 'lots', capacity_bytes: 1000 }` (one field invalid)
- **THEN** both produce `usage: { capacityBytes: 1000 }` and, lacking `usedBytes`, **MUST NOT** write `usageRatio`

#### Scenario: A zero capacity produces no usageRatio

- **WHEN** an upstream node's `usage` is `{ used_bytes: 0, capacity_bytes: 0 }`
- **THEN** it produces `usage: { usedBytes: 0, capacityBytes: 0 }` and **MUST NOT** write `usageRatio` (avoiding a division by zero)

#### Scenario: A malformed usage shape is discarded entirely

- **WHEN** an upstream node's `usage` is not a plain object (a string, an array, or `null`)
- **THEN** normalize omits both `usage` and `usageRatio`, normalizes every other field as usual, and produces the node as usual
### Requirement: K8s node `ready_status` normalization

`normalizeGraph` SHALL carry an upstream node's `ready_status` onto the produced cytoscape
node as `data.readyStatus`, a `string`, when it is a non-empty string; otherwise the field
SHALL be **absent** from `data` entirely.

The value SHALL be passed through **verbatim**, with no mapping, casing change, or
membership check against the backend's `"Ready"` / `"NotReady"` / `"Unknown"` triple. The
guard is the same one `health` uses, for the same reason: an upstream that grows a fourth
condition value must surface it rather than vanish.

**Absence MUST NOT be defaulted to `"Unknown"`, `""`, or any other value.** The backend omits
the field when the node carries no Ready-condition series at all and reserves the literal
`"Unknown"` for the genuine Kubernetes state where the kubelet has stopped reporting.
Conflating the two would render a scrape gap as a cluster-wide outage.

`readyStatus` is a **third status axis** and MUST NOT feed `data.status`, `data.worstStatus`,
the status border colour, or any alert aggregation. Kubernetes' Ready condition and the
panel's alert severity answer different questions, and a node can legitimately be `NotReady`
with nothing firing; folding one into the other would make one colour mean two things.

#### Scenario: Each condition value passes through unchanged

- **WHEN** an upstream `node` carries `ready_status: "NotReady"`
- **THEN** the produced node's `data.readyStatus` is `'NotReady'`

#### Scenario: A node with no Ready data carries no field

- **WHEN** an upstream `node` carries no `ready_status` key, or an empty string, or a non-string value
- **THEN** the produced `data` has no `readyStatus` key — never `''`, never `'Unknown'` — and nothing is added to `errors`

#### Scenario: An unrecognised condition value survives

- **WHEN** an upstream `node` carries `ready_status: "SchedulingDisabled"`
- **THEN** `data.readyStatus` is `'SchedulingDisabled'`

#### Scenario: The status axes are untouched

- **WHEN** a node carrying `ready_status: "NotReady"` and no alerts is normalized
- **THEN** its produced `data` is identical to the same node normalized without `ready_status`, apart from the `readyStatus` field itself
