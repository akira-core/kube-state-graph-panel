# panel-rendering delta — sync-netapp-storage-nodes

## MODIFIED Requirements

### Requirement: 邊顏色依關係類型對應

系統 SHALL 透過 `src/shared/constants/colorByEdgeType.ts` 將 edge type(`EdgeType`)映射到不同顏色與線型,並由同一份對應表供 stylesheet 與 legend 共用。`EdgeType` 列舉涵蓋後端輸出的邊型別(`pod-to-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-netapp-aggr` / `switch-to-switch` / `node-to-switch`),共 8 種,**皆為後端輸出**——panel 隨後端 D6 階層採用而退役兩個舊有合成邊:`pod-runs-on-node`(pod-runs-on-node 不再是巢狀或合成邊,改由後端 `pod-to-node` 邊取代)與 `controller-owns-pod`(controller 群組改由後端輸出,panel 不再自 pod `data.owner` 合成此邊,見 graph-data-integration)。`pod-to-node`(`pod → node`)MUST 以藍色 `#3b82f6`(舊 blue)實線渲染;`pvc-to-netapp-aggr`(`pvc → netapp-aggr`)MUST 以紫色 `#8b5cf6`(storage violet)實線渲染,且此色 MUST **刻意有別於** `pod-mounts-pvc` 的 `#a855f7`,使兩條 storage 邊在視覺上可區分(已移除的 `pvc-to-storageclass` 讓出此色與此位置)。`pod-calls-service` 與 `service-selects-pod` MUST 共用與 `pod-calls-pod` **相同的橘色 `#f97316`**——一個 pod→service→pod hop 本質仍是 pod-to-pod 關係、只多一層 Service;這兩個服務型別並 MUST **自 edge legend 省略**(無獨立列、亦無額外合併列),由 `pod-calls-pod` 的單一列代表——該列渲染為 `pod ↔ pod/service`(雙向箭頭 glyph),標示其同時涵蓋直連與經 Service 的 pod-to-pod 關係(見下「圖例」需求)。所有邊皆實線,方向以**箭頭**區分;`switch-to-switch` 與 `node-to-switch`(後端 v0.0.18 物理網路 fabric)MUST **完全共用同一 infra 色與實線線型**,並走相同的正交(`taxi`)路由(見 switch-tier-layout 規格),視覺上等同——`node-to-switch` 不再使用獨立靛色或 bézier,僅以端點(`<node> → <switch>` vs `<switch> → <switch>`)區分,使 K8s node 的上行連線讀起來即為 switch fabric 的一部分。`colorByEdgeType.ts` 同時匯出 `EDGE_ENDPOINTS_BY_TYPE`(每個 edge type 的來源/目標 `NodeKind`),供 legend 將 edge type 渲染為 `<from> → <to>`;`pod-to-node` 的端點 MUST 為 `<pod> → <node>`,`pvc-to-netapp-aggr` 為 `<pvc> → <netapp-aggr>`,`switch-to-switch` 為 `<switch> → <switch>`,`node-to-switch` 為 `<node> → <switch>`。

#### Scenario: 已知邊類型對應到正確顏色

- **WHEN** 邊 data 帶有 `edgeType: 'pod-to-node'`(或其他已定義 type)
- **THEN** 該邊以對應顏色與線型渲染(`pod-to-node` 為藍 `#3b82f6` 實線),且與 `colorByEdgeType.ts` 定義一致

#### Scenario: 兩條 storage 邊以不同紫色區分

- **WHEN** 圖中同時存在 `pod-mounts-pvc` 與 `pvc-to-netapp-aggr` 邊
- **THEN** `pod-mounts-pvc` 以 `#a855f7`、`pvc-to-netapp-aggr` 以 `#8b5cf6` 渲染,兩色刻意不同使兩條 storage 邊可區分閱讀

#### Scenario: 邊顏色不與 status 顏色衝突

- **WHEN** 檢視 `EDGE_STYLE_BY_TYPE` 中任一 edge type 的顏色
- **THEN** 其顏色 MUST NOT 等於 `STATUS_COLOR` 的任一值(綠 `#73BF69` / 黃 `#F2CC0C` / 紅 `#E02F44`)——`pod-to-node` `#3b82f6`、`pvc-to-netapp-aggr` `#8b5cf6` 與服務邊橘色 `#f97316` 皆滿足此條件

#### Scenario: node-to-switch 與 switch-to-switch 視覺一致

- **WHEN** 圖中同時有 `node-to-switch` 與 `switch-to-switch` 邊
- **THEN** 兩者以相同 infra 色、相同實線線型、相同 `taxi` 正交路由渲染(僅端點不同);`node-to-switch` 不再以獨立靛色或 bézier 呈現

#### Scenario: 未知邊類型走 fallback

- **WHEN** 邊 data 的 `edgeType` 不在對應表中
- **THEN** 該邊以 fallback 灰色實線渲染,不拋出例外

### Requirement: 互動與選取狀態

Panel SHALL 支援節點點擊選取,選取狀態透過 cytoscape 內建 `:selected` style 視覺化,且可選地透過 `onSelect` callback 將被選節點 id 傳出供其他元件消費。

**選取(selection)與 detail 面板的可見性(detail open)MUST 為兩個獨立狀態**:selection 驅動 cytoscape 單選高亮、selection-focus 淡化、右上角釘選 tooltip(位於 search bar 下方,見 `graph-search`)與變數輸出(selected-pod-export);detail 面板的開/關為純 UI 狀態,關閉面板 MUST NOT 清除 selection(見「Node Detail 面板」)。取消選取的途徑**僅有**:點擊背景、點擊邊、點擊不可選取的 `cluster` 背板(三者皆觸發 `onSelect(null)`)。點擊**已選取**的節點 MUST 重新開啟其 detail 面板(而非取消選取)。除畫布 tap 外,graph-search 的 **locate** 亦建立 selection,且對 detail-eligible 節點 MUST 開啟 detail 面板(等同畫布左鍵點該節點,見 `graph-search` capability)。**畫布**上的選取/取消選取(GraphCanvas `onSelect`)在 search query 非空時 MUST 清除 search(見 `graph-search`「Canvas interaction clears search」);locate 路徑 MUST NOT 走此清除。

**`controller` / K8s `node` / `netapp-node` / `netapp-aggr`,以及裝飾性 `namespace` / `application` 群組 MUST 為可選取(`selectable`)。裝飾性 `cluster` 與 `storage-cluster` 群組 MUST NOT 可選取(`selectable: false`)。** 此可選取性的唯一目的,是讓 `cytoscape-expand-collapse` 既已啟用(`cueEnabled: true`)的 **`+/-` 摺疊 cue** 能浮現:該 cue 為 selection-driven,僅於**單一被選取**且為 `:parent`(或已收合)的節點上繪製。故使用者點選任一可選取的 compound parent → 該 parent 浮現其 `+/-` cue → 點 cue 切換該 parent 的收合 / 展開(沿用既有 expand-collapse plumbing,無新元件、無新收合機制)。

`cluster` 群組因不可選取,點擊(`tap`)它一律視同點擊背景(觸發 `onSelect(null)`,不顯示選取環、不浮現摺疊 cue)。其收合 / 展開改由**雙擊(`dbltap`)**觸發:GraphCanvas MUST 於偵測到對 `isCluster` 節點的 `dbltap` 時,直接呼叫既有 `ExpandCollapseApi`(`api.expand(node)` 或 `api.collapse(node)`,依 `isExpandable`/`isCollapsible` 判斷)切換該節點收合狀態——此路徑觸發與 cue 相同的 `expandcollapse.aftercollapse`/`afterexpand` 事件,`collapsedIds` 更新沿用既有 `onCollapsedChange` 路徑,無新收合狀態機制。

`namespace` 裝飾群組雖可被選取(顯示單選環與既有 selection-focus 視覺),但 MUST NOT 開啟 node-detail 面板:`resolveSelectedNode` 對 `isNamespace` 一律回 `null`。**`application` 群組為例外**:它現為 detail-eligible——選取時除浮現摺疊 cue 外,**亦開啟 node-detail 面板**顯示該 ArgoCD application 的 config_changes(`resolveSelectedNode` 以合成 `kind: application` + `queryTarget { kind: 'application', name: <app> }` 解析,見「Node Detail 面板」/「Node Detail Application 與 Containers 區塊」)。故 `resolveSelectedNode` 的範圍刻意較 `isDashboardEligible` 寬——後者仍排除 `application` 群組於 `/dashboard` 按鈕之外(application 群組無 per-node dashboard)。

#### Scenario: 點擊節點觸發選取與 callback

- **WHEN** 使用者點擊任一可選取節點
- **THEN** 該節點被 cytoscape 標記為 `:selected` 並套用對應樣式,若提供 `onSelect` prop 則以節點 id 呼叫之

#### Scenario: 點擊已選取節點重開面板而非取消選取

- **WHEN** 某節點已被選取且其 detail 面板已被關閉鈕關閉,使用者再次點擊該節點
- **THEN** detail 面板重新開啟;selection 維持不變(不經歷「取消再選取」,高亮、釘選 tooltip、變數輸出全程存續)

#### Scenario: cluster 群組不可選取,點擊如同背景點擊

- **WHEN** 使用者點擊一個裝飾性 `cluster` 群組節點
- **THEN** 該節點 `selectable()` 為 `false`,`onSelect(null)` 被呼叫,不顯示選取環,`cytoscape-expand-collapse` 摺疊 cue 不浮現

#### Scenario: 雙擊 cluster 群組切換收合 / 展開

- **WHEN** 使用者對一個裝飾性 `cluster` 群組節點雙擊(`dbltap`)
- **THEN** 該節點的收合 / 展開狀態透過 `ExpandCollapseApi` 被直接切換,且 `collapsedIds` 隨之更新(經既有 `onCollapsedChange` 路徑),無論該節點目前是否被選取

#### Scenario: namespace / application 群組可被選取以浮現摺疊 cue

- **WHEN** 使用者點擊一個裝飾性 `namespace` / `application` 群組節點
- **THEN** 該節點 `selectable()` 為 `true`、被標記為 `:selected`(顯示單選環),且 `cytoscape-expand-collapse` 於其上繪製 `+/-` 摺疊 cue

