## MODIFIED Requirements

### Requirement: 上游 kube-state-graph payload 契約(cytoscape.js 形式)

上游 `kube-state-graph` 後端 `GET /v1/graph` 端點輸出 **cytoscape.js elements 形式**的 JSON,本 panel MUST 以此為唯一資料來源契約並依此 normalize。頂層形狀為:

```
{ apiVersion: string, clusters: string[], elements: { nodes: CyNode[], edges: CyEdge[] } }
```

每個 node / edge 皆以 cytoscape 慣例包在 `data` 物件中:

- `CyNode.data { id: string, name: string, type: string, parent?: string, ipaddress?: string[], owner?: { kind: string, name: string }, labels: Record<string,string> }`
- `CyEdge.data { id: string, type: string, source: string, target: string, labels: Record<string,string> }`

後端 node `type` 列舉(小寫):核心資源 `pod` / `node` / `pvc` / `service` / `external`,workload controller `deployment` / `statefulset` / `daemonset` / `job` / `cronjob`,以及實體網路 `switch`(後端 v0.0.18 起)。未對應到具體 K8s 資源的端點歸入 `external`(契約無 `others` 類型)。
後端 edge `type` 列舉:`pod-runs-on-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod`,以及實體網路 fabric `switch-to-switch` / `node-to-switch`(後端 v0.0.18 起)。`pod-calls-service`(pod→service)與 `service-selects-pod`(service→pod)為方向相反的一對;`switch-to-switch`(switch→switch)、`node-to-switch`(node→switch)為實體網路邊。邊的視覺樣式(顏色/線型/箭頭)由 panel-rendering 規格定義。
`ipaddress` 為**陣列**(可能多個 IP 或空);僅 `pod` / `node` / `service` node 帶有,且 IP 資料已於上游 commit `524057b` 從 `labels`(原 `pod_ip` / `host_ip` / `external_ip`)移出,改置於此專屬欄位 —— panel MUST 從 `data.ipaddress` 取 IP,**不可**再從 `labels` 讀取。

**Pod 控制器歸屬以 `data.owner` 表達**:後端在**僅 pod** 節點上選用性地帶 `data.owner: { kind, name }`,標示該 pod 的頂層控制器(如 `{ kind: "Deployment", name: "checkout" }`)。後端已將 `Deployment → ReplicaSet → Pod` 鏈收斂——`owner.kind` 直接為頂層控制器,panel 不會看到中介 ReplicaSet(除非為無 owning Deployment 的裸 ReplicaSet)。無控制器的 pod MUST 省略整個 `owner` 欄位(非 `null`、非 `{}`)。此欄位為後端最新契約,**已自 `labels.owner_kind` / `labels.owner_name` 移至 typed 的 `data.owner`**;為相容尚未升級的後端,panel 在缺 `data.owner` 時 MAY 退而讀取 `labels.owner_kind` / `labels.owner_name`。後端**不**輸出 controller 節點,也**不**輸出 `controller-owns-pod` 邊——這兩者由 panel 自 `data.owner` 合成(見「Controller 節點與 controller-owns-pod 邊之合成」)。

#### Scenario: 契約欄位以後端 golden fixture 為準

- **WHEN** 對 `normalizeGraph` 餵入後端 `internal/api/testdata/golden/*-cytoscape.json` 的內容
- **THEN** 正確解析出對應數量的 nodes 與 edges,且 `service` node 的 `ipaddress: ["10.0.0.5"]` 被保留

#### Scenario: pod 帶 owner 時驅動 controller 合成

- **WHEN** 上游 pod node `data` 含 `owner: { kind: "Deployment", name: "checkout" }`
- **THEN** normalize 依此合成對應 controller 節點與 `controller-owns-pod` 邊(見專屬需求);無 `owner` 的 pod 不產生 controller 節點/邊

## ADDED Requirements

### Requirement: Controller 節點與 controller-owns-pod 邊之合成(自 pod data.owner)

由於後端僅在 pod 上以 `data.owner` 提供控制器 metadata、不輸出 controller 節點與 `controller-owns-pod` 邊,系統 SHALL 於 `normalizeGraph`(anti-corruption layer,純函式、確定性、不涉 pod-parent 模式)中**自 pod 的 owner 合成**這兩者,使下游 `applyPodParentMode` 與 stylesheet 無需知道 owner 的來源:

