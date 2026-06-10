## 1. 資料模型與正規化(graph-data-integration / D3 D4)

- [ ] 1.1 `src/shared/types/cytoscape.d.ts` 的 `NodeDataDefinition` 以 declaration merging 宣告 `application?: string` 與 `containers?: ContainerSpec[]`;`ContainerSpec`(`{ name: string; image: string }`)定義於 `src/shared/types/`
- [ ] 1.2 `normalize.ts`:pod 透傳 backend `data.application`(非空字串才寫入,否則省略——`exactOptionalPropertyTypes`:不寫 `undefined`)
- [ ] 1.3 `normalize.ts`:pod 透傳 backend `data.containers`——逐項驗證 `name` / `image` 皆非空字串,形狀不符項目丟棄;驗證後為空或缺失時省略該欄
- [ ] 1.4 `normalize.ts` controller 合成:自子 pod 聚合 `application`(取任一帶值子 pod,穩定排序確定性選取)與 `containers`(所有子 pod 聯集、以 `(name, image)` 去重、穩定排序);無任一子 pod 帶值時省略;不影響 `worstStatus` / 去重 / `controller-owns-pod` 邊
- [ ] 1.5 `normalize.test.ts` 增補:pod 透傳兩欄位、欄位缺失/空值省略、壞形狀 container 項丟棄、controller 聚合(application 確定性、containers 去重)、controller 無子 pod 帶值省略、純函式不就地修改、舊版 backend(無欄位)輸出與現行完全相同

## 2. Panel 選項(D7)

- [ ] 2.1 `KsgPanel.types.ts`:新增 `detailEndpoint`(graph API backend proxy route / base path)選項欄位,預設空字串
- [ ] 2.2 `module.ts` options builder:加入 `detailEndpoint` 編輯器欄位與說明文字(註明兩查詢共用、子路徑固定)
- [ ] 2.3 未設定 `detailEndpoint` 時的停用語意:兩區塊不顯示/停用且不發查詢(對應 spec「未設定 endpoint 時停用」)

## 3. REST 查詢 hook(D2 / async 正確性)

- [ ] 3.1 新增 `src/features/node-detail/hooks/useNodeDetailUrls.ts`:輸入 `{ application, kind, name, time } | undefined` + `endpoint`,以 `@grafana/runtime` `getBackendSrv()` **並行**發出 application-detail(`GET <endpoint>/api/v1/config_changes`,回 `{ "url": string }`)與 image-detail(`GET <endpoint>/api/v1/code_changes`,回 `{ [container]: { "url": string } }`)兩請求,query 參數 `application` / `kind` / `name` / `time`(Unix 秒);解析層將 code_changes 巢狀回應**攤平**為 `urlByContainer: Record<string, string>`;回傳 `{ loading, applicationUrl, urlByContainer, error }`
- [ ] 3.2 input 為 `undefined` 或 `endpoint` 為空時 MUST NOT 發查詢(回 idle 狀態)
- [ ] 3.3 `AbortController` 在 input / endpoint 變更或 unmount 時中止;StrictMode 雙掛載冪等;`void` + `.catch` 滿足 `no-floating-promises` / `no-misused-promises`;不在 unmount 後 setState
- [ ] 3.4 hook 測試:mock `getBackendSrv`,涵蓋雙請求成功、單邊失敗(另一邊結果保留)、HTTP/網路失敗、中止、idle(無 input / 無 endpoint)不發查詢、回傳 JSON 形狀不符的防禦

## 4. ApplicationTable 與 ContainerTable 元件(D5 D8)

- [ ] 4.1 建立 `src/features/node-detail/components/ContainerTable/`:`.tsx` + `.types.ts` + `.test.tsx` + `index.ts`(co-location、props `Readonly<T>`、named export);接 `{ containers, urlByContainer, loading, error }`,每 container 一列顯示 name + image + URL 按鈕
- [ ] 4.2 ContainerTable 行為:loading 指示 / 成功時每列 `LinkButton`(或 `<a>`)`href` 為 map 查得 URL、`target="_blank"` + `rel="noopener"`、不自動導頁 / `urlByContainer[name]` 為 `undefined`(`noUncheckedIndexedAccess`)時該列按鈕停用、name+image 照常 / 失敗錯誤狀態
- [ ] 4.3 建立 `src/features/node-detail/components/ApplicationTable/`(同 4.1 慣例):接 `{ application, url, loading, error }`,單列顯示 application name + URL 按鈕,同一列版型與按鈕語意(`target="_blank"` + `rel="noopener"`),介面預留多列成長
- [ ] 4.4 樣式皆 `useStyles2(getStyles)` + emotion,沿用 `NodeDetailPanel` 既有 sticky `.section` / `.sectionTitle` 版式
- [ ] 4.5 元件測試:兩元件各覆蓋 loading / 成功(`href`/`target`/`rel` 正確)/ 失敗 / ContainerTable 缺 map key 按鈕停用 / 不自動導頁(無 `window.open`)

