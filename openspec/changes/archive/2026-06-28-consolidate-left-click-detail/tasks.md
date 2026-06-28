## 1. 缺值占位單一常數（D4）

- [x] 1.1 RED：新增 `src/shared/constants/missingValuePlaceholder.ts` 的測試，斷言匯出 `MISSING_VALUE_PLACEHOLDER === 'n/a'`
- [x] 1.2 GREEN：建立該常數檔（單一來源）
- [x] 1.3 `ChangeTimeCell` 改 import 該常數取代硬編 `'—'`；更新其測試斷言由「—」改「n/a」
- [x] 1.4 `ChangeTypeCell` 改 import 該常數取代 `'—'`；更新其測試斷言為「n/a」
- [x] 1.5 `AlertTable` Pod / Service 缺值占位改用該常數；更新其測試斷言為「n/a」

## 2. 共用 node attributes helper（D2）

- [x] 2.1 RED：為新純函式 `buildNodeAttributes(data)` 寫測試（合成 kind、`namespace`、`application`(`isApplication !== true`)、`ipAddress` join、`provisioner`、storageclass `parameters` key-sorted+wrap；只輸出有值者、無空列）
- [x] 2.2 GREEN：自 `HoverTooltip.buildContent` 抽出 promoted-attrs 邏輯為純函式 `src/shared/nodeAttributes/buildNodeAttributes.ts`
- [x] 2.3 重接 `HoverTooltip.buildContent` 改用該 helper；既有 hover tooltip 測試保持綠（無行為變更）

## 3. NodeDetailPanel 單一統合面板（D1）

- [x] 3.1 RED：Properties 區塊（`node-detail-section-properties`）恆顯——即使無 application/containers/alerts 也渲染；內容取自 `buildNodeAttributes` 且**略過 kind row**
- [x] 3.2 RED：屬性區塊吸收 storageclass（provisioner/params kv-row，不再有 `node-detail-section-storageclass`）與 service/pvc application（不再有 `node-detail-section-app-info`）
- [x] 3.3 RED：Alerts 區塊在 `data.alerts` 空/缺時**整段不渲染**（取消「No alerts」訊息）
- [x] 3.4 GREEN：移除 `view` prop（含 `NodeDetailPanel.types.ts`）；新增 Properties 區塊（kv-row + helper）；Alerts 改條件渲染；刪除 Storage Class 與輕量 App Info 兩段專屬 JSX；change-report 區塊改純 workload-kind + 資料閘控
- [x] 3.5 更新既有 `NodeDetailPanel` 測試：移除 view-based 斷言、移除 storageclass/app-info testid 斷言，補單一面板下三類區塊共存案例

## 4. KsgPanel 左鍵驅動預取與匯出（D3）

- [x] 4.1 RED：左鍵選取帶 `application` + `queryTarget` 的 workload 節點 → 建立 `detailQueryInput` 並觸發 `useNodeDetailUrls` 預取；非 workload 節點左鍵不建立 input、不查詢
- [x] 4.2 RED：`useSelectedPodExport` 於左鍵選取非 normal pod 時即匯出（不再以 `detailRequest === null` 設限）
- [x] 4.3 GREEN：`handleSelect` 在 id 非 null 時設 `detailRequest={nodeId,time:now}`、null 時清除；刪除 `handleContextSelect`；`NodeDetailPanel` 不再傳 `view`；`resolveSelectedNode` 加 `attributes`；`useSelectedPodExport` 閘件改為左鍵選取即生效
- [x] 4.4 更新 `KsgPanel` 測試（移除 view-based 斷言、右鍵預取案例改左鍵）

## 5. GraphCanvas 移除右鍵 detail（D3／D5）

- [x] 5.1 RED：`cxttap` MUST NOT 呼叫 detail 選取 callback、MUST NOT 開 detail 面板
- [x] 5.2 GREEN：移除 `onContextSelect` prop 與 `cxttap` 開 detail 的 wiring（含原生選單抑制；左鍵 `tap` 選取與摺疊 cue 路徑不動）
- [x] 5.3 更新 `GraphCanvas` 測試（刪除 cxttap→onContextSelect 斷言）

## 6. 驗證

- [x] 6.1 `npm run typecheck` + `npm run lint` 綠燈
- [x] 6.2 `npm run test:ci` 全綠（701 passed）
- [x] 6.3 `npm run build` 成功
## 7. 統合面板捲動回歸修正（single-body-scroll）

- [x] 7.1 RED：以帶 containers + alerts 的節點寫結構測試——body(`node-detail-scroll`)`overflowY:auto`、Containers/Alerts `flexGrow:0`、各 slot 不自帶 `overflowY:auto`（pre-fix 三項皆反相 → 失敗）
- [x] 7.2 GREEN：`getStyles` 三項 value-only 變更——`body` 由 `overflow:hidden` 改 `overflowX:hidden`+`overflowY:auto`；`sectionFill` 改 `flex:0 0 auto`；`slot` 去除內部捲動/sticky/overflowX reset（JSX、`cx`、return 型別不動）
- [x] 7.3 驗證：typecheck/lint 綠;test:ci 702 passed;build 成功
- [x] 7.4 瀏覽器驗證（Playwright + 安裝的 chromium，繞過壞掉的 `chrome` channel）：真實 demo 節點（Properties+Application+Containers 堆疊、短 viewport 壓低上限）→ body `overflowY:auto`、scrollHeight 350 > clientHeight 247、scrollTop 0→103 實際捲動、區塊重疊 0px。多面向 design judge workflow 選定 single-body-scroll（9.3 分）
- [x] 6.4 demo 驗證：Grafana 服務的 dist bundle 已含新碼（`node-detail-section-properties` / `node-detail-prop-` / `Properties` 標題存在；舊 `node-detail-section-storageclass` / `node-detail-section-app-info` 已移除）。註：瀏覽器像素級視覺驗證受限（本環境無 Chrome 供 Playwright MCP，`chrome` channel 安裝需 root），改以「部署 bundle 字串檢查 + 701 項自動化測試」覆蓋屬性恆顯 / 條件 change-report+alerts / n/a 占位 / 左鍵預取 / 右鍵 no-op 等行為
