# graph-data-integration delta — sync-netapp-storage-nodes

## MODIFIED Requirements

### Requirement: 上游 kube-state-graph payload 契約(cytoscape.js 形式)

上游 `kube-state-graph` 後端 `GET /v1/graph` 端點輸出 **cytoscape.js elements 形式**的 JSON,本 panel MUST 以此為唯一資料來源契約並依此 normalize。後端(design **D6**,commit `787573b`,取代舊 D31 `cluster > node > pod` 模型)現為**整個拓撲階層的唯一真實來源**。頂層形狀為:

```
{ apiVersion: string, clusters: string[], elements: { nodes: CyNode[], edges: CyEdge[] } }
```

每個 node / edge 皆以 cytoscape 慣例包在 `data` 物件中:

- `CyNode.data { id: string, name: string, type: string, parent?: string, ipaddress?: string[], owner?: { kind: string, name: string }, application?: string, containers?: Array<{ name: string; image: string }>, storageclass?: string, health?: string, usage?: { used_bytes?: number, capacity_bytes?: number }, labels: Record<string,string> }`
- `CyEdge.data { id: string, type: string, source: string, target: string, labels: Record<string,string>, metrics?: EdgeMetricsUnion }`

後端 node `type` 列舉(小寫):核心資源 `pod` / `node` / `pvc` / `service` / `external`;**實體儲存** `netapp-aggr` / `netapp-node`;**compound 群組節點** `cluster` / `storage-cluster` / `namespace` / `application` / `controller`;以及實體網路 `switch`。`controller` 群組之 `type` 為字面值 `controller`(**非**小寫化的 workload Kind);其 Kind 僅存在於 id 路徑與子 pod 的 `owner.kind`。`node` 為 cluster 下的葉節點。未對應到具體 K8s 資源的端點歸入 `external`(契約無 `others` 類型)。`storageclass` **已自契約移除**——後端不再輸出該 node type,claim 的 StorageClass 名稱改以 PVC 自身的 `data.storageclass`(string,omitempty)攜帶。

**NetApp 儲存鏈**:`netapp-aggr`(ONTAP aggregate,id `netapp/<ontap-cluster>/aggr/<aggr>`)為 PVC 實際落地的實體單位,`labels` 恰為 `{ontap_cluster, node}`(`node` = 當下擁有該 aggregate 的 controller);`netapp-node`(ONTAP controller,id `netapp/<ontap-cluster>/<node>`)`labels` 恰為 `{ontap_cluster}`。兩者皆**不**帶 `cluster` label(不屬於任何 K8s cluster,亦不出現於頂層 `clusters[]`),故 panel 的 cluster accent / cluster 篩選對其不適用。兩者皆可帶 `health`(值域恰為 `"online"` / `"degraded"`,omitempty);`netapp-aggr` 另可帶 `usage`。**`health` 的省略與 `"degraded"` 語意不同**——省略代表後端無該狀態資料,消費端 MUST NOT 將省略視為 `"degraded"`。

**`usage` 欄位**:形狀為 `{ used_bytes?: number, capacity_bytes?: number }`(bytes,JSON number),出現於 `pvc`(來自 kubelet volume stats)與 `netapp-aggr`(來自 Harvest aggregate space)兩種節點,**形狀完全相同**。物件本身於至少一欄解析成功時出現;任一欄未解析則該欄不存在(**不**補 `0`)。

後端 edge `type` 列舉:`pod-to-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-netapp-aggr`,以及實體網路 fabric `switch-to-switch` / `node-to-switch`。`pod-to-node`(pod→node)表達 pod 與其 K8s node 之關係(D6 起 pod-runs-on-node 不再以巢狀表達);`pvc-to-netapp-aggr`(pvc→netapp-aggr)連接 PVC 至承載其 FlexVol 的 ONTAP aggregate(取代已移除的 `pvc-to-storageclass`);`pod-calls-service`(pod→service)與 `service-selects-pod`(service→pod)為方向相反的一對。邊的視覺樣式(顏色/線型/箭頭)由 panel-rendering 規格定義。

