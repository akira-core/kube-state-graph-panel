# panel-rendering delta — legend-controllers-bottom

## MODIFIED Requirements

### Requirement: 圖例 (Legend)

Panel SHALL 提供 legend 元件,顯示**圖中實際呈現的**節點 icon 與邊類型對應說明。Node legend 的 icon / 顏色資料源 MUST 與 cytoscape stylesheet 共用同一份對應表(`iconSvgByKind.ts` / `colorByEdgeType.ts`)。Node legend 的 kind 集合 MUST 由 collapse-aware 的 `deriveLegendKinds`(見「Node-kinds 圖例 collapse-aware」requirement)導出——只列出**目前以 glyph 呈現於畫布**的 kind(drawn leaf + 收合容器;展開容器與被收合祖先隱藏的子節點不列);Edge legend MUST 只列出**目前資料中出現的 edge type**,惟 `pod-calls-service` / `service-selects-pod` 一律**省略**(本質為 pod-to-pod,由 `pod-calls-pod` 的 `pod ↔ pod/service` 雙向列代表——見下);兩者於對應集合為空時 MUST 不渲染(`return null`)。Node legend MUST 以隨主題上色的 icon glyph(取代既有 `ShapeGlyph`)呈現各 kind,並依 panel-owned 的 `kind → 超大類`(`categoryByKind.ts`:Workloads / Networking / Storage / Cluster / Other)查表**分組**,只渲染含 ≥1 個出現 kind 的大類;顏色 MUST NOT 編碼大類(顏色保留給狀態)。kind 列的文字標籤預設為 kind 字串本身,惟 MUST 支援 display-name 覆寫(`NodeLegend` 內的查表):`network` MUST 顯示為 `physical network`。Edge legend 每列 MUST 渲染為 `<from> [箭頭 glyph] <to>`:箭頭 glyph(`EdgeGlyph`,帶該 edge 的顏色與線型)置於兩端 `NodeKind` 標籤中間以取代動詞,端點標籤由 `EDGE_ENDPOINTS_BY_TYPE` 解析(`service` 縮寫為 `svc`),且 MUST NOT 顯示額外的 nesting 說明文字。例外:`pod-calls-pod` 列 MUST 渲染為 `pod ↔ pod/service`(雙向箭頭 glyph,兩端皆有箭頭),代表被省略的服務邊對。

legend 區段的垂直順序 MUST 為:`Layout`(Node|Controller 切換,置頂)→ `Node Kinds` → **`Ingress Gateway`** → `Edge Types` → `Status` → swatch 區段(`Clusters` → `Namespaces` → `Applications` → **`Nodes`|`Controllers`**);亦即 swatch 區段置於 `Status` **之後**,且 **`Nodes`|`Controllers`(`NodeContainerLegend`)MUST 為 legend 最底區段**(在 `Applications` 之後;在 `node` 模式下 `Namespaces` / `Applications` 不渲染時,仍接在 `Clusters` 之後作為最底)。

其中 `Ingress Gateway`(`IngressToggle`,見 ingress-visibility-toggle capability)為 **presence-gated**:僅在圖中確實存在 ingress-gateway 節點集合(非空)時渲染,否則 MUST NOT 渲染——與本 requirement「對應集合為空時 `return null`」的既有慣例一致。它緊接 `Node Kinds` **之後**、`Edge Types` **之前**,因其與 `NodeLegend` 同屬**節點可見性控制**(眼睛 / eye-slash 切換語彙),而非邊或狀態的說明列;它 MUST NOT 併入 `NodeLegend` 的 kind-based row(那些列嚴格以 kind 為 key)。該區段除標題與 eye 切換外,MUST 另附一條虛線 `EdgeGlyph` 樣本說明畫布上的 ingress 虛線語意——`EdgeLegend` 省略了服務型別列且其樣本一律實線,故若無此樣本,畫布虛線在 legend 中無任何對應說明。

`Namespaces`(`NamespaceLegend`)與 `Applications`(`ApplicationLegend`,標題 `Applications` / 應用程式)為 **mode-gated**:僅在 `controller` 模式渲染(`node` 模式剝除 namespace / application 群組,故兩區段 MUST `return null`);`NamespaceLegend` 由後端 `isNamespace` 群組節點餵入(以 `namespaceColor` accent 上色)、`ApplicationLegend` 由後端 `isApplication` 群組節點餵入(以 `applicationColor` accent 上色,`applicationPalette` 衍生)。舊有的 `StorageClassLegend`(`Storage Classes` swatch 區段)MUST **移除**——`storageclass` 於後端 D6 階層改為 cluster 下的一般 leaf,故 MUST 改以其 `storageclass` glyph 列於 `NodeLegend` 的 `Storage` 大類(經既有 `categoryByKind` wiring),不再有獨立 swatch 區段。所有區段標題 MUST 為 Title Case(`Node Kinds` / `Ingress Gateway` / `Edge Types` / `Status` / `Clusters` / `Namespaces` / `Applications` / `Nodes`|`Controllers`)。

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

- **WHEN** 圖中含 storageclass leaf 節點
- **THEN** `storageclass` 以其 glyph 列於 `NodeLegend` 的 `Storage` 大類;legend MUST NOT 渲染任何 `Storage Classes` swatch 區段(`StorageClassLegend` 已移除)

#### Scenario: 對應集合為空時不渲染

- **WHEN** 圖中無任何節點(或無任何 drawn 邊)
- **THEN** Node legend(或 Edge legend)`return null`,不渲染空標題