#### Scenario: 選取 namespace 群組不開啟 detail 面板

- **WHEN** 使用者選取一個裝飾性 `namespace` 群組節點
- **THEN** `resolveSelectedNode` 回 `null`,node-detail 面板 MUST NOT 開啟(只顯示選取環與摺疊 cue)

#### Scenario: 選取 application 群組開啟其 app-detail

- **WHEN** 使用者選取一個 `application` 群組節點
- **THEN** `resolveSelectedNode` 解析該節點(合成 `kind: application`),node-detail 面板開啟並渲染 Application 區塊(預取該 application 的 `config_changes`),tooltip 釘選於右上角;同時仍浮現摺疊 cue

#### Scenario: 點摺疊 cue 切換該 parent 收合

- **WHEN** 某可選取的 compound parent(`controller` / K8s `node` / `netapp-node` / `namespace` / `application`)已被選取並顯示其 `+/-` cue,使用者點擊該 cue 範圍
- **THEN** 該 parent 的收合 / 展開狀態被切換(經 expand-collapse api),且 `collapsedIds` 隨之更新(沿用既有 cue 事件 → `onCollapsedChange` 路徑)

### Requirement: 收合的裝飾群組顯示 folder icon

裝飾性 `cluster` / `storage-cluster` / `namespace` / `application` 群組在**收合**(`.cy-expand-collapse-collapsed-node`)時 MUST 於框中央顯示一個 **folder glyph**,以該群組的 accent 色(`clusterColor` / `storageClusterColor` / `namespaceColor` / `applicationColor`)上色(`background-fit: contain`)。**展開**時維持現狀——無中央 icon 的 labelled 容器(`background-image: 'none'`)。此 folder icon 為 gap-fill:具 `kind` 的 compound(`controller` / k8s `node` / `netapp-node`)在收合時本就回退顯示其 kind icon(base `node` 規則),MUST NOT 受影響(folder 選擇器僅匹配 `isCluster` / `isStorageCluster` / `isNamespace` / `isApplication`)。folder glyph 為 `NodeKind` 之外的獨立 SVG(`FOLDER_ICON_SVG`,裝飾 kind 非 `NodeKind`,不入 `ICON_SVG_BY_KIND`)。

#### Scenario: 收合的裝飾群組顯示 folder icon

- **WHEN** 一個 `cluster` / `namespace` / `application` 裝飾群組被收合
- **THEN** 其 `background-image` 為 folder glyph(以該群組 accent 色 tinted),而非 `'none'`

#### Scenario: 展開的裝飾群組無中央 icon

- **WHEN** 該裝飾群組為展開狀態(`:parent`,其下有可見子節點)
- **THEN** 其 `background-image` 為 `'none'`(labelled 容器,無中央 folder icon)

#### Scenario: 收合的 kind-ful compound 維持 kind icon

- **WHEN** 一個 `controller` / k8s `node` / `netapp-node` compound 被收合
- **THEN** 其中央 icon 維持為該 kind 的 icon,folder 選擇器 MUST NOT 套用其上

### Requirement: 圖例 (Legend)

Panel SHALL 提供 legend 元件,顯示**圖中實際呈現的**節點 icon 與邊類型對應說明。Node legend 的 icon / 顏色資料源 MUST 與 cytoscape stylesheet 共用同一份對應表(`iconSvgByKind.ts` / `colorByEdgeType.ts`)。Node legend 的 kind 集合 MUST 由 collapse-aware 的 `deriveLegendKinds`(見「Node-kinds 圖例 collapse-aware」requirement)導出——只列出**目前以 glyph 呈現於畫布**的 kind(drawn leaf + 收合容器;展開容器與被收合祖先隱藏的子節點不列);Edge legend MUST 只列出**目前資料中出現的 edge type**,惟 `pod-calls-service` / `service-selects-pod` 一律**省略**(本質為 pod-to-pod,由 `pod-calls-pod` 的 `pod ↔ pod/service` 雙向列代表——見下);兩者於對應集合為空時 MUST 不渲染(`return null`)。Node legend MUST 以隨主題上色的 icon glyph(取代既有 `ShapeGlyph`)呈現各 kind,並依 panel-owned 的 `kind → 超大類`(`categoryByKind.ts`:Workloads / Networking / Storage / Cluster / Other)查表**分組**,只渲染含 ≥1 個出現 kind 的大類;顏色 MUST NOT 編碼大類(顏色保留給狀態)。kind 列的文字標籤預設為 kind 字串本身,惟 MUST 支援 display-name 覆寫(`NodeLegend` 內的查表):`network` MUST 顯示為 `physical network`。Edge legend 每列 MUST 渲染為 `<from> [箭頭 glyph] <to>`:箭頭 glyph(`EdgeGlyph`,帶該 edge 的顏色與線型)置於兩端 `NodeKind` 標籤中間以取代動詞,端點標籤由 `EDGE_ENDPOINTS_BY_TYPE` 解析(`service` 縮寫為 `svc`),且 MUST NOT 顯示額外的 nesting 說明文字。例外:`pod-calls-pod` 列 MUST 渲染為 `pod ↔ pod/service`(雙向箭頭 glyph,兩端皆有箭頭),代表被省略的服務邊對。

legend 區段的垂直順序 MUST 為:`Layout`(Node|Controller 切換,置頂)→ `Node Kinds` → **`Ingress Gateway`** → `Edge Types` → `Status` → swatch 區段(`Clusters` → `Namespaces` → `Applications` → **`Nodes`|`Controllers`**);亦即 swatch 區段置於 `Status` **之後**,且 **`Nodes`|`Controllers`(`NodeContainerLegend`)MUST 為 legend 最底區段**(在 `Applications` 之後;在 `node` 模式下 `Namespaces` / `Applications` 不渲染時,仍接在 `Clusters` 之後作為最底)。

其中 `Ingress Gateway`(`IngressToggle`,見 ingress-visibility-toggle capability)為 **presence-gated**:僅在圖中確實存在 ingress-gateway 節點集合(非空)時渲染,否則 MUST NOT 渲染——與本 requirement「對應集合為空時 `return null`」的既有慣例一致。它緊接 `Node Kinds` **之後**、`Edge Types` **之前**,因其與 `NodeLegend` 同屬**節點可見性控制**(眼睛 / eye-slash 切換語彙),而非邊或狀態的說明列;它 MUST NOT 併入 `NodeLegend` 的 kind-based row(那些列嚴格以 kind 為 key)。該區段除標題與 eye 切換外,MUST 另附一條虛線 `EdgeGlyph` 樣本說明畫布上的 ingress 虛線語意——`EdgeLegend` 省略了服務型別列且其樣本一律實線,故若無此樣本,畫布虛線在 legend 中無任何對應說明。

`Namespaces`(`NamespaceLegend`)與 `Applications`(`ApplicationLegend`,標題 `Applications` / 應用程式)為 **mode-gated**:僅在 `controller` 模式渲染(`node` 模式剝除 namespace / application 群組,故兩區段 MUST `return null`);`NamespaceLegend` 由後端 `isNamespace` 群組節點餵入(以 `namespaceColor` accent 上色)、`ApplicationLegend` 由後端 `isApplication` 群組節點餵入(以 `applicationColor` accent 上色,`applicationPalette` 衍生)。`storageclass` kind 已自後端契約移除,故 `NodeLegend` 的 `Storage` 大類改由 `pvc` / `netapp-aggr` / `netapp-node` 三個 glyph 組成(經既有 `categoryByKind` wiring);此前已移除的 `StorageClassLegend`(`Storage Classes` swatch 區段)MUST 維持不存在,亦 MUST NOT 為 ONTAP 新增任何 swatch 區段——`storage-cluster` 為單純的 accent 群組框,不需 legend 列。所有區段標題 MUST 為 Title Case(`Node Kinds` / `Ingress Gateway` / `Edge Types` / `Status` / `Clusters` / `Namespaces` / `Applications` / `Nodes`|`Controllers`)。

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

#### Scenario: Ingress Gateway 區段位於 Node Kinds 與 Edge Types 之間

- **WHEN** 圖中存在 ingress-gateway 節點集合(非空),legend 渲染
- **THEN** 區段順序 MUST 為 `Node Kinds` → `Ingress Gateway` → `Edge Types`,標題為 Title Case 的 `Ingress Gateway`

#### Scenario: 圖中無 ingress 節點時該區段不渲染

- **WHEN** 圖中無任何節點屬 ingress-gateway 集合
- **THEN** legend MUST NOT 渲染 `Ingress Gateway` 區段,其餘區段順序不受影響(`Node Kinds` 直接接 `Edge Types`)

#### Scenario: Applications swatch 區段列出後端 application 群組(mode-gated)

- **WHEN** `controller` 模式下圖中含後端 `isApplication` 群組節點
- **THEN** `ApplicationLegend`(標題 `Applications`)以各 application 名稱列出 swatch,顏色取自 `applicationColor`(`applicationPalette` accent);切換為 `node` 模式時 application 群組被剝除,該區段 `return null`(與 `Namespaces` 區段一致 mode-gated)

#### Scenario: Controllers/Nodes swatch 位於 legend 最底

- **WHEN** `controller` 模式下 legend 同時渲染 `Clusters`、`Namespaces`、`Applications` 與 `Controllers`
- **THEN** 垂直順序 MUST 為 `Clusters` → `Namespaces` → `Applications` → `Controllers`(`Controllers` 為 legend 最後一區)
- **WHEN** `node` 模式下 legend 渲染 `Clusters` 與 `Nodes`(無 Namespaces / Applications)
- **THEN** 垂直順序 MUST 為 `Clusters` → `Nodes`(`Nodes` 為 legend 最後一區)

#### Scenario: storageclass 以 NodeLegend glyph 呈現、無獨立 swatch 區段

- **WHEN** 圖中含 `netapp-aggr` / `netapp-node` 節點(本情境原先所述的 `storageclass` leaf 已自契約移除)
- **THEN** 兩者各以其 glyph 列於 `NodeLegend` 的 `Storage` 大類(與 `pvc` 同類);legend MUST NOT 渲染任何 `Storage Classes` swatch 區段,亦 MUST NOT 為 `storage-cluster` 新增 swatch 區段