**Edge `metrics` 為兩個互斥家族的 union**,單一邊只會攜帶其中一族,永不混合:

1. **RED 家族**(trace 衍生的邊):後端在兩端皆解析為 `pod` 或 `service` 節點、且該邊由 `traces_service_graph_request_*` 序列產生時附上。實務上僅 `pod-calls-pod` 與 `pod-calls-service` 可能帶有。欄位為 `rate` / `error_rate` / `p90_server_ms`。
2. **I/O 家族**(`pvc-to-netapp-aggr` 邊獨有):`read_ops` / `write_ops` / `read_latency_us` / `write_latency_us`,四欄**各自** optional(每欄對應一個獨立的 Harvest 序列家族,任一家族缺席只使該欄缺席)。ops 為每秒次數、latency 為微秒平均值,皆為後端逐字透傳的既有值。

`service-selects-pod` / `pod-to-node` / `pod-mounts-pvc` / fabric 邊、任一端為 `external` 的邊、以及後端合成的邊,MUST 視為**永不帶** `metrics`。各欄位契約為:

- `rate`:查詢視窗內的每秒請求數(**req/s**,非累計次數)。**RED 家族存在時**此欄必定存在且 > 0;但因 `metrics` 現為 union,消費端 MUST NOT 於任意 `metrics` 物件上假設 `rate` 存在(I/O 家族永無此欄)。
- `error_rate`:失敗**比例**,值域 `[0,1]`(**非**百分比)。省略代表失敗計數器**讀取失敗**;`0` 代表**讀取成功且無失敗**——兩者語意不同,消費端 MUST NOT 把「省略」當作 `0`。
- `p90_server_ms`:server 端觀測之請求耗時 p90,單位**毫秒**。無可用 classic histogram(例如 native histogram / `vmrange`)時省略。
- `read_ops` / `write_ops`:每秒讀 / 寫次數。
- `read_latency_us` / `write_latency_us`:讀 / 寫平均延遲,單位**微秒**(µs)。

後端對所有數值以 **6 位有效數字**輸出,故值可能以指數表示法送達(例如 `3.86e-7`);panel MUST 依實際數值格式化,MUST NOT 假設其為小整數。`metrics` 缺席時該 key 完全不出現(非 `null`、非 0)。所有數值欄位皆 MUST NOT 出現在 `labels` map 中——`labels` 維持嚴格的 `Record<string,string>`。

`ipaddress` 為**陣列**(可能多個 IP 或空);僅 `pod` / `node` / `service` node 帶有,且 IP 資料已於上游 commit `524057b` 從 `labels`(原 `pod_ip` / `host_ip` / `external_ip`)移出,改置於此專屬欄位 —— panel MUST 從 `data.ipaddress` 取 IP,**不可**再從 `labels` 讀取。

**D6 parent 鏈(`data.parent`)**:workload 鏈為 `cluster > namespace > application > controller > pod`;`pvc` / `service` 直接 parent 至其 `namespace` 群組;`node` 為 cluster 下的葉節點。**儲存鏈為 `storage-cluster > netapp-node > netapp-aggr`**——其中間層 `netapp-node` 是**真實節點**(有 kind、有 icon、可選取),而非裝飾性群組;這是契約中唯一一處由真實節點擔任 compound parent 的階層,panel MUST 依 `data.parent` 原樣建立巢狀,不得因其為真實 kind 而改以邊表達。`namespace` / `application` / `storage-cluster` 群組 `labels:{}`、無 status、無邊,純為 `data.parent` 目標。

**Pod 控制器歸屬**:後端在 pod 節點上仍帶 `data.owner: { kind, name }`、`application:<string>` 與 `labels.node`(其 K8s node id),**即使該 pod 現以 `data.parent` 巢狀於其 `controller` 群組之下亦然**。後端現**直接輸出** `controller` / `namespace` / `application` 群組節點與 `pod-to-node` 邊——panel 不再自 `data.owner` 合成 controller 節點或 `controller-owns-pod` 邊(舊客戶端合成已移除)。一個 PVC 若未 join 到 NetApp aggregate(無 `volumename`、Harvest 無對應序列、或該序列 `aggr` 為空),後端**不**輸出對應的 `pvc-to-netapp-aggr` 邊。

