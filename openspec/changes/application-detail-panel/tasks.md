## 1. 資料模型與正規化(graph-data-integration / D3 D4 D9)

- [x] 1.1 `src/shared/types/cytoscape.d.ts` 的 `NodeDataDefinition` 以 declaration merging 宣告 `application?: string` 與 `containers?: ContainerSpec[]`;`ContainerSpec`(`{ name: string; image: string }`)定義於 `src/shared/types/`
- [x] 1.2 `normalize.ts`:pod 透傳 backend `data.application`(非空字串才寫入,否則省略——`exactOptionalPropertyTypes`:不寫 `undefined`)
- [x] 1.3 `normalize.ts`:pod 透傳 backend `data.containers`——逐項驗證 `name` / `image` 皆非空字串,形狀不符項目丟棄;驗證後為空或缺失時省略該欄
- [x] 1.4 `normalize.ts` controller 合成:自子 pod 聚合 `application`(取任一帶值子 pod,穩定排序確定性選取)與 `containers`(所有子 pod 聯集、以 `(name, image)` 去重、穩定排序);無任一子 pod 帶值時省略;不影響 `worstStatus` / 去重 / `controller-owns-pod` 邊
- [x] 1.5 `normalize.test.ts` 增補:pod 透傳兩欄位、欄位缺失/空值省略、壞形狀 container 項丟棄、controller 聚合(application 確定性、containers 去重)、controller 無子 pod 帶值省略、純函式不就地修改、舊版 backend(無欄位)輸出與現行完全相同
- [x] 1.6 `normalize.ts` controller 合成(D9):自子 pod 聚合 `alerts`——podId 穩定排序串接、缺 `pod` 欄以來源 pod label 回填(新物件,不改 pod 自身)、帶 `id` 跨 pod 去重(首見者勝)、無任一子 pod 帶值省略;不影響 `worstStatus`(status 仍為唯一上色來源)/ 去重 / `controller-owns-pod` 邊
- [x] 1.7 `normalize.test.ts` 增補(D9):controller 聚合多 pod 告警(順序確定性)、缺 `pod` 欄回填且來源 pod 元素不被修改、`id` 跨 pod 去重、無子 pod 帶值省略、normal status + critical alert 仍省略 `worstStatus`(顏色不受 alerts 影響)
- [x] 1.8 `KsgPanel.test.tsx`:`resolveSelectedNode` 對 controller id 回傳聚合 alerts(面板零修改驗證——`AlertTable` 照 `data.alerts` 渲染)

## 2. Panel 選項(D7)

- [x] 2.1 `KsgPanel.types.ts`:新增 `detailEndpoint`(graph API backend proxy route / base path)選項欄位,預設空字串
- [x] 2.2 `KsgPanel.editor.tsx` options builder(經 `module.ts` 掛載):加入 `detailEndpoint` 編輯器欄位與說明文字(註明兩查詢共用、子路徑固定)
- [x] 2.3 endpoint 為空時的停用語意:URL 按鈕停用且不發查詢(當時語意為「option 空即停用」;§9 改版為「option 空先自 datasource 推導、皆不可得才停用」——對應 spec「未設定 endpoint 且無法推導時停用」)

## 3. REST 查詢 hook(D2 / async 正確性)

- [x] 3.1 新增 `src/features/node-detail/hooks/useNodeDetailUrls.ts`:輸入 `{ application, kind, name, time } | undefined` + `endpoint`,以 `@grafana/runtime` `getBackendSrv()` **並行**發出 application-detail(`GET <endpoint>/api/v1/config_changes`,回 `{ "url": string }`)與 image-detail(`GET <endpoint>/api/v1/code_changes`,回 `{ [container]: { "url": string } }`)兩請求,query 參數 `application` / `kind` / `name` / `time`(Unix 秒);解析層將 code_changes 巢狀回應**攤平**為 `urlByContainer: Record<string, string>`;回傳 `{ loading, applicationUrl, urlByContainer, applicationError, containersError }`(錯誤按查詢分開)
- [x] 3.2 input 為 `undefined` 或 `endpoint` 為空時 MUST NOT 發查詢(回 idle 狀態)
- [x] 3.3 `AbortController` 在 input / endpoint 變更或 unmount 時中止;StrictMode 雙掛載冪等;`void` + `.catch` 滿足 `no-floating-promises` / `no-misused-promises`;不在 unmount 後 setState
- [x] 3.4 hook 測試:mock `getBackendSrv`,涵蓋雙請求成功、單邊失敗(另一邊結果保留)、HTTP/網路失敗、中止、idle(無 input / 無 endpoint)不發查詢、回傳 JSON 形狀不符的防禦

