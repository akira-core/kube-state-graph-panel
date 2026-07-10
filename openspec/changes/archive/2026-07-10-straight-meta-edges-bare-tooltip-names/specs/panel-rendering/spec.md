## ADDED Requirements

### Requirement: Compound 收合後的 meta-edge 以直線繪製

當 `cytoscape-expand-collapse` 收合 compound parent 時,跨邊界的邊會被重指到收合容器並加上 `cy-expand-collapse-meta-edge` class。stylesheet MUST 對 `edge.cy-expand-collapse-meta-edge` 使用 `curve-style: 'straight'`(直線),並維持既有加寬 cue(`width: 2.5`)。Meta-edge MUST NOT 強制覆寫 `line-color` / 箭頭色——色彩與線型仍 cascade 自 base `edge` rule(依原始 `data.edgeType`)。此規則僅影響收合後合成的 meta-edge;一般邊的 routing(fabric `taxi`、其餘 `bezier`)不變。

#### Scenario: 收合後 meta-edge 為直線且加寬

- **WHEN** 一個 compound parent 被收合,且至少一條跨邊界邊被 expand-collapse 重指為 `cy-expand-collapse-meta-edge`
- **THEN** 該 meta-edge 的 `curve-style` 為 `straight`、`width` 為 `2.5`
- **AND** 其 `line-color` / 箭頭色仍依原始 `edgeType` 自 base `edge` rule cascade(meta-edge 規則本身不釘死色彩)

#### Scenario: 非 meta 邊 routing 不受影響

- **WHEN** 圖中同時存在未收合的一般邊(含 fabric `taxi` 與非 fabric `bezier`)與收合產生的 meta-edge
- **THEN** 一般邊維持其既有 routing;`taxi` / `bezier` 選擇器行為不變

## MODIFIED Requirements

### Requirement: Hover Tooltip 顯示元素 metadata

Panel SHALL 顯示 `HoverTooltip` 元件,具**兩種模式**:

- **(1) Hover 浮動模式(預設,無 detail 節點被選取時)**:使用者 hover 於任一 node 或 edge 時,tooltip MUST 浮動定位於被 hover 元素附近(`position: absolute`,node 取其 rendered 中心、edge 取游標 rendered 位置,加固定偏移),並夾擠 / 翻轉於 cytoscape canvas wrapper 邊界內(偏移後超出右 / 下緣時翻轉至元素左側並夾於 wrapper 內,不超出可視範圍),寬度約 280px,套用 `pointer-events: none` 以確保不阻擋下方圖形互動。**此模式行為與既往完全一致。**
- **(2) Pinned 釘選模式(當一個 detail-eligible 節點被左鍵選取時)**:tooltip 改**釘選於 canvas 右上角**(`top: 8` / `right: 8` / `left: auto`、`maxHeight: calc(50% - 16px)`、`overflowY: auto`、`pointer-events: auto` 使其內容可捲動、`zIndex: 1000` 以蓋過 cytoscape expand-collapse 的透明輸入層 `z-index: 999`),顯示**被選取節點**的完整 tooltip 內容(title + promoted attrs + 原始 labels),其內容**與 hover 模式同源同樣**(同一 `buildNodeAttributes` 與 `toLabelRows`,promoted 的 `kind` row 一併顯示)。釘選時 **hover 浮動 tooltip 全面抑制**(node 與 edge 皆不再浮動)。

被選取節點的資料源為已 gated 的 `resolveSelectedNode`(可見 + 未被收合祖先隱藏 + detail-eligible),故裝飾性 **`cluster` / `namespace`** 群組(`resolveSelectedNode` 回 `null`)**不**釘選、其 hover 行為不變;**`application` 群組現為 detail-eligible**,選取時**亦釘選**(顯示合成 `kind: application` + 其名稱)。釘選卡片**無關閉鈕**:取消選取(點背景 / 邊、切換節點、kind / edge 過濾、收合祖先、資料刷新移除)即自動清除釘選並恢復 hover 模式。樣式 MUST 使用 `@grafana/ui` theme tokens(背景半透明 `theme.colors.background.secondary` + opacity ≥ 0.85)。

`storageclass` leaf 節點 MUST 走**一般 node-tooltip 路徑**——它於後端 D6 階層自帶 `kind`(`storageclass`)、`labels.cluster`、`provisioner` 與 `parameters`,tooltip(hover 浮動或釘選)直接顯示這些自帶欄位;舊有「自子 PVC 節點合成 context」路徑(`gatherStorageClassContext`、`HoveredElement.storageClass` 欄、`HoverTooltip` 的 `isStorageClass` 分支)MUST 移除。kind-less 的 backend 群組(`isNamespace` / `isApplication`)MUST 由旗標推導一個**合成 `kind` row**(`isApplication` → `application`、`isNamespace` → `namespace`)——純呈現,MUST NOT 於 `data` 寫入 `kind`(群組維持 kind-less,對 kind filter / icon legend 不可見);`cluster` 群組於 `useHoverElement` 上游略過、不顯示 tooltip,故不適用。