#### Scenario: 契約欄位以後端 golden fixture 為準

- **WHEN** 對 `normalizeGraph` 餵入後端 `internal/api/testdata/golden/with-netapp-storage-cytoscape.json` 的內容
- **THEN** 正確解析出對應數量的 nodes 與 edges,且 `netapp-aggr` / `netapp-node` / `storage-cluster` 三種節點與 `pvc-to-netapp-aggr` 邊皆被正確映射

#### Scenario: 後端 D6 階層原樣消費,pod 巢狀於 controller 仍保留 owner/application/labels.node

- **WHEN** 上游 pod node `data` 含 `owner: { kind: "StatefulSet", name: "mongo" }`、`application: "mongo"`、`labels.node: "prod/node-1"`,且其 `data.parent` 指向某 `controller` 群組
- **THEN** normalize 不再合成任何 controller 節點或 `controller-owns-pod` 邊,並保留該 pod 的 `owner` / `application` / `labels.node` 與其後端 `parent`

#### Scenario: 新增 pod-to-node 與 pvc-to-storageclass 邊

- **WHEN** 上游 edges 含 `type: 'pod-to-node'`(pod→node)與 `type: 'pvc-to-netapp-aggr'`(pvc→netapp-aggr;取代本情境原先命名的已移除 `pvc-to-storageclass`)
- **THEN** 兩者皆被映射為對應 `edgeType`,不歸入未知類型 fallback

#### Scenario: 無 StorageClass 的 PVC 無 pvc-to-storageclass 邊

- **WHEN** 某 PVC 未 join 到 NetApp aggregate(後端未輸出對應 `pvc-to-netapp-aggr` 邊;本情境原先描述的 `pvc-to-storageclass` 邊型別已自契約移除)
- **THEN** normalize 不為其產生任何儲存邊,該 PVC 仍為正常節點

#### Scenario: RED metrics 契約以後端 golden fixture 為準

- **WHEN** 對 `normalizeGraph` 餵入後端 `internal/api/testdata/golden/with-red-metrics-cytoscape.json` 形狀的內容(同一 payload 內同時含 `metrics: { rate, error_rate, p90_server_ms }` 齊全的邊、僅 `{ rate, error_rate }` 的邊、以及完全無 `metrics` 的邊)
- **THEN** 三種邊皆被解析為 element,各自的 `metrics` 欄位分別為齊全、僅含存在的欄位、與不存在

#### Scenario: NetApp 節點不帶 cluster label 且不進入 clusters[]

- **WHEN** 上游含 `netapp-aggr` 與 `netapp-node` 節點,其 `labels` 分別為 `{ontap_cluster, node}` 與 `{ontap_cluster}`
- **THEN** 兩者皆無 `cluster` label,normalize 不為其指派 cluster accent,且頂層 `clusters[]` 不含任何 ONTAP cluster 名稱

### Requirement: Backend 群組節點識別(namespace / application / controller)與著色

`normalizeGraph` SHALL 辨識 backend 直接輸出的四種 compound 群組節點(`data.type` 為 `namespace` / `application` / `controller` / `storage-cluster`),比照既有 `cluster` flag-group 正規化為**裝飾性 compound parent**——除 `controller` 外**不**賦予 `kind`(故對 kind filter 與 icon legend 不可見,並由 `computeVisibility` 略過:無 kind ⇒ 恆可見,僅受 orphan cascade 影響)。其 `data.parent` 一律**原樣穿透**(panel 結構無關,僅指派 accent 顏色)。**可選取性由 panel-rendering「互動與選取狀態」規範**:`namespace` / `application` 群組與 `controller` 皆維持可選取(selection-driven 摺疊 cue 賴此浮現;`namespace` 選取不開啟 detail 面板、`application` 為 detail-eligible 例外),`cluster` 與 `storage-cluster` 群組為 `selectable: false`——normalize MUST NOT 對 `namespace` / `application` / `controller` 設 `selectable: false`,否則 canvas 的 tap 守門(`single.selectable()`)會丟棄其點擊,摺疊 cue 永不浮現、controller / application 的 detail 面板永不開啟。映射:

- `namespace` → `{ isNamespace, namespace: <label>, namespaceColor }`——**重用**既有 `isNamespace` 旗標、stylesheet selector 與 `NamespaceLegend`;accent 色為 per-kind 固定色(見 panel-rendering「裝飾性 compound 群組使用 per-kind 固定色彩與 kind 前綴標籤」)。
- `application` → `{ isApplication, application: <label>, applicationColor }`——**新增** `isApplication` 旗標、`applicationPalette.ts`、stylesheet selector 與 `ApplicationLegend`;accent 色同為 per-kind 固定色。
- `storage-cluster` → `{ isStorageCluster, storageCluster: <label>, storageClusterColor }`——ONTAP cluster 的裝飾性外框,accent 色同為 per-kind 固定色;比照 `cluster` 設 `selectable: false`(其下的 `netapp-node` / `netapp-aggr` 才是可選取的真實節點)。
- `controller` → `{ isController: true, kind: <子 pod owner.kind 小寫> }`(見「pod / service / pvc `application`、pod `containers` 透傳與 controller 聚合」):controller 攜帶 real `kind` 以保留 detail 面板,既是 compound parent 又有 glyph(收合時畫該 kind icon)。

`namespace` / `application` / `storage-cluster` 群組 `labels:{}`、無 status、無邊,純為 `data.parent` 目標。

對裝飾性群組(`cluster` / `storage-cluster` / `namespace` / `application`),`normalizeGraph` MUST 將 `data.label` 設為上游裸名稱(`data.name`,或缺則 id),**MUST NOT** 寫入 kind 前綴(`Cluster:` / `Storage:` / `Namespace:` / `Release Unit:`)。畫布上的前綴標籤由 stylesheet render-only mapper 負責(見 panel-rendering);裸 `data.label` 供 tooltip title 與其他 identity 消費端使用。

#### Scenario: namespace 群組正規化並著色

- **WHEN** 上游節點 `data.type === 'namespace'`、`name === 'shop'`、`parent` 指向其 cluster 容器
- **THEN** normalize 產出 `isNamespace: true`、`namespace: 'shop'`、`label: 'shop'`(裸名,無 `Namespace:` 前綴)、`namespaceColor` 為 per-kind 固定 accent 色,**不**帶 `kind`、**不**設 `selectable: false`(維持可選取,cue-driven——見 panel-rendering「互動與選取狀態」),且 `parent` 原樣穿透

#### Scenario: application 群組正規化並著色

- **WHEN** 上游節點 `data.type === 'application'`、`name === 'checkout'`、`parent` 指向其 namespace 群組
- **THEN** normalize 產出 `isApplication: true`、`application: 'checkout'`、`label: 'checkout'`(裸名,無 `Release Unit:` 前綴)、`applicationColor` 為 per-kind 固定 accent 色,**不**帶 `kind`、**不**設 `selectable: false`(維持可選取;application 為 detail-eligible——見 panel-rendering),且 `parent` 原樣穿透

#### Scenario: cluster 群組正規化為裸 label

- **WHEN** 上游節點 `data.type === 'cluster'`、`name === 'prod'`
- **THEN** normalize 產出 `isCluster: true`、`cluster: 'prod'`、`label: 'prod'`(裸名,無 `Cluster:` 前綴)、`clusterColor` 為 per-kind 固定 accent 色,且 `selectable: false`

#### Scenario: storage-cluster 群組正規化為裸 label