## 4. ApplicationTable 與 ContainerTable 元件(D5 D8)

- [x] 4.1 建立 `src/features/node-detail/components/ContainerTable/`:`.tsx` + `.types.ts` + `.test.tsx` + `index.ts`(co-location、props `Readonly<T>`、named export);接 `{ containers, urlByContainer, loading, error }`,每 container 一列顯示 name + image + URL 按鈕
- [x] 4.2 ContainerTable 行為:loading 指示 / 成功時每列 `LinkButton`(或 `<a>`)`href` 為 map 查得 URL、`target="_blank"` + `rel="noopener"`、不自動導頁 / `urlByContainer[name]` 為 `undefined`(`noUncheckedIndexedAccess`)時該列按鈕停用、name+image 照常 / 失敗錯誤狀態
- [x] 4.3 建立 `src/features/node-detail/components/ApplicationTable/`(同 4.1 慣例):接 `{ application, url, loading, error }`,單列顯示 application name + URL 按鈕,同一列版型與按鈕語意(`target="_blank"` + `rel="noopener"`),介面預留多列成長
- [x] 4.4 樣式皆 `useStyles2(getStyles)` + emotion,沿用 `NodeDetailPanel` 既有 sticky `.section` / `.sectionTitle` 版式
- [x] 4.5 元件測試:兩元件各覆蓋 loading / 成功(`href`/`target`/`rel` 正確)/ 失敗 / ContainerTable 缺 map key 按鈕停用 / 不自動導頁(無 `window.open`)

## 5. NodeDetail 整合(D4 D5 / 條件顯示)

- [x] 5.1 `NodeDetailPanel.types.ts`:`NodeDetailData` 新增 `application?: string`、`containers?: ContainerSpec[]`;`NodeDetailPanelProps` 新增 REST 狀態 prop(`applicationUrl` / `urlByContainer` / `loading` / `error` 或等價封裝)
- [x] 5.2 `KsgPanel.tsx` `resolveSelectedNode()`:擴充傳遞 `application` / `containers`,並一併解析查詢參數來源(pod 取 `data.owner` 的 kind/name、controller 取自身、standalone pod 用自身 kind/name)
- [x] 5.3 `NodeDetailPanel.tsx`:`kind ∈ { pod, deployment, statefulset, daemonset, job, cronjob }` 時,有 `application` 渲染 Application section、有非空 `containers` 渲染 Containers section(兩者獨立 gating,sticky sections);其餘 kind 一律不渲染(後續定案:view 分流——右鍵 `detail` view 只渲染兩區塊、左鍵 `alerts` view 只渲染告警表)
- [x] 5.4 `src/features/node-detail/index.ts` barrel:匯出 `ApplicationTable` / `ContainerTable`(及必要時 hook);`KsgPanel` 僅經 barrel import(不越界)
- [x] 5.5 更新既有測試 fixture(`NodeDetailPanel.test.tsx` / `KsgPanel.test.tsx`)並新增:兩區塊依 kind gating、application/containers 個別有無時的獨立顯示/隱藏、`resolveSelectedNode` 傳遞新欄位

## 6. 右鍵觸發與接線(D1 / cxttap)

- [x] 6.1 `GraphCanvas.tsx`:於既有 `tap` listener 旁新增 `cy.on('cxttap', handler)` 與 `onContextSelect(nodeId)` prop;右鍵節點時沿用受控選取(`selectSingle` / `selectedNodeId`),維持藍色高亮同步
- [x] 6.2 抑制瀏覽器原生 context menu(container `contextmenu` `preventDefault` 或 handler 內 `evt.originalEvent.preventDefault()`);cleanup 以 `cy.off` 解綁,StrictMode 下無 listener 殘留
- [x] 6.3 `KsgPanel.tsx`:接 `onContextSelect` → 設定 `selectedNodeId` + 組出查詢 input(application / controller kind / controller name / 當下 Unix 秒)驅動 `useNodeDetailUrls`;僅對 pod/controller 觸發;左鍵 `tap` 不得觸發查詢(input 維持 `undefined`)
- [x] 6.4 測試(headless):`cxttap` 觸發選取與面板開啟同步、查詢 input 組裝正確(pod 取 owner / controller 取自身)、handler 綁定/解綁、非 pod/controller 與左鍵不觸發查詢