- 對每個帶有效 owner(`data.owner.{kind,name}`,或缺該欄時退讀 `labels.owner_kind` / `labels.owner_name`)的 pod,系統 MUST 確保存在**唯一**的 controller 節點,以 `(cluster, namespace, ownerKind, ownerName)` 去重(多個同屬一控制器的 pod 共用同一節點)。`namespace` 取自 pod 的 `data.namespace`(由 `labels.namespace` 映射)、`cluster` 取自 pod 的 `labels.cluster`;缺 cluster / namespace 時 MUST 以明確 sentinel(例如空字串)入 key,使不同情境下的同名控制器**不**誤併。controller 節點的 `data.kind` MUST 為 `ownerKind` 正規化後的小寫值(如 `Deployment` → `deployment`);非面板已知 workload kind(例如裸 `ReplicaSet`)MUST 仍合成節點並走 fallback icon、預設可見,不報錯。controller 節點 id MUST 為對該 key 確定性的字串;`data.parent` MUST 為**該 pod 所屬 cluster 容器之實際 id**——由 pod 的 cluster 祖先解析(沿 pod 的 `data.parent` 鏈上溯至 `isCluster` 容器,或以 pod 的 `labels.cluster` 對應到該 `isCluster` 容器),重用該容器**既有 id**,**不可**以 `cluster/<name>` 字串模板硬湊(panel 不自行構造 cluster 容器 id);pod 無 cluster 祖先時 controller **無 parent**(top-level)。`data.label` MUST 為 `ownerName`。
- 對每個這樣的 pod,系統 MUST 合成一條 `edgeType: 'controller-owns-pod'` 的邊,`source` = 該 controller 節點 id、`target` = pod id,邊 id 對 `(controllerId, podId)` 確定性。
- 合成 MUST 為 immutable(產生新元素,不就地修改輸入),且對相同輸入位元組級確定(節點/邊排序穩定)。
- 無 owner 的 pod MUST NOT 觸發任何 controller 節點或邊。
- 系統 MUST 於每個合成的 controller 節點上彙整其**子 pod 的最差 status** 為 `data.worstStatus`(值域 `normal` / `warning` / `critical`;排序 critical > warning > normal;status 取自 pod 的 `data.status`,缺值 / 不合法預設 `normal`;當該最差為 `normal` 時 MUST 省略此欄)。**同一彙整亦施於每個 k8s `node` 容器**:其 `data.worstStatus` 取 **自身 status 與其各子 pod status 之最差**(worst-wins——絕不因子節點而降級到比自身 status 更輕);最差為 `normal` 時省略。此欄供 getStylesheet 對**收合的**容器(controller / k8s node)邊框上色(見 panel-rendering 規格);它**不**影響 owns 邊或去重。採 **status**(非 alert severity):後端為每個節點都給 status(uniform `normal/warning/critical`,預設 normal),故一個 pod 即使**不帶 alert**、只要 status 非 normal 仍會傳播(alert 另有 `info` 階且僅供 detail panel 的 alert 表)。

合成後,`controller-owns-pod` 為 **synthesis-internal**、**永不繪製**:在 `node` 模式下 `applyPodParentMode` **drop** 掉所有合成的 controller 節點(`data.isController === true`)與其 `controller-owns-pod` 邊,呈現乾淨的 cluster > node > pod 基礎設施視圖(**不顯示 controller**);在 `controller` 模式下 `applyPodParentMode` 以這些 owns 邊把 pod re-parent 進 controller(owns 邊轉為 nesting,亦不繪製)(見 pod-parent-mode 規格)。

#### Scenario: 多個同控制器的 pod 共用一個 controller 節點

- **WHEN** 同一 cluster / namespace 下三個 pod 皆帶 `owner: { kind: "StatefulSet", name: "mongo" }`
- **THEN** normalize 合成**恰一個** `kind: 'statefulset'` 的 controller 節點,並合成三條 `controller-owns-pod` 邊(該節點分別指向三個 pod)

#### Scenario: 不同 namespace 同名控制器不混用

- **WHEN** namespace `a` 與 `b` 各有一個 `owner: { kind: "Deployment", name: "api" }` 的 pod
- **THEN** 合成兩個不同的 controller 節點(以 namespace 區分),各自的 owns 邊不交叉