#### Scenario: 對應集合為空時不渲染

- **WHEN** 圖中無任何節點(或無任何 drawn 邊)
- **THEN** Node legend(或 Edge legend)`return null`,不渲染空標題

### Requirement: Hover Tooltip 顯示元素 metadata

Panel SHALL 顯示 `HoverTooltip` 元件,具**兩種模式**:

- **(1) Hover 浮動模式(預設,無 detail 節點被選取時)**:使用者 hover 於任一 node 或 edge 時,tooltip MUST 浮動定位於被 hover 元素附近(`position: absolute`,node 取其 rendered 中心、edge 取游標 rendered 位置,加固定偏移),並夾擠 / 翻轉於 cytoscape canvas wrapper 邊界內(偏移後超出右 / 下緣時翻轉至元素左側並夾於 wrapper 內,不超出可視範圍),寬度約 280px,套用 `pointer-events: none` 以確保不阻擋下方圖形互動。**此模式行為與既往完全一致。**
- **(2) Pinned 釘選模式(當一個 detail-eligible 節點被左鍵選取時)**:tooltip 改**釘選於 canvas 右上角**(`top: 8` / `right: 8` / `left: auto`、`maxHeight: calc(50% - 16px)`、`overflowY: auto`、`pointer-events: auto` 使其內容可捲動、`zIndex: 1000` 以蓋過 cytoscape expand-collapse 的透明輸入層 `z-index: 999`),顯示**被選取節點**的完整 tooltip 內容(title + promoted attrs + 原始 labels),其內容**與 hover 模式同源同樣**(同一 `buildNodeAttributes` 與 `toLabelRows`,promoted 的 `kind` row 一併顯示)。釘選時 **hover 浮動 tooltip 全面抑制**(node 與 edge 皆不再浮動)。

被選取節點的資料源為已 gated 的 `resolveSelectedNode`(可見 + 未被收合祖先隱藏 + detail-eligible),故裝飾性 **`cluster` / `namespace`** 群組(`resolveSelectedNode` 回 `null`)**不**釘選、其 hover 行為不變;**`application` 群組現為 detail-eligible**,選取時**亦釘選**(顯示合成 `kind: application` + 其名稱)。釘選卡片**無關閉鈕**:取消選取(點背景 / 邊、切換節點、kind / edge 過濾、收合祖先、資料刷新移除)即自動清除釘選並恢復 hover 模式。樣式 MUST 使用 `@grafana/ui` theme tokens(背景半透明 `theme.colors.background.secondary` + opacity ≥ 0.85)。

**實體儲存節點(`netapp-aggr` / `netapp-node`)MUST 走一般 node-tooltip 路徑**——它們自帶 `kind`、`labels.ontap_cluster`(aggregate 另有 `labels.node`)、`health`,`netapp-aggr` 另有 `usage`,tooltip(hover 浮動或釘選)直接顯示這些自帶欄位,無任何合成路徑。已移除的 `storageclass` kind 連同其 `provisioner` / `parameters` tooltip 列一併消失。**`health` 與 `usage` MUST 為 promoted attribute row**(與 `kind` / `namespace` / `ipAddress` 同源,經 `buildNodeAttributes`):`health` 原樣顯示其字串值;`usage` MUST 格式化為人類可讀的 `<used> / <capacity> (<pct>%)`(位元組以十進位單位縮寫,百分比取整),缺 `usage` 時整列不顯示,**MUST NOT** 於缺值時顯示 `0` 或 placeholder。PVC 節點若帶 `storageclass`(claim 的 StorageClass 名稱)與 `usage`,MUST 以同一機制各顯示一列。kind-less 的 backend 群組(`isNamespace` / `isApplication`)MUST 由旗標推導一個**合成 `kind` row**(`isApplication` → `application`、`isNamespace` → `namespace`)——純呈現,MUST NOT 於 `data` 寫入 `kind`(群組維持 kind-less,對 kind filter / icon legend 不可見);`cluster` 群組於 `useHoverElement` 上游略過、不顯示 tooltip,故不適用。

**Tooltip 的 name title MUST 使用裸 `data.label`(或缺則 `data.id`),MUST NOT 含畫布 compound 的 kind 前綴**(`Cluster:` / `Namespace:` / `Release Unit:` / `Node:`)。那些前綴僅由 stylesheet 於畫布標籤渲染(見「裝飾性 compound 群組…」與「physical-network 與 k8s node compound header…」);normalize 對裝飾性群組寫入的 `data.label` 為裸名稱,故 hover / pinned 路徑讀 `data.label` 即得裸名,無需額外 strip。

#### Scenario: Hover 節點顯示節點 metadata（無選取時）

- **WHEN** 無 detail 節點被選取,使用者滑鼠 hover 於任一節點
- **THEN** `HoverTooltip` 浮動顯示節點 `name`(`data.label ?? data.id`)、`kind`、`namespace`、`ipAddress`(`data.ipAddress` 以逗號串接顯示,僅當存在且非空時)、`application`(ArgoCD application;凡 leaf 帶 `data.application`——pod / service / pvc 與聚合後的 controller——即顯示,惟裝飾性 `application` 群組節點 MUST NOT 顯示此 row 以免與其合成 `kind`/`name` 重複),以及白名單 labels(`app`、`version`、`app.kubernetes.io/name`、`app.kubernetes.io/instance`)中有值的欄位;缺漏欄位 MUST 不顯示其 row(不顯示空白 placeholder)

#### Scenario: Hover storageclass leaf 顯示自帶 metadata（未選取）

- **WHEN** 無選取時,滑鼠移至一個 `netapp-aggr` leaf(巢狀於某 `netapp-node`,自帶 `kind: netapp-aggr`、`labels.ontap_cluster`、`labels.node`、`health: "online"`、`usage: { usedBytes: 700000000000, capacityBytes: 1000000000000 }`;本情境原先所述的 storageclass leaf 已自契約移除)
- **THEN** tooltip 浮動顯示其名稱(title)、`kind: netapp-aggr`、`health: online`、格式化後的 `usage`(如 `700 GB / 1 TB (70%)`),以及 `ontap_cluster` / `node` 兩個 label 列
- **AND** MUST NOT 顯示任何 `provisioner` / `parameters` 列(該欄位已隨 storageclass 自契約移除)

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

- **WHEN** 使用者左鍵選取一個 detail-eligible 節點(leaf 含 `netapp-aggr` / k8s-node / `netapp-node` / controller)
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

- **WHEN** 使用者左鍵選取一個 `netapp-aggr` leaf 或 `netapp-node` compound(本情境原先所述的 storageclass leaf 已自契約移除)
- **THEN** tooltip 釘選顯示其 `kind` + `health` +(`netapp-aggr` 另有)格式化 `usage`,以及其 `ontap_cluster` / `node` labels;底部 detail 面板因無 change-report / alerts 區塊而僅渲染 header(見「Node Detail 面板」)
- **AND** 選取一個帶 `storageclass` 與 `usage` 的 PVC 時,釘選卡各顯示一列 `storageclass: <name>` 與格式化 `usage`

### Requirement: Node Detail 面板

Panel SHALL 在**左鍵**點擊節點時,於 canvas 底部以浮層(不縮放 graph)開啟 detail 面板,header 顯示節點 name、kind、status 三項。面板的關閉途徑分**兩類、語意不同**:(1)點擊背景 / 邊(= 取消選取)時面板關閉且 selection 一併清除;(2)按**關閉鈕**時 MUST **僅關閉面板**(detail open → false)——selection 及其衍生視覺(cytoscape 單選高亮、selection-focus 淡化、右上角釘選 tooltip)與變數輸出 MUST 全數存續。切換到另一節點時面板切換至新節點。cytoscape 單選的藍色高亮 MUST 與 **selection** 同步(而非與面板開關同步)。關閉後**再次點擊該已選取節點** MUST 重新開啟面板,且 MUST 沿用原選取當下的查詢時間戳(不重發 change-report 查詢——關/開面板為 UI 動作,非資料動作;查詢時間戳的生命週期繫於 selection,選取**另一**節點時才取新時間戳)。裝飾性 **cluster** 群組**不可被選取**(見「互動與選取狀態」:tap 視同背景點擊、無選取環、無摺疊 cue,收合改由 dbltap 觸發),裝飾性 **namespace** 群組**可被選取**(顯示選取環與摺疊 cue,見「互動與選取狀態」)——兩者 `resolveSelectedNode` 皆回 `null`,故 MUST NOT 開啟此 detail 面板、亦 MUST NOT 釘選 tooltip。**`application` 群組為例外**:它現為 detail-eligible(kind-less,以合成 `kind: application` 解析),選取時**開啟面板**渲染該 ArgoCD application 的 Application config_changes 區塊(見「Node Detail Application 與 Containers 區塊」)並**釘選 tooltip**,同時仍浮現其摺疊 cue。

header 除節點 name / kind / status 外,當該節點(任一 detail-eligible 節點:**leaf 含 `netapp-aggr` / k8s-node / `netapp-node` / controller**;**僅裝飾性 cluster / storage-cluster / namespace / application 除外**)的 `/dashboard` 查詢回傳可用 URL 時,MUST 於 name 旁顯示一顆 **Dashboard 按鈕**;按鈕的查詢時機、參數組裝、200-gated 可用性與新分頁開啟行為見 `node-dashboard-url` capability。

面板 body 一律以**資料有無**閘控,依序為——(1)**Application change-report 區塊**:帶 `data.application` 的節點即顯示(**含 `service` / `pvc`**——見「Node Detail Application 與 Containers 區塊」需求);**Containers change-report 區塊**僅 workload kind 且帶 `data.containers` 時顯示;(2)**Alerts 區塊**(`node-detail-section-alerts`):節點帶非空 `data.alerts` 時渲染告警表,**無告警時整段不渲染**。**面板不再有恆顯的屬性(Properties)區塊**——節點的 promoted attributes(合成 kind、`namespace`、`application`、`ipAddress`、`storageclass`、`health`、格式化 `usage`)改由**右上角釘選 tooltip** 呈現(見「Hover Tooltip」pinned 模式,與 hover 同源);釘選卡 MUST 排在 **search bar 下方**(search 在上、屬性卡在下,見 `graph-search`)。