## 7. 驗證與收尾

- [x] 7.1 `npm run typecheck` 通過(strict / `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`)
- [x] 7.2 `npm run lint` 零警告(`import-x/no-default-export`、`import-x/no-restricted-paths`、`no-floating-promises`、`no-misused-promises`、`Readonly` props)
- [x] 7.3 `npm run test:ci` 全綠
- [x] 7.4 demo 手動驗證(視 backend 版本支援 `application`/`containers` 欄位與 detail endpoint;必要時先以 mock/seeder 假資料替代):右鍵 pod/controller → loading → Application 單一 URL 按鈕 + Containers 每列按鈕新分頁開啟;map 缺 key 該列停用;非 pod/controller 無區塊;未設定 `detailEndpoint` 停用;查詢失敗顯示錯誤而不影響告警表格;左鍵不發查詢
- [ ] 7.5 上游對齊:子路徑與回傳形狀已定案(`/api/v1/config_changes` 回 `{url}`;`/api/v1/code_changes` 回 `{name:{url}}`);確認 query 參數名與 D2 假設一致,不一致時僅調整 hook 解析層並回填 design.md;demo seeder 補 container/image 假資料(待 backend 版本);backend 輸出 `application`/`containers` 後,demo 一併手動驗證 §8 表格 header 版型(與 Alerts 表格一致)與 §9 推導路徑(右鍵後 Network 面板見 `/api/datasources/proxy/uid/ksg-default/api/v1/...`)

## 8. 表格版型對齊 Alerts 表格(D8 增補)

- [x] 8.1 `ApplicationTable.tsx`:改以 `@grafana/ui` `InteractiveTable` 渲染,欄位 **Application / URL**;columns / data `useMemo`、`getRowId` 穩定(application name + index,比照 `AlertTable` 的 index 後綴慣例);URL 欄 cell 維持既有 `LinkButton` 語意(成功帶 `href` + `target="_blank"` + `rel="noopener"`、無 URL 停用);loading / error 指示維持表格之外
- [x] 8.2 `ContainerTable.tsx`:同上改 `InteractiveTable`,欄位 **Name / Image / URL**;`getRowId` 穩定(`name/image` + index);image 欄維持 monospace、ellipsis 改 `break-all` 換行(無空白字串不換行會撐欄)
- [x] 8.3 測試更新:兩元件斷言 column headers(Application/URL、Name/Image/URL)存在且每列內容落於對應欄;testid 政策——`application-url-button` / `container-url-button`(URL cell 內 LinkButton)與 `*-table-loading` / `*-table-error`(表格外)**原樣保留**(`NodeDetailPanel.test.tsx` / `KsgPanel.test.tsx` 跨檔斷言不必動),`application-row` / `container-row` 移入 cell 內元素或退役(僅兩元件自身測試使用);既有 href / target / rel / 停用 / loading / error / 不自動導頁斷言隨新 DOM 調整
- [x] 8.4 `npm run typecheck` + `npm run lint` + `npm run test:ci` 全綠(2026-06-11,450 tests / 52 suites + production build);demo 視覺驗證併入 7.5(現行 backend 不輸出 `application`/`containers`,區塊在 demo 不出現)

## 9. endpoint 自 panel datasource 自動推導(D7 改版)

