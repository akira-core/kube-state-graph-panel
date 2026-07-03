## MODIFIED Requirements

### Requirement: 邊顏色依關係類型對應

系統 SHALL 透過 `src/shared/constants/colorByEdgeType.ts` 將 edge type(`EdgeType`)映射到不同顏色與線型,並由同一份對應表供 stylesheet 與 legend 共用。`EdgeType` 列舉涵蓋後端輸出的邊型別(`pod-to-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-storageclass` / `switch-to-switch` / `node-to-switch`),共 8 種,**皆為後端輸出**——panel 隨後端 D6 階層採用而退役兩個舊有合成邊:`pod-runs-on-node`(pod-runs-on-node 不再是巢狀或合成邊,改由後端 `pod-to-node` 邊取代)與 `controller-owns-pod`(controller 群組改由後端輸出,panel 不再自 pod `data.owner` 合成此邊,見 graph-data-integration)。`pod-to-node`(`pod → node`)MUST 以藍色 `#3b82f6`(舊 blue)實線渲染;`pvc-to-storageclass`(`pvc → storageclass`)MUST 以紫色 `#8b5cf6`(storage violet)實線渲染,且此色 MUST **刻意有別於** `pod-mounts-pvc` 的 `#a855f7`,使兩條 storage 邊在視覺上可區分。`pod-calls-service` 與 `service-selects-pod` MUST 共用與 `pod-calls-pod` **相同的橘色 `#f97316`**——一個 pod→service→pod hop 本質仍是 pod-to-pod 關係、只多一層 Service;這兩個服務型別並 MUST **自 edge legend 省略**(無獨立列、亦無額外合併列),由 `pod-calls-pod` 的單一列代表——該列渲染為 `pod ↔ pod/service`(雙向箭頭 glyph),標示其同時涵蓋直連與經 Service 的 pod-to-pod 關係(見下「圖例」需求)。所有邊皆實線,方向以**箭頭**區分;`switch-to-switch` 與 `node-to-switch`(後端 v0.0.18 物理網路 fabric)MUST **完全共用同一 infra 色與實線線型**,並走相同的正交(`taxi`)路由(見 switch-tier-layout 規格),視覺上等同——`node-to-switch` 不再使用獨立靛色或 bézier,僅以端點(`<node> → <switch>` vs `<switch> → <switch>`)區分,使 K8s node 的上行連線讀起來即為 switch fabric 的一部分。`colorByEdgeType.ts` 同時匯出 `EDGE_ENDPOINTS_BY_TYPE`(每個 edge type 的來源/目標 `NodeKind`),供 legend 將 edge type 渲染為 `<from> → <to>`;`pod-to-node` 的端點 MUST 為 `<pod> → <node>`,`pvc-to-storageclass` 為 `<pvc> → <storageclass>`,`switch-to-switch` 為 `<switch> → <switch>`,`node-to-switch` 為 `<node> → <switch>`。

#### Scenario: 已知邊類型對應到正確顏色

- **WHEN** 邊 data 帶有 `edgeType: 'pod-to-node'`(或其他已定義 type)
- **THEN** 該邊以對應顏色與線型渲染(`pod-to-node` 為藍 `#3b82f6` 實線),且與 `colorByEdgeType.ts` 定義一致

#### Scenario: 兩條 storage 邊以不同紫色區分

- **WHEN** 圖中同時存在 `pod-mounts-pvc` 與 `pvc-to-storageclass` 邊
- **THEN** `pod-mounts-pvc` 以 `#a855f7`、`pvc-to-storageclass` 以 `#8b5cf6` 渲染,兩色刻意不同使兩條 storage 邊可區分閱讀

#### Scenario: 邊顏色不與 status 顏色衝突

