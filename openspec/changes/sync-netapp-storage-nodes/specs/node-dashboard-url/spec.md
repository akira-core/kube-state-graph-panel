# node-dashboard-url delta — sync-netapp-storage-nodes

## MODIFIED Requirements

### Requirement: Dashboard 按鈕的節點適用範圍

Panel SHALL 僅對 **node-detail 面板會開啟的節點**請求 `/dashboard` 並渲染 Dashboard 按鈕——即 **leaf 節點**(含後端實體儲存的 **`netapp-aggr`** leaf,攜帶 `health` / `usage`)、**k8s-node**(`kind: node`)compound 容器、**`netapp-node`** compound 容器(後端契約中唯一由真實節點擔任 compound parent 者,攜帶 `health`)、與 **controller** compound 容器(backend 提供、經 enrich 後攜帶真實 `kind` 的 controller;`resolveSelectedNode` ≠ `null` 的集合)。**cluster / storage-cluster / namespace / application** compound MUST NOT 觸發任何 `/dashboard` 查詢、亦 MUST NOT 渲染 Dashboard 按鈕。適用範圍的守門以參數組裝在不適用節點回傳「無參數」(`undefined`)實作——使停用的節點不發查詢——並與 `resolveSelectedNode` 的排除集合(`isCluster` / `isStorageCluster` / `isNamespace` / `isApplication`)共用同一判定,不另立平行清單以免漂移。

`netapp-aggr` / `netapp-node` 雖開啟 detail 面板並如其他適用節點般進行 `/dashboard` 預取,但其 `kind` **不屬於 Workloads `DETAIL_URL` 集合**,故 `resolveSelectedNode` MUST NOT 為其指派 per-kind dashboard query target(`queryTarget`):其 `health` / `usage`(以及 `netapp-aggr` 的 `ontap_cluster` / `node` labels)由右上角**釘選 tooltip** 呈現(見 panel-rendering「Hover Tooltip」pinned 模式),detail 面板本身為 header-only(無 Workloads-kind 的細項查詢目標)。已移除的 `storageclass` kind 連同其 `provisioner` / `parameters` 的同類規則一併消失。

#### Scenario: leaf(含 storageclass)/ k8s-node / controller 為適用節點

- **WHEN** node-detail 面板對一個 leaf 節點(含 `netapp-aggr` leaf;本情境原先所述的 `storageclass` leaf 已自契約移除)、k8s-node compound、`netapp-node` compound、或 backend 提供的 enriched controller compound 開啟
- **THEN** 系統為該節點發出一次 `/dashboard` 查詢(於下「預取」需求所述時機),並在可用時渲染 Dashboard 按鈕

#### Scenario: storageclass leaf 開啟 detail 但無 per-kind dashboard query target

- **WHEN** 被選取的節點為 `netapp-aggr` leaf 或 `netapp-node` compound(攜帶 `health` / `usage`;本情境原先所述的 `storageclass` leaf 已自契約移除)
- **THEN** detail 面板以 header-only 開啟,其 `health` / `usage` 釘選於右上角 tooltip(見 panel-rendering「Hover Tooltip」pinned 模式);由於其 `kind` 不屬 Workloads `DETAIL_URL` 集合,`resolveSelectedNode` MUST NOT 為其指派 per-kind `queryTarget`(它仍如其他適用節點般進行 `/dashboard` 預取、可用時渲染 Dashboard 按鈕)

#### Scenario: cluster / namespace / application 不適用

- **WHEN** 被選取的節點為 `cluster` / `storage-cluster` / `namespace` / `application` compound
- **THEN** 系統 MUST NOT 發出 `/dashboard` 查詢,Dashboard 按鈕 MUST NOT 渲染(這些節點本就不開啟 detail 面板)
