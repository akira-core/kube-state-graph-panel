# node-icon-encoding Specification

## Purpose

TBD - created by archiving change icon-encoding-workload-topology. Update Purpose after archive.
## Requirements

### Requirement: Node identity is encoded by icon

The system SHALL carry node identity (`kind`) through a per-kind **icon**, replacing the previous per-kind shape encoding. All leaf nodes MUST render in a uniform `round-rectangle` container, with kind distinguished by the node's `background-image` (its icon). `ICON_SVG_BY_KIND`, exported from `src/shared/constants/iconSvgByKind.ts`, MUST be the single source of the kind→icon mapping, shared by `getStylesheet` and the legend (taking over the identity role `SHAPE_BY_KIND` used to hold). The `NodeKind` enum MUST be `pod` / `node` / `pvc` / `service` / `external`, plus the workload kinds `deployment` / `statefulset` / `daemonset` / `job` / `cronjob`, the physical-network kind `switch` (backend v0.0.18), **the physical-storage kinds `netapp-aggr` (an ONTAP aggregate, a leaf) and `netapp-node` (an ONTAP controller, a **real** compound container — see the compound-icon requirement below)**, and the virtual **container** kind `network` that wraps the switch fabric (the `network > switch` group; its wifi glyph is drawn only when collapsed, and it is icon-less when expanded like every other container; when collapsed it replaces `switch` in the Node-kinds legend with the label `physical network` — see the panel-rendering and switch-tier-layout specs). `storageclass` MUST NOT exist (the backend removed it from the contract; the physical storage chain replaces it). `others` MUST NOT exist (the backend removed it from the contract; `external` absorbed that fallback). ReplicaSet is **not** a panel `NodeKind` — the backend collapses `Deployment → ReplicaSet → Pod` and attributes a pod straight to its top-level controller, so a ReplicaSet never appears in the graph and needs no icon.

`netapp-aggr` and `netapp-node` MUST each have their own icon, and the two MUST be visually distinguishable (a storage-pool vocabulary for the aggregate, a chassis/controller vocabulary for the controller), so that the two tiers sharing the `Storage` category do not blur together in the legend or on the canvas.

#### Scenario: A known kind maps to the correct icon

- **WHEN** a node's data carries `kind: 'deployment'` (or any other defined kind)
- **THEN** that node renders in the uniform `round-rectangle` container with the icon from `ICON_SVG_BY_KIND['deployment']` as its centred `background-image`, and the mapping agrees with `iconSvgByKind.ts`

#### Scenario: Leaf node shape no longer encodes kind

- **WHEN** two leaf nodes of different kinds (say `pod` and `service`) render at the same time
- **THEN** both containers are `round-rectangle` (shape no longer distinguishes kind) and only the icon distinguishes identity

#### Scenario: The two NetApp kinds have distinguishable icons

- **WHEN** a single graph renders both a `kind: 'netapp-aggr'` and a `kind: 'netapp-node'` node
- **THEN** `ICON_SVG_BY_KIND` supplies a different icon for each, and `storageclass` is no longer a key of `ICON_SVG_BY_KIND`

### Requirement: icon 隨 Grafana 主題單色上色

系統 SHALL 提供純函式 `tintSvgToDataUri(rawSvg, hex)`,將 line-art SVG 的 `currentColor` sentinel 替換為傳入的主題色 `hex`,再以 `encodeURIComponent` 編碼為 `data:image/svg+xml,...` 字串(**非 base64**——cytoscape style 文件明示 SVG data-URI 用 encodeURIComponent、勿用 base64)。每個 icon SVG MUST 帶有 XML header(`<?xml version="1.0" encoding="UTF-8"?>`)與明確 `width`/`height`;缺 XML header 時 cytoscape 在 canvas 上 rasterise 為空白(同一 URI 作為 `<img>` 卻正常,故 legend 顯示而 canvas 空白)。上色 MUST 集中於純工廠 `getStylesheet(theme, …)`:以 `function(ele)` mapper 依 `ele.data('kind')` 查 `ICON_SVG_BY_KIND` 並以主題色產生 `background-image` data-URI;`background-fit` MUST 為 `contain`、`background-clip` 為 `none`,icon 寬高 MUST 內縮(約 60%)使容器邊框/狀態色仍可見。產生的 data-URI MUST 以 `(kind, hex)` 為鍵 memoize(避免 per-node 唯一 URI 破壞 cytoscape 影像快取)。`normalizeGraph` MUST NOT 涉及 icon 或主題(維持純 anti-corruption)。

#### Scenario: 主題切換時 icon 重新上色且不重建 instance

- **WHEN** 使用者於 Grafana 切換 dark ↔ light theme
- **THEN** `getStylesheet` 以新主題色重算每個 kind 的 icon data-URI 並 `cy.style(stylesheet).update()`;`cyRef.current` 引用不變;icon 顏色隨主題改變

#### Scenario: tintSvgToDataUri 正確編碼