- **WHEN** 檢視 `EDGE_STYLE_BY_TYPE` 中任一 edge type 的顏色
- **THEN** 其顏色 MUST NOT 等於 `STATUS_COLOR` 的任一值(綠 `#73BF69` / 黃 `#F2CC0C` / 紅 `#E02F44`)——`pod-to-node` `#3b82f6`、`pvc-to-storageclass` `#8b5cf6` 與服務邊橘色 `#f97316` 皆滿足此條件

#### Scenario: node-to-switch 與 switch-to-switch 視覺一致

- **WHEN** 圖中同時有 `node-to-switch` 與 `switch-to-switch` 邊
- **THEN** 兩者以相同 infra 色、相同實線線型、相同 `taxi` 正交路由渲染(僅端點不同);`node-to-switch` 不再以獨立靛色或 bézier 呈現

#### Scenario: 未知邊類型走 fallback

- **WHEN** 邊 data 的 `edgeType` 不在對應表中
- **THEN** 該邊以 fallback 灰色實線渲染,不拋出例外

### Requirement: 圖例 (Legend)

Panel SHALL 提供 legend 元件,顯示**圖中實際呈現的**節點 icon 與邊類型對應說明。Node legend 的 icon / 顏色資料源 MUST 與 cytoscape stylesheet 共用同一份對應表(`iconSvgByKind.ts` / `colorByEdgeType.ts`)。Node legend 的 kind 集合 MUST 由 collapse-aware 的 `deriveLegendKinds`(見「Node-kinds 圖例 collapse-aware」requirement)導出——只列出**目前以 glyph 呈現於畫布**的 kind(drawn leaf + 收合容器;展開容器與被收合祖先隱藏的子節點不列);Edge legend MUST 只列出**目前資料中出現的 edge type**,惟 `pod-calls-service` / `service-selects-pod` 一律**省略**(本質為 pod-to-pod,由 `pod-calls-pod` 的 `pod ↔ pod/service` 雙向列代表——見下);兩者於對應集合為空時 MUST 不渲染(`return null`)。Node legend MUST 以隨主題上色的 icon glyph(取代既有 `ShapeGlyph`)呈現各 kind,並依 panel-owned 的 `kind → 超大類`(`categoryByKind.ts`:Workloads / Networking / Storage / Cluster / Other)查表**分組**,只渲染含 ≥1 個出現 kind 的大類;顏色 MUST NOT 編碼大類(顏色保留給狀態)。kind 列的文字標籤預設為 kind 字串本身,惟 MUST 支援 display-name 覆寫(`NodeLegend` 內的查表):`network` MUST 顯示為 `physical network`。Edge legend 每列 MUST 渲染為 `<from> [箭頭 glyph] <to>`:箭頭 glyph(`EdgeGlyph`,帶該 edge 的顏色與線型)置於兩端 `NodeKind` 標籤中間以取代動詞,端點標籤由 `EDGE_ENDPOINTS_BY_TYPE` 解析(`service` 縮寫為 `svc`),且 MUST NOT 顯示額外的 nesting 說明文字。例外:`pod-calls-pod` 列 MUST 渲染為 `pod ↔ pod/service`(雙向箭頭 glyph,兩端皆有箭頭),代表被省略的服務邊對。

legend 區段的垂直順序 MUST 為:`Layout`(Node|Controller 切換,置頂)→ `Node Kinds` → `Edge Types` → `Status` → swatch 區段(`Clusters` → `Nodes`|`Controllers` → `Namespaces` → `Applications`);亦即 swatch 區段置於 `Status` **之後**(legend 底部)。其中 `Namespaces`(`NamespaceLegend`)與 `Applications`(`ApplicationLegend`,標題 `Applications` / 應用程式)為 **mode-gated**:僅在 `controller` 模式渲染(`node` 模式剝除 namespace / application 群組,故兩區段 MUST `return null`);`NamespaceLegend` 由後端 `isNamespace` 群組節點餵入(以 `namespaceColor` accent 上色)、`ApplicationLegend` 由後端 `isApplication` 群組節點餵入(以 `applicationColor` accent 上色,`applicationPalette` 衍生)。舊有的 `StorageClassLegend`(`Storage Classes` swatch 區段)MUST **移除**——`storageclass` 於後端 D6 階層改為 cluster 下的一般 leaf,故 MUST 改以其 `storageclass` glyph 列於 `NodeLegend` 的 `Storage` 大類(經既有 `categoryByKind` wiring),不再有獨立 swatch 區段。所有區段標題 MUST 為 Title Case(`Node Kinds` / `Edge Types` / `Status` / `Clusters` / `Namespaces` / `Applications`)。

