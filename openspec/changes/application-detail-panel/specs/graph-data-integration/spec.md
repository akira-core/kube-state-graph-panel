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