#### Scenario: 有 owner 但無 cluster 的 pod 產生 top-level controller

- **WHEN** 某 pod 帶 `owner` 但無 `labels.cluster`(無 cluster 祖先)
- **THEN** 合成的 controller 節點**無 parent**(top-level),其去重 key 的 cluster 欄以 sentinel 表示,不與其他 cluster 的同名控制器誤併

#### Scenario: 無 owner 的 pod 不合成控制器

- **WHEN** 某 pod 無 `data.owner`(亦無 legacy `labels.owner_kind`)
- **THEN** 不為其合成任何 controller 節點或 `controller-owns-pod` 邊;該 pod 維持後端原 parent

#### Scenario: 相容 legacy labels.owner_kind

- **WHEN** 後端未發 `data.owner`,但 pod `labels` 含 `owner_kind: "DaemonSet"` 與 `owner_name: "fluentd"`
- **THEN** normalize 以該 labels 合成 `kind: 'daemonset'` controller 節點與 owns 邊(與 `data.owner` 路徑等價)

#### Scenario: 收合容器彙整子節點最差 status(controller 與 k8s node)

- **WHEN** 某 controller 旗下兩個 pod 各帶 `status: warning` 與 `status: critical`
- **THEN** 合成的 controller 節點 `data.worstStatus` 為 `critical`(critical > warning)
- **WHEN** 某 controller 旗下唯一 pod `status: warning` 但**不帶任何 alert**
- **THEN** `worstStatus` 為 `warning`(來源為 status,非 alert)
- **WHEN** 某 controller 旗下所有 pod 皆 `normal`(或缺 / 不合法 status,預設 normal)
- **THEN** 合成的 controller 節點 MUST 省略 `worstStatus` 欄
- **WHEN** 某 k8s `node`(自身 `status: normal`)旗下有一 pod `status: critical`
- **THEN** 該 node `data.worstStatus` 為 `critical`(子節點 status 傳播)
- **WHEN** 某 k8s `node`(自身 `status: critical`)旗下 pod 皆 `normal`
- **THEN** 該 node `data.worstStatus` 為 `critical`(worst-wins,不被子節點降級)

#### Scenario: 合成為純函式且確定性

- **WHEN** 以相同 input 多次呼叫 `normalizeGraph`
- **THEN** 合成的 controller 節點與 owns 邊集合、排序、id 完全一致,輸入未被就地修改

### Requirement: StorageClass compound 容器之正規化(真 NodeKind + 容器旗標)

後端(latest)以 PVC 的 `kube_persistentvolumeclaim_info` `storageclass` label 解析出每個 PVC 的 StorageClass,並合成 `type: "storageclass"` 群組節點(id `<cluster>/storageclass/<sc>`,`parent` = 該 cluster 容器),把有解析到 StorageClass 的 PVC 的 `data.parent` 指向它,巢狀為 `cluster > storageclass > pvc`。`normalizeGraph` SHALL 將此節點正規化為**容器型的真 `NodeKind`**(比照 K8s `node` 容器):賦予 `kind: 'storageclass'`(使其可進 icon 圖例/收合時顯示、可被 `visibleKinds` 過濾)**並**標 `isStorageClass: true`(標示其自成 swatch 區段、排除於 detail 面板);MUST **不**賦予 `status` / `alerts`(分組盒無健康)。其 `parent` 以及其下 PVC 的 `parent` 一律**原樣穿透**(panel 不自造此節點、不改其巢狀——它由後端產生,僅由 panel 正規化)。

#### Scenario: storageclass 群組正規化為容器型 kind,PVC 巢狀原樣穿透

- **WHEN** 上游節點 `data.type === 'storageclass'`(帶 `parent` 指向其 cluster 容器),且其下 PVC 的 `parent` 指向該群組
- **THEN** normalize 賦予 `kind: 'storageclass'` 與 `isStorageClass: true`,**無** `status`、**無** `alerts`(即使上游帶 `alerts` 亦丟棄),並原樣保留其 `parent` 與 `label`(= `name`)
- **AND** 其下 PVC 的 `data.parent` 原樣指向該 storageclass 群組,且 PVC 仍攜帶自身的 `kind` 與 `status`(`cluster > storageclass > pvc`)