- [x] 9.1 新增 `src/features/node-detail/resolveDetailEndpoint.ts`(+ `.test.ts`,經 barrel 匯出):輸入 `{ option, request }`——option 非空(trim 後)→ 原樣回傳;否則依序檢視 `request?.targets` 非隱藏且帶 datasource ref 的 targets,以 `getDataSourceSrv().getInstanceSettings(ref)?.url` 為 base(僅接受非空字串),取第一個解析成功者(hide / 解析不出 url 的 ref 跳過續查);皆無 → `''`。**呼叫順序釘死**:option / request / targets / ref 逐層 early-return,確認有 ref 後才觸碰 `getDataSourceSrv()`(既有測試 fixture 無 `request`,module mock 不含 `getDataSourceSrv`,先觸碰即炸)
- [x] 9.2 `KsgPanel.tsx`:`useNodeDetailUrls` 改餵解析後 endpoint(`useMemo` 依 option + `data.request` 計算);hook 本身不動(仍接 endpoint 字串、`''` = idle)
- [x] 9.3 `KsgPanel.editor.tsx`:`detailEndpoint` 選項描述改為「覆寫;留空時自面板查詢的 datasource 自動推導 proxy path(`/api/datasources/proxy/uid/<uid>`)」
- [x] 9.4 測試:helper 單元測試(mock `getDataSourceSrv`——option 覆寫優先 / 無 targets / 無 datasource ref / 查無 instance settings / `url` 空 → `''` / 正常推導回 proxy path);`KsgPanel.test.tsx` 既有 `jest.mock('@grafana/runtime')` factory **加入 `getDataSourceSrv`**,並增補「option 空 + target 帶 ref → 查詢發往推導 base」、「option 設定 → 覆寫推導」、「皆無法解析 → 右鍵後區塊照資料渲染、按鈕停用、零查詢」
- [x] 9.5 `npm run typecheck` + `npm run lint` + `npm run test:ci` 全綠(2026-06-11,同 8.4);demo Network 驗證併入 7.5(節點無 `application` 時右鍵不組 input、不發查詢,推導路徑在現行 demo 無從觀察)

## 10. 查詢結果顯示於 URL 按鈕右側(D8 增補)

- [x] 10.1 兩元件 URL 欄 cell 改「按鈕 + 右側結果槽」:進行中 spinner + 提示文字、失敗錯誤色訊息(截斷 + `title`)、成功顯示解析 URL(次要色截斷 + `title`)、idle / 缺 key 槽位空白;移除表格外 loading / error 列;per-row testid `*-url-pending` / `*-url-error` / `*-url-result`
- [x] 10.2 測試更新:兩元件結果槽三態(pending / error / result)與槽位位置(URL cell 內)斷言;`NodeDetailPanel.test.tsx` 錯誤斷言改 per-row testid
- [x] 10.3 `npm run typecheck` + `npm run lint` + `npm run test:ci` 全綠(2026-06-11,454 tests / 52 suites)

## 11. 欄名與按鈕欄對齊(D8 增補)

- [x] 11.1 ApplicationTable 首欄 header 改 **Name**、URL 欄 header 改 **Change Report**;ContainerTable URL 欄 header 同改 **Change Report**(按鈕文字不變)
- [x] 11.2 兩表 Change Report 欄 `disableGrow`(Application 的 Name 欄、Containers 的 Image 欄填滿剩餘寬度;Containers 的 Name 欄 `disableGrow`),兩區塊按鈕欄靠右、上下對齊
- [x] 11.3 查詢失敗時 Change Report 欄僅渲染錯誤訊息、不渲染停用按鈕(idle / 進行中 / 缺 key 仍渲染停用按鈕)
- [x] 11.4 測試同步(header 名、失敗時按鈕缺席)+ `npm run typecheck` + `npm run lint` + `npm run test:ci` 全綠

## 12. 收合容器 worstStatus 含 normal(D10)

- [x] 12.1 `normalize.ts`:controller 合成 `worstStatus` 一律寫入(拿掉 `worstRank > 0` 守門);`childWorstStatusRank` pre-pass 記錄所有帶 parent 的 pod(含 rank 0);k8s node 改「有 status 資訊(自身 status 或 ≥1 子 pod)才寫入」,無資訊省略
- [x] 12.2 `normalize.test.ts`:既有「全 normal 省略」三測項反轉為 `'normal'`;「critical alert 不升級」測項改斷言 `worstStatus: 'normal'`;新增「node 無 status 無子 pod → 省略」
- [x] 12.3 spec deltas:panel-rendering 與 graph-data-integration 各加 MODIFIED requirement(全 normal 畫綠框 / 一律寫入與無資訊省略);delta 內「告警聚合不影響 status 上色」scenario 同步
- [x] 12.4 `npm run typecheck` + `npm run lint` + `npm run test:ci` 全綠;demo 目視(收合全 normal controller 應綠框——seeder 的 status 組合已可觀察,不依賴 7.5)

