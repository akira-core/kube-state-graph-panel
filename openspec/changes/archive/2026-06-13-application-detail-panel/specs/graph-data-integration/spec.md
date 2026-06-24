## ADDED Requirements

### Requirement: pod `application` / `containers` 透傳與 controller 聚合

`normalizeGraph` SHALL 於 anti-corruption boundary 承載 backend 在 pod 節點輸出的兩個新欄位——**`application?: string`**(ArgoCD application name)與 **`containers?: Array<{ name: string; image: string }>`**(container 與其 image)——並為 panel 端**合成**的 controller 節點自子 pod 聚合兩者。兩欄位經 `src/shared/types/cytoscape.d.ts` declaration merging 宣告於 `NodeDataDefinition`,供 node-detail 面板顯示與 URL 查詢使用。URL 查詢本身**非** normalize 職責——它是 UI 端的非同步動作,經 Grafana runtime 發出(見 panel-rendering「Node Detail Application 與 Containers 區塊」)。規則:

- **pod `application`**:backend 值為非空字串時原樣透傳;缺失或空字串時 MUST 省略該欄(`exactOptionalPropertyTypes`:不寫 `undefined` 值)。
- **pod `containers`**:逐項驗證——`name` 與 `image` 皆為非空字串的項目保留,形狀不符的項目 MUST 丟棄(anti-corruption);驗證後為空陣列或欄位缺失時 MUST 省略該欄。
- **controller `application`**(合成節點,`data.isController === true`,backend 不送):MUST 自其**子 pod** 的 `application` 聚合——取任一帶值的子 pod(以穩定排序確定性選取);無任何子 pod 帶值時 MUST 省略該欄。
- **controller `containers`**:MUST 自其**所有子 pod** 的 `containers` 聯集聚合,以 **(name, image)** 去重、穩定排序;無任何子 pod 帶 containers 時 MUST 省略該欄。
- 解析 / 聚合 MUST 為純函式、確定性、immutable(產生新元素,不就地修改輸入),與既有 controller 合成一致。
- 兩欄位 MUST NOT 影響既有 `worstStatus` 彙整、controller 去重(`(cluster, namespace, ownerKind, ownerName)`)或 `controller-owns-pod` 邊。
- 舊版 backend(不送這兩欄位)MUST 完全不受影響——產出與現行相同,無錯誤、無多餘欄位。

#### Scenario: pod application 原樣透傳

- **WHEN** backend 某 pod 節點 `data.application` 為 `"checkout"`
- **THEN** 正規化後該 pod element 之 `data.application` 為 `"checkout"`

#### Scenario: pod containers 原樣透傳

- **WHEN** backend 某 pod 節點 `data.containers` 為 `[{ name: "app", image: "repo/app:1.2" }]`
- **THEN** 正規化後該 pod element 之 `data.containers` 等值保留

#### Scenario: 欄位缺失或空值時省略

- **WHEN** backend 某 pod 節點無 `application`(或為空字串)且無 `containers`(或驗證後為空)
- **THEN** 該 pod element MUST NOT 帶 `data.application` 與 `data.containers`

#### Scenario: 形狀不符的 container 項目被丟棄

- **WHEN** backend 某 pod 的 `containers` 為 `[{ name: "app", image: "repo/app:1.2" }, { name: "", image: "x" }, { name: "noimg" }]`
- **THEN** 正規化後僅保留 `{ name: "app", image: "repo/app:1.2" }`

#### Scenario: controller 自子 pod 聚合 application

- **WHEN** 某 controller 旗下有子 pod 帶 `data.application: "mongo"`
- **THEN** 合成的 controller 節點 `data.application` 為 `"mongo"`(controller 本身 backend 不送此欄)

#### Scenario: controller 聚合 containers 並以 (name, image) 去重

- **WHEN** 某 controller 旗下三個子 pod 皆帶 `containers: [{ name: "app", image: "repo/app:1.2" }]`,其中一個另帶 `{ name: "sidecar", image: "repo/sc:0.9" }`
- **THEN** 合成的 controller 節點 `data.containers` 為兩項:`app`/`repo/app:1.2` 與 `sidecar`/`repo/sc:0.9`(去重後、穩定排序)

#### Scenario: controller 無子 pod 帶值時省略

- **WHEN** 某 controller 旗下無任一子 pod 帶 `application` 或 `containers`
- **THEN** 合成的 controller 節點 MUST NOT 帶 `data.application` 與 `data.containers`

