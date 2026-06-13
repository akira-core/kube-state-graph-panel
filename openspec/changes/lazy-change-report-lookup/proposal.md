## Why

目前 node-detail 面板一**右鍵**就立即併發送出 application-detail(`config_changes`)與 image-detail(`code_changes`)兩個查詢(eager,設計 D5「右鍵預先解析 URL」)。當 backend 尚未實作這兩個端點(回 404)時,面板在使用者**還沒點任何東西之前**就把 Change Report 欄全部顯示成「Not Found」,看起來像面板壞了。使用者預期:預設只顯示可點的按鈕,**點下去才呼叫 backend**,回應非 200 時才顯示「Not Found」。

## What Changes

- **BREAKING(行為)**:Change Report 查詢由「右鍵即發」改為「**按鈕點擊才發**」(lazy)。右鍵只選取節點並建立查詢 input(application / kind / name / time),MUST NOT 發出任何查詢。
- 每顆按鈕(Application 一顆、Containers 每列一顆)各自有獨立狀態機:**idle**(預設,可點按鈕、無查詢、無 Not Found)→ 點擊 **loading**(spinner、按鈕停用)→ **成功(HTTP 200 + 有效 URL)**以新分頁開啟報告後回到 idle(可再點)→ **失敗(非 200 / 回應格式錯誤 / 該 container 無對應 URL)**於按鈕旁顯示「Not Found」,按鈕保持可點以重試。
- 成功時改以 `window.open(url, '_blank', 'noopener,noreferrer')` 開新分頁(取代原本的預解析 `<a href>`):URL 在點擊後才得知,故無法再用預解析連結。若被瀏覽器擋下(`window.open` 回 `null`),退化為 inline「Pop-up blocked」提示。
- 元件 `ApplicationTable` / `ContainerTable` 的 `LinkButton`(`<a href>`)改為 `Button` + `onClick`;移除成功時的 inline URL 結果槽(改為開新分頁);`data-testid` 維持不變。
- `useNodeDetailUrls` 由 effect-驅動的 eager 查詢改為 **imperative hook**:回傳每目標狀態 + `openApplicationReport()` / `openContainerReport(name)` 觸發函式;換節點時重置狀態並中止 in-flight 查詢。
- 涵蓋範圍:**Application 區塊與 Containers 區塊兩者皆改**。

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `panel-rendering`: 修改「Node Detail Application 與 Containers 區塊」需求——查詢觸發時機(右鍵即發 → 按鈕點擊才發)、成功開頁方式(預解析 `<a>` →`window.open`)、失敗呈現(僅顯示錯誤訊息不渲染按鈕 → 按鈕保留可重試 + 旁顯「Not Found」)、loading 觸發點(右鍵後 → 點擊後),以及相應的 scenario。

## Impact

- `src/features/node-detail/hooks/useNodeDetailUrls.ts`(eager effect → imperative trigger)及其測試。
- `src/features/node-detail/components/ApplicationTable/`、`.../ContainerTable/`(按鈕由 `LinkButton` 改 `Button` + `onClick`、移除 inline 結果槽、loading/error 呈現調整)及其測試。
- `src/features/node-detail/components/NodeDetailPanel/`(改接新 prop 形狀)及其測試。
- `src/panels/KsgPanel/KsgPanel.tsx`(改接 hook 新回傳形狀並下傳觸發函式)。
- 不變:endpoint 解析(`resolveDetailEndpoint`)、查詢契約(`config_changes` / `code_changes` 路徑與回傳格式)、查詢必經 `getBackendSrv()`、右鍵抑制原生選單、左鍵不查詢、區塊 gating(kind / 資料存在性)。
