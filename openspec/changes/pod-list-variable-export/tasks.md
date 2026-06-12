# Tasks: pod-list-variable-export

## 1. extractPodNames(純函式,TDD)

- [x] 1.1 先寫 `extractPodNames.test.ts`:混合元素只取 pod、去重排序、`data.label` fallback `data.id`、忽略 edges/容器節點、空輸入回傳 `[]`(RED)
- [x] 1.2 實作 `src/features/variable-export/extractPodNames.ts` 使測試轉綠(GREEN)

## 2. writeDashboardVariable(@grafana/runtime touchpoint,TDD)

- [x] 2.1 先寫 `writeDashboardVariable.test.ts`(`jest.mock('@grafana/runtime')` stub `locationService.getSearch/partial`):多值寫入帶 `replace=true`、順序無關等值跳過、空清單寫 `['$__empty']`、`$__empty` 現值等值跳過(RED)
- [x] 2.2 實作 `src/features/variable-export/writeDashboardVariable.ts`(唯一 runtime import)使測試轉綠(GREEN)

## 3. useVariableExport hook + 接線

- [x] 3.1 先寫 `useVariableExport.test.ts`(renderHook):變數名空字串完全停用、`enabled=false`(錯誤/初載入閘門)完全停用、elements 變更觸發寫入、同 elements 連續 render 至多寫一次(RED)
- [x] 3.2 實作 `useVariableExport.ts` + `index.ts` barrel,於 `KsgPanel.tsx` 以 `baseElements`(未經視圖變換)+ error/loading 閘門接線(GREEN)
- [x] 3.3 新增 panel option `podListVariable`(`KsgPanel.types.ts` + `module.ts` addTextInput,預設 `''`);更新/新增 KsgPanel 層級測試確認預設不觸發 runtime 呼叫

## 4. Demo dashboard 佈建

- [x] 4.1 `ksg-demo.json`:加 `pod_list` custom multi 變數(佔位選項 `none`)+ panel options `"podListVariable": "pod_list"`;確認 panel target URL 不含 `pod_list` 引用(spec「無自濾迴圈」scenario)

## 5. 驗證

- [x] 5.1 全套 `npm run test:ci` + `typecheck` + `lint` + `build` 通過
- [x] 5.2 demo 實測(docker compose --profile backend):dashboard 載入後 URL 出現重複 `var-pod_list=<pod>` 參數、變數 picker 顯示 pod 名稱;`openspec validate --specs` 綠

## 6. Adversarial review 修正(12-agent workflow,5 confirmed findings)

- [x] 6.1 no-payload 閘門缺口:`useGraphData` 公開 `hasPayload`(fingerprint 非 null),`KsgPanel` 閘門加入第四條件;graph-data-integration MODIFIED delta + 本 capability spec 補「無 payload 的 Done frame 不清空變數」scenario
- [x] 6.2 demo 佔位選項 `none` → `$__empty`(scenes 對 multi custom 預設選第一個選項,佔位字串會外漏給消費端查詢)
- [x] 6.3 `$__empty` 哨兵語義文件化(panel option description + demo 變數 description)
- [x] 6.4 閘門測試補齊:loading 中、no-payload Done、normalize 整包失敗 → 不寫入;成功載入零 pod → 寫哨兵;useGraphData `hasPayload` 三態單元測試
