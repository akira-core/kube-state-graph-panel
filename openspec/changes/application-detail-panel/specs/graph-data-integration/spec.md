## ADDED Requirements

### Requirement: ArgoCD application name 正規化(固定 label,controller 自子 pod 聚合)

`normalizeGraph` SHALL 於 anti-corruption boundary 自固定 label key **`argocd.argoproj.io/instance`** 解析每個 pod / controller 節點的 ArgoCD application name,並承載為節點的 `data.argoAppName?: string`(經 `src/shared/types/cytoscape.d.ts` declaration merging 宣告於 `NodeDataDefinition`),供 detail 面板查詢 ArgoCD URL。URL 查詢本身**非** normalize 職責——它是 UI 端的非同步動作,經 Grafana runtime 發出(見 panel-rendering「Node Detail ArgoCD Application 區塊」)。規則:

- **pod**:取自身 `data.labels['argocd.argoproj.io/instance']`;為非空字串時設為 `data.argoAppName`,否則 MUST 省略該欄(`exactOptionalPropertyTypes`:不寫 `undefined` 值)。
- **controller**(合成節點,`data.isController === true`,本身**無** `labels`):MUST 自其**子 pod** 的 `argocd.argoproj.io/instance` label 聚合——取任一帶該 label 的子 pod 之值(以穩定排序確定性選取);無任何子 pod 帶該 label 時 MUST 省略該欄。同一 controller 的子 pod 通常屬同一 application。
- 來源**僅限 label**(上游 `labels` map);annotation 不在上游 wire 的 labels 內,故不支援(屬後端議題,明列為非目標)。
- 解析 / 聚合 MUST 為純函式、確定性、immutable(產生新元素,不就地修改輸入),與既有 controller 合成一致。
- 此欄 MUST NOT 影響既有 `worstStatus` 彙整、controller 去重(`(cluster, namespace, ownerKind, ownerName)`)或 `controller-owns-pod` 邊。

#### Scenario: pod 自身 label 解析為 argoAppName

- **WHEN** 某 pod `data.labels` 含 `argocd.argoproj.io/instance: "checkout"`
- **THEN** 該 pod element 之 `data.argoAppName` 為 `"checkout"`

#### Scenario: pod 無該 label 時省略

- **WHEN** 某 pod `data.labels` 不含 `argocd.argoproj.io/instance`(或其值為空字串)
- **THEN** 該 pod element MUST NOT 帶 `data.argoAppName`

#### Scenario: controller 自子 pod 聚合 argoAppName

- **WHEN** 某 controller 旗下有子 pod 帶 `argocd.argoproj.io/instance: "mongo"`
- **THEN** 合成的 controller 節點 `data.argoAppName` 為 `"mongo"`(自子 pod 聚合;controller 本身無 labels)

#### Scenario: controller 無子 pod 帶 label 時省略

- **WHEN** 某 controller 旗下無任一子 pod 帶 `argocd.argoproj.io/instance`
- **THEN** 合成的 controller 節點 MUST NOT 帶 `data.argoAppName`

#### Scenario: 聚合為純函式且確定性

- **WHEN** 以相同 input 多次呼叫 `normalizeGraph`,且某 controller 有多個子 pod 帶 `argocd.argoproj.io/instance`
- **THEN** 每次選取的 `data.argoAppName` 一致(穩定排序確定性選取),且輸入未被就地修改
