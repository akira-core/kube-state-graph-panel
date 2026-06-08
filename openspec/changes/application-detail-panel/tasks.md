## 1. 資料模型與正規化(graph-data-integration / D3 D4)

- [ ] 1.1 在 `src/shared/types/cytoscape.d.ts` 的 `NodeDataDefinition` 以 declaration merging 宣告 `argoAppName?: string`
- [ ] 1.2 `normalize.ts`:pod 自身 `data.labels['argocd.argoproj.io/instance']` 為非空字串時寫入 `data.argoAppName`,否則省略(`exactOptionalPropertyTypes`:不寫 `undefined`;`noUncheckedIndexedAccess` 以 `?? undefined` 收斂)
- [ ] 1.3 `normalize.ts` controller 合成(現行 312–357):自子 pod 的 `argocd.argoproj.io/instance` label 以穩定排序確定性聚合至合成節點 `data.argoAppName`;無任一子 pod 帶該 label 時省略;不影響 `worstStatus` / 去重 / owns 邊
- [ ] 1.4 `normalize.test.ts` 增補:pod 有/無 label、controller 自子 pod 聚合、controller 無子 pod 帶 label、多子 pod 取值確定性、純函式不就地修改

## 2. Panel 選項與 proxy 接法(D2 D7)

- [ ] 2.1 釐清並於 design.md Open Questions 收斂 proxy route 接法(借用 Infinity datasource resource/proxy vs 部署方配 datasource proxy route vs Grafana API route);記錄最終 endpoint 形狀與回傳 JSON(假設 `{ url: string }`)
- [ ] 2.2 `KsgPanel.types.ts`:新增 `argoEndpoint`(proxy route / 路徑)選項欄位,預設空字串
- [ ] 2.3 `module.ts` options builder:加入 `argoEndpoint` 編輯器欄位與說明文字
- [ ] 2.4 未設定 `argoEndpoint` 時的停用語意:Application 區塊不顯示且不發查詢(對應 spec「未設定 endpoint 時停用」)

## 3. REST 查詢 hook(D2 / async 正確性)

- [ ] 3.1 新增 `src/features/node-detail/hooks/useArgoApplicationUrl.ts`:輸入 `(appName, endpoint)`,以 `@grafana/runtime` `getBackendSrv().fetch(...)` 查詢,回傳 `{ loading, url, error }`
- [ ] 3.2 以 `AbortController` 在 `appName` / `endpoint` 變更或元件 unmount 時中止;對 StrictMode 雙掛載冪等;呼叫端 `void` + `.catch` 滿足 `no-floating-promises` / `no-misused-promises`;不在 unmount 後 setState
- [ ] 3.3 `endpoint` 為空或 `appName` 缺時 MUST NOT 發出查詢(回 idle 狀態)
- [ ] 3.4 hook 測試:mock `getBackendSrv`,涵蓋成功回 `{url}`、HTTP/網路失敗、中止、未設定 endpoint 不發查詢

## 4. ApplicationTable 元件(D5)

- [ ] 4.1 建立 `src/features/node-detail/components/ApplicationTable/`:`ApplicationTable.tsx` + `.types.ts` + `.test.tsx` + `index.ts`(co-location,props 以 `Readonly<T>`,named export)
- [ ] 4.2 依 REST 狀態渲染:loading 指示 / 成功時**單一可點擊連結**(`<a target="_blank" rel="noopener">` 或 `@grafana/ui` `LinkButton`,不自動 `window.open`)/ 失敗錯誤狀態 / 空狀態
- [ ] 4.3 樣式 `useStyles2(getStyles)` + emotion,沿用 `NodeDetailPanel` 既有 sticky `.section` / `.sectionTitle` 版式;型別介面預留可成長為多列(`Application[]`)
- [ ] 4.4 元件測試:loading 呈現、成功連結 `href`/`target`/`rel` 屬性正確、失敗狀態、不自動導頁

## 5. NodeDetail 整合(D1 D4 D5 / 條件顯示)

- [ ] 5.1 `NodeDetailPanel.types.ts`:`NodeDetailData` 新增 `argoAppName?: string`;`NodeDetailPanelProps` 新增 Application 區塊所需 prop(endpoint / 觸發狀態 / hook 接線方式)
- [ ] 5.2 `KsgPanel.tsx` `resolveSelectedNode()`:擴充為傳遞 `argoAppName`
- [ ] 5.3 `NodeDetailPanel.tsx`:當 `kind ∈ { pod, deployment, statefulset, daemonset, job, cronjob }` 且有 `argoAppName` 時,渲染 Application section(作為既有 Alerts 之外的第二個 sticky section);其餘 kind / 無 `argoAppName` 不渲染
- [ ] 5.4 `src/features/node-detail/index.ts` barrel:匯出 `ApplicationTable`(及必要時 `useArgoApplicationUrl`);確保 `KsgPanel` 僅經 barrel import(不越界)
- [ ] 5.5 更新既有測試 fixture(`NodeDetailPanel.test.tsx` / `KsgPanel.test.tsx`)並新增:Application section 依 kind gating 顯示/隱藏、有/無 `argoAppName`、`resolveSelectedNode` 傳遞 `argoAppName`

## 6. 右鍵觸發與接線(D1 / cxttap)

- [ ] 6.1 `GraphCanvas.tsx`:於既有 `tap` listener 旁新增 `cy.on('cxttap', handler)` 與 `onContextSelect(nodeId)` prop;右鍵節點時沿用受控選取(`selectSingle` / `selectedNodeId`),維持藍色高亮同步
- [ ] 6.2 抑制瀏覽器原生 context menu(container `oncontextmenu` `preventDefault` 或 handler 內 `evt.originalEvent.preventDefault()`);cleanup 以 `cy.off` 解綁,StrictMode 下無 listener 殘留
- [ ] 6.3 `KsgPanel.tsx`:接 `onContextSelect` → 設定 `selectedNodeId` + 觸發該節點的 ArgoCD 查詢(驅動 `useArgoApplicationUrl` 的 `appName` / 觸發旗標);僅對 pod/controller 觸發
- [ ] 6.4 測試(headless):`cxttap` 觸發選取與面板開啟同步、handler 綁定/解綁、非 pod/controller 不觸發查詢

## 7. 驗證與收尾

- [ ] 7.1 `npm run typecheck` 通過(strict / `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`)
- [ ] 7.2 `npm run lint` 零警告(`import-x/no-default-export`、`import-x/no-restricted-paths`、`no-floating-promises`、`no-misused-promises`、`Readonly` props)
- [ ] 7.3 `npm run test:ci` 全綠
- [ ] 7.4 demo 手動驗證:右鍵 pod/controller → loading → 單一連結新分頁開啟;非 pod/controller 無 Application 區塊;未設定 `argoEndpoint` 時停用;查詢失敗顯示錯誤狀態而不影響告警表格
- [ ] 7.5 排序:待 `alert-occurrence-grouping` land / archive 後再合併本變更程式碼,避免 `NodeDetailPanel.tsx` / `NodeDetailPanel.test.tsx` / `KsgPanel.test.tsx` 衝突;合併後重跑 7.1–7.3
