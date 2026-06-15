## 1. Hook:`useNodeDetailUrls` 改回 eager effect

- [x] 1.1 (RED)改寫 `useNodeDetailUrls.test.ts`:斷言掛載(`enabled`)時**無需點擊**即併發發出 `config_changes` + `code_changes`(`getBackendSrv().get` 各一次,帶 `{ abortSignal, showErrorAlert:false }`)
- [x] 1.2 (RED)新增/改寫測試:成功 → `application` 為 `{ status:'ready', url }`、`containers.phase==='settled'` 且 `containers.byName[name]` 為 `{ status:'ready', url }`;預取未回前 `application` 為 `{ status:'loading' }`、`containers.phase==='loading'`
- [x] 1.3 (RED)新增/改寫測試:失敗(reject / 格式錯誤)→ `application` 為 `{ status:'unavailable', error }`、`containers.phase==='settled'` 空 `byName`;成功 map 缺某 name → `byName[name] === undefined`(表格衍生 unavailable);`enabled` 在 input 為空或 endpoint `''` 時 false 且**不發查詢**
- [x] 1.4 (RED)新增測試:換 input(換節點)重置狀態並中止舊 in-flight(`AbortController`),舊 promise 延遲 resolve 不寫新節點;unmount 後不 setState;移除 `window.open` spy(成功改 anchor、無 `window.open`)
- [x] 1.5 (GREEN)實作 eager hook:`DetailLookup` discriminated union + `NodeDetailLookups { enabled, application, containers:{ phase, byName } }`;`useEffect`(keyed by request key)併發兩查詢;沿用 `requestKeyFor` / `parseApplicationUrl` / `parseUrlByContainer` / `errorMessage`;以 `controller.signal.aborted` + key 比對防 stale write;移除 `openApplicationReport` / `openContainerReport` / `ChangeReportState` / `mergeContainer` / `ctxRef`
- [x] 1.6 更新匯出與型別(`ChangeReportState` → `DetailLookup`),調整 `index.ts` barrel 匯出;`IDLE_NODE_DETAIL_LOOKUPS.containers = { phase:'settled', byName:{} }`

## 2. 元件:ApplicationTable

- [x] 2.1 (RED)改寫 `ApplicationTable.test.tsx`:`state={{status:'ready',url}}` 渲染 `application-url-link`(`href`/`target="_blank"`/`rel="noopener noreferrer"`,**不**點擊它);`{status:'loading'}` 渲染 `application-url-pending`;`{status:'unavailable',error}` 渲染 `application-url-unavailable`(muted、`title=error`、無 link)
- [x] 2.2 (GREEN)`ApplicationTable.types.ts` props 改為 `{ application, state: DetailLookup }`(移除 `enabled`/`onOpen`);cell 三態渲染(`Spinner` / `<a>` anchor / muted「No change report」);**保留** `InteractiveTable` 外殼、`columns`/`data`/`getRowId`、`urlCell` 右緣對齊;`getStyles` 將 `resultError` 改為 muted `unavailable`、加 `link`、移除 `Button`、加 `Icon`/`Spinner`;更新檔頭註解

## 3. 元件:ContainerTable

- [x] 3.1 (RED)改寫 `ContainerTable.test.tsx`:`lookups={{ phase:'settled', byName:{ app:{status:'ready',url} } }}` → `app` 列 `container-url-link`、缺項列 `container-url-unavailable`;`phase:'loading'` → 每列 `container-url-pending`;`{phase:'settled',byName:{}}` → 每列 unavailable
- [x] 3.2 (GREEN)`ContainerTable.types.ts` props 改為 `{ containers, lookups: NodeDetailLookups['containers'] }`(移除 `enabled`/`stateByContainer`/`onOpen`);cell 由 `(phase, byName, name)` 衍生 `DetailLookup` 後三態渲染;**保留** `InteractiveTable` 外殼與欄定義、name `whiteSpace:'nowrap'`、`urlCell` 右緣;同 `getStyles` 調整

## 4. 串接:NodeDetailPanel + KsgPanel

- [x] 4.1 (RED)更新 `NodeDetailPanel.test.tsx`:以新 `lookups` 形狀注入,驗證下傳 `state` / `lookups` 至兩表格;省略 `lookups` 時兩區塊顯示 `*-url-unavailable`(IDLE 預設)
- [x] 4.2 (GREEN)`NodeDetailPanel.types.ts` / `NodeDetailPanel.tsx`:移除 open triggers 下傳;Application 傳 `state={lookups.application}`、Containers 傳 `lookups={lookups.containers}`
- [x] 4.3 (GREEN)`KsgPanel.tsx`:`detailQueryInput` 加 `useMemo`(keyed by `[selectedNode, detailRequest]`)穩定 identity;`detailLookups = useNodeDetailUrls(...)` 簽名不變;更新 `KsgPanel.test.tsx` 右鍵-detail 整合測試(右鍵即併發預取、resolve 後渲染 anchor、左鍵不查、無 endpoint 顯示 unavailable)

## 5. 品質閘 + 驗證

- [x] 5.1 `npm run test:ci` 全綠(**508/508**,56 suites;lazy baseline 為 499)
- [x] 5.2 `npm run typecheck` 與 `npm run lint`(zero-warning)通過
- [x] 5.3 `npm run build` 成功並更新 `dist/`
- [ ] 5.4 demo 手動 / Playwright 驗證:右鍵 controller → 兩區塊預取 loading→(backend 有資料)anchor /(404)muted「No change report」;確認新分頁不再空白(對真實 Azure DevOps)。**待辦**:demo backend 404s `config_changes`/`code_changes`,且空白頁修復需對真實 Azure DevOps 才驗證得了

## 6. 規格同步

- [x] 6.1 `openspec validate eager-change-report-prefetch --strict` 通過
- [x] 6.2 確認元件檔頭 / 程式碼註解與更新後規格一致(無殘留 lazy「點擊才查 / `window.open` / Pop-up blocked / Not Found 可重試按鈕」描述)

> 備註:本變更尚未 `openspec archive`——保留為 active,待 5.4 demo 驗證後再 `openspec archive eager-change-report-prefetch -y` 折入 baseline。
