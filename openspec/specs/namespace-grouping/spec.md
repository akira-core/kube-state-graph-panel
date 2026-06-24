# namespace-grouping Specification

## Purpose
TBD - created by archiving change namespace-compound-grouping. Update Purpose after archive.
## Requirements
### Requirement: Namespace compound 合成(controller 模式專屬)

系統 SHALL 提供純函式 `applyNamespaceGrouping(elements, mode)`,於 `applyPodParentMode` 之後、`wrapSwitchFabric` 之前組合(`KsgPanel` 以 `wrapSwitchFabric(applyNamespaceGrouping(applyPodParentMode(baseElements, mode), mode))` 串接)。`normalizeGraph` MUST 維持 mode-agnostic、完全不碰 namespace 分群——namespace compound 為純前端、模式相依的 post-normalize pass。

- `mode === 'node'`:**no-op**——MUST 回傳與輸入語意等價的新陣列,完全不插入 namespace 盒、不寫 `namespaceColor`、不繪製任何 namespace 層。
- `mode === 'controller'`:自各 namespaced 資源的 `data.namespace` 合成虛擬 namespace compound 父節點,並把 namespaced 資源 re-parent 進去,形成:
  - `cluster → namespace → controller → pod`(controller 為 `data.isController === true` 且帶 `data.namespace`——該欄由 normalize 於合成 controller 時寫入,見 graph-data-integration 規格「合成 controller 節點攜帶 namespace」;pod 維持巢狀於其 controller,不再變動)
  - `cluster → namespace → service`(`kind === 'service'` 且帶 `data.namespace`)
  - pvc 之 storageclass 巢狀見專屬需求。

namespace 盒 MUST 區分「自身 id」與「parent」兩種 id:

- **自身 id**:由 panel 以 `(cluster 容器實際 id, namespace 名稱)` 的 opaque key **確定性合成**(比照 `controllerIdFor` 的 opaque-key 合成**手法**——確定性、不透明 `/`-joined 串接——而非沿用其相同輸入欄位);MUST NOT 以「猜測後端 cluster 命名」的字串模板硬湊,而 MUST 以**已解析到的實際 cluster 容器 id**為料(該 id 對 panel 不透明,僅作唯一鍵串接)。
- **parent**:MUST **重用既有 cluster 容器的實際 id**(取該資源的 cluster 祖先實際 id——原 parent 或沿 parent 鏈上溯至 `isCluster` 容器),MUST NOT 自造 cluster 容器 id。

re-parent 規則:擷取資源的 cluster 祖先 MUST 在改寫其 `data.parent` 之前於 fresh-clone 上完成(immutable);僅當其原 parent / cluster 祖先確為 `isCluster` 容器時才插入 namespace 層。

Fallback:`data.namespace` 缺失 / 空字串,或無 cluster 祖先(top-level)的 controller / service / pvc MUST 跳過 namespace 層(維持原 parent),不建盒、不消失、不報錯。

`applyNamespaceGrouping` MUST 為純函式、對相同輸入位元組級確定(namespace 盒以穩定排序插入)、且不就地修改輸入(每個被改 parent 的元素 fresh-clone、`data` 至少淺拷貝;新合成的 namespace 盒為新物件)。

#### Scenario: controller 模式下 controller 與 service 就位於 namespace 盒

- **WHEN** `mode === 'controller'` 且某 cluster 容器下有一帶 `data.namespace: 'shop'` 的合成 controller 與一帶 `data.namespace: 'shop'` 的 service(兩者原 parent 皆為該 cluster 容器)
- **THEN** 合成一個 `(cluster, 'shop')` namespace 盒(`parent` = 該 cluster 容器既有 id),該 controller 與 service 的 `data.parent` 改指此 namespace 盒,形成 `cluster → namespace → controller → pod` 與 `cluster → namespace → service`;controller 旗下 pod 的 parent 不變(仍巢狀於 controller)

#### Scenario: node 模式為 no-op 不繪製 namespace

- **WHEN** `mode === 'node'`
- **THEN** `applyNamespaceGrouping` 回傳與輸入語意等價的新陣列:不插入任何 namespace 盒、不寫入 `namespaceColor`、所有 controller / service / pvc 維持其原 parent(`cluster → node → pod` 與既有 service / pvc / storageclass 掛點完全不變)

#### Scenario: 缺 namespace 或無 cluster 祖先者 fallback 跳過

- **WHEN** `mode === 'controller'` 且某 service 缺 `data.namespace`(或為空字串),或某 controller 無 cluster 祖先(top-level)
- **THEN** 該資源 MUST 跳過 namespace 層、維持原 parent,不建 namespace 盒、不消失、不報錯

#### Scenario: 同名 namespace 跨 cluster 各一盒

- **WHEN** `mode === 'controller'` 且 cluster `prod` 與 cluster `dr` 各有一個 `data.namespace: 'shop'` 的 controller
- **THEN** 合成**兩個**不同的 namespace 盒(以 `(clusterContainerId, namespace)` key 區分),各自 `parent` 指向其所屬 cluster 容器既有 id,不誤併為單一盒