#### Scenario: Node legend 只列出以 glyph 呈現的 kind,依大類分組

- **WHEN** Panel 收到 pod / service / pvc / node 皆為 drawn leaf(無巢狀容器、無收合)且無 workload / switch 的資料
- **THEN** Node legend 只以 icon glyph 呈現 pod / service / pvc / node 並依大類分組(pod→Workloads、service→Networking、pvc→Storage、node→Cluster),未出現的 kind(deployment / switch …)不列出;顏色不用於區分大類
- **AND**(見 collapse-aware requirement)若 `node` 改為裝載 pod 的展開容器,則 `node` 不列於 Node legend(改於「Nodes」swatch 區段),收合後才以 glyph 回到 Node legend

#### Scenario: Edge legend 只列出圖中出現且未省略的 edge type

- **WHEN** 圖中存在 `pod-mounts-pvc` 與 `pod-calls-pod` 邊,但無 `switch-to-switch`
- **THEN** Edge legend 以 `<from> → <to>`(箭頭 glyph 置中)只呈現 `pod-mounts-pvc` / `pod-calls-pod`,`switch-to-switch` / `node-to-switch` 不列出;顏色/線型與 canvas 中渲染一致

#### Scenario: 服務邊自 edge legend 省略(本質為 pod-to-pod)

- **WHEN** 圖中存在 `pod-calls-service` / `service-selects-pod` 邊
- **THEN** 該兩型別 MUST NOT 出現於 edge legend(無獨立列、亦無額外合併列);它們在 canvas 以與 `pod-calls-pod` 相同的橘色繪製,於 legend 由 `pod-calls-pod` 列代表——該列渲染為 `pod ↔ pod/service`(雙向箭頭 glyph)

#### Scenario: Applications swatch 區段列出後端 application 群組(mode-gated)

- **WHEN** `controller` 模式下圖中含後端 `isApplication` 群組節點
- **THEN** `ApplicationLegend`(標題 `Applications`)以各 application 名稱列出 swatch,顏色取自 `applicationColor`(`applicationPalette` accent);切換為 `node` 模式時 application 群組被剝除,該區段 `return null`(與 `Namespaces` 區段一致 mode-gated)

#### Scenario: storageclass 以 NodeLegend glyph 呈現、無獨立 swatch 區段

- **WHEN** 圖中含 storageclass leaf 節點
- **THEN** `storageclass` 以其 glyph 列於 `NodeLegend` 的 `Storage` 大類;legend MUST NOT 渲染任何 `Storage Classes` swatch 區段(`StorageClassLegend` 已移除)

#### Scenario: 對應集合為空時不渲染

- **WHEN** 圖中無任何節點(或無任何 drawn 邊)
- **THEN** Node legend(或 Edge legend)`return null`,不渲染空標題

### Requirement: Hover Tooltip 顯示元素 metadata

Panel SHALL 顯示 `HoverTooltip` 元件,具**兩種模式**:

