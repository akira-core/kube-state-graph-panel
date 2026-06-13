## 1. Hook:`useNodeDetailUrls` 改 imperative

- [x] 1.1 (RED)改寫 `useNodeDetailUrls.test.ts`:斷言掛載/換 input 時 **MUST NOT** 立即呼叫 `getBackendSrv().get`(預設 idle);`openApplicationReport()` 才發 `config_changes`、`openContainerReport(name)` 才發 `code_changes`
- [x] 1.2 (RED)新增測試:成功(200 + 有效 URL)呼叫 `window.open(url, '_blank', 'noopener,noreferrer')` 後狀態回 idle;`window.open` 回 `null` 時狀態為 error「Pop-up blocked」
- [x] 1.3 (RED)新增測試:失敗(reject)/格式錯誤 → 對應目標 `status:'error'`(預設訊息「Not Found」);container map 缺該 name → 該 name error「Not Found」;`enabled` 在 input 為空或 endpoint `''` 時為 false 且觸發函式為 no-op
- [x] 1.4 (RED)新增測試:換 input(換節點)時所有目標狀態重置回 idle 並中止 in-flight 查詢(`AbortController`),unmount 後不 setState
- [x] 1.5 (GREEN)實作 imperative hook:回傳 `{ enabled, application, containers, openApplicationReport, openContainerReport }`;移除原 eager `useEffect` 查詢;以 `useState` 保存每目標狀態、`AbortController` 管控中止;input key 變更時 reset;沿用 `requestKeyFor` / `parseApplicationUrl` / `parseUrlByContainer` / `errorMessage`;失敗訊息保留 backend 訊息、空時退化「Not Found」
- [x] 1.6 更新匯出與型別(`NodeDetailUrlsState` → `NodeDetailLookups` / `ChangeReportState`、`IDLE_NODE_DETAIL_URLS` → `IDLE_NODE_DETAIL_LOOKUPS`),調整 `index.ts` barrel 匯出

## 2. 元件:ApplicationTable

- [x] 2.1 (RED)改寫 `ApplicationTable.test.tsx`:預設(idle)渲染**可點** `application-url-button`、無 `application-url-error`、無 `application-url-result`;`enabled=false` 時按鈕停用
- [x] 2.2 (RED)新增測試:點擊按鈕呼叫 `onOpen`;`status:'loading'` 顯示 `application-url-pending` 且按鈕停用;`status:'error'` 顯示 `application-url-error`(含 `title`)且**按鈕仍在**(可重試)
- [x] 2.3 (GREEN)`ApplicationTable.types.ts` 改 props 為 `{ application, state, enabled, onOpen }`;`LinkButton` → `Button`(`onClick=onOpen`、`disabled` 條件)、移除成功 inline 結果槽、error 與 button 並存;更新檔頭註解

## 3. 元件:ContainerTable

- [x] 3.1 (RED)改寫 `ContainerTable.test.tsx`:每列預設可點 `container-url-button`、無 error/result;點擊某列呼叫 `onOpen(name)`;該列 `loading` 顯示 pending、`error` 顯示 `container-url-error` 且按鈕保留;其餘列不受影響
- [x] 3.2 (GREEN)`ContainerTable.types.ts` 改 props 為 `{ containers, stateByContainer, enabled, onOpen }`;每列 `LinkButton` → `Button`;移除 inline 結果槽、error 與 button 並存;更新檔頭註解。**保留** name 欄 `whiteSpace:'nowrap'`(既有長名稱不換行修正)

## 4. 串接:NodeDetailPanel + KsgPanel

- [x] 4.1 (RED)更新 `NodeDetailPanel.test.tsx`:以新 `lookups` 形狀注入,驗證下傳至 ApplicationTable / ContainerTable 的 state 與 onOpen
- [x] 4.2 (GREEN)`NodeDetailPanel.types.ts` / `NodeDetailPanel.tsx`:`urls` prop 改為 `lookups: NodeDetailLookups`;兩區塊改接 `application`/`containers` state + `enabled` + open triggers
- [x] 4.3 (GREEN)`KsgPanel.tsx`:`detailLookups = useNodeDetailUrls(...)`,改傳 `lookups={detailLookups}`;更新 `KsgPanel.test.tsx` 右鍵-detail 整合測試(右鍵不查、點按鈕才查)

## 5. 品質閘 + 驗證

- [x] 5.1 `npm run test:ci` 全綠(499/499,含上述更新測試)
- [x] 5.2 `npm run typecheck` 與 `npm run lint`(zero-warning)通過
- [x] 5.3 `npm run build` 成功並更新 `dist/`
- [x] 5.4 demo 手動驗證:右鍵 nats controller→ 兩區塊預設顯示**可點按鈕**(非 Not Found);點擊 → backend 404 後顯示「Not Found」且按鈕可重試(Playwright 截圖佐證:errors 0→2「Not Found」、按鈕保留)

## 6. 規格同步

- [x] 6.1 `openspec validate lazy-change-report-lookup --strict` 通過
- [x] 6.2 確認元件檔頭 / 程式碼註解與更新後規格一致(`LinkButton` 全數替換、無殘留 D5「預解析 / 不 window.open / 失敗不渲染按鈕」描述)