- **WHEN** 以含 `currentColor` 的 SVG 與某主題 hex(如 `#c3cbd9`)呼叫 `tintSvgToDataUri`
- **THEN** 回傳字串中 `currentColor` 已被該 hex 取代,且所有 `#` 編碼為 `%23`,字串以 `data:image/svg+xml,` 起始(非 `;base64,`)

#### Scenario: 相同 (kind, hex) 回傳穩定 memoized 結果

- **WHEN** 同一 `(kind, hex)` 多次經由 stylesheet 取得 icon data-URI
- **THEN** 回傳同一字串(referential 穩定),不重複編碼

### Requirement: Icons on compound containers (none when expanded, centred icon when collapsed or a leaf)

When a `node` / `controller` / `netapp-node` node is an **expanded** compound parent (it has visible children, matching `:parent`), the system MUST NOT render a resource icon (`node:parent` sets `background-image: 'none'`) and MUST show only the label and the container frame, so that no icon tiles behind the children. The same nodes in the **collapsed** state (not `:parent`) show their kind icon in the centre, resolved by the base `node` selector from `data.kind`. Among these, `controller` is a compound group the backend emits directly under D6, yet it still carries a real `kind` (enrichment derives it from a child pod's `owner.kind`), so it behaves exactly like the controller the panel used to synthesise: **its Workloads glyph when collapsed, a frame when expanded.**

`netapp-node` belongs to the same class and is the real-node compound parent the **backend contract names directly** (the storage chain `storage-cluster > netapp-node > netapp-aggr`): it carries a real `kind`, is selectable, and has an icon, while also boxing its `netapp-aggr` children. It MUST therefore follow the `node` / `controller` expanded/collapsed icon behaviour exactly (a frame when expanded, its kind icon when collapsed). `netapp-aggr` is the leaf beneath it and always draws its icon as a leaf.

`storageclass` has been removed from `NodeKind`, so its expanded/collapsed and leaf-glyph behaviour disappears with it; no rule corresponds to it any more.

Any decorative compound group with **no `kind`** MUST NOT render a resource icon in either state (expanded or collapsed). Besides the existing `cluster` container (`isCluster`), this now covers the `namespace` (`isNamespace`), `application` (`isApplication`), and `storage-cluster` (`isStorageCluster`) groups the backend emits under D6: all of them are kind-less, accent-only group frames. The corresponding stylesheet selectors (`node[?isCluster]` / `node[?isNamespace]` / `node[?isApplication]` / `node[?isStorageCluster]`) MUST force `background-image: 'none'` and present only the label and the accent frame.

#### Scenario: An expanded container carries no icon

- **WHEN** a `node` / `controller` / `netapp-node` container holds visible children (expanded, matching `:parent`)
- **THEN** that container's `background-image` is `none`, its centre is left to the children, and only the label and container frame show

#### Scenario: A collapsed node / controller shows its centred kind icon

- **WHEN** a `node`, `controller`, or `netapp-node` container is collapsed (not `:parent`)
- **THEN** its centre shows its `kind` icon — a collapsed K8s node shows the node icon, a collapsed controller shows its Workloads glyph, and a collapsed `netapp-node` shows its controller icon

#### Scenario: The storageclass leaf glyph no longer exists

- **WHEN** inspecting `ICON_SVG_BY_KIND` and the stylesheet's kind resolution
- **THEN** there is no `storageclass` kind (it was removed from both the contract and the enum) and the old leaf-glyph behaviour this scenario described is gone with it; the `netapp-aggr` leaf icon takes its place

#### Scenario: A kind-less decorative group carries no resource icon

- **WHEN** rendering an `isCluster` / `isNamespace` / `isApplication` / `isStorageCluster` compound container, expanded or collapsed
- **THEN** that container carries no resource icon (`background-image: 'none'`) and serves only as a group frame in its accent colour

### Requirement: 未知 kind 走 fallback icon 且預設可見

當節點 `data.kind` 不在 `ICON_SVG_BY_KIND` keys 中時,系統 MUST 以通用 fallback icon 渲染,且該節點 MUST 預設可見(延續既有 unknown-kind 可見哲學),不拋出例外,使上游/後端新增資源類型時不會無聲消失。

#### Scenario: 未知 kind 顯示 fallback icon

- **WHEN** 上游回傳節點 `data.kind` 不在 `ICON_SVG_BY_KIND` 中(例:`ingress`)
- **THEN** 該節點以統一容器 + 通用 fallback icon 渲染,預設可見,console 不報錯

### Requirement: icon 上色純函式可單測

`tintSvgToDataUri` MUST 為純函式並具備單元測試覆蓋;含 icon 的 stylesheet MUST 以 snapshot 測試。測試 MUST 為 headless,不斷言像素級渲染。

#### Scenario: 純函式與 stylesheet 測試覆蓋

- **WHEN** CI 跑 `npm run test`
- **THEN** `tintSvgToDataUri` 測試覆蓋 `currentColor` 替換、`#`→`%23` 編碼、非 base64、`(kind,hex)` memoize 穩定性;`getStylesheet` snapshot 涵蓋帶 icon `background-image` 的節點樣式,皆通過