- **(1) Hover 浮動模式(預設,無 detail 節點被選取時)**:使用者 hover 於任一 node 或 edge 時,tooltip MUST 浮動定位於被 hover 元素附近(`position: absolute`,node 取其 rendered 中心、edge 取游標 rendered 位置,加固定偏移),並夾擠 / 翻轉於 cytoscape canvas wrapper 邊界內(偏移後超出右 / 下緣時翻轉至元素左側並夾於 wrapper 內,不超出可視範圍),寬度約 280px,套用 `pointer-events: none` 以確保不阻擋下方圖形互動。**此模式行為與既往完全一致。**
- **(2) Pinned 釘選模式(當一個 detail-eligible 節點被左鍵選取時)**:tooltip 改**釘選於 canvas 右上角**(`top: 8` / `right: 8` / `left: auto`、`maxHeight: calc(50% - 16px)`、`overflowY: auto`、`pointer-events: auto` 使其內容可捲動、`zIndex: 1000` 以蓋過 cytoscape expand-collapse 的透明輸入層 `z-index: 999`),顯示**被選取節點**的完整 tooltip 內容(title + promoted attrs + 原始 labels),其內容**與 hover 模式同源同樣**(同一 `buildNodeAttributes` 與 `toLabelRows`,promoted 的 `kind` row 一併顯示)。釘選時 **hover 浮動 tooltip 全面抑制**(node 與 edge 皆不再浮動)。

被選取節點的資料源為已 gated 的 `resolveSelectedNode`(可見 + 未被收合祖先隱藏 + detail-eligible),故裝飾性 **`cluster` / `namespace`** 群組(`resolveSelectedNode` 回 `null`)**不**釘選、其 hover 行為不變;**`application` 群組現為 detail-eligible**,選取時**亦釘選**(顯示合成 `kind: application` + 其名稱)。釘選卡片**無關閉鈕**:取消選取(點背景 / 邊、切換節點、kind / edge 過濾、收合祖先、資料刷新移除)即自動清除釘選並恢復 hover 模式。樣式 MUST 使用 `@grafana/ui` theme tokens(背景半透明 `theme.colors.background.secondary` + opacity ≥ 0.85)。

`storageclass` leaf 節點 MUST 走**一般 node-tooltip 路徑**——它於後端 D6 階層自帶 `kind`(`storageclass`)、`labels.cluster`、`provisioner` 與 `parameters`,tooltip(hover 浮動或釘選)直接顯示這些自帶欄位;舊有「自子 PVC 節點合成 context」路徑(`gatherStorageClassContext`、`HoveredElement.storageClass` 欄、`HoverTooltip` 的 `isStorageClass` 分支)MUST 移除。kind-less 的 backend 群組(`isNamespace` / `isApplication`)MUST 由旗標推導一個**合成 `kind` row**(`isApplication` → `application`、`isNamespace` → `namespace`)——純呈現,MUST NOT 於 `data` 寫入 `kind`(群組維持 kind-less,對 kind filter / icon legend 不可見);`cluster` 群組於 `useHoverElement` 上游略過、不顯示 tooltip,故不適用。

#### Scenario: Hover 節點顯示節點 metadata（無選取時）

- **WHEN** 無 detail 節點被選取,使用者滑鼠 hover 於任一節點
- **THEN** `HoverTooltip` 浮動顯示節點 `name`(`data.label ?? data.id`)、`kind`、`namespace`、`ipAddress`(`data.ipAddress` 以逗號串接顯示,僅當存在且非空時)、`application`(ArgoCD application;凡 leaf 帶 `data.application`——pod / service / pvc 與聚合後的 controller——即顯示,惟裝飾性 `application` 群組節點 MUST NOT 顯示此 row 以免與其合成 `kind`/`name` 重複),以及白名單 labels(`app`、`version`、`app.kubernetes.io/name`、`app.kubernetes.io/instance`)中有值的欄位;缺漏欄位 MUST 不顯示其 row(不顯示空白 placeholder)

#### Scenario: Hover storageclass leaf 顯示自帶 metadata（未選取）