**面板 ALWAYS 渲染**(當左鍵選取一個 detail-eligible 節點**且面板未被關閉鈕關閉**——即 selection 存在且 detail open 為 true):**header**(節點 name + kind / status badge + 關閉鈕,以及 `/dashboard` 查詢回 `ready` + 非空 `urls` 時的 Dashboard 按鈕)為最小渲染;body 區塊(Application / Containers / Alerts)各自以資料有無閘控。無任何 body 內容的節點(如 `netapp-aggr` / `netapp-node`、無 `application` 的 `service` / `pvc`)左鍵選取後**仍渲染 header-only 面板**;其 promoted attributes 由右上角釘選 tooltip 承載(不重複於面板)。釘選卡片本身**不含** Dashboard 按鈕,故 header 是 dashboard 入口的唯一處——因 header 恆顯,入口必然可達。**graph-search 的 locate 對 detail-eligible 節點 MUST 建立 selection 並開啟面板**(detail open → true,等同畫布左鍵,見 `graph-search` capability);釘選 tooltip 照常呈現於 search bar 下方。

面板高度 MUST 隨內容增長,僅在超過上限(canvas 高度的 `50%`)時才捲動(header 釘住);內容短於上限時 MUST NOT 出現捲動。**捲動 MUST 集中於單一容器(面板 body,`node-detail-scroll`):body 為唯一 scroll authority(`overflowY: auto`),各區塊一律為 content-height(`flex: 0 0 auto`)且 MUST NOT 各自擁有內部捲動。**面板可同時堆疊多個區塊(Application + Containers + Alerts),若任一區塊自帶內部捲動,多個 fill 區塊會在受限高度下互相重疊且皆無法捲動——故 single-body-scroll 為唯一可組合的模型。

告警資料來自上游 graph JSON 節點的選用欄位 `alerts: NodeAlert[]`(`normalizeGraph` 攜帶至 `data.alerts`,缺值或空陣列→該區塊不渲染)。每筆 `NodeAlert` 以 `timeRecords: number[]`(Unix 秒,升序)表示重複發生;後端已把同一 alert 分組為**單筆**,故告警表格**一列代表一個 alert**。**Count** 欄 MUST 顯示 `timeRecords.length`,並 MUST 透過 `@grafana/ui` `Tooltip` 列出全部發生時間(依 `timeZone` 格式化)。**Last occurred** 欄 MUST 顯示 `max(timeRecords)`(格式化)且 MUST 可點擊:點擊時以 `t = max(timeRecords)`(Unix 秒)為中心、固定 ±5 分鐘(300 秒),呼叫 `onChangeTimeRange({ from: (t-300)*1000, to: (t+300)*1000 })` 倒帶 dashboard 時間範圍。`severity` 為自由字串:`info` / `warning` / `critical` 取 `SEVERITY_COLOR` 對應色,其餘自訂標籤 MUST 原樣保留並以 `FALLBACK_SEVERITY_COLOR`(critical 色)著色。告警表格的 **Pod / Service 缺值格 MUST 顯示 muted「n/a」**(統一缺值占位 `MISSING_VALUE_PLACEHOLDER`,見「Node Detail Application 與 Containers 區塊」)。

#### Scenario: 左鍵點任一 detail-eligible 節點開啟面板

- **WHEN** 使用者**左鍵**點擊任一非裝飾 detail-eligible 節點
- **THEN** 底部浮層渲染 header(節點 label、kind badge、status badge、關閉鈕),覆蓋於 graph 之上且不改變 graph 尺寸;有資料的 body 區塊隨之顯示
- **AND** 該節點的選取高亮與 selection 同步,且其屬性同時釘選於右上角 tooltip

#### Scenario: 點外面或關閉鈕關閉

- **WHEN** 使用者點擊 graph 背景或邊
- **THEN** detail 面板關閉,selection 清除(選取高亮、focus 淡化、右上角釘選 tooltip 一併消失,變數輸出清空)
- **WHEN** 面板開啟時使用者按下關閉鈕
- **THEN** detail 面板關閉;selection 維持——選取高亮、selection-focus 淡化與右上角釘選 tooltip 持續顯示,selected-pod-export 變數值不變

#### Scenario: 關閉後再點該節點重開且不重發查詢

- **WHEN** 使用者以關閉鈕關閉面板後,再次左鍵點擊該(仍選取中的)節點
- **THEN** 面板重新開啟,內容與關閉前一致;change-report 查詢沿用原選取時間戳,MUST NOT 重新發出查詢

#### Scenario: 切換節點

- **WHEN** 面板開啟時使用者點擊另一個節點
- **THEN** 面板切換為新點擊的節點(釘選 tooltip 同步切換),查詢以新選取當下的時間戳發出

#### Scenario: 裸節點仍渲染 header-only 面板

- **WHEN** 使用者左鍵選取一個 detail-eligible 但無 application / containers / alerts、亦無 ready dashboard URL 的節點(如 `netapp-aggr` / `netapp-node`、無 `application` 的 `service` / `pvc`)
- **THEN** `NodeDetailPanel` **仍渲染**,只含 header(節點 name + kind / status badge + 關閉鈕),無任何 body 區塊
- **AND** 該節點的 promoted attributes 由右上角釘選 tooltip 承載(不重複於面板)

#### Scenario: header 顯示 Dashboard 按鈕(後端有 URL 時)

- **WHEN** 使用者左鍵選取的節點 `/dashboard` 查詢回傳 ready + 非空 url(不論是否有 body 內容)
- **THEN** header 於節點 name 旁顯示 Dashboard 按鈕;若無任何 body 內容則為 header-only 面板
- **AND** Dashboard 按鈕可達(其僅存在於 header,不在釘選卡片)

#### Scenario: Dashboard 按鈕顯示於名稱旁

- **WHEN** 開啟某 detail-eligible 節點的面板(因其帶 change-report / alerts,或僅因有 ready dashboard 而成 header-only),且其 `/dashboard` 查詢回傳 200 + 非空 url
- **THEN** header 於節點名稱旁顯示 Dashboard 按鈕
- **AND** 裝飾性 cluster / storage-cluster / namespace / application 群組 `resolveSelectedNode` 回 null、不開啟面板,故無此按鈕;`netapp-aggr` 等 detail-eligible leaf 若有 dashboard URL 則以 header-only 面板顯示此按鈕

#### Scenario: 顯示告警表格(分組,一列一個 alert)

- **WHEN** 選取的節點帶非空 `data.alerts`(一或多筆)
- **THEN** Alerts 區塊以 `InteractiveTable` 逐列顯示告警,**一列代表一個 alert**,欄位為 Pod / Service / Alert / Severity / Count / Last occurred

#### Scenario: 告警 Pod / Service 缺值顯示 n/a

- **WHEN** 某告警列的 Pod 或 Service 缺值
- **THEN** 該格顯示 muted「n/a」(`MISSING_VALUE_PLACEHOLDER`)

#### Scenario: Count 徽章與發生時間 Tooltip

- **WHEN** 某 alert 的 `timeRecords` 含 N 個發生時間
- **THEN** 該列 Count 欄顯示 `N`(= `timeRecords.length`)
- **AND** hover Count 時以 `@grafana/ui` `Tooltip` 列出全部 N 個發生時間(依 `timeZone` 格式化)

#### Scenario: Severity 著色(自由字串 + SEVERITY_COLOR)

- **WHEN** 告警 `severity` 為 `info` / `warning` / `critical`
- **THEN** 該列 Severity 以對應 `SEVERITY_COLOR` 著色徽章呈現
- **WHEN** `severity` 不在 `SEVERITY_COLOR` 中(自訂標籤,如 `fatal`)
- **THEN** 以 `FALLBACK_SEVERITY_COLOR`(critical 色)著色、且徽章原樣保留該標籤文字,不報錯

#### Scenario: 點 Last occurred 倒帶時間範圍

- **WHEN** 使用者點擊某列的 Last occurred 欄,該 alert `timeRecords` 的最大值為 `t`(Unix 秒)
- **THEN** panel 呼叫 `onChangeTimeRange({ from: (t-300)*1000, to: (t+300)*1000 })`(±5 分鐘,毫秒)
- **AND** dashboard 時間範圍倒帶至該窗(以最後發生時間為中心)

#### Scenario: 多區塊以單一 body 捲動且不重疊

- **WHEN** 面板同時渲染多個高區塊(如帶 application + 多 container + 多 alert 的 pod,Containers 與 Alerts 區塊皆高於上限)
- **THEN** 面板 body(`node-detail-scroll`)為唯一捲動容器(`overflowY: auto`),各區塊 `flex-grow: 0`(content-height)且其表格 slot MUST NOT 自帶 `overflowY: auto`
- **AND** 區塊上下堆疊、彼此 MUST NOT 重疊;內容超過上限時 body 捲動整個堆疊(header 釘住),內容短於上限時不出現捲動

#### Scenario: 無告警時 Alerts 區塊整段不渲染

- **WHEN** 選取的節點無 `alerts` 欄位或為空陣列
- **THEN** Alerts 區塊(`node-detail-section-alerts`)MUST NOT 渲染(不顯示表格、亦不顯示舊的「No alerts」訊息);其他有資料區塊照常渲染,若無其他 body 區塊則面板仍渲染 header-only

### Requirement: 收合容器(controller / k8s node)邊框依最差子節點 status 上色