#### Scenario: 聚合為純函式且確定性

- **WHEN** 以相同 input 多次呼叫 `normalizeGraph`,且某 controller 有多個子 pod 帶不同 `application` 值
- **THEN** 每次選取的 `data.application` 一致(穩定排序確定性選取),且輸入未被就地修改

#### Scenario: 舊版 backend 不受影響

- **WHEN** backend 回應的 pod 節點皆不含 `application` / `containers` 欄位
- **THEN** `normalizeGraph` 產出與現行行為完全相同,`errors` 不含相關錯誤

### Requirement: controller 告警(alerts)自子 pod 聚合

`normalizeGraph` SHALL 於合成 controller 節點時,自其**子 pod** 的 `data.alerts` 聚合出該 controller 的 `data.alerts`(`NodeAlert[]`),使 node-detail 面板的告警表格對 controller 顯示旗下所有 pod 的告警。聚合僅及於 panel 合成的 controller 節點(`isController === true`);k8s `node` 容器與其他 backend 實體節點不在此列。規則:

- **順序**:以子 pod 的穩定排序(podId 升冪)串接各 pod 的 alerts,pod 內保持解析後順序——對相同輸入確定性。
- **pod 歸屬**:聚合項目缺 `pod` 欄時 MUST 以來源 pod 的 label 回填;已帶 `pod` 的項目 MUST 保留原值。回填 MUST 作用於新物件——來源 pod 元素自身的 `alerts` MUST NOT 被修改。
- **去重**:帶 `id` 的項目 MUST 跨 pod 以 `id` 去重(穩定順序下首見者勝);無 `id` 的項目一律保留。
- **省略**:無任一子 pod 帶 alerts 時,controller MUST NOT 帶 `alerts` 欄(不寫 `undefined` 值)。
- **顏色與既有合成不受影響**:此聚合 MUST NOT 改變 `worstStatus` 彙整(**status 仍為唯一節點上色來源**;alerts 不參與 stylesheet)、controller 去重 key 或 `controller-owns-pod` 邊。

#### Scenario: controller 聚合子 pod 告警

- **WHEN** 某 controller 旗下兩個 pod 各帶一筆 alert(`HighMem` / `CrashLoop`)
- **THEN** 合成的 controller 節點 `data.alerts` 含兩筆(podId 升冪串接),node-detail 告警表格對該 controller 顯示兩列

#### Scenario: 缺 pod 欄的告警以來源 pod 回填

- **WHEN** 子 pod(label `mongo-0`)的 alert 不帶 `pod` 欄
- **THEN** controller 上的聚合副本 `pod` 為 `"mongo-0"`;該 pod 自身元素的 alert 仍不帶 `pod` 欄(輸入與 pod 元素未被修改)

#### Scenario: 帶 id 的告警跨 pod 去重

- **WHEN** 兩個子 pod 各帶 `id: "alert-1"` 的同一筆 alert
- **THEN** controller 的 `data.alerts` 僅含一筆 `id: "alert-1"`(穩定順序首見者)

#### Scenario: 無子 pod 帶告警時省略

- **WHEN** 某 controller 旗下無任一子 pod 帶 `alerts`
- **THEN** 合成的 controller 節點 MUST NOT 帶 `data.alerts`(告警表格顯示「No alerts」)

#### Scenario: 告警聚合不影響 status 上色

- **WHEN** 某 controller 旗下唯一 pod `status: normal` 但帶一筆 `severity: 'critical'` 的 alert
- **THEN** controller 的 `data.alerts` 含該筆 alert,但 `worstStatus` 仍為 `normal`(alert 不升級 status——顏色仍由 status 決定);`controller-owns-pod` 邊與去重不變

## MODIFIED Requirements

### Requirement: Controller 節點與 controller-owns-pod 邊之合成(自 pod data.owner)

由於後端僅在 pod 上以 `data.owner` 提供控制器 metadata、不輸出 controller 節點與 `controller-owns-pod` 邊,系統 SHALL 於 `normalizeGraph`(anti-corruption layer,純函式、確定性、不涉 pod-parent 模式)中**自 pod 的 owner 合成**這兩者,使下游 `applyPodParentMode` 與 stylesheet 無需知道 owner 的來源:

- 對每個帶有效 owner(`data.owner.{kind,name}`,或缺該欄時退讀 `labels.owner_kind` / `labels.owner_name`)的 pod,系統 MUST 確保存在**唯一**的 controller 節點,以 `(cluster, namespace, ownerKind, ownerName)` 去重(多個同屬一控制器的 pod 共用同一節點)。`namespace` 取自 pod 的 `data.namespace`(由 `labels.namespace` 映射)、`cluster` 取自 pod 的 `labels.cluster`;缺 cluster / namespace 時 MUST 以明確 sentinel(例如空字串)入 key,使不同情境下的同名控制器**不**誤併。controller 節點的 `data.kind` MUST 為 `ownerKind` 正規化後的小寫值(如 `Deployment` → `deployment`);非面板已知 workload kind(例如裸 `ReplicaSet`)MUST 仍合成節點並走 fallback icon、預設可見,不報錯。controller 節點 id MUST 為對該 key 確定性的字串;`data.parent` MUST 為**該 pod 所屬 cluster 容器之實際 id**——由 pod 的 cluster 祖先解析(沿 pod 的 `data.parent` 鏈上溯至 `isCluster` 容器,或以 pod 的 `labels.cluster` 對應到該 `isCluster` 容器),重用該容器**既有 id**,**不可**以 `cluster/<name>` 字串模板硬湊(panel 不自行構造 cluster 容器 id);pod 無 cluster 祖先時 controller **無 parent**(top-level)。`data.label` MUST 為 `ownerName`。
- 對每個這樣的 pod,系統 MUST 合成一條 `edgeType: 'controller-owns-pod'` 的邊,`source` = 該 controller 節點 id、`target` = pod id,邊 id 對 `(controllerId, podId)` 確定性。
- 合成 MUST 為 immutable(產生新元素,不就地修改輸入),且對相同輸入位元組級確定(節點/邊排序穩定)。
- 無 owner 的 pod MUST NOT 觸發任何 controller 節點或邊。
- 系統 MUST 於每個合成的 controller 節點上彙整其**子 pod 的最差 status** 為 `data.worstStatus`(值域 `normal` / `warning` / `critical`;排序 critical > warning > normal;status 取自 pod 的 `data.status`,缺值 / 不合法預設 `normal`)。controller 必有至少一個子 pod,此欄 MUST **一律寫入**——最差為 `normal` 時寫入 `normal`(不省略),使旗下全健康的 controller 收合時畫明確的綠框。**同一彙整亦施於每個 k8s `node` 容器**:其 `data.worstStatus` 取 **自身 status 與其各子 pod status 之最差**(worst-wins——絕不因子節點而降級到比自身 status 更輕),於**有 status 資訊**時寫入(自身帶合法 `status`,或至少有一個子 pod);自身無 status 且無任何子 pod 時 MUST 省略此欄(「無資訊」不得偽裝成 normal)。此欄供 getStylesheet 對**收合的**容器(controller / k8s node)邊框上色(見 panel-rendering 規格);它**不**影響 owns 邊或去重。採 **status**(非 alert severity):後端為每個節點都給 status(uniform `normal/warning/critical`,預設 normal),故一個 pod 即使**不帶 alert**、只要 status 非 normal 仍會傳播(alert 另有 `info` 階且僅供 detail panel 的 alert 表)。

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
- **THEN** 合成的 controller 節點 `data.worstStatus` 為 `normal`(一律寫入,收合時畫綠框)
- **WHEN** 某 k8s `node`(自身 `status: normal`)旗下有一 pod `status: critical`
- **THEN** 該 node `data.worstStatus` 為 `critical`(子節點 status 傳播)
- **WHEN** 某 k8s `node`(自身 `status: critical`)旗下 pod 皆 `normal`
- **THEN** 該 node `data.worstStatus` 為 `critical`(worst-wins,不被子節點降級)
- **WHEN** 某 k8s `node` 自身 `status: normal` 且旗下 pod 皆 `normal`(或缺 status)
- **THEN** 該 node `data.worstStatus` 為 `normal`(有 status 資訊即寫入)
- **WHEN** 某 k8s `node` 自身無 `status` 且無任何子 pod
- **THEN** 該 node MUST 省略 `worstStatus`(無 status 資訊)

#### Scenario: 合成為純函式且確定性

- **WHEN** 以相同 input 多次呼叫 `normalizeGraph`
- **THEN** 合成的 controller 節點與 owns 邊集合、排序、id 完全一致,輸入未被就地修改
