## Why

node-detail 面板的 Change Report 查詢目前為 **lazy**(見 archived `2026-06-15-lazy-change-report-lookup`):右鍵只建立 input,查詢於使用者**點擊**按鈕時才發,成功時以 `window.open(url, '_blank', 'noopener,noreferrer')` 開新分頁。但 `window.open` 在 `await`(查詢回傳)**之後**才呼叫,已逸出使用者手勢的 transient activation——開新分頁到 Azure DevOps 等 SPA 時造成**首次載入空白、需手動 refresh**(以及偶發彈窗被擋)。

lazy 當初(反轉更早的 eager)是為避免 backend 未實作端點(404)時「右鍵就滿欄 Not Found、像面板壞了」。本變更改回 **eager prefetch**,並以兩項調整同時化解上述兩個問題:

1. 右鍵開啟即**併發預取**,URL 在點擊前已解析,按鈕回到**真正的 `<a href>` anchor**(一般使用者手勢導頁,無 `window.open`、無空白頁、無彈窗被擋)。
2. 失敗 / 無資料改以 **muted「No change report」提示**取代紅色「Not Found」——讀作「尚無資料」而非「壞掉」,消除當初促成 lazy 的觀感問題。

## What Changes

- **BREAKING(行為)**:Change Report 查詢由「按鈕點擊才發」改回「**右鍵開啟即併發預取**」(eager)。`config_changes` 與 `code_changes` 於 detail view 開啟(`enabled`)時無需點擊即同時發出。
- 每個 Change Report 目標(Application 一個、Containers 每列一個)有三個渲染狀態:**loading**(`Spinner`)→ **ready**(成功 + 有效 URL,渲染 `<a href target="_blank" rel="noopener noreferrer">` anchor)/ **unavailable**(失敗 / 查無 / 無 URL,顯示 muted「No change report」提示,完整失敗訊息入 `title`)。
- 成功改回**預解析 anchor**(取代 lazy 的 `window.open`):URL 預取已知,點擊為一般使用者手勢導頁——修掉 `window.open`-after-await 的空白頁 / 彈窗被擋。移除「Pop-up blocked」分支與 `window.open`。
- 移除 lazy 的 imperative 觸發(`openApplicationReport` / `openContainerReport`);`useNodeDetailUrls` 改回 effect-驅動的 eager 預取,回傳每目標解析後狀態(`DetailLookup` 三態 + containers `{ phase, byName }`)。
- **快取機制不變**:每端點每次開啟最多呼叫一次、僅快取成功、失敗清 slot、換節點 / 換 endpoint / 關閉 panel 清快取並中止 in-flight。
- 涵蓋範圍:**Application 區塊與 Containers 區塊兩者皆改**。
- 不變:查詢契約(端點名稱 `config_changes` / `code_changes`、回傳格式、共用 input)、查詢必經 `getBackendSrv()`、endpoint sibling 推導(`resolveDetailEndpoint` / `detailPaths` 不動)、右鍵抑制原生選單、左鍵不查詢、區塊 gating(kind + 資料存在性)、帶 header 的 `InteractiveTable` 版型與 Change Report 欄右緣對齊。

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `panel-rendering`: 修改「Node Detail Application 與 Containers 區塊」需求——查詢觸發時機(點擊才發 → 右鍵開啟即併發預取)、成功開頁方式(`window.open` → 預解析 `<a>` anchor)、非成功呈現(可重試按鈕 + 紅色「Not Found」/「Pop-up blocked」→ 三態 loading / ready / unavailable,unavailable 為 muted「No change report」),以及相應的 scenario。

## Impact

- `src/features/node-detail/hooks/useNodeDetailUrls.ts`(imperative trigger → eager effect、新回傳形狀 `DetailLookup` + containers `{ phase, byName }`)及其測試。
- `src/features/node-detail/components/ApplicationTable/`、`.../ContainerTable/`(`Button` + `onClick` → 三態:`Spinner` / `<a>` anchor / muted 提示;**保留** `InteractiveTable` 外殼、欄定義與右緣對齊)及其測試。
- `src/features/node-detail/components/NodeDetailPanel/`(改接新 prop 形狀、移除 open triggers)及其測試。
- `src/panels/KsgPanel/KsgPanel.tsx`(`detailQueryInput` 加 `useMemo` 穩定 identity、改接 hook 新回傳形狀)及其測試。
- `src/features/node-detail/index.ts`(匯出 `DetailLookup` 取代 `ChangeReportState`)。
- 不變:`resolveDetailEndpoint.ts`、`detailPaths.ts`、`graph-data-integration` 規格(endpoint 名稱 / 回傳格式 / sibling 推導皆不動,只移動「何時查」)。