- **WHEN** 無選取時,滑鼠移至一個 storageclass leaf(巢狀於某 cluster,自帶 `kind: storageclass`、`labels.cluster`、`provisioner`、`parameters`)
- **THEN** tooltip 浮動顯示其名稱(title)、`kind: storageclass`、`cluster: <name>`、`provisioner: <name>`,以及每個 backing-storage 參數一列(如 `pool: kube`、`selector: tier=fast`;key 排序、值換行)
- **AND** MUST NOT 以子 PVC 節點合成 `PVCs (N)` 清單(該合成路徑已隨 storageclass 改為 leaf 而移除;PVC 以 `pvc-to-storageclass` 邊相連而非巢狀)

#### Scenario: Hover kind-less 群組(namespace / application)顯示合成 kind

- **WHEN** 使用者 hover 於一個 backend `namespace` 或 `application` 群組節點(kind-less:無 `data.kind`,僅帶 `isNamespace` / `isApplication` 旗標)
- **THEN** `HoverTooltip` MUST 由該旗標推導出一個合成 `kind` row(`isApplication` → `application`、`isNamespace` → `namespace`)並顯示,使 hover 不致只剩裸 name;此 row 為純呈現,MUST NOT 於 `data` 寫入 `kind`(群組維持 kind-less,對 kind filter / icon legend 不可見)。`cluster` 群組於 `useHoverElement` 上游略過、不顯示 tooltip,故不適用

#### Scenario: Hover 邊顯示邊 metadata（無選取時）

- **WHEN** 無 detail 節點被選取,使用者滑鼠 hover 於任一邊
- **THEN** `HoverTooltip` 浮動顯示 `edgeType`、`source → target`(以兩端節點的 `label` 解析,而非裸 id)

#### Scenario: Tooltip 定位於 hovered 元素附近（hover 模式）

- **WHEN** 無 detail 節點被選取,使用者 hover 於某節點
- **THEN** tooltip 以該節點 rendered 位置加固定偏移定位(動態 `left` / `top`),而非固定於角落
- **AND** 當偏移後 tooltip 會超出 canvas 右 / 下緣時,翻轉至節點左側並夾擠於 wrapper 邊界內

#### Scenario: Tooltip 不阻擋圖形互動（hover 模式）

- **WHEN** Hover 浮動 tooltip 顯示中,使用者點擊 tooltip DOM 覆蓋區域底下的節點
- **THEN** 該節點被選取(觸發既有 `:selected` 樣式與 `onSelect` callback),hover tooltip 不攔截 click 事件(`pointer-events: none` 生效)

#### Scenario: 取消 hover 後浮動 tooltip 淡出並從 DOM 移除

- **WHEN** 無選取時,使用者滑鼠移出原 hovered 元素且未進入其他元素
- **THEN** `HoverTooltip` 以 opacity transition(≥ 100ms ≤ 200ms)淡出,動畫結束後 tooltip 不渲染任何 DOM(避免空 box 佔位)

#### Scenario: Hovered 元素被移除時清空浮動 tooltip

- **WHEN** 一個元素 hover 中(無選取),該元素因 data refresh 從 cytoscape instance 中被 remove
- **THEN** `useHoverElement` 收到 `remove` 事件後清空 store,`HoverTooltip` 立即消失,不渲染參照已不存在元素的內容

#### Scenario: Hover 不觸發 GraphCanvas 重渲染

- **WHEN** 連續 hover 多個元素
- **THEN** 透過 `useSyncExternalStore` 訂閱的 `HoverTooltip` 元件重新渲染,但 `GraphCanvas` 與 cytoscape instance reference 不變(React DevTools profiler 驗證 `GraphCanvas` render count 不增加)

#### Scenario: 左鍵選取 detail 節點將 tooltip 釘選於右上角

