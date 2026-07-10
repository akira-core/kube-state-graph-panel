# node-click-export-vars — Tasks

## 1. 純函式 `nodeClickExportValues`(TDD)

- [x] 1.1 新增 `src/features/variable-export/nodeClickExportValues.test.ts`(RED):pod 點擊(單值 + cluster 走訪)、status 缺值/normal 照樣匯出、controller 點擊(直接子 pod 多值、去重 + 字典序)、無子 pod controller 清除、非 pod/controller 清除、`selectedNodeId === null` 清除、cluster fallback `labels.cluster`、cluster 解析失敗只清 cluster、parent 環防護
- [x] 1.2 實作 `src/features/variable-export/nodeClickExportValues.ts`(GREEN):`elements + selectedNodeId → { podNames, clusterName }`,內含 byId map + `isCluster` 祖先走訪(hop guard),設計見 design D2–D4
- [x] 1.3 刪除 `selectedPodExportValue.ts` + `selectedPodExportValue.test.ts`(被取代)

## 2. Hook `useNodeClickExport`

- [x] 2.1 新增 `useNodeClickExport.test.ts`(RED,承接 `useSelectedPodExport.test.ts` 的 mock 模式):雙變數各自寫入、單獨啟用其一(另一不呼叫 locationService)、兩 option 皆空完全停用、value fingerprint 等值跳過(同值 re-render 至多寫一次)
- [x] 2.2 實作 `useNodeClickExport.ts`(GREEN):簽名 `(elements, selectedNodeId, podVariable, clusterVariable)`,經 `writeDashboardVariable` 雙寫;刪除 `useSelectedPodExport.ts` + 其測試;更新 `index.ts` barrel

## 3. Panel options 與接線

- [x] 3.1 `KsgPanel.types.ts`:新增 `clusterVariable: string`(預設 `''`);`KsgPanel.editor.tsx` 新增 `.addTextInput`,description 註明消費端變數型別要求(單值 textbox 可;多值須 custom + multi + allowCustomValue),同步更新 `selectedPodVariable` 描述(不再限 warning/critical、controller 多值)
- [x] 3.2 `KsgPanel.tsx`:以 `useNodeClickExport(elements, selectedNodeId, selectedPodVariable, clusterVariable)` 取代 `useSelectedPodExport(selectedNode, true, …)`(L377-378)
- [x] 3.3 `KsgPanel.test.tsx`:改寫既有 selected-pod 測試(status gating 移除 → normal pod 也匯出),新增 controller 點擊多值 + cluster 變數 + 背景點擊清除兩變數情境

## 4. Demo dashboard

- [x] 4.1 `provisioning/dashboards/ksg-demo.json`:`selected_pod` 變數改為 custom + multi + `allowCustomValue`;新增 `cluster_sel` 變數;panel option 加上 `clusterVariable: 'cluster_sel'`;既有 `selected_pod` 消費示範同步更新語意說明

## 5. 驗證

- [x] 5.1 `npm run lint && npm run typecheck && npm run test:ci` 全綠
- [x] 5.2 瀏覽器驗證(docker compose --profile backend + 既有 standalone Playwright 模式):點 pod → URL 出現 `var-selected_pod=<pod>&var-cluster_sel=<cluster>`;點 controller → 重複 `var-selected_pod=` 多值;點背景 → 兩者 `$__empty`;controller 摺疊後點擊仍匯出全部子 pod
- [x] 5.3 `openspec validate node-click-export-vars --strict` 通過;spec 與實作行為一致