當一個**容器收合**時(controller 或 k8s `node`),其矩形邊框 MUST 以它**收合後會隱藏的最差 status** 對應的 `STATUS_COLOR`(`normal` 綠 `#73BF69` / `warning` 黃 / `critical` 紅)上色——**含 `normal`**:旗下全健康的容器收合時 MUST 畫 `normal` 綠框(明確的好消息,而非中性無框)。資料來源為 normalize 彙整於該節點的 `data.worstStatus`(見 graph-data-integration:controller = 自子 pod(`pod.parent === controllerId`)聚合之最差 status,**一律寫入**;k8s node = 自身 status 與**其 pod** status 之最差,worst-wins——`controller` 視圖下 pod 不再巢狀於 node,故 node 的 pod 改以**經 `pod-to-node` 邊可達的 pod** 認定(D8),`node` 視圖下 pod 重新巢狀於 node 則沿用子節點認定;**有 status 資訊時寫入**——自身無 status 且無任何(可達或巢狀)pod 的 node 無此欄,收合維持中性邊框,「無資訊」不得偽裝成 normal)。stylesheet MUST 以 `node[worstStatus="<status>"].cy-expand-collapse-collapsed-node` 選擇器實作,宣告於 `statusSelectors`(資料驅動的 `node[status="<s>"]`——**任何帶 `status` 的節點**畫自身 status 邊框,非 pod/node/pvc 白名單;normalize 只在後端實際給 status 時才寫該欄,故 service / external / cluster / netapp-aggr / netapp-node 等無 status 者維持中性邊框(NetApp 的 `health` 是獨立欄位,MUST NOT 被映射為 status 邊框色——顏色保留給 K8s status 量尺))**之後**,使**收合的 k8s node** 的最差子節點 status 能覆寫其自身 status 邊框;controller 無 status 邊框,故此為其唯一上色。`node:selected` 以 outline/underlay 呈現故不影響此邊框色。**展開**的容器不套此選擇器(controller 維持中性 `:parent` 容器邊框、k8s node 維持自身 status 邊框)。採 **status**(非 alert severity):`info` 僅存在於 alert、不在 status 量尺,故收合框永不為 info(`SEVERITY_COLOR` 仍只服務 detail panel 的 alert 表)。

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

icon「Node Kinds」圖例的 kind 集合 MUST 由純函式 `deriveLegendKinds(elements, collapsedIds)` 導出,只列出**目前以 glyph 呈現於畫布**的 kind——而非單純「資料中出現過」的 kind。判定規則(對每個非 cluster、帶 `kind` 的節點):被收合祖先隱藏者**不**計入;**展開的**容器(其 id 為他人 `parent` 且自身未收合)**不**計入(它在 Clusters / Nodes|Controllers swatch 區段呈現);其餘(drawn leaf 或**收合的**容器)計入其 kind。`cluster`(無 kind)永不計入。此規則取代舊有的 `presentKinds` + `deriveContainers.showNodeKindIcon`,使 node / controller 容器一致;`netapp-aggr` 為 `netapp-node` 之下的 leaf,恆以其 glyph(drawn leaf)計入;`netapp-node` **是**真實 compound 容器,故與 `node` / `controller` 同規則——展開時不計入(於畫布為框)、收合時以其 glyph 計入。已移除的 `storageclass` kind 不再有任何對應規則。

#### Scenario: storageclass 恆以 leaf glyph 計入 Node-kinds

- **WHEN** 圖中含 `netapp-aggr` leaf(其父 `netapp-node` 為展開狀態)且其鄰近有 pvc leaf(本情境原先所述的 storageclass leaf 已自契約移除)
- **THEN** Node-kinds 圖例的 `Storage` 大類同時列出 `pvc` 與 `netapp-aggr` 兩個 glyph;展開的 `netapp-node` **不**計入(它於畫布為框),收合後才以 `netapp-node` glyph 回到 Node-kinds 圖例

#### Scenario: 收合容器時其子 kind 退出、容器 kind 進入(node / controller 同理)

- **WHEN** 某 K8s `node`(或 controller)容器被收合,其下 pod 全被聚合隱藏
- **THEN** `pod` 退出 Node-kinds 圖例、`node`(或對應 controller kind)以其 glyph 進入;展開的容器則不出現在 Node-kinds(僅於其 swatch 區段)

#### Scenario: 收合虛擬 network compound 時 Node-kinds 以 network 取代 switch

- **WHEN** 包裹 switch fabric 的虛擬 `network` compound(見 switch-tier-layout 規格)被收合
- **THEN** 其下 `switch` 因被收合祖先隱藏而退出 Node-kinds 圖例,收合的 `network` 以其 wifi glyph 進入(NETWORKING 大類由 `switch` 變為 `network`,標籤顯示為 `physical network`);展開後還原為 `switch`

### Requirement: Node Detail Application 與 Containers 區塊

Panel SHALL 在 node-detail 面板中提供帶 change-report 查詢的 **Application 區塊**與 **Containers 區塊**,沿用既有面板位置與版型(與 Alerts 區塊同一 sticky section 樣式)。**Application 區塊**對**任一帶 `data.application` 的節點**顯示——pod / workload controller(`kind ∈ { pod, deployment, statefulset, daemonset, job, cronjob }`),屬於某 ArgoCD application 的 `service` / `pvc` leaf,**以及 ArgoCD `application` 群組節點本身**(kind-less,以合成 `kind: application` 解析)——其 `config_changes`(Deployment Changes)查詢以該節點的識別發出(`service` / `pvc` 用自身 kind/name;`application` 群組用 `{ kind: 'application', name: <app> }`)。**Containers 區塊**MUST **僅對 pod 與 workload controller**且帶 `data.containers` 時顯示;`service` / `pvc` / `application` 群組 / `node` / `external` 等無 containers,Containers 區塊永不對其渲染。service / pvc 的 application 名稱**同時**以 promoted attr 出現於右上角釘選 tooltip(見「Hover Tooltip」),兩處互補:tooltip 顯示名稱,Application 區塊提供 config_changes 連結。

面板 body 純以**各區塊資料有無**閘控:**Application 區塊**以 `data.application` 有無閘控(任一帶 application 的節點,含 service / pvc);**Containers 區塊**以 **workload kind + 非空 `data.containers`** 閘控;兩者與 Alerts 區塊(資料閘控)共存於同一**左鍵**面板;面板**不再有恆顯的屬性區塊**(promoted attributes 改由釘選 tooltip 承載,見「Node Detail 面板」),且 header **恆顯**(面板 ALWAYS 渲染,見「Node Detail 面板」)。

**資料來源**:application name 來源為節點的 `data.application`(backend 於 pod 節點輸出;controller 由 `normalizeGraph` 自子 pod 聚合);containers 來源為節點的 `data.containers`(`Array<{ name, image }>`)。節點無 `data.application` 時 Application 區塊 MUST NOT 渲染;無 `data.containers`(或為空陣列)時 Containers 區塊 MUST NOT 渲染;兩者互不影響。

**觸發**:在 pod/controller 節點上**左鍵**(cytoscape `tap`)MUST(a)選取該節點(沿用既有單選受控狀態,與藍色高亮 / 面板開關同步,面板隨之開啟),(b)**建立**該節點兩個 URL 查詢(application-detail 與 image-detail)所需的 input(application name, controller kind, controller name, time——time 為左鍵選取當下時間,Unix 秒),並以此 input **立即併發預取(eager prefetch)** 兩查詢——`config_changes`(application)與 `code_changes`(containers)MUST 在面板因左鍵選取 workload 節點而開啟(`enabled` 為 true,即 input 與 endpoint 皆可解析)時、**無需任何後續點擊**即同時發出。**右鍵(`cxttap`)不再開啟 detail 面板、不再建立查詢 input、不再發出任何查詢**(舊右鍵 detail 觸發與其原生 context menu 抑制一併移除)。**屬於某 ArgoCD application 的 `service` / `pvc`**(帶 `data.application`)左鍵選取時亦建立查詢 input——`kind` / `name` 取**該節點自身**——並預取 `config_changes`(驅動其 Application 區塊);其 `code_changes` 雖由共用預取一併發出,但 service / pvc 無 containers,回傳結果不被使用(Containers 區塊不渲染)。**無 `data.application` 的非 workload 節點(無 `queryTarget`)左鍵選取 MUST NOT 建立查詢 input、MUST NOT 發出任何查詢**(其屬性由釘選 tooltip 承載,Alerts 視資料顯示)。

**查詢契約**:兩個查詢 MUST 共用同一組 input——ArgoCD application name、pod-controller kind、pod-controller name、time。pod 節點的 controller kind/name 取自其 owner(`data.owner`);controller 節點取自身 kind/name;無 owner 的 standalone pod 以自身 kind(`pod`)與 name 帶入。回傳:

- **application-detail 查詢**(`GET <base>/config_changes`):回 `{ "url": string, "current_time": string, "previous_time": string }`——`url` 為該 ArgoCD application 的外部詳情頁;`current_time` / `previous_time` 為該 deployment diff 的兩個時間戳。
- **image-detail 查詢**(`GET <base>/code_changes`):回 `{ [containerName]: { "url": string, "current_time": string, "previous_time": string, "result_type": string } }`——map(container name → entry);input MUST NOT 含 image 參數,一次呼叫即涵蓋該節點所有 containers。
- **時間戳契約**:`current_time` / `previous_time` MUST 為 **RFC 3339 / ISO 8601(UTC)** 字串。兩時間戳為 **best-effort**:缺漏 / 非字串 / 解析失敗時,對應時間欄 MUST 顯示 muted(`theme.colors.text.secondary`)「n/a」(`MISSING_VALUE_PLACEHOLDER`),並 MUST NOT 影響同列的 `url` anchor、其餘欄、或其餘列。
- **變更型別契約(`result_type`,僅 `code_changes`)**:每個 container entry MAY 帶 `result_type` 字串,已知列舉值為 **`UNCHANGED` / `UPDATED` / `REPLACED` / `ADDED` / `REMOVED` / `RENAMED`**(大寫)。`result_type` 為 **best-effort**:缺漏 / 非字串 / 空字串時,該列 Change Type 欄 MUST 顯示 muted(`theme.colors.text.secondary`)「n/a」(`MISSING_VALUE_PLACEHOLDER`);**未知值**(非上述六個)MUST 照原字串渲染(visible-by-default),以中性灰 fallback 色呈現。`config_changes`(application)**不含** `result_type`,Application 區塊 MUST NOT 有 Change Type 欄。

**缺值占位單一來源**:面板內所有「有列但缺格」的缺值占位(change time、Change Type、Alert 的 Pod/Service)MUST 取自單一常數 `MISSING_VALUE_PLACEHOLDER = 'n/a'`,以 muted 樣式呈現(取代舊有分散硬編的 em-dash「—」)。