#### Scenario: 不就地修改輸入

- **WHEN** 以同一組 elements 連續呼叫 `applyNamespaceGrouping(elements, 'controller')` 與 `applyNamespaceGrouping(elements, 'node')`
- **THEN** 輸入 `elements` 陣列與其節點/邊物件 MUST NOT 被修改(referential 上產生新物件),兩次呼叫結果互不污染

### Requirement: PVC 依 namespace 巢狀於 storageclass(controller 模式拆盒)

`mode === 'controller'` 時,`applyNamespaceGrouping` SHALL 使 pvc 走 `cluster → namespace → storageclass → pvc`(namespace 外層、storageclass 內層)。由於後端的 storageclass 盒(`isStorageClass === true`)為 cluster-scoped、可能含跨 namespace 的 pvc,panel MUST 依各 pvc 的 namespace **拆盒**:

- 對每個帶 `data.namespace` 且原 parent 為**後端 storageclass 盒**的 pvc:MUST 確保存在 per-`(namespaceBoxId, storageclassName)` 的 **storageclass sub-box**(`kind: 'storageclass'`、`isStorageClass: true`、`label` = 原 storageclass 名;`parent` = 該 `(cluster, namespace)` namespace 盒;自身 id 以 `(namespaceBoxId, storageclassName)` 確定性合成的 opaque key),並把該 pvc re-parent 至此 sub-box。
- 對帶 `data.namespace` 但**無 storageclass**(原 parent 為 cluster 容器)的 pvc:MUST 直接 re-parent 至 `(cluster, namespace)` namespace 盒(`cluster → namespace → pvc`)。
- **原後端 storageclass 盒**:其 pvc 全被 re-parent 至 per-namespace sub-box 後即冗餘,MUST 自 elements **移除**(以過濾而非 mutate;避免空盒殘留)。
- 同一 storageclass 若被多 namespace 使用,MUST 在各該 namespace 下各出現一個 storageclass sub-box(可接受的重複,與「namespace 為外層分群」一致)。
- storageclass sub-box 比照既有 storageclass 盒:MUST **不**帶 `status` / `alerts` / `worstStatus`,並標 `isStorageClass: true`。

`mode === 'node'`:storageclass MUST 維持後端原樣(`cluster → storageclass → pvc`,不拆),`applyNamespaceGrouping` 不碰。

拆盒、re-parent、移除 MUST 為純函式、對相同輸入確定(sub-box 以穩定排序——namespace 名、再 storageclass 名——插入)、immutable(不就地修改輸入)。

#### Scenario: 跨 namespace 的 storageclass 拆成多盒

- **WHEN** `mode === 'controller'` 且後端某 cluster 下的 `gp2` storageclass 盒含 namespace `a` 的 pvc 與 namespace `b` 的 pvc
- **THEN** panel 合成兩個 storageclass sub-box(`(a-box, 'gp2')` 與 `(b-box, 'gp2')`,皆 `isStorageClass: true`、`label: 'gp2'`),namespace `a` 的 pvc re-parent 至前者、namespace `b` 的 pvc re-parent 至後者,形成 `cluster → a → gp2 → pvc` 與 `cluster → b → gp2 → pvc`

#### Scenario: 無 storageclass 的 pvc 直掛 namespace

- **WHEN** `mode === 'controller'` 且某 pvc 帶 `data.namespace: 'shop'` 但原 parent 為 cluster 容器(無後端 storageclass 盒)
- **THEN** 該 pvc re-parent 至 `(cluster, 'shop')` namespace 盒(`cluster → namespace → pvc`),不合成 storageclass sub-box

#### Scenario: 原後端 storageclass 盒於拆盒後移除

- **WHEN** `mode === 'controller'` 且後端某 storageclass 盒之 pvc 全被 re-parent 至 per-namespace sub-box
- **THEN** 原後端 storageclass 盒(已無子)MUST 自 elements 移除,不留空容器

#### Scenario: node 模式不拆 storageclass

- **WHEN** `mode === 'node'` 且後端輸出 `cluster → storageclass → pvc`
- **THEN** `applyNamespaceGrouping` 不拆盒、不移除原 storageclass 盒、不 re-parent pvc——維持後端原樣

### Requirement: Namespace 高對比顏色編碼

系統 SHALL 提供顏色 helper `colorForNamespace(name: string): string`,以穩定字串 hash 取 `NAMESPACE_PALETTE[hash % len]`(比照 `colorForCluster` / `clusterPalette.ts`)。`NAMESPACE_PALETTE` MUST 為 panel 自有、固定有序的高對比 colorblind-safe 分類調色盤常數,MUST **避開** status 三色(`#73BF69` / `#F2CC0C` / `#E02F44`)並盡量與 cluster 冷色弧(blue→indigo→violet→teal)拉開色相,使巢狀盒上的 cluster 邊框與 namespace 邊框可區分;若參考 Grafana 分類色盤,MUST 先凍結為固定有序常數再以 panel 的穩定 hash 取 index,MUST NOT 在 runtime 依出現順序或 Grafana 內部排序動態取色。

