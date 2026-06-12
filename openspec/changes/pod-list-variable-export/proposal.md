# Proposal: pod-list-variable-export

## Why

Dashboard 上的其他 panel(典型場景:Elasticsearch logs panel)需要「目前拓撲圖裡有哪些 pod」這項資訊來縮小查詢範圍,但 Grafana 變數無法直接讀取另一個 panel 的查詢結果。Panel 拿到 graph 資料後,把所有 pod 名稱寫入一個既有的 dashboard 變數(例如 `pod_list`),即可讓 ES logs panel 以 `${pod_list:lucene}` 等 Grafana 格式消費同一份 pod 清單,與拓撲圖保持同一時間窗、同一 scope 的一致性。

## What Changes

- 新增 feature 模組 `src/features/variable-export/`:panel 每次取得 normalize 後的 graph 元素時,擷取所有 `kind === 'pod'` 節點的顯示名稱(`data.label`,normalize 自上游 `data.name` 映射而來),以 Grafana 多值格式(`locationService.partial({ 'var-<name>': string[] }, true)`,序列化為重複參數 `var-x=a&var-x=b`)寫入 panel option 指定的 dashboard 變數。
- 新增 panel option `podListVariable`(文字輸入,預設空字串 = 功能停用):指定目標變數名稱;變數本身假設已存在於 dashboard(panel 只寫值,無法建立變數或注入選項——Grafana 公開 API 限制)。
- 寫入防護:寫入前與 `locationService.getSearch().getAll('var-<name>')` 現值做順序無關比對,相同即跳過(防止重複寫入與 re-render 迴圈);一律傳 `replace=true`(避免每次 refresh 產生瀏覽器 history 條目);pod 清單為空時寫入 `'$__empty'` 哨兵值(沿用 Volkov Labs 慣例,避免殘留過期選值)。
- Demo dashboard `provisioning/dashboards/ksg-demo.json` 新增 `pod_list` custom multi 變數,並在 panel options 設定 `podListVariable: "pod_list"`,作為可驗證的展示。

## Capabilities

### New Capabilities

- `pod-list-variable-export`: panel 將 graph 中全部 pod 名稱自動匯出至既有 dashboard 變數的行為——觸發時機、寫入格式、防護條款(等值跳過、replace、空清單哨兵)、停用條件,以及 `@grafana/runtime` touchpoint 的隔離慣例。

### Modified Capabilities

- `graph-data-integration`:「載入與錯誤狀態傳遞」requirement 的 `useGraphData` 公開契約由 `{ elements, error }` 擴為 `{ elements, error, hasPayload }`——`hasPayload` 區分「frames 無可辨識 payload」與「成功載入但零元素」,供帶副作用的消費者(本 change 的變數匯出閘門)避免把「沒拿到資料」誤判為「空 graph」。(「範例 Dashboard Provisioning」requirement 為泛性條款,demo 加變數屬實作細節,不改其 spec 層行為。)

## Impact

- **新增程式碼**:`src/features/variable-export/`(純函式 + 一個 `@grafana/runtime` touchpoint 模組,倣 `node-detail/resolveDetailEndpoint.ts` 的隔離模式)。
- **修改**:`src/panels/KsgPanel/KsgPanel.tsx`(掛接匯出 effect)、`KsgPanel.types.ts` + `module.ts`(新 panel option)、`provisioning/dashboards/ksg-demo.json`(demo 變數 + option)。
- **相依**:`@grafana/runtime` 12.4.2 既有依賴,無新套件。
- **風險面**:寫入的是 URL 狀態,僅影響掛了該變數的 dashboard;option 預設停用,對既有 dashboard 零行為變化。已知 Grafana 限制:推入 query/custom 變數的值在選項重載(revalidation)時若不在選項清單會被丟回預設——demo 用 custom multi 變數承接,實際部署建議變數型別與消費端格式由使用者依 ES 查詢需求決定。