**呼叫快取**:panel 開啟期間,`code_changes` 與 `config_changes` 各 MUST **最多呼叫一次**——eager 預取於面板開啟時各發一次,`code_changes` 回的整包 map 由所有 container 列**共用**。僅快取**成功**回應:失敗 MUST NOT 入快取。**換節點 / 換 endpoint / 關閉 panel(unmount / 清除選取)MUST 清除快取**(連同中止 in-flight)。

**查詢傳輸**:查詢 MUST 透過 Grafana runtime(`@grafana/runtime` `getBackendSrv()`)發往**同一個 graph API backend**;MUST NOT 自 `src/**` 直接以 `fetch` / `axios` / `XMLHttpRequest` 連線外部 backend。查詢端點(base path)MUST 依序解析:(1)panel option 非空時以其為準(覆寫);(2)否則 SHALL 自面板查詢請求(`data.request.targets`)自動推導為 graph query 的 **sibling**(取第一個經 Grafana runtime datasource instance settings 解析出非空 proxied base path 的 target,於其後串接 graph query 路徑的目錄,再 append `/config_changes`、`/code_changes`);(3)兩者皆無時,兩區塊照資料渲染但連結欄 MUST 顯示「Not found」提示(`enabled` 為 false → 不發查詢),且 MUST NOT 發出任何查詢。預取查詢 MUST 可中止,MUST NOT 在 unmount 後 setState。

**呈現**(每個連結欄目標各自獨立狀態,三態之一:**loading / ready / unavailable**):

- **loading**:面板一開啟即併發查詢;回傳前,每個尚未解析的目標 MUST 於該列連結欄顯示 `Spinner` + 提示文字,該位置 MUST NOT 顯示 anchor。
- **ready**:`config_changes` / `code_changes` 回 200 + 有效 `url` 時,連結欄 MUST 渲染真實 anchor `<a href={url} target="_blank" rel="noopener noreferrer">`(預解析 URL,MUST NOT `window.open`)。
- **unavailable**:失敗 / 查無 / 無 URL 時,連結欄 MUST 以次要(muted)文字顯示「Not found」提示(過長截斷、完整失敗訊息入 `title`)。
- **失敗隔離**:任一目標 unavailable MUST NOT 影響 header、另一區塊、或同區塊其他列。
- **時間欄呈現(Current / Previous)**:兩區塊各新增 **Current Change Time** 與 **Previous Change Time** 兩欄,以 `@grafana/data` `dateTimeFormat` 依面板 `timeZone` 將 RFC 3339 原字串格式化為在地化絕對時間,完整 ISO 入 `title`;無值或非法日期時該格顯示 muted「n/a」(`MISSING_VALUE_PLACEHOLDER`)且 MUST NOT 設 `title`、MUST NOT 顯示 `Invalid date`。
- **變更型別欄呈現(Change Type,僅 Containers)**:Containers 區塊的 **Change Type** 欄呈現 `result_type`,以單一來源色彩映射(`colorByResultType.ts`)的彩色文字渲染(`ADDED`=綠 / `REMOVED`=紅 / `UPDATED`=藍 / `REPLACED`=橘 / `RENAMED`=紫 / `UNCHANGED`=灰);未知值以中性灰照原字串渲染;缺漏 / 非字串 / 空字串顯示 muted「n/a」。色彩查找對大小寫不敏感、顯示一律大寫。Application 區塊 MUST NOT 有此欄。
- **對齊**:連結欄內容 MUST 釘於該欄右緣(`disableGrow` + `justifyContent: flex-end`),使兩區塊各列連結欄上下對齊、不左右漂移。
- **表格版型**:兩區塊 MUST 以帶 column header 的 `InteractiveTable` 渲染——Application 欄位依序 **Name / Current Change Time / Previous Change Time / Deployment Changes**,Containers 欄位依序 **Name / Image / Change Type / Current Change Time / Previous Change Time / Code Changes**;連結欄維持最右(`disableGrow`),`Change Type` / `Current` / `Previous` 亦 `disableGrow`,由 Name / Image 欄填滿剩餘寬度。
- 兩區塊 MUST 以 `@grafana/ui` + emotion `useStyles2` 實作,元件(ApplicationTable / ContainerTable)共置於 `node-detail` feature 並經其 `index.ts` barrel 匯出。

#### Scenario: 左鍵 pod/controller 選取並立即併發預取兩查詢

- **WHEN** 使用者於一個帶 `data.application` 的 pod(或 controller)節點按**左鍵**,且 endpoint 可解析(`enabled`)
- **THEN** 該節點被選取(藍色高亮與面板開啟同步),系統建立兩查詢所需 input(application name, controller kind, controller name, time)
- **AND** 系統 MUST **無需任何後續點擊**,即經 `getBackendSrv()` **同時併發**發出 application-detail(`config_changes`)與 image-detail(`code_changes`)兩查詢

#### Scenario: 右鍵不再開啟 detail 面板或查詢

- **WHEN** 使用者於 pod/controller 節點按**右鍵**(`cxttap`)
- **THEN** 系統 MUST NOT 因此開啟 detail 面板、MUST NOT 建立查詢 input、MUST NOT 發出任何 change-report 查詢(右鍵 detail 觸發已移除)

#### Scenario: pod 的 controller kind/name 取自 owner

- **WHEN** 左鍵的節點為 pod 且其 `data.owner` 為 `{ kind: "deployment", name: "gateway" }`
- **THEN** 該節點預取查詢的 input 之 controller kind/name 為 `deployment` / `gateway`

#### Scenario: controller 節點以自身 kind/name 查詢

- **WHEN** 左鍵的節點為 controller(如 `statefulset` `mongo`)
- **THEN** 該節點預取查詢的 input 之 controller kind/name 為 `statefulset` / `mongo`

#### Scenario: 區塊僅對 pod/controller 顯示

- **WHEN** 使用者**左鍵**選取的節點 `kind` 為 `pod` 或 controller 且帶對應資料(`data.application` / 非空 `data.containers`)
- **THEN** 面板渲染 change-report 的 Application 區塊與 Containers 區塊

#### Scenario: Containers 僅對 workload;service/pvc 帶 application 顯示 Application

- **WHEN** 選取的節點 `kind` 為 `service` / `pvc` 且帶 `data.application`
- **THEN** **Application 區塊**(`node-detail-section-application`)渲染並預取 `config_changes`(以該節點自身 kind/name);**Containers 區塊**(`node-detail-section-containers`)MUST NOT 渲染(service/pvc 無 containers,即使資料偶帶 `containers`)
- **WHEN** 選取的節點 `kind` 為 `node` / `external` / `switch` / `cluster` / `netapp-aggr` / `netapp-node`,或為無 `data.application` 的 `service` / `pvc`
- **THEN** Application 與 Containers 區塊皆 MUST NOT 渲染

#### Scenario: 無 application 時僅隱藏 Application 區塊

- **WHEN** **左鍵**選取的 pod/controller 節點無 `data.application`,但帶非空 `data.containers`
- **THEN** Application 區塊 MUST NOT 渲染,Containers 區塊照常渲染並預取 `code_changes`

#### Scenario: 無 containers 時僅隱藏 Containers 區塊

- **WHEN** **左鍵**選取的 pod/controller 節點帶 `data.application`,但無 `data.containers`(或為空陣列)
- **THEN** Containers 區塊 MUST NOT 渲染,Application 區塊照常渲染並預取 `config_changes`

#### Scenario: 預取進行中顯示 loading spinner

- **WHEN** 左鍵開啟面板且 endpoint 可解析,預取查詢尚未回傳
- **THEN** Application 與 Containers 兩區塊每列連結欄顯示 `Spinner` + 提示文字,該位置不顯示 anchor

#### Scenario: Application 預取成功渲染 anchor

- **WHEN** application-detail(`config_changes`)查詢成功回傳有效 URL `u`
- **THEN** Application 區塊連結欄(header「Deployment Changes」)渲染 `<a href="u" target="_blank" rel="noopener noreferrer">`,點擊以一般使用者手勢於新分頁開啟 `u`(MUST NOT `window.open`)

#### Scenario: Container 預取成功為有 URL 的列渲染 anchor

- **WHEN** 節點 `data.containers` 含 `{ name: "app", image: "repo/app:1.2" }`,且 image-detail(`code_changes`)成功回傳 `{ "app": { "url": "https://x/app" } }`
- **THEN** `app` 列連結欄(header「Code Changes」)渲染 `<a href="https://x/app" target="_blank" rel="noopener noreferrer">`

#### Scenario: Application 區塊以帶 header 表格渲染

- **WHEN** 左鍵開啟的面板渲染 Application 區塊(節點帶 `data.application`)
- **THEN** 區塊以 `InteractiveTable` 依序呈現 column headers **Name** / **Current Change Time** / **Previous Change Time** / **Deployment Changes**

#### Scenario: Containers 區塊以帶 header 表格渲染且沿欄對齊

- **WHEN** 左鍵開啟的面板渲染 Containers 區塊(節點帶兩個以上、name 長度不一的 containers)
- **THEN** 區塊以 `InteractiveTable` 依序呈現 column headers **Name** / **Image** / **Change Type** / **Current Change Time** / **Previous Change Time** / **Code Changes**,沿欄對齊(欄界不隨 name 長度漂移)

#### Scenario: 連結欄 header 正名

- **WHEN** 面板同時渲染 Application 與 Containers 區塊
- **THEN** Application 區塊連結欄 header 為「Deployment Changes」,Containers 區塊連結欄 header 為「Code Changes」(皆 MUST NOT 顯示「Change Report」)

#### Scenario: config_changes 帶兩時間戳時 Application 顯示在地化絕對時間

- **WHEN** application-detail(`config_changes`)成功回傳 `{ "url": "u", "current_time": "2026-06-16T10:30:00Z", "previous_time": "2026-06-10T08:00:00Z" }`
- **THEN** Application 列 Current / Previous 欄顯示依面板 `timeZone` 格式化的在地化絕對時間,各以完整 ISO 入 `title`,同列連結欄仍渲染 `u` 的 anchor

#### Scenario: code_changes 某 container entry 帶兩時間戳時該列顯示之