同名 namespace 跨 data refresh、跨 cluster 顏色 MUST 穩定。

`applyNamespaceGrouping` MUST 於合成時把 `namespaceColor` 算好寫入 namespace 盒 `data`(連同 `isNamespace: true`、`namespace: <名稱>`,三欄經 `src/shared/types/cytoscape.d.ts` declaration merging 宣告於 `NodeDataDefinition`),使 `getStylesheet` 維持純工廠、不在 selector 內 hash。`getStylesheet` MUST 新增 `node[?isNamespace]` selector,以 `data(namespaceColor)` 套用背景淡 tint(低 `background-opacity`)+ 較濃邊框(`border-color: data(namespaceColor)`)。此 selector MUST **直接以 `node[?isNamespace]` 命中**,MUST NOT 透過 `node:parent` 或收合相關偽類間接套色——確保展開 / 收合兩態皆維持 `namespaceColor` 邊框(收合容器會 drop 出 `node:parent`)。

namespace 盒 MUST NOT 帶 `status` / `alerts` / `worstStatus`,且 `selectable: false`(decorative、不開 detail 面板,比照 cluster)。

#### Scenario: 同名 namespace 同色且跨 cluster 穩定

- **WHEN** cluster `prod` 與 cluster `dr` 各有一個名為 `shop` 的 namespace 盒,且資料 refresh 後 cluster 集合改變
- **THEN** 兩個 `shop` namespace 盒的 `namespaceColor` 為 `colorForNamespace('shop')` 同一 hex,且 refresh 前後不變(顏色由名稱 hash 決定,不受其他 namespace / cluster 出現與否影響)

#### Scenario: 收合態仍維持 namespace 邊框色

- **WHEN** 某 namespace 盒被收合(drop 出 `node:parent`)
- **THEN** 其邊框仍以 `data(namespaceColor)` 上色——因 `node[?isNamespace]` selector 直接命中、不依賴 `:parent`

#### Scenario: namespace 盒無 status border

- **WHEN** 渲染任一 namespace 盒
- **THEN** 該盒 MUST NOT 帶 `status` / `alerts` / `worstStatus`,故不畫 status 邊框(green/yellow/red),僅以 `namespaceColor` tint + 邊框呈現;且 `selectable: false`,點擊不開 detail 面板

### Requirement: Namespace collapse 與 legend(controller 模式)

namespace 盒 SHALL 作為一般 `:parent` 容器參與既有 collapse 機制:自動納入 `collapsedIds` / `reconcileCollapse`(desired ∩ present),無需改動 `reconcileCollapse` / `useCollapseGroup` / `useExpandCollapse`。namespace 盒 MUST **不**預設摺疊——MUST NOT 加入任何 default-collapse seeding;controller 容器既有的預設摺疊行為 MUST 不受影響(畫面呈現「依 namespace 色帶分群的收合 controller」)。

Legend:`controller` 模式 MUST 新增 namespace 色 swatch section(thin wrapper `NamespaceLegend`,沿用 `SwatchLegend` 的 fold-by-default + entry count 慣例;entries 自 elements 蒐集 `(namespace, namespaceColor)` 去重)。此 section MUST 提供 collapse-all 群組 toggle(`useCollapseGroup` over namespace 盒 ids);因 namespace 不預設摺疊,其初始 `allCollapsed` MUST 為 `false`。`node` 模式無 namespace 盒,MUST NOT 渲染此 section。

#### Scenario: namespace 盒不預設摺疊

- **WHEN** Panel 於 `controller` 模式初次載入,namespace 盒已合成
- **THEN** namespace 盒 MUST NOT 被預設摺疊(展開呈現其內含的收合 controller),且 controller 容器仍維持其既有預設摺疊

#### Scenario: namespace 盒可手動摺疊

- **WHEN** 使用者於 `controller` 模式摺疊某 namespace 盒(或經 `NamespaceLegend` collapse-all)
- **THEN** 該 namespace 盒加入 `collapsedIds`、收合呈現;此操作經既有 `reconcileCollapse` 跨 data refresh / 模式重建以 desired ∩ present 保留

#### Scenario: node 模式無 namespace legend section

- **WHEN** `mode === 'node'`
- **THEN** legend MUST NOT 渲染 `NamespaceLegend` section(無 namespace 盒)

#### Scenario: controller 既有預設摺疊不受影響

- **WHEN** 切入 `controller` 模式且 namespace 盒與 controller 容器一同出現
- **THEN** 所有 controller 容器仍依既有規則被預設全摺疊,而 namespace 盒不被預設摺疊——兩者互不干擾