- **WHEN** 上游節點 `data.type === 'storage-cluster'`、`name === 'ontap-prod'`(無 `parent`)
- **THEN** normalize 產出 `isStorageCluster: true`、`storageCluster: 'ontap-prod'`、`label: 'ontap-prod'`(裸名,無前綴)、`storageClusterColor` 為 per-kind 固定 accent 色,**不**帶 `kind`,且 `selectable: false`

#### Scenario: controller 群組標 isController 並由子 pod 取得 kind(維持可選取)

- **WHEN** 上游節點 `data.type === 'controller'`(無 `kind`),其旗下子 pod `owner.kind === 'StatefulSet'`
- **THEN** normalize 產出 `isController: true`、`kind: 'statefulset'`,`parent` 原樣穿透,且 **MUST NOT** 設 `selectable: false`(controller 為 detail-eligible,須維持可選取以開啟 detail 面板)

#### Scenario: 無 kind 的群組對 kind filter / icon legend 不可見

- **WHEN** 對 `namespace` / `application` / `storage-cluster` 群組執行 `computeVisibility` 與 icon legend 推導
- **THEN** 三者皆因無 `kind` 被 `computeVisibility` 略過(恆可見,僅受 orphan cascade 影響),亦不出現於 icon legend

### Requirement: Edge RED metrics 正規化與逐欄降級

`normalizeGraph` MUST 把上游 edge 的 `data.metrics` 以**同名同單位**帶到產出的 cytoscape edge `data.metrics`,並在 `src/shared/types/cytoscape.d.ts` 以 declaration merging 定義其型別。`metrics` 為兩個互斥家族的 union(見「上游 kube-state-graph payload 契約」):RED 家族 `rate` / `errorRate` / `p90ServerMs`,I/O 家族 `readOps` / `writeOps` / `readLatencyUs` / `writeLatencyUs`(snake_case → camelCase,其餘不變)。此為**純透傳 + 驗證**:panel MUST NOT 在此層做單位換算、百分比換算、四捨五入或補值——顯示層才負責格式化。

驗證與降級規則(metrics 為附加資訊層,**任何 metrics 問題皆 MUST NOT 使該邊消失**):

- `metrics` 非 plain object → 整個 `metrics` 丟棄,邊照常產出。
- `rate` 存在但非 `number` 或非有限值(`NaN` / `±Infinity`) → 整個 `metrics` 丟棄(`rate` 是 RED 家族的必要欄位),邊照常產出。
- **`rate` 缺失時 MUST NOT 直接丟棄整個 `metrics`**:改以 I/O 家族解析——四個 I/O 欄位中若有任一為有限 `number` 則保留該族,否則整個 `metrics` 丟棄。此為 union 化後與舊行為的唯一差異。
- 任一 optional 欄位(`error_rate` / `p90_server_ms` / 四個 I/O 欄位)存在但非 `number` 或非有限值 → **僅丟棄該欄**,其餘 `metrics` 保留。
- 兩族欄位若同時出現(契約上不可能),MUST 以 RED 家族為準並丟棄 I/O 欄位——避免產出混合物件使消費端無法判別家族。
- 上游未送出的 optional 欄位 MUST 維持不存在(**不得**補 `0`、`null` 或任何 placeholder)。
- 數值 MUST 原樣保留,含指數表示法之極小值(例如 `3.86e-7`)與 `0`。

metrics 的驗證失敗 MUST NOT 寫入 `normalizeGraph` 的 `errors` 陣列(該通道用於會影響拓撲正確性的 partial-parse 警示;metrics 缺損不影響拓撲,寫入只會讓警示橫幅噪音化)。

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

- **WHEN** 上游 edge `metrics` 為 `{ rate: null, error_rate: 0.1 }`(`rate` 存在但非法),或 `metrics` 為字串,或 `{ error_rate: 0.1, p90_server_ms: 45 }`(缺 `rate` 且無任何合法 I/O 欄位)
- **THEN** 產出的 edge element 無 `metrics` key,但該 edge element 仍存在於 elements 中且 `edgeType` / `labels` 不受影響

#### Scenario: 極小值以指數表示法原樣保留

