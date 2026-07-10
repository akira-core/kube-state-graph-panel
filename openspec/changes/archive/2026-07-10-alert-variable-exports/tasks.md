# alert-variable-exports — Tasks

## 1. 純函式擷取(TDD)

- [x] 1.1 新增 `src/features/variable-export/extractAlertPodNames.test.ts`(RED):只取 `kind==='pod'` 且 `alerts` 非空、無 alert pod 排除、非 pod 節點(node/pvc/controller 即使帶 alerts)排除、severity 不影響(info 也算)、去重 + 字典序、label 空 fallback id、edges 忽略
- [x] 1.2 實作 `src/features/variable-export/extractAlertPodNames.ts`(GREEN),刪除 `extractPodNames.ts` + `extractPodNames.test.ts`
- [x] 1.3 新增 `src/features/variable-export/extractAlertNames.test.ts`(RED):跨節點種類收集(pod/node/pvc/service/controller 的 `alerts[].name`)、controller 聚合重複名稱去重、無 alert 回傳 `[]`、去重 + 字典序、edges 忽略
- [x] 1.4 實作 `src/features/variable-export/extractAlertNames.ts`(GREEN)

## 2. Hook 泛化 `useListVariableExport`

- [x] 2.1 新增 `useListVariableExport.test.ts`(RED,承接 `useVariableExport.test.ts` 的 locationService mock 模式):簽名 `(values, variableName, enabled)`、變數名空字串停用、`enabled === false` 完全不寫(含空 values 不寫哨兵 — 錯誤狀態防護)、value fingerprint 等值跳過、多值寫入
- [x] 2.2 實作 `useListVariableExport.ts`(GREEN),刪除 `useVariableExport.ts` + 其測試,更新 `index.ts` barrel(匯出 `useListVariableExport`、`extractAlertPodNames`、`extractAlertNames`)

## 3. Panel options 與接線

- [x] 3.1 `KsgPanel.types.ts`:`podListVariable` 更名 `alertPodListVariable`(**BREAKING**,無舊 key fallback),新增 `alertNameListVariable: string`(預設 `''`);doc comment 更新
- [x] 3.2 `KsgPanel.editor.tsx`:兩個 `.addTextInput` — 更名者的 description 註明「只列出帶 alert 的 pod;舊 podListVariable 已停用」,新者註明「所有 alert 名稱,供 VictoriaMetrics alertname 查詢」;兩者皆註明 custom + multi + allowCustomValue 型別要求
- [x] 3.3 `KsgPanel.tsx`(L260-266 一帶):`useMemo` 計算 `extractAlertPodNames(baseElements)` / `extractAlertNames(baseElements)`,以 `useListVariableExport(values, name, variableExportEnabled)` 各接一次;`variableExportEnabled` 閘(`hasPayload && seriesError === undefined && !isFatalNormalizeError`)不變
- [x] 3.4 `KsgPanel.test.tsx`:改寫既有 pod-list 匯出測試(全量 → alert-gated),新增 alert-names 匯出、舊 key 不生效、錯誤狀態兩變數皆不寫等情境

## 4. Demo dashboards

- [x] 4.1 `provisioning/dashboards/ksg-switch-demo.json`(展示主場,inline 資料含 alert):panel option 改 `alertPodListVariable`(變數更名 `alert_pod_list`)+ 新增 `alertNameListVariable: 'alert_names'`;兩變數 custom + multi + allowCustomValue;預期展示值 `alert_pod_list=[mesh-gateway-0, mongo-2]`
- [x] 4.2 `provisioning/dashboards/ksg-demo.json`:option/變數同步更名 + 新增 `alert_names`;text panel 註明 backend seed 無 alert 契約、此二變數在本 demo 恆為 `$__empty`;JSON 以 `python3 -m json.tool` 驗證

## 5. 驗證

- [x] 5.1 `npm run lint && npm run typecheck && npm run test:ci` 全綠;grep 確認 `podListVariable` / `extractPodNames` / `useVariableExport` 在 `src/` 零**程式**參照(import/呼叫/欄位)— 文件性提及(BREAKING 說明、`@ts-expect-error` 舊 key 防護測試)為刻意保留,不在此限
- [x] 5.2 瀏覽器驗證(standalone Playwright,`/d/ksg-switch-demo`):載入後 URL 出現 `var-alert_pod_list=mesh-gateway-0&var-alert_pod_list=mongo-2` 與 `var-alert_names=` 多值(12 個去重名稱);`/d/ksg-demo` 兩變數為 `$__empty`
- [x] 5.3 `openspec validate alert-variable-exports --strict` 通過;spec 與實作行為一致