**Tooltip 的 name title MUST 使用裸 `data.label`(或缺則 `data.id`),MUST NOT 含畫布 compound 的 kind 前綴**(`Cluster:` / `Namespace:` / `Release Unit:` / `Node:`)。那些前綴僅由 stylesheet 於畫布標籤渲染(見「裝飾性 compound 群組…」與「physical-network 與 k8s node compound header…」);normalize 對裝飾性群組寫入的 `data.label` 為裸名稱,故 hover / pinned 路徑讀 `data.label` 即得裸名,無需額外 strip。

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

#### Scenario: Hover 裝飾性群組 title 為裸名稱(不含 kind 前綴)

- **WHEN** 使用者 hover 於一個 `data.label` 為 `shop` 的 `namespace` 群組,或 `data.label` 為 `mongo` 的 `application` 群組(畫布上分別渲染為 `Namespace: shop` / `Release Unit: mongo`)
- **THEN** tooltip title MUST 分別為 `shop` / `mongo`,MUST NOT 含 `Namespace:` / `Release Unit:` 前綴
- **AND** 合成 `kind` row 仍分別顯示 `namespace` / `application`

#### Scenario: 釘選 application 群組 title 為裸名稱

- **WHEN** 使用者左鍵選取一個 `data.label` 為 `mongo` 的 `application` 群組(detail-eligible,釘選 tooltip)
- **THEN** 釘選卡片 title MUST 為 `mongo`,MUST NOT 為 `Release Unit: mongo`

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

### Requirement: 裝飾性 compound 群組使用 per-kind 固定色彩與 kind 前綴標籤

裝飾性 `cluster` / `namespace` / `application` 群組的 accent 色(`clusterColor` / `namespaceColor` / `applicationColor`)MUST 為**依群組種類(kind)固定的單一色彩**——同種類的所有群組節點(不論其名稱)共用同一色彩,不再依名稱雜湊(hash)產生每一實例各異的色彩。三種 kind 的色彩 MUST 彼此不同,且 MUST 與既有邊色彩表(`EDGE_STYLE_BY_TYPE`)及 status 色彩(normal 綠、warning 黃、critical 紅)有足夠對比,確保邊線經過任一 compound 背板時仍清晰可辨。

裝飾性 `cluster` / `namespace` / `application` 群組的**畫布標籤**MUST 以**首字大寫 kind 前綴詞 + `: `**(冒號後接一空格)為前綴,格式為 `${PREFIX}: ${name}`(例如名稱 `prod` 的 `cluster` 群組畫布標籤為 `Cluster: prod`,名稱 `checkout` 的 `namespace` 為 `Namespace: checkout`,名稱 `mongo` 的 `application` 為 `Release Unit: mongo`)。**`application` 群組的顯示前綴詞為「Release Unit」**——此僅為顯示文字,內部 `type`/`kind` 字串、`isApplication` flag、`applicationColor`、CSS selector(`node[?isApplication]`)皆維持 `application` 不變。

此前綴 MUST 以 **stylesheet 的 render-only function `label` mapper** 實作(選擇器 `node[?isCluster]` / `node[?isNamespace]` / `node[?isApplication]`),**MUST NOT** 由 `normalizeGraph` 寫入 `data.label`——`data.label` MUST 維持上游裸名稱(與 `data.cluster` / `data.namespace` / `data.application` 一致)。如此 hover / pinned tooltip 的 name title、以及其他讀取 `data.label` 作為 identity / 顯示名的路徑,皆取得裸名稱;前綴**僅**出現在畫布 compound naming。此要求僅適用於三種裝飾性 compound 群組,不影響任何 leaf 節點(pod / service / pvc / node / storageclass)或 `controller` compound 的標籤格式。整段畫布標籤(前綴 + 名稱)沿用既有 `font-weight: 600` 樣式——cytoscape 單一 label 不支援同節點內混合字重的局部粗體,故前綴與名稱共用同一字重。

#### Scenario: 同 kind 的多個 cluster 群組共用同一色彩

- **WHEN** 圖中存在兩個以上不同名稱的 `cluster` 群組節點
- **THEN** 所有 `cluster` 群組節點的 `data.clusterColor` 皆為同一固定值,不因名稱不同而異

#### Scenario: 三種 kind 的固定色彩彼此不同且與邊色彩有對比

