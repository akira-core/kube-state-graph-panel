## 1. Meta-edge 直線

- [x] 1.1 RED — `getStylesheet.test.ts`: 斷言 `edge.cy-expand-collapse-meta-edge` 的 `curve-style` 為 `straight`(並維持 `width: 2.5`、不釘 `line-color`);必要時補 headless 實例斷言收合後 meta-edge 為直線
- [x] 1.2 GREEN — `getStylesheet.ts`: 將 meta-edge 規則的 `curve-style` 由 `bezier` 改為 `straight`;更新相關註解

## 2. 裝飾性群組裸 `data.label`

- [x] 2.1 RED — `normalize.test.ts`: 將 `Cluster: demo` / `Namespace: shop` / `Release Unit: checkout` 等 `data.label` 斷言改為裸名(`demo` / `shop` / `checkout`);確認 `data.cluster` / `namespace` / `application` 仍為裸名
- [x] 2.2 GREEN — `normalize.ts`: 移除 `GROUP_LABEL_PREFIX` 寫入 `data.label` 的路徑,裝飾性群組 `data.label` = 上游 `name`(或缺則 id);清理相關註解
- [x] 2.3 掃過並修正其他以帶前綴字串作為 `data.label` fixture 的測試(例如 `GraphCanvas.test.tsx` 的 `Cluster: demo` / `Namespace: shop`)改為裸名

## 3. 畫布 render-only 前綴

- [x] 3.1 RED — `getStylesheet.test.ts`: 斷言 `node[?isCluster]` / `node[?isNamespace]` / `node[?isApplication]` 的 `label` 為 function mapper;headless 實例上裸 `data.label` 渲染為 `Cluster: …` / `Namespace: …` / `Release Unit: …`
- [x] 3.2 GREEN — `getStylesheet.ts`: 將三個裝飾群組選擇器的 `label: 'data(label)'` 改為 render-only mapper(PREFIX 常數:`Cluster` / `Namespace` / `Release Unit`);字級／字重／顏色不變
- [x] 3.3 更新 palette / normalize 註解中「前綴烤進 `data.label`」的過時描述(例如 `clusterPalette.ts` / `namespacePalette.ts` / `applicationPalette.ts`)

## 4. Tooltip 裸名回歸

- [x] 4.1 RED — `HoverTooltip.test.tsx`(必要時 pinned 路徑): hover / 釘選 `namespace` / `application` 時 title 為裸名,不含 `Namespace:` / `Release Unit:` 前綴;合成 `kind` row 仍顯示
- [x] 4.2 確認無需改 `HoverTooltip.tsx` / `buildPinnedTooltip.ts` 實作(它們已讀 `data.label`);若有硬編碼帶前綴 fixture 則一併修正

## 5. 驗證

- [x] 5.1 跑相關 Jest:`getStylesheet.test.ts`、`normalize.test.ts`、`HoverTooltip.test.tsx`,以及因 fixture 改動而受影響的檔案
- [x] 5.2 `npm run typecheck` 與 `npm run lint` 通過