## 5. NodeDetail 整合(D4 D5 / 條件顯示)

- [ ] 5.1 `NodeDetailPanel.types.ts`:`NodeDetailData` 新增 `application?: string`、`containers?: ContainerSpec[]`;`NodeDetailPanelProps` 新增 REST 狀態 prop(`applicationUrl` / `urlByContainer` / `loading` / `error` 或等價封裝)
- [ ] 5.2 `KsgPanel.tsx` `resolveSelectedNode()`:擴充傳遞 `application` / `containers`,並一併解析查詢參數來源(pod 取 `data.owner` 的 kind/name、controller 取自身、standalone pod 用自身 kind/name)
- [ ] 5.3 `NodeDetailPanel.tsx`:`kind ∈ { pod, deployment, statefulset, daemonset, job, cronjob }` 時,有 `application` 渲染 Application section、有非空 `containers` 渲染 Containers section(兩者獨立 gating,作為 Alerts 之外的 sticky sections);其餘 kind 一律不渲染
- [ ] 5.4 `src/features/node-detail/index.ts` barrel:匯出 `ApplicationTable` / `ContainerTable`(及必要時 hook);`KsgPanel` 僅經 barrel import(不越界)
- [ ] 5.5 更新既有測試 fixture(`NodeDetailPanel.test.tsx` / `KsgPanel.test.tsx`)並新增:兩區塊依 kind gating、application/containers 個別有無時的獨立顯示/隱藏、`resolveSelectedNode` 傳遞新欄位

## 6. 右鍵觸發與接線(D1 / cxttap)

- [ ] 6.1 `GraphCanvas.tsx`:於既有 `tap` listener 旁新增 `cy.on('cxttap', handler)` 與 `onContextSelect(nodeId)` prop;右鍵節點時沿用受控選取(`selectSingle` / `selectedNodeId`),維持藍色高亮同步
- [ ] 6.2 抑制瀏覽器原生 context menu(container `contextmenu` `preventDefault` 或 handler 內 `evt.originalEvent.preventDefault()`);cleanup 以 `cy.off` 解綁,StrictMode 下無 listener 殘留
- [ ] 6.3 `KsgPanel.tsx`:接 `onContextSelect` → 設定 `selectedNodeId` + 組出查詢 input(application / controller kind / controller name / 當下 Unix 秒)驅動 `useNodeDetailUrls`;僅對 pod/controller 觸發;左鍵 `tap` 不得觸發查詢(input 維持 `undefined`)
- [ ] 6.4 測試(headless):`cxttap` 觸發選取與面板開啟同步、查詢 input 組裝正確(pod 取 owner / controller 取自身)、handler 綁定/解綁、非 pod/controller 與左鍵不觸發查詢

## 7. 驗證與收尾

- [ ] 7.1 `npm run typecheck` 通過(strict / `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`)
- [ ] 7.2 `npm run lint` 零警告(`import-x/no-default-export`、`import-x/no-restricted-paths`、`no-floating-promises`、`no-misused-promises`、`Readonly` props)
- [ ] 7.3 `npm run test:ci` 全綠
- [ ] 7.4 demo 手動驗證(視 backend 版本支援 `application`/`containers` 欄位與 detail endpoint;必要時先以 mock/seeder 假資料替代):右鍵 pod/controller → loading → Application 單一 URL 按鈕 + Containers 每列按鈕新分頁開啟;map 缺 key 該列停用;非 pod/controller 無區塊;未設定 `detailEndpoint` 停用;查詢失敗顯示錯誤而不影響告警表格;左鍵不發查詢
- [ ] 7.5 上游對齊:子路徑與回傳形狀已定案(`/api/v1/config_changes` 回 `{url}`;`/api/v1/code_changes` 回 `{name:{url}}`);確認 query 參數名與 D2 假設一致,不一致時僅調整 hook 解析層並回填 design.md;demo seeder 補 container/image 假資料(待 backend 版本)
