## ADDED Requirements

### Requirement: 合成 controller 節點攜帶 namespace

`normalizeGraph` 於 `synthesizeControllers` 合成 controller 節點時,SHALL 在該節點 `data` 寫入 `namespace`。值取自其 owned pod 的 namespace:controller 以 `(cluster, namespace, ownerKind, ownerName)` 去重,故同一 controller 的所有 owned pod 共用同一 namespace;來源為 pod 的 `labels.namespace`,經 `PendingOwned.namespace` 帶上。namespace 為空字串(owned pod 無 namespace)時 MUST 省略該欄(`exactOptionalPropertyTypes`:不寫 `undefined`),比照 leaf 節點 `...(isString(namespace) ? { namespace } : {})` 慣例。

此欄為 **mode-agnostic 的 leaf 事實**(controller 節點本即由 `normalizeGraph` 合成),寫於 normalize 不破壞其 mode-agnostic 性;它供下游 `applyNamespaceGrouping`(`controller` 模式)把 controller 收進其 namespace 盒(見 namespace-grouping 規格)。此欄 MUST NOT 影響既有 controller 去重 key、`worstStatus` 彙整、`controller-owns-pod` 邊,或 application / containers / alerts 聚合。

#### Scenario: 合成 controller 攜帶其 namespace

- **WHEN** 某 controller 旗下 pod 帶 `data.namespace: 'shop'`(owner 為 `{ kind: "Deployment", name: "checkout" }`)
- **THEN** 合成的 controller 節點 `data.namespace` 為 `'shop'`

#### Scenario: owned pod 無 namespace 時合成 controller 省略 namespace

- **WHEN** 某 controller 旗下 pod 皆無 `labels.namespace`
- **THEN** 合成的 controller 節點 MUST NOT 帶 `data.namespace`(不寫 `undefined`)

#### Scenario: 不同 namespace 同名 owner 各自帶其 namespace(既有去重不變)

- **WHEN** namespace `a` 與 namespace `b` 各有一個 owner 為 `{ kind: "Deployment", name: "api" }` 的 pod
- **THEN** 合成兩個不同 controller 節點(沿用既有 `(cluster, namespace, ownerKind, ownerName)` 去重),其 `data.namespace` 分別為 `a` 與 `b`
