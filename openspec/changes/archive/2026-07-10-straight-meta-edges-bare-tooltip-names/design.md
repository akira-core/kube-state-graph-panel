## Context

兩件獨立但同屬 compound UX 的呈現問題：

1. **Meta-edge 曲線**：`cytoscape-expand-collapse` 收合 compound 時，跨邊界的邊會被重指到收合容器並加上 `cy-expand-collapse-meta-edge` class。`getStylesheet` 目前對該 class 強制 `curve-style: 'bezier'`（並加寬至 2.5），用意是避免 taxi 正交路由指向收合盒子。收合後盒子之間的 bezier 彎曲在視覺上顯得雜亂；使用者要求改為直線。

2. **Tooltip name 帶前綴**：`polish-compound-node-ui` 把裝飾性群組（`cluster` / `namespace` / `application`）的 kind 前綴烤進 `data.label`（`Cluster: prod` 等），讓畫布標題、legend、tooltip 全部吃到前綴。k8s `node` / `network` 則刻意用 stylesheet render-only mapper，因為 `data.label` 是 identity。現在使用者明確要求：**前綴只服務 compound 畫布 naming**；tooltip（hover + pinned）的 name title 必須是裸名稱。這與 node/network 的 render-only 模式對齊，並推翻先前「烤進 `data.label` 讓所有消費者自動帶前綴」的決定。

## Goals / Non-Goals

**Goals:**
- Meta-edge 以直線繪製（保留既有加寬 cue 與 edge-type 色彩 cascade）。
- 裝飾性 compound 的 on-canvas 標籤仍顯示 `${PREFIX}: ${name}`（`Cluster` / `Namespace` / `Release Unit`）。
- `data.label` 對裝飾性群組改回裸名稱；hover / pinned tooltip title 因此顯示裸名。
- 更新規格與測試，使「前綴 = render-only」成為單一契約（與 k8s node / network 一致）。

**Non-Goals:**
- 不改一般（非 meta）邊的 routing（fabric 仍 taxi、其餘仍 bezier）。
- 不改 meta-edge 寬度、色彩、箭頭、或 filter 豁免行為。
- 不改 k8s `node` / `network` 既有的 render-only 前綴／title-case。
- 不改 tooltip 的 promoted attrs / labels 區塊內容（只動 title 來源的裸名）。
- 不改 `controller` 或其他 leaf 的標籤。
- 不引入新 npm 依賴。

## Decisions

**1. Meta-edge `curve-style: 'straight'`（非 `haystack`）。**
Cytoscape 的 `haystack` 是高效直線，但對 arrow / 部分 edge style 支援不完整；meta-edge 依賴 base `edge` rule 的 `target-arrow-shape: triangle` 與 edge-type 色彩 cascade。`straight` 提供直線幾何並完整支援箭頭與線型。替代方案：`haystack`（拒：箭頭風險）、維持 `bezier`（拒：使用者要求直線）、`segments`（拒：多餘控制點）。實作：只改 `edge.cy-expand-collapse-meta-edge` 的 `curve-style`；`width: 2.5` 不變。

**2. 裝飾性群組前綴改為 stylesheet render-only，與 node/network 對齊。**
- `normalize.ts`：移除 `GROUP_LABEL_PREFIX` 寫入 `data.label` 的路徑；`data.label` = 上游 `name`（或缺則 id）。`data.cluster` / `namespace` / `application` 仍持有裸名（本來就是）。
- `getStylesheet.ts`：在 `node[?isCluster]` / `node[?isNamespace]` / `node[?isApplication]` 的 `label` 改為 function mapper：`` `${PREFIX}: ${ele.data('label')}` ``，PREFIX 常數與先前相同（`Cluster` / `Namespace` / `Release Unit`）。字級／字重／顏色不變。
- 常數放置：把 `GROUP_LABEL_PREFIX`（或同等 map）移到 stylesheet 側（或 `shared/constants` 若需單測共用）；normalize 不再引用。
- Tooltip：`HoverTooltip.buildContent` / `buildPinnedTooltip` 繼續讀 `data.label` → 自動變裸名，無需特殊 strip 邏輯。
- 替代方案：tooltip 端 strip 前綴、保留烤進 `data.label`（拒：雙重真相、edge hover 的 endpoint label 仍帶前綴、與「prefix 只用在 compound naming」不符）；stylesheet 用 `content` 而非 `label`（拒：與既有 node/network mapper 不一致）。

**3. 規格契約翻轉。**
`panel-rendering`「裝飾性 compound 群組…kind 前綴標籤」改為：前綴為 render-only；`data.label` 為裸名；tooltip title 為裸名。`physical-network 與 k8s node…` 需求中「刻意與裝飾性群組不對稱」的敘述改為「三者皆 render-only」。`graph-data-integration` 若有「normalize 產出帶前綴 label」的隱含／明示契約，改為裸名。新增（或在既有 stylesheet 相關需求下補）meta-edge 直線 scenario。

## Risks / Trade-offs

- [Risk] 測試／fixture 大量寫死 `Cluster: …` 作為 `data.label` → Mitigation：以 grep 掃 `Cluster: `|`Namespace: `|`Release Unit: `，改為裸 `data.label` + 畫布 `style('label')` 斷言（比照既有 `Node: worker-0` 測試模式）。
- [Risk] Legend 或其他讀 `data.label` 的 UI 若曾依賴前綴字串 → Mitigation：裝飾群組 legend 主要用色票／kind，不依賴帶前綴的 label；實作時確認 `ClusterLegend` / `NamespaceLegend` / `ApplicationLegend` 與 derive helpers。
- [Risk] `straight` 在極近端點時可能與節點重疊 → Mitigation：可接受；收合後端點是大盒子，直線通常比 bezier 更清晰。若實測不佳可再調 `source-endpoint`／`target-endpoint`（非本 change 範圍）。

## Migration Plan

純前端呈現變更，無資料遷移、無 feature flag。下一輪 panel render 即生效。Rollback = revert stylesheet + normalize 兩處。

## Open Questions

None — meta-edge 用 `straight`、前綴改 render-only 已由使用者意圖與既有 node/network 模式決定。