## 13. detail 面板間距微調(demo 回饋)

- [x] 13.1 `NodeDetailPanel` 樣式:header(節點/controller 標題)與區塊之間的分隔線**同款 2px `border.strong`**(header 線貼近標題 `paddingBottom: 4` + `marginBottom: 10`;區塊間 `marginTop: 12` / `paddingTop: 10`);字級層級修正——sectionTitle `10 → 13px`、sectionBody 設 `bodySmall`(InteractiveTable 不自帶 fontSize,th/td 繼承)使標題 > 表格內文;(`themeColors` 補 `border.strong` 欄位)
- [x] 13.3 `AlertTable` 對齊同步 detail 表格節奏:Pod / Service / Severity / Count / Last occurred `disableGrow`(識別欄貼內容、右側狀態/動作欄靠右),Alert 主文字欄吃滿剩餘寬度
- [x] 13.2 使用者 demo preview 確認(2026-06-11:分隔線 2px strong 上下對稱 10px、標題 13px / 內文 bodySmall、AlertTable 對齊同步)後 commit

## 14. 圖例節點種類顯示/隱藏切換按鈕(D11)

- [x] 14.1 圖例 kind 列表推導改版:新 helper `src/panels/KsgPanel/deriveLegendEntries.ts`(+ `isFilterableKind` type guard)輸出 `NodeLegendKindEntry[]`(`{ kind, hidden, togglable }`)——`deriveLegendKinds(elements, collapsedIds)` ∪「存在於 mode 轉換後 elements 但被 `visibleKinds` 濾掉」的 kinds;`togglable` = kind ∈ `ALL_KINDS`(`network` 與未知 kind 為 `false`);純函式 + 單元測試(隱藏 kind 保留於列表、收合互換列不重複、展開容器 kind 隱藏後可還原、未知 kind 不可切換、去重)
- [x] 14.2 `NodeLegend`:props 自 `kinds` 遷移為 `entries: readonly NodeLegendKindEntry[]` + `onToggleKind?: (kind) => void`(type 經 legend barrel 匯出;省略 props 仍列全部已知 kind);每列右側 `IconButton`(`eye`/`eye-slash`,`tooltip` 帶 kind 名 → aria-label);隱藏列 glyph + label 淡化(opacity 0.4,按鈕不淡化);`togglable: false` 或無 `onToggleKind` 不渲染按鈕;`useStyles2` + emotion
- [x] 14.3 `KsgPanel.tsx` 接線:`handleToggleKind` → `onOptionsChange({ ...options, visibleKinds: toggle(...) })`(部分更新、不動其他 option;`isFilterableKind` 守門);`nodeLegendEntries` `useMemo` 依 `elements` / `collapsedIds` / `visibleKinds`;`computeVisibility` / `useElementFilter` / `collapsedIds` 零修改(獨立兩層);空狀態改鍵 `visibleNodeIds.size === 0`(只隱藏「實際在圖中」的 kinds 也要出 `All node types filtered`)
- [x] 14.4 測試:`NodeLegend.test.tsx`(按鈕渲染/缺席、點擊回呼、隱藏列淡化與 Show/Hide affordance、read-only 無按鈕);`KsgPanel.test.tsx` 新 describe(eye 點擊 → `onOptionsChange` 收到更新後 `visibleKinds` 且其餘 option 原封;隱藏 kind 列保留可還原 + GraphCanvas visibility 同步丟節點與端點邊;隱藏不清除 `collapsedIds`;模式往返不寫 option、隱藏設定保留;只隱藏在場 kinds → `All node types filtered` 且圖例列可還原)
- [x] 14.5 `computeVisibility` 互動驗證:端點邊隱藏與孤兒級聯既有測試核對通過;補一條 D11 對位 scenario(controller 模式濾掉 `pod` → `controller-owns-pod` 邊與 controller 盒級聯隱藏)
- [ ] 14.6 `npm run typecheck` + `npm run lint` + `npm run test:ci` 全綠(2026-06-12,474 tests / 53 suites + production build)✅;demo 目視待確認:點 `service` 列 → service 節點與 `pod-calls-service` / `service-selects-pod` 邊消失、列淡化可還原;收合 storageclass 後切 `storageclass` 列 → 容器連內容物消失、還原後仍收合;editor multi-select 與圖例同步
