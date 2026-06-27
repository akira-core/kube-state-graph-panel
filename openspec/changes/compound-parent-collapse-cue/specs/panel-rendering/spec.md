## MODIFIED Requirements

### Requirement: 互動與選取狀態

Panel SHALL 支援節點點擊選取,選取狀態透過 cytoscape 內建 `:selected` style 視覺化,且可選地透過 `onSelect` callback 將被選節點 id 傳出供其他元件消費。

**所有 compound parent 節點 MUST 為可選取(`selectable`)**——含 `controller` / K8s `node` / `storageclass`,以及裝飾性 `cluster` / `namespace` / `application` 群組。`normalizeGraph` MUST NOT 再把裝飾群組標為 `selectable: false`。此可選取性的唯一目的,是讓 `cytoscape-expand-collapse` 既已啟用(`cueEnabled: true`)的 **`+/-` 摺疊 cue** 能浮現:該 cue 為 selection-driven,僅於**單一被選取**且為 `:parent`(或已收合)的節點上繪製。故使用者點選任一 compound parent → 該 parent 浮現其 `+/-` cue → 點 cue 切換該 parent 的收合 / 展開(沿用既有 expand-collapse plumbing,無新元件、無新收合機制)。

裝飾群組雖可被選取(顯示單選環與既有 selection-focus 視覺),但 MUST NOT 開啟 node-detail 面板:`resolveSelectedNode` 經 `isDashboardEligible` 對 `isCluster` / `isNamespace` / `isApplication` 一律回 `null`,此守衛不變。

#### Scenario: 點擊節點觸發選取與 callback

- **WHEN** 使用者點擊任一節點
- **THEN** 該節點被 cytoscape 標記為 `:selected` 並套用對應樣式,若提供 `onSelect` prop 則以節點 id 呼叫之

#### Scenario: 裝飾群組可被選取以浮現摺疊 cue

- **WHEN** 使用者點擊一個裝飾性 `cluster` / `namespace` / `application` 群組節點
- **THEN** 該節點 `selectable()` 為 `true`、被標記為 `:selected`(顯示單選環),且 `cytoscape-expand-collapse` 於其上繪製 `+/-` 摺疊 cue(該 parent 取得 `expandcollapseRenderedStartX` 等 cue 資料)

#### Scenario: 選取裝飾群組不開啟 detail 面板

- **WHEN** 使用者選取一個裝飾性 `cluster` / `namespace` / `application` 群組節點
- **THEN** `resolveSelectedNode` 回 `null`,node-detail 面板 MUST NOT 開啟(只顯示選取環與摺疊 cue)

#### Scenario: 點摺疊 cue 切換該 parent 收合

- **WHEN** 某 compound parent 已被選取並顯示其 `+/-` cue,使用者點擊該 cue 範圍
- **THEN** 該 parent 的收合 / 展開狀態被切換(經 expand-collapse api),且 `collapsedIds` 隨之更新(沿用既有 cue 事件 → `onCollapsedChange` 路徑)

## ADDED Requirements

### Requirement: 收合的裝飾群組顯示 folder icon

裝飾性 `cluster` / `namespace` / `application` 群組在**收合**(`.cy-expand-collapse-collapsed-node`)時 MUST 於框中央顯示一個 **folder glyph**,以該群組的 accent 色(`clusterColor` / `namespaceColor` / `applicationColor`)上色(`background-fit: contain`)。**展開**時維持現狀——無中央 icon 的 labelled 容器(`background-image: 'none'`)。此 folder icon 為 gap-fill:具 `kind` 的 compound(`controller` / k8s `node` / `storageclass`)在收合時本就回退顯示其 kind icon(base `node` 規則),MUST NOT 受影響。folder glyph 為 `NodeKind` 之外的獨立 SVG(裝飾 kind 非 `NodeKind`,不入 `ICON_SVG_BY_KIND`)。

#### Scenario: 收合的裝飾群組顯示 folder icon

- **WHEN** 一個 `cluster` / `namespace` / `application` 裝飾群組被收合
- **THEN** 其 `background-image` 為 folder glyph(以該群組 accent 色 tinted),而非 `'none'`

#### Scenario: 展開的裝飾群組無中央 icon

- **WHEN** 該裝飾群組為展開狀態(`:parent`,其下有可見子節點)
- **THEN** 其 `background-image` 為 `'none'`(labelled 容器,無中央 folder icon)

#### Scenario: 收合的 kind-ful compound 維持 kind icon

- **WHEN** 一個 `controller` / k8s `node` / `storageclass` compound 被收合
- **THEN** 其中央 icon 維持為該 kind 的 icon(`ICON_SVG_BY_KIND`),MUST NOT 被 folder glyph 取代