- **WHEN** 使用者左鍵選取一個 detail-eligible 節點(leaf 含 storageclass / k8s-node / controller)
- **THEN** `HoverTooltip` 進入 pinned 模式:於 canvas 右上角(`top:8` / `right:8`、`pointer-events:auto`、`zIndex:1000`、`maxHeight: calc(50% - 16px)` 可捲動)釘選顯示**該節點**的 title + promoted attrs(含 `kind` row)+ 原始 labels(`toLabelRows` 過濾掉已 promote 的 `namespace`)
- **AND** 釘選內容與 hover 該節點時的內容完全一致(同源)

#### Scenario: 釘選時抑制 hover 浮動

- **WHEN** 一個 detail 節點已被選取(tooltip 釘選中),使用者 hover 於其他 node 或 edge
- **THEN** 浮動 hover tooltip MUST NOT 顯示(pinned 模式抑制 hover);右上角僅持續顯示被選取節點的釘選卡片

#### Scenario: 釘選 tooltip 即使游標不在任何元素上仍顯示

- **WHEN** 一個 detail 節點被選取,且游標未 hover 於任何元素(`useHoverElement` 回 `null`)
- **THEN** 釘選卡片仍 MUST 顯示(pinned 模式不依賴 hovered 元素;渲染早於 hover 的 `hovered === null` 早退)

#### Scenario: 取消選取清除釘選並恢復 hover

- **WHEN** 釘選中,使用者取消選取(點背景 / 邊、切換到另一節點、kind/edge 過濾掉該節點、收合其祖先、或資料刷新移除該節點)
- **THEN** `resolveSelectedNode` 回 `null` → 釘選卡片消失,tooltip 恢復 hover 浮動模式

#### Scenario: 選取 storageclass 釘選 provisioner 與 parameters

- **WHEN** 使用者左鍵選取一個 storageclass leaf
- **THEN** tooltip 釘選顯示 `kind: storageclass` + `provisioner` + 每個 backing-storage parameter(key 排序、值換行);底部 detail 面板因無 change-report / alerts 區塊而僅渲染 header(見「Node Detail 面板」)

### Requirement: 容器圖例(NodeContainerLegend)隨 pod-parent 模式切換容器來源

`NodeContainerLegend`(以 cluster 色上色的 compound 容器清單,含「全部摺疊 / 展開」切換)列出的容器來源 MUST 隨 `podParentMode` 切換:`node` 模式列出 K8s `node` 容器(`cluster > node > pod` 的中間層);`controller` 模式改列 controller 容器(`cluster > controller > pod` 的中間層)。controller 容器來源 MUST 為**後端 `controller` 群組節點**(經 enrichment 標 `isController: true`、kind 衍生自子 pod 的 `owner.kind`),而非 panel 合成(`synthesizeControllers` 已移除);`deriveNodeContainers` 於 controller 模式以 `d.isController === true` 認定容器。兩模式皆以容器所屬 cluster 的 accent 色上色(與 canvas 容器底色同源),且「全部摺疊」切換 MUST 作用於**當前模式**的容器集合(經 `deriveNodeContainers` 等單一來源導出,使切換鈕與 canvas 容器永遠指向同一組)。容器圖例 MUST 在當前模式無任何 compound 容器時 `return null`。

#### Scenario: node 模式列 K8s node 容器

- **WHEN** `podParentMode === 'node'` 且圖中有裝載 pod 的 K8s node
- **THEN** `NodeContainerLegend` 列出這些 K8s node(以各自 cluster 色),「全部摺疊」作用於該 node 容器集合

#### Scenario: controller 模式列 controller 容器

- **WHEN** `podParentMode === 'controller'` 且圖中有裝載 pod 的後端 `controller` 群組(`isController: true`)
- **THEN** `NodeContainerLegend` 改列這些 controller(以各自 cluster 色);「全部摺疊」改作用於 controller 容器集合

#### Scenario: 當前模式無容器時不渲染

- **WHEN** 當前模式下圖中無任何 compound 容器(例:無 owner 的裸 pod 在 controller 模式)
- **THEN** `NodeContainerLegend` `return null`,不渲染空標題