- **WHEN** Panel 渲染 `cluster` / `namespace` / `application` 群組
- **THEN** 三者的固定色彩彼此互異,且皆非 `EDGE_STYLE_BY_TYPE` 中任一邊色彩或 status 色彩(綠 `#73BF69` / 黃 `#F2CC0C` / 紅 `#E02F44`)的完全相同色值

#### Scenario: 裝飾性群組畫布標籤以 kind 為前綴,data.label 為裸名

- **WHEN** 一個名稱為 `prod` 的 `cluster` 群組、名稱為 `checkout` 的 `namespace` 群組、名稱為 `mongo` 的 `application` 群組被正規化並渲染
- **THEN** 三者的 `data.label` 依序為 `prod`、`checkout`、`mongo`(裸名)
- **AND** 畫布上 stylesheet 渲染的標籤依序為 `Cluster: prod`、`Namespace: checkout`、`Release Unit: mongo`

#### Scenario: 非裝飾性節點標籤不受影響

- **WHEN** 一個 `pod` / `service` / `pvc` / `node` / `storageclass` leaf 節點或 `controller` compound 節點被正規化
- **THEN** 其 `data.label` 維持原名稱,不套用任何 kind 前綴

### Requirement: physical-network 與 k8s node compound header 標籤對齊

physical-network fabric box(`kind: network`,包住 switches 的 compound)與 k8s `node` **compound** box(node-layout 模式下包住 pod、即為 `:parent` 者)的 header 標籤,MUST 在**大小寫與字級**上對齊三個裝飾性群組 header:physical-network 名稱 title-case(`physical network` → `Physical Network`),k8s node 加 `Node: ` 前綴(`worker-0` → `Node: worker-0`),字級各自提升(network 17、node 18)以匹配群組 header。

k8s node 的此對齊 MUST **僅在該 node 為 compound 時**套用:選擇器為 `node[kind='node']:parent`(node-layout 下包住 pod)加上 `node[kind='node'].cy-expand-collapse-collapsed-node`(收合後子節點移除、失去 `:parent`,以 class 維持 header 穩定)。**controller-layout 下 k8s node 為葉節點**(pod 掛在合成 controller 下,非掛在 node),不符任一選擇器,MUST 回退為 base `node` 一般標題(裸 `data.label`、base 字級、標籤置底)。葉節點永不為 compound,故永不帶 collapsed class,sibling 選擇器不會外洩至葉節點。

此對齊 MUST 以 **stylesheet 的 render-only function `label` mapper** 實作,**MUST NOT** 改寫 `data.label`——因 k8s `node` 的 `data.label` 為其 identity 值:`/dashboard` 查詢的 `name=` 參數(`paramsFromData` 將 `label` 改名為 `name`)與 detail 面板標題(`NodeDetailPanel` 渲染 `node.label`)皆直接讀取之,若把前綴烤進 `data.label` 會送出錯誤的 `name=Node: worker-0` 並讓標題與 kind badge 重複。裝飾性群組的 kind 前綴同樣為 render-only(見「裝飾性 compound 群組使用 per-kind 固定色彩與 kind 前綴標籤」),三者契約一致:前綴只服務畫布 compound naming。switch 葉節點不在此範圍。

#### Scenario: physical-network fabric box header title-case 且字級放大

- **WHEN** Panel 渲染 `kind: network` 的 physical-network fabric box(`data.label` 為 `physical network`)
- **THEN** 其 on-canvas 標籤渲染為 `Physical Network`(逐字 title-case)、`font-size` 17、`font-weight` 600
- **AND** 其 `data.label` 維持 `physical network` 不變

#### Scenario: compound k8s node box header 加 `Node: ` 前綴且字級放大,identity 不變

- **WHEN** Panel 於 node-layout 渲染一個包住 pod 的 compound k8s node(`kind: node`、`:parent`、`data.label` 為 `worker-0`)
- **THEN** 其 on-canvas 標籤渲染為 `Node: worker-0`、`font-size` 18、`font-weight` 600
- **AND** 其 `data.label` 維持 `worker-0`,故 `/dashboard` 查詢的 `name=` 參數與 detail 面板標題皆為 `worker-0`(不含前綴)
- **AND** 該 compound 收合後(`.cy-expand-collapse-collapsed-node`)仍維持 `Node: worker-0` 對齊 header

#### Scenario: leaf k8s node 回退一般標題

- **WHEN** Panel 於 controller-layout 渲染一個葉 k8s node(`kind: node`、非 `:parent`、`data.label` 為 `worker-9`)
- **THEN** 其標籤回退為 base `node` 一般標題:裸 `worker-9`、base 字級(11)、標籤置底,不加 `Node: ` 前綴、不放大