- **WHEN** 上游 edge `metrics` 為 `{ rate: 3.86e-7, error_rate: 6.7e-8 }`
- **THEN** 產出的 `data.metrics.rate` 嚴格等於 `3.86e-7`、`data.metrics.errorRate` 嚴格等於 `6.7e-8`(未被截為 `0`)

#### Scenario: RED 缺損不進入 errors 通道

- **WHEN** 上游 payload 中有邊帶著非法 `metrics`(如上述各種形式)
- **THEN** `normalizeGraph` 回傳的 `errors` 陣列 MUST NOT 因此新增任何項目

#### Scenario: I/O 家族 metrics 原樣帶入儲存邊

- **WHEN** 上游 `pvc-to-netapp-aggr` 邊帶 `metrics: { read_ops: 150, write_ops: 40, read_latency_us: 830, write_latency_us: 1200 }`(無 `rate`)
- **THEN** 產出的 `data.metrics` 為 `{ readOps: 150, writeOps: 40, readLatencyUs: 830, writeLatencyUs: 1200 }`,無 `rate` key,數值未經換算

#### Scenario: I/O 家族逐欄降級

- **WHEN** 上游儲存邊 `metrics` 為 `{ read_ops: 150, write_ops: 'many' }`(僅部分家族欄位、且其一非法)
- **THEN** 產出的 `data.metrics` 為 `{ readOps: 150 }`,邊照常產出,`errors` 不新增項目

## ADDED Requirements

### Requirement: NetApp 節點與 PVC 儲存欄位正規化(health / usage / storageclass)

`normalizeGraph` SHALL 將 `data.type === 'netapp-aggr'` 與 `data.type === 'netapp-node'` 的上游節點正規化為對應 `kind` 的**真實葉語意節點**(帶 icon、可選取、歸於 `Storage` category),其 `parent` 原樣穿透——包含 `netapp-aggr` 指向**真實** `netapp-node` id 的情形(見「上游 kube-state-graph payload 契約」的儲存鏈)。後端不送 `status`,故省略 `status`。

三個新的節點欄位以獨立 guard 逐欄透傳,彼此不連坐:

- `health`(`netapp-aggr` / `netapp-node`):值為 `"online"` 或 `"degraded"` 的字串時透傳;**其他字串亦原樣透傳**(未知後端值不得使節點失敗),非字串或空字串則省略。`health` 省略 MUST NOT 被補為 `"degraded"` 或任何預設值。
- `usage`(`netapp-aggr` / `pvc`):`used_bytes` / `capacity_bytes` 各自於為有限 `number` 且 `>= 0` 時透傳為 `usedBytes` / `capacityBytes`;兩欄皆不合格則整個 `usage` 省略。
- `storageclass`(`pvc`):非空字串時透傳。

**`usageRatio` 衍生**:當 `usage` 同時具備合格的 `usedBytes` 與 `capacityBytes` 且 `capacityBytes > 0` 時,normalize MUST 另外寫入衍生欄位 `usageRatio`(`usedBytes / capacityBytes`,clamp 至 `[0,1]`)。此欄位**專供 stylesheet 的節點使用率視覺化**(cytoscape selector 無法讀取巢狀 `data`,亦無法在 selector 內做除法),故必須於 normalize 攤平。`capacityBytes` 為 `0`、缺任一欄、或比值無法計算時 MUST NOT 寫入 `usageRatio`(缺席 = 不畫使用率視覺化)。此衍生**與 kind 無關**——任何帶合格 `usage` 的節點皆得到 `usageRatio`,故 `pvc` 與 `netapp-aggr` 走同一條規則,未來新增的 usage-bearing kind 亦自動適用。

`netapp-aggr` / `netapp-node` 皆為帶 icon 且歸於 `Storage` category 的 `NodeKind`,故於 `NodeLegend` 自動呈現;兩者皆為**可選取**(selectable)的 detail-eligible 節點——`netapp-node` 雖為 compound parent 仍維持可選取(比照 `controller` / k8s `node` 容器)。