### Requirement: 收合容器(controller / k8s node)邊框依最差子節點 status 上色

當一個**容器收合**時(controller 或 k8s `node`),其矩形邊框 MUST 以它**收合後會隱藏的最差 status** 對應的 `STATUS_COLOR`(`normal` 綠 `#73BF69` / `warning` 黃 / `critical` 紅)上色——**含 `normal`**:旗下全健康的容器收合時 MUST 畫 `normal` 綠框(明確的好消息,而非中性無框)。資料來源為 normalize 彙整於該節點的 `data.worstStatus`(見 graph-data-integration:controller = 自子 pod(`pod.parent === controllerId`)聚合之最差 status,**一律寫入**;k8s node = 自身 status 與**其 pod** status 之最差,worst-wins——`controller` 視圖下 pod 不再巢狀於 node,故 node 的 pod 改以**經 `pod-to-node` 邊可達的 pod** 認定(D8),`node` 視圖下 pod 重新巢狀於 node 則沿用子節點認定;**有 status 資訊時寫入**——自身無 status 且無任何(可達或巢狀)pod 的 node 無此欄,收合維持中性邊框,「無資訊」不得偽裝成 normal)。stylesheet MUST 以 `node[worstStatus="<status>"].cy-expand-collapse-collapsed-node` 選擇器實作,宣告於 `statusSelectors`(資料驅動的 `node[status="<s>"]`——**任何帶 `status` 的節點**畫自身 status 邊框,非 pod/node/pvc 白名單;normalize 只在後端實際給 status 時才寫該欄,故 service / external / cluster / storageclass 等無 status 者維持中性邊框)**之後**,使**收合的 k8s node** 的最差子節點 status 能覆寫其自身 status 邊框;controller 無 status 邊框,故此為其唯一上色。`node:selected` 以 outline/underlay 呈現故不影響此邊框色。**展開**的容器不套此選擇器(controller 維持中性 `:parent` 容器邊框、k8s node 維持自身 status 邊框)。採 **status**(非 alert severity):`info` 僅存在於 alert、不在 status 量尺,故收合框永不為 info(`SEVERITY_COLOR` 仍只服務 detail panel 的 alert 表)。

#### Scenario: 收合 controller 顯示最差子 pod status

- **WHEN** 某 controller 旗下有 pod `status: critical`,使用者**收合**該 controller
- **THEN** 收合的 controller 矩形邊框以 `STATUS_COLOR.critical`(紅)上色
- **WHEN** 同一 controller **展開**
- **THEN** 邊框回到中性 `:parent` 容器色

#### Scenario: k8s node worstStatus 經 pod-to-node 邊計算

- **WHEN** `controller` 視圖下,某 k8s `node` 自身 `status: normal`、且有 pod 經 `pod-to-node` 邊指向它、該 pod `status: critical`(此時 pod 巢狀於 controller、非 node)
- **THEN** normalize 將 `data.worstStatus` 寫為 `critical`(自 `pod-to-node` 邊可達 pod 取最差);`node` 視圖下 pod 重新巢狀於 node 時,以子節點認定亦得相同結果

#### Scenario: 收合 k8s node 以最差子 status 覆寫自身 status 邊框

- **WHEN** 某 k8s `node` 自身 `status: normal`、旗下有 pod `status: critical`(經 `pod-to-node` 邊或巢狀認定),使用者**收合**該 node
- **THEN** 收合的 node 矩形邊框以 `STATUS_COLOR.critical`(紅)上色(覆寫其自身 normal 綠)
- **WHEN** 同一 node **展開**
- **THEN** 邊框回到自身 status(`normal` 綠);其子 pod 各自顯示自身 status 邊框

#### Scenario: 全 normal 容器收合畫 normal 綠框