- **WHEN** image-detail(`code_changes`)成功回傳 `{ "app": { "url": "https://x/app", "current_time": "2026-06-16T10:30:00Z", "previous_time": "2026-06-10T08:00:00Z" } }`,節點 `data.containers` 含 `{ name: "app", image: "repo/app:1.2" }`
- **THEN** `app` 列 Current / Previous 欄分別顯示兩時間戳在地化絕對時間、各以完整 ISO 入 `title`,該列連結欄渲染 `https://x/app` 的 anchor

#### Scenario: code_changes entry 帶 result_type 時該列 Change Type 顯示彩色型別

- **WHEN** image-detail(`code_changes`)成功回傳 `{ "app": { "url": "https://x/app", "result_type": "UPDATED" } }`,節點 `data.containers` 含 `{ name: "app", image: "repo/app:1.2" }`
- **THEN** `app` 列 Change Type 欄顯示 `UPDATED`,以該已知列舉值對應的語義色(藍)彩色文字渲染,該列連結欄仍渲染 anchor

#### Scenario: result_type 為未知值時照原字串以中性灰渲染

- **WHEN** 某 container `code_changes` entry 的 `result_type` 為非列舉值(如 `"MIGRATED"`)
- **THEN** 該列 Change Type 欄照原字串顯示 `MIGRATED`(MUST NOT 靜默丟棄),以中性灰 fallback 色渲染

#### Scenario: result_type 缺漏 / 非字串 / 空字串時 Change Type 降級為 muted「n/a」

- **WHEN** 某 container `code_changes` entry 成功回傳有效 `url` 但 `result_type` 缺漏 / 為非字串 / 為空字串
- **THEN** 該列 Change Type 欄顯示 muted(`theme.colors.text.secondary`)「n/a」(`MISSING_VALUE_PLACEHOLDER`),同列 url anchor、時間欄、其餘欄與其餘列 MUST NOT 受影響

#### Scenario: Application 區塊無 Change Type 欄

- **WHEN** 面板渲染 Application 區塊
- **THEN** Application 區塊欄位依序為 Name / Current Change Time / Previous Change Time / Deployment Changes,MUST NOT 含 Change Type 欄

#### Scenario: 時間戳缺漏或非 RFC 3339 時時間欄降級為 muted「n/a」

- **WHEN** `config_changes`(或某 container 的 `code_changes` entry)成功回傳有效 `url`,但 `current_time` 缺漏 / 為非字串 / 為非 RFC 3339 字串(如 `"not-a-date"`),`previous_time` 正常
- **THEN** 該目標 Current 欄顯示 muted(`theme.colors.text.secondary`)「n/a」(`MISSING_VALUE_PLACEHOLDER`)且無 `title`,Previous 欄照常顯示在地化絕對時間,同列 url anchor 與其餘欄、其餘列皆 MUST NOT 受影響(MUST NOT 顯示 `Invalid date`)

#### Scenario: 開啟期間 code_changes 只呼叫一次、各 container 共用結果

- **WHEN** 面板開啟、`code_changes` 預取完成,且有多個 container 列
- **THEN** 系統僅對 `code_changes` 發出**一次**呼叫,所有 container 列以該次回傳的 map 取值
- **AND** 關閉 panel / 換節點後快取 MUST 清除,下次開啟重新呼叫一次

#### Scenario: 失敗的查詢不入快取(remount 重取)

- **WHEN** 某次 `code_changes`(或 `config_changes`)失敗,其後面板對同節點重新掛載(remount)
- **THEN** 系統重新發出該查詢(失敗結果未被快取)

#### Scenario: 連結欄跨區塊與跨狀態上下對齊

- **WHEN** 面板同時顯示 Application 與 Containers 區塊,且部分目標為 loading、部分為 ready、部分為 unavailable(混合狀態)
- **THEN** 兩區塊每列的連結欄內容皆釘於欄右緣、彼此上下對齊

#### Scenario: map 缺 container key 時顯示「Not found」

- **WHEN** `code_changes` 成功,但某 container name 不存在於回傳 map(或該 name 無有效 URL)
- **THEN** 該列連結欄顯示「Not found」提示(無 anchor),name 與 image 仍照常顯示

#### Scenario: 查詢失敗顯示「Not found」且不波及其餘

- **WHEN** `config_changes`(或 `code_changes`)查詢失敗
- **THEN** 對應目標連結欄以次要色顯示「Not found」提示(無 anchor;過長截斷、完整失敗訊息入 `title`)
- **AND** 面板 header 與另一區塊 / 其他列仍正常顯示

#### Scenario: endpoint 自 panel datasource 自動推導(預取發往 sibling 段)

- **WHEN** panel option 未設定查詢 endpoint,且面板查詢 target 帶 datasource ref(`access: proxy`)、其 graph query 路徑為 `/api/v1/graph/service_graph`,使用者左鍵開啟 workload 節點面板
- **THEN** 預取查詢發往與 graph query 同目錄的 sibling 段(`…/api/v1/graph/config_changes` 與 `…/api/v1/graph/code_changes`)

#### Scenario: panel option 覆寫自動推導

- **WHEN** panel option 設定 endpoint 為 `/foo`,使用者左鍵開啟 workload 節點面板
- **THEN** 預取查詢發往 `/foo/config_changes` 與 `/foo/code_changes`(option 優先)

#### Scenario: 未設定 endpoint 且無法推導時不查詢並顯示「Not found」

- **WHEN** panel option 未設定查詢 endpoint,且自查詢 targets 推導不出 datasource proxy path
- **THEN** 左鍵開啟的面板中兩區塊照資料渲染,連結欄顯示「Not found」提示(`enabled` 為 false),且 MUST NOT 發出任何查詢

#### Scenario: 帶 application 的 service/pvc 左鍵預取 config_changes

- **WHEN** 使用者左鍵選取一個帶 `data.application` 的 `service` 或 `pvc`,且 endpoint 可解析
- **THEN** 系統以該節點**自身 kind/name** + application 建立查詢 input,預取 `config_changes`(驅動 Application 區塊的 Deployment Changes 連結)
- **AND** Containers 區塊不渲染(無 containers;`code_changes` 的回傳結果不被使用)

#### Scenario: 選取 application 群組預取其 config_changes

- **WHEN** 使用者左鍵選取一個 ArgoCD `application` 群組節點(kind-less,帶 `application`),且 endpoint 可解析
- **THEN** 系統以 `{ application: <app>, kind: 'application', name: <app>, time }` 建立查詢 input,預取 `config_changes`;Application 區塊渲染該 application 的 Deployment Changes 連結(header badge 顯示合成 `application` kind)
- **AND** Containers 區塊不渲染(application 群組無 containers)

#### Scenario: 無 application 的非 workload 節點左鍵不觸發查詢

- **WHEN** 使用者以左鍵 `tap` 選取一個非 workload、**無 `data.application`** 的節點(如 `node` / `external`,或無 application 的 `service` / `pvc`;無 `queryTarget`)
- **THEN** 面板仍渲染(header-only 或含 Alerts),節點屬性由右上角釘選 tooltip 承載,但 MUST NOT 建立查詢 input、MUST NOT 發出 application-detail / image-detail 查詢

#### Scenario: 換節點 / 關閉 panel 清除狀態與快取並中止 in-flight

- **WHEN** 面板開啟且預取 in-flight,使用者切換到另一節點、或關閉 panel(unmount / 清除選取)
- **THEN** 系統中止 in-flight 查詢(`AbortController`)、清除兩端點快取與每目標狀態,且中止後 MUST NOT 對舊節點 setState

#### Scenario: 查詢經 Grafana runtime 而非直連外部

- **WHEN** 對 `src/**` 進行 source code 掃描
- **THEN** 查詢僅經 `getBackendSrv()`;`src/**` 內無任何直接 `fetch` / `axios` / `XMLHttpRequest` 連線外部 backend 的程式碼

### Requirement: 圖例節點種類顯示/隱藏切換

Panel SHALL 在 Node Kinds 圖例的**每一列**(icon + 名稱)提供一顆**顯示/隱藏切換按鈕**(`eye` / `eye-slash`),點擊切換該 kind 節點在畫布上的可見性。切換 MUST 寫入 panel option `visibleKinds`(經 `onOptionsChange` 部分更新)——options editor 的 kind multi-select 與圖例按鈕為**同一狀態**的兩個介面,MUST 雙向同步。隱藏一個 kind 時,**任一端點為該 kind 節點的邊** MUST 隨之隱藏(既有 `computeVisibility` 端點規則),且無可見邊與可見子節點的節點 MUST 被孤兒級聯隱藏(既有 `hideOrphans`)。

**圖例列表**:圖例 kind 列表 MUST 為「實際以 glyph 渲染的 kinds」(既有收合感知推導)與「存在於當前(mode 轉換後)elements 但被 `visibleKinds` 濾掉的 kinds」之**聯集**——被隱藏的 kind 其圖例列 MUST 保留(淡化樣式 + `eye-slash`),否則無法從圖例還原。切換按鈕 MUST 僅渲染於**可過濾的已知 kind**:`network` 虛擬 wrapper(永不 kind-過濾)與未知 kind(預設恆可見)的列 MUST NOT 帶按鈕。

**與既有切換的互動**:

- **收合切換(cluster / nodes-or-controllers / storage classes 的 collapse-all 與單一容器收合)**:收合狀態(`collapsedIds`)與可見性(`visibleKinds`)為獨立兩層——隱藏 kind MUST NOT 變更任何容器的收合狀態;重新顯示後收合狀態 MUST 原樣呈現。
- **收合互換語意不變**:收合容器在圖例以容器 kind 列代表(如收合 `netapp-node` → 列 `netapp-node` 非 `netapp-aggr`),按鈕切換的是該列的 kind;容器 kind 隱藏時其後代節點 MUST 一併不可見(有效可見性 = 自身 AND 祖先)。
- **pod-parent 模式切換**:`visibleKinds` 為跨模式全域集合,作用於 mode 轉換後的 elements;模式切換 MUST NOT 清除隱藏設定——在另一模式無對應節點的設定無視覺效果但保留,切回後恢復生效。

切換寫回 option 時 MUST 維持 canonical kind 順序(以全 kind 宇宙的固定順序重建陣列)——隱藏/還原往返不得重排持久化的 `visibleKinds`(dashboard JSON 與 editor multi-select 順序穩定)。

