## Why

Compound 收合後，expand-collapse 合成的 meta-edge 目前強制走 `bezier`，在已收合的大盒子之間彎曲顯得雜亂，應改為直線。同時裝飾性 compound 的 kind 前綴（`Cluster:` / `Namespace:` / `Release Unit:`）被寫進 `data.label`，導致 hover / pinned tooltip 的 name 也帶前綴——前綴應只服務畫布上的 compound 標題，tooltip 顯示裸名稱。

## What Changes

- Meta-edge（`edge.cy-expand-collapse-meta-edge`）的 `curve-style` 由 `bezier` 改為直線（`haystack`）；寬度等既有 collapsed-boundary cue 維持。
- 裝飾性 compound（`cluster` / `namespace` / `application`）的 kind 前綴改為**僅畫布渲染**（stylesheet function mapper），`data.label` 改回裸名稱；hover / pinned tooltip 的 title 因此顯示裸名。
- k8s `node` compound 的 `Node: ` 前綴本就已是 render-only，行為不變；tooltip 本來就讀裸 `data.label`。
- 更新相關單測與 `panel-rendering` / `graph-data-integration` 規格中「前綴寫入 `data.label`」的契約。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `panel-rendering`: meta-edge 改直線；裝飾性 compound 前綴改為 render-only；Hover Tooltip 的 name title 顯示裸名稱（不含 kind 前綴）。
- `graph-data-integration`: `normalizeGraph` 對 `cluster` / `namespace` / `application` 不再把 kind 前綴寫入 `data.label`（裸名；前綴改由 stylesheet 負責）。

## Impact

- `src/features/graph-canvas/styles/getStylesheet.ts`（+ tests）— meta-edge `curve-style`；裝飾群組 label mapper。
- `src/features/graph-data/normalize.ts`（+ tests）— 移除 `GROUP_LABEL_PREFIX` 寫入 `data.label`。
- `src/features/hover-tooltip/**` — 行為隨裸 `data.label` 自動正確；必要時補回歸測。
- 既有 fixture / 測試中寫死 `Cluster: …` / `Namespace: …` / `Release Unit: …` 作為 `data.label` 的斷言需改為裸名 + 畫布樣式斷言。