- **WHEN** 某容器(controller 或 k8s node)收合後會隱藏的最差 status 為 `normal`(子節點皆 normal,缺 status 視為 normal)
- **THEN** 收合的容器矩形邊框以 `STATUS_COLOR.normal`(綠)上色——controller 一律;k8s node 因自身或子 pod 至少其一帶 status 資訊

#### Scenario: 無 status 資訊的 k8s node 收合維持中性邊框

- **WHEN** 某 k8s `node` 自身無 `status` 且無任何(可達或巢狀)pod
- **THEN** 該 node 無 `data.worstStatus`,收合時維持中性容器邊框(「無資訊」不是「正常」)

### Requirement: Node-kinds 圖例 collapse-aware(只列實際以 glyph 呈現者)

icon「Node Kinds」圖例的 kind 集合 MUST 由純函式 `deriveLegendKinds(elements, collapsedIds)` 導出,只列出**目前以 glyph 呈現於畫布**的 kind——而非單純「資料中出現過」的 kind。判定規則(對每個非 cluster、帶 `kind` 的節點):被收合祖先隱藏者**不**計入;**展開的**容器(其 id 為他人 `parent` 且自身未收合)**不**計入(它在 Clusters / Nodes|Controllers swatch 區段呈現);其餘(drawn leaf 或**收合的**容器)計入其 kind。`cluster`(無 kind)永不計入。此規則取代舊有的 `presentKinds` + `deriveContainers.showNodeKindIcon`,使 node / controller 容器一致;`storageclass` 於後端 D6 階層改為 cluster 下的 leaf、**不再是容器**,恆以其 glyph(drawn leaf)計入,不再因「收合 / 展開」而於 Node-kinds 圖例進退。

#### Scenario: storageclass 恆以 leaf glyph 計入 Node-kinds

- **WHEN** 圖中含 storageclass leaf(後端 D6 階層下 storageclass 為 cluster 下的 leaf,非容器)且其鄰近有 pvc leaf
- **THEN** Node-kinds 圖例的 `Storage` 大類同時列出 `pvc` 與 `storageclass` 兩個 glyph;`storageclass` 不再因「收合」而與 `pvc` 互換(它從不是容器)

#### Scenario: 收合容器時其子 kind 退出、容器 kind 進入(node / controller 同理)

- **WHEN** 某 K8s `node`(或 controller)容器被收合,其下 pod 全被聚合隱藏
- **THEN** `pod` 退出 Node-kinds 圖例、`node`(或對應 controller kind)以其 glyph 進入;展開的容器則不出現在 Node-kinds(僅於其 swatch 區段)

#### Scenario: 收合虛擬 network compound 時 Node-kinds 以 network 取代 switch

- **WHEN** 包裹 switch fabric 的虛擬 `network` compound(見 switch-tier-layout 規格)被收合
- **THEN** 其下 `switch` 因被收合祖先隱藏而退出 Node-kinds 圖例,收合的 `network` 以其 wifi glyph 進入(NETWORKING 大類由 `switch` 變為 `network`,標籤顯示為 `physical network`);展開後還原為 `switch`

## REMOVED Requirements

### Requirement: StorageClass compound 容器渲染與圖例(**完全比照 K8s node 容器**)

**Reason:** `storageclass` 於後端 D6 階層改為 cluster 下的一般 `kind:'storageclass'` leaf(自帶 `provisioner` / `parameters`),不再是 boxing PVC 的 compound 容器;`isStorageClass` 旗標、`deriveStorageClassContainers`、`StorageClassLegend` 與 storageclass 專屬的 stylesheet / hover / 容器渲染行為一併退役。對等行為改見:`圖例 (Legend)`(storageclass 改以 NodeLegend glyph 列於 Storage 大類)、`Hover Tooltip 顯示元素 metadata`(自帶 metadata 的一般 node 路徑;選取時 `provisioner` / `parameters` 釘選於右上角 tooltip)、`Node Detail 面板`(storageclass 為 detail-eligible leaf,無 body 內容時 header-only)。