全部可切換 kind 均隱藏時,畫布 MUST 顯示既有 `All node types filtered` 空狀態,圖例 MUST 仍列出全部(隱藏的)kind 供還原;畫布因**邊類型過濾**(孤兒級聯)而清空、但仍有可切換 kind 未隱藏時,MUST NOT 歸咎節點種類——顯示一般化的 `All elements filtered out`。

#### Scenario: 切換隱藏一個 kind 及其相關邊

- **WHEN** 圖中有 `service` 節點與 `service-selects-pod` 邊,使用者點擊圖例 `service` 列的切換按鈕
- **THEN** 所有 `service` 節點與所有以 `service` 節點為端點的邊(如 `pod-calls-service` / `service-selects-pod`)自畫布隱藏
- **AND** `service` 列保留於圖例(淡化 + `eye-slash`),再次點擊後節點與邊恢復顯示

#### Scenario: 圖例按鈕與 options editor 同步

- **WHEN** 使用者點擊圖例 `pvc` 列的切換按鈕隱藏 `pvc`
- **THEN** panel option `visibleKinds` 不再含 `pvc`(editor multi-select 同步反映);反之自 editor 取消勾選某 kind 時,圖例對應列同步呈現隱藏狀態

#### Scenario: 隱藏不清除收合狀態

- **WHEN** 某 K8s `node` 容器處於收合狀態,使用者隱藏 `node` kind 後再重新顯示
- **THEN** 該 node 容器恢復顯示且**維持收合**(收合狀態未被切換動作清除)

#### Scenario: controller 模式隱藏 pod 觸發孤兒級聯

- **WHEN** controller 模式下使用者隱藏 `pod` kind,且某 controller 盒自身無 incident drawn edge(pod 巢狀於其中,`pod-to-node` 由 pod 指向 K8s node、不經 controller),其子 pod 全數被隱藏
- **THEN** 該 controller 盒因無可見子節點且無可見邊而被孤兒級聯一併隱藏

#### Scenario: 模式切換保留隱藏設定

- **WHEN** controller 模式下隱藏 `deployment`,切換至 node 模式再切回 controller 模式
- **THEN** node 模式期間設定無視覺效果(圖中無 controller 節點),切回 controller 模式後 `deployment` 仍為隱藏

#### Scenario: 不可過濾的列無按鈕

- **WHEN** 圖例列出 `network`(虛擬 fabric wrapper)或一個未知 kind(backend 新增、不在已知 kind 集合)
- **THEN** 該列照常顯示 glyph 與名稱,但不渲染顯示/隱藏切換按鈕

#### Scenario: 全部隱藏顯示空狀態且可還原

- **WHEN** 使用者將圖例列出的全部 kind 切換為隱藏
- **THEN** 畫布顯示 `All node types filtered` 空狀態,圖例仍列出全部 kind(淡化 + `eye-slash`),點擊任一列即可還原該 kind

#### Scenario: 邊類型過濾清空畫布不歸咎節點種類

- **WHEN** 全部 kind 均為顯示,但使用者於 options editor 取消全部邊類型,孤兒級聯使所有節點自畫布消失
- **THEN** 畫布顯示 `All elements filtered out`(而非 `All node types filtered`),圖例 kind 列維持顯示狀態(`Hide` affordance)

#### Scenario: 隱藏/還原往返不重排 visibleKinds

- **WHEN** 使用者隱藏再還原同一 kind
- **THEN** 寫回的 `visibleKinds` 與原陣列逐項相等(canonical 順序,不在尾端追加)

### Requirement: 裝飾性 compound 群組使用 per-kind 固定色彩與 kind 前綴標籤

裝飾性 `cluster` / `namespace` / `application` 群組的 accent 色(`clusterColor` / `namespaceColor` / `applicationColor`)MUST 為**依群組種類(kind)固定的單一色彩**——同種類的所有群組節點(不論其名稱)共用同一色彩,不再依名稱雜湊(hash)產生每一實例各異的色彩。三種 kind 的色彩 MUST 彼此不同,且 MUST 與既有邊色彩表(`EDGE_STYLE_BY_TYPE`)及 status 色彩(normal 綠、warning 黃、critical 紅)有足夠對比,確保邊線經過任一 compound 背板時仍清晰可辨。

裝飾性 `cluster` / `namespace` / `application` 群組的**畫布標籤**MUST 以**首字大寫 kind 前綴詞 + `: `**(冒號後接一空格)為前綴,格式為 `${PREFIX}: ${name}`(例如名稱 `prod` 的 `cluster` 群組畫布標籤為 `Cluster: prod`,名稱 `checkout` 的 `namespace` 為 `Namespace: checkout`,名稱 `mongo` 的 `application` 為 `Release Unit: mongo`)。**`application` 群組的顯示前綴詞為「Release Unit」**——此僅為顯示文字,內部 `type`/`kind` 字串、`isApplication` flag、`applicationColor`、CSS selector(`node[?isApplication]`)皆維持 `application` 不變。

此前綴 MUST 以 **stylesheet 的 render-only function `label` mapper** 實作(選擇器 `node[?isCluster]` / `node[?isStorageCluster]` / `node[?isNamespace]` / `node[?isApplication]`),**MUST NOT** 由 `normalizeGraph` 寫入 `data.label`——`data.label` MUST 維持上游裸名稱(與 `data.cluster` / `data.namespace` / `data.application` 一致)。如此 hover / pinned tooltip 的 name title、以及其他讀取 `data.label` 作為 identity / 顯示名的路徑,皆取得裸名稱;前綴**僅**出現在畫布 compound naming。此要求僅適用於裝飾性 compound 群組(`cluster` / `storage-cluster` / `namespace` / `application`),不影響任何 leaf 節點(pod / service / pvc / node / netapp-aggr)或 `controller` / `netapp-node` compound 的標籤格式。整段畫布標籤(前綴 + 名稱)沿用既有 `font-weight: 600` 樣式——cytoscape 單一 label 不支援同節點內混合字重的局部粗體,故前綴與名稱共用同一字重。

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

- **WHEN** 一個 `pod` / `service` / `pvc` / `node` / `netapp-aggr` leaf 節點或 `controller` / `netapp-node` compound 節點被正規化
- **THEN** 其 `data.label` 維持原名稱,不套用任何 kind 前綴

## ADDED Requirements

### Requirement: 節點使用率視覺化(usage 資料驅動,與 kind 無關)

系統 SHALL 於 canvas 上為**任何帶有 `data.usageRatio` 的節點**繪製使用率視覺化,使操作者不必開 tooltip 即可一眼辨識接近容量上限的儲存。實務上此集合為 `pvc`(kubelet volume stats)與 `netapp-aggr`(Harvest aggregate space),但規則 MUST 以 **`usageRatio` 的存在**為唯一觸發條件、**MUST NOT** 硬編任何 kind 清單——未來後端為其他 kind 補上 `usage` 時即自動適用,無需改動 stylesheet。

`usageRatio` 由 normalize 攤平為節點 `data` 的頂層數值欄位(見 graph-data-integration「NetApp 節點與 PVC 儲存欄位正規化」),因 cytoscape selector 無法讀取巢狀 `data` 亦無法於 selector 內做除法。

視覺編碼規則:

- 以 `node[usageRatio]` 選擇器套用一個**由下往上的填充**(cytoscape `background-fill: 'linear-gradient'` 搭配依 `usageRatio` 計算的 gradient stop),使填滿高度正比於使用率。
- 填充色 MUST 為**無彩度**(取自 Grafana theme 的中性色階,如 `theme.colors.text.disabled` / `border` 家族),**MUST NOT** 使用 `STATUS_COLOR` 的任一值或任何語意色——顏色在本 panel 保留給 status,使用率以**填滿高度**而非色相編碼。
- 節點的 kind icon MUST 維持可見且位於填充**之上**,身分辨識不得被使用率遮蔽。
- 無 `usageRatio` 的節點(含所有非儲存節點、以及 `usage` 不完整的儲存節點)MUST 維持既有背景,不套用任何填充——**缺資料不得渲染為 0%**。

此視覺化為**純呈現**:MUST NOT 影響選取、過濾、佈局或 tooltip 內容,亦 MUST NOT 寫回任何 `data` 欄位。tooltip 的文字 `usage` 列(見「Hover Tooltip 顯示元素 metadata」)與本視覺化為同一資料的兩種呈現,兩者 MUST 並存。

#### Scenario: 帶 usageRatio 的節點渲染填充

- **WHEN** 一個 `netapp-aggr` 節點帶 `usageRatio: 0.7`,一個 `pvc` 節點帶 `usageRatio: 0.5`
- **THEN** 兩者皆以由下往上的填充渲染,填滿高度分別約為節點高度的 70% 與 50%,且兩者走**同一條** stylesheet 規則(非 per-kind 規則)

#### Scenario: 無 usageRatio 的節點不套用填充

- **WHEN** 一個 `pvc` 節點無 `usage`(或其 `usage` 僅有 `capacityBytes`,故 normalize 未寫入 `usageRatio`)
- **THEN** 該節點維持既有背景,MUST NOT 渲染任何填充,亦 MUST NOT 被渲染為 0% 填滿

#### Scenario: 填充色不與 status 色衝突

- **WHEN** 檢視使用率填充所用的顏色
- **THEN** 其值 MUST NOT 等於 `STATUS_COLOR` 的任一值(綠 `#73BF69` / 黃 `#F2CC0C` / 紅 `#E02F44`),且為無彩度的中性色——使用率僅以填滿高度編碼

#### Scenario: 使用率填充不遮蔽 kind icon 與 status 邊框

- **WHEN** 一個帶 `usageRatio` 且同時帶 `status` 的節點被渲染
- **THEN** 其 kind icon 仍可見於填充之上,其 status 邊框色仍依既有規則呈現(填充只影響背景,不影響邊框)

#### Scenario: 使用率視覺化不影響互動與佈局

- **WHEN** 使用者對帶 `usageRatio` 的節點進行選取 / 過濾 / 切換 pod-parent 模式
- **THEN** 行為與無此欄位的同 kind 節點完全一致(填充純為呈現層,不參與 `computeVisibility`、佈局或 `resolveSelectedNode` 判定)