#### Scenario: netapp-aggr 正規化並透傳 health / usage 與衍生 usageRatio

- **WHEN** 上游節點 `data.type === 'netapp-aggr'`、`parent` 指向真實 `netapp-node` id、帶 `health: "online"` 與 `usage: { used_bytes: 700000000000, capacity_bytes: 1000000000000 }`
- **THEN** normalize 產出 `kind: 'netapp-aggr'`、`health: 'online'`、`usage: { usedBytes: 700000000000, capacityBytes: 1000000000000 }`、`usageRatio: 0.7`,**不**帶 `status`,其 `parent` 與 `label`(= `name`)原樣保留

#### Scenario: netapp-node 為真實 compound parent 且可選取

- **WHEN** 上游節點 `data.type === 'netapp-node'`、`parent` 指向 `storage-cluster` 群組、帶 `health: "degraded"`,且另有 `netapp-aggr` 節點 `parent` 指向它
- **THEN** normalize 產出 `kind: 'netapp-node'`、`health: 'degraded'`,**MUST NOT** 設 `selectable: false`,且該 `netapp-aggr` 的 `parent` 仍指向此節點 id(巢狀由 cytoscape 依 `data.parent` 建立)

#### Scenario: health 省略不補值

- **WHEN** 上游 `netapp-aggr` 或 `netapp-node` 無 `health` 欄位(或其值為空字串 / 非字串)
- **THEN** 產出的 element `data` 無 `health` key(`exactOptionalPropertyTypes`:不寫 `undefined` 值),且 MUST NOT 被補為 `'degraded'`

#### Scenario: PVC 透傳 storageclass 與 usage

- **WHEN** 上游 `pvc` 節點帶 `storageclass: "netapp-nas"` 與 `usage: { used_bytes: 5368709120, capacity_bytes: 10737418240 }`
- **THEN** normalize 產出 `storageclass: 'netapp-nas'`、`usage: { usedBytes: 5368709120, capacityBytes: 10737418240 }` 與 `usageRatio: 0.5`

#### Scenario: usage 逐欄降級

- **WHEN** 上游節點 `usage` 為 `{ capacity_bytes: 1000 }`(僅容量)、或 `{ used_bytes: 'lots', capacity_bytes: 1000 }`(其一非法)
- **THEN** 兩者皆產出 `usage: { capacityBytes: 1000 }`,且因缺 `usedBytes` 而 **MUST NOT** 寫入 `usageRatio`

#### Scenario: capacity 為 0 時不產生 usageRatio

- **WHEN** 上游節點 `usage` 為 `{ used_bytes: 0, capacity_bytes: 0 }`
- **THEN** 產出 `usage: { usedBytes: 0, capacityBytes: 0 }`,且 **MUST NOT** 寫入 `usageRatio`(避免除以零)

#### Scenario: usage 形狀不符時整個丟棄

- **WHEN** 上游節點 `usage` 非 plain object(字串 / 陣列 / `null`)
- **THEN** normalize 省略 `usage` 與 `usageRatio` 兩欄,其餘欄位正常正規化,節點照常產出

## REMOVED Requirements

### Requirement: StorageClass compound 容器之正規化(真 NodeKind + 容器旗標)

**Reason**: 後端已移除 `storageclass` node type 與 `pvc-to-storageclass` 邊(`replace-storageclass-with-netapp-nodes`),儲存側改以實體 NetApp 鏈(`storage-cluster > netapp-node > netapp-aggr`)表達,`provisioner` / `parameters` 兩欄不再由後端輸出。此正規化規則的輸入在契約上已不存在。

**Migration**: claim 的 StorageClass 名稱改由 PVC 自身的 `data.storageclass` 攜帶,由新的「NetApp 節點與 PVC 儲存欄位正規化」需求規範;實體後端資訊改由 `netapp-aggr` / `netapp-node` 節點與 `pvc-to-netapp-aggr` 邊呈現。`provisioner` / `parameters` 兩個資料欄位、其型別宣告與其 tooltip 列一併移除,無替代欄位。
