## Context

現行 node-detail 面板以 `NodeDetailPanel` 的 `view` prop 做 disjoint 雙分流(`NodeDetailPanel.tsx:172-203`):

- **左鍵 `tap`**(`GraphCanvas` → `onSelect` → `KsgPanel.handleSelect`,清掉 `detailRequest`)→ `view='alerts'` → 只渲染 Alerts 表(無告警時顯示「No alerts」)。
- **右鍵 `cxttap`**(`onContextSelect` → `handleContextSelect`,設 `detailRequest={nodeId,time}`)→ `view='detail'` → 渲染 Application / Containers change-report,並以 `detailRequest` 驅動 `useNodeDetailUrls` eager 預取 `config_changes` / `code_changes`。

另有兩個恆顯於兩 view 的內在資訊區塊:Storage Class(`kind==='storageclass'` 的 provisioner + parameters，kv-row 版型 `NodeDetailPanel.tsx:228-246`)與輕量 Application 列(service/pvc leaf 的 ArgoCD app `:247-254`)。同樣的 promoted attributes(kind / namespace / application / ipAddress / provisioner / storageclass params)在 hover tooltip 的 `buildContent`(`HoverTooltip.tsx:116-168`)各自又實作一遍 —— 兩處邏輯平行、易漂移。

Change-report 的缺值占位目前是 muted em-dash「—」,分散硬編於 `ChangeTimeCell`(`PLACEHOLDER='—'`)、`ChangeTypeCell`(同)、`AlertTable`(Pod/Service `PLACEHOLDER='—'`)。

約束:`panel-rendering` capability 既有規格(互動與選取狀態 / Node Detail 面板 / Node Detail Application 與 Containers 區塊)是 source of truth;cytoscape 整合慣例不得違反;feature-first co-location、單一來源 map 原則。

## Goals / Non-Goals

**Goals:**

- 左鍵成為節點資訊的**唯一**入口:單一統合面板,**預設恆顯**一個比照 hover tooltip 的「屬性」區塊(kv-row 版型,like 現行 storageclass)。
- Application/Containers change-report 與 Alerts 改為**純資料閘控**的可選區塊(無資料整段隱藏),change-report 預取改由左鍵選取觸發。
- 移除 `view` 雙分流與右鍵 detail 觸發路徑。
- 缺值占位 em-dash「—」統一改 muted「n/a」,收斂為單一來源常數。
- 屬性區塊與 hover tooltip 共用單一 attribute 導出 helper,消除平行實作。

**Non-Goals:**

- 不改後端 / graph JSON 欄位 / `config_changes`·`code_changes` 端點契約。
- 不改 compound parent 的 `+/-` 摺疊 cue(本就左鍵選取驅動,與本變更正交)。
- 不新增屬性欄位來源(屬性集合 = 現行 hover tooltip promoted attrs 原集;owner 等非現有項不在此變更引入)。
- 不改 Dashboard 按鈕、alert `timeRecords` 行為、change-report 三態(loading/ready/unavailable)與時間/Change Type 欄邏輯(僅占位字串改 n/a)。

## Decisions

### D1. 移除 `view` prop,改為單一面板 + 純資料閘控區塊

`NodeDetailPanel` 不再收 `view`。區塊渲染順序與條件:

1. **屬性(Properties)**：**恆顯**。kv-row 版型(沿用既有 `kvRow`/`kvKey`/`kvVal` 樣式),內容為共用 helper 導出的 promoted attrs(見 D2)。
2. **Application change-report**：`kind ∈ DETAIL_URL_KINDS` 且 `data.application` 有值。
3. **Containers change-report**：`kind ∈ DETAIL_URL_KINDS` 且 `data.containers` 非空。
4. **Alerts**：`data.alerts` 非空才渲染；**移除「No alerts」空狀態**(無告警整段不顯)。

既有專屬的 **Storage Class 區塊**與**輕量 Application 列**被 D2 的屬性區塊吸收(provisioner / parameters / application 本就是 promoted attrs),故刪除這兩段專屬 JSX。

- *為何不保留 `view` 加個 `'unified'` 值*：雙分流的存在理由(左=alerts、右=detail)隨右鍵移除而消失;保留只增分支。純資料閘控更貼合「有才顯」需求。
- *為何把 Storage Class 折進屬性*：使用者要的就是「like 目前的 storageclass」的 kv 版型套到所有節點;storageclass 的 provisioner/params 已是 promoted attrs,折入後 storageclass 節點維持同樣呈現,non-storageclass 節點也獲得屬性區塊 —— 一段程式覆蓋全部。

### D2. 抽出共用 `buildNodeAttributes(data)`,hover tooltip 與屬性區塊共用

把 `HoverTooltip.buildContent` 的 node promoted-attrs 區段(kind 合成、namespace、application、ipAddress、provisioner、storageclass params key-sorted)抽成一個純函式(置於 `shared/` 或 `hover-tooltip` barrel 匯出),回 `Array<{key,value,wrap?}>`。hover tooltip 與 `NodeDetailPanel` 屬性區塊各自消費,渲染樣式不同(tooltip row vs kv-row)但**資料來源單一**。

- *為何*：消除兩處平行實作的漂移(「比照 hover tooltip」的字面落實 = 同一資料源)。
- *屬性與 header 重疊*：header 已有 kind/status badge;屬性區塊仍照 helper 輸出含 kind row(與 hover 一致、無害),或於屬性區塊渲染時略過 `kind`(因 header 已顯)——採後者以免重複,**但 helper 本身輸出完整集合**(hover 仍需 kind row)。屬性區塊只負責「不重複 header 已有者」的呈現選擇。
- *缺值*：helper 只 push 有值的 attr(沿用 hover 既有行為),故屬性區塊**不產生空列**、不需 n/a(n/a 只作用於有列但缺格的表格,見 D4)。

### D3. Change-report 預取改由左鍵選取驅動

移除右鍵路徑:刪 `handleContextSelect` / `GraphCanvas.onContextSelect` / `cxttap` 開 detail 的 wiring。`detailRequest` 改由 `handleSelect` 在選到非 null 節點時設 `{nodeId, time: now}`(背景 tap / 關閉設 null)——即原本右鍵捕捉 time 的邏輯平移到左鍵。`detailQueryInput`(`KsgPanel.tsx:320-335`)的閘件不變(`selectedNode` 有 `application` + `queryTarget`),故只有 workload 節點會預取;service/pvc/node 等 `queryTarget` undefined → 不預取,只顯屬性(+ alerts)。

- *為何沿用 `detailRequest` 結構而非新 state*：它已是「(nodeId, 捕捉於點擊當下的 time)」載體,改 producer 即可,`useNodeDetailUrls` 串接不動,改動面最小。
- *`useSelectedPodExport` 閘件*(`KsgPanel.tsx:353`,現為 `detailRequest === null`，意即「僅左鍵 alerts view 才匯出」)：右鍵移除後左鍵恆設 `detailRequest`,此 gate 將永遠 false。改為**不再以 `detailRequest` 設限**(左鍵本就是唯一選取路徑 = 既有匯出觸發時機),使用者可見行為不變。

### D4. 缺值占位「—」→「n/a」,收斂單一常數

新增單一來源常數(如 `shared/constants/missingValuePlaceholder.ts` 匯出 `MISSING_VALUE_PLACEHOLDER = 'n/a'`),由 `ChangeTimeCell`、`ChangeTypeCell`、`AlertTable`(Pod/Service)共同 import,取代各自硬編的 `'—'`。muted 樣式(`theme.colors.text.secondary`)不變,只換字串。

- *範圍*(對應澄清「所有缺值欄位」)：統合面板內**有列但缺格**的占位一律 n/a —— change time(current/previous)、Change Type、Alert 的 Pod/Service。屬性區塊無空列故不涉及。
- *為何單一常數*：與專案「單一來源 map」原則一致,杜絕日後再現「—」/「n/a」混用。

### D5. 右鍵不再被攔截

`cxttap` 開 detail 的處理移除後,右鍵回歸瀏覽器 / Grafana 預設(原 cxttap 會 `preventDefault` 原生 context menu)。本變更**不**保留 no-op 攔截 —— 右鍵不再具面板語意,讓原生行為自然發生(見 Open Questions,若 UX 要求抑制再補一個 no-op `preventDefault`)。

## Risks / Trade-offs

- **每次左鍵 workload 節點都會預取 change-report**(原僅右鍵) → 網路呼叫頻次上升。→ *Mitigation*:既有 eager-prefetch 已含每次開啟最多各一次的快取與換節點/unmount 中止(`useNodeDetailUrls`),語意不變,只是 trigger 前移;非 workload 節點不預取。
- **右鍵原生選單回歸**可能與既有使用習慣不同。→ *Mitigation*:右鍵本就無獨立資訊價值(全移到左鍵);如需抑制,後續加 no-op `cxttap` `preventDefault` 即可,不阻塞本變更。
- **屬性區塊吸收 Storage Class 區塊**:若有 e2e/快照斷言舊 `node-detail-section-storageclass` / `node-detail-section-app-info` testid,將失效。→ *Mitigation*:同步更新測試與 spec scenario;新 testid `node-detail-section-properties`。
- **`view` prop 移除**為 `NodeDetailPanel` 介面 BREAKING(內部元件,僅 `KsgPanel` 消費)→ 影響面侷限於本 repo,隨改即可。

## Migration Plan

1. 抽 `buildNodeAttributes` helper + 單元測試(沿用 hover 既有斷言遷移)。
2. 新增 `MISSING_VALUE_PLACEHOLDER` 常數,三個 cell 改 import。
3. `NodeDetailPanel`:移 `view`、加屬性區塊、Alerts 改條件渲染、刪 Storage Class / App Info 專屬段;更新其測試。
4. `KsgPanel`:`handleSelect` 設 `detailRequest`、刪 `handleContextSelect`、`NodeDetailPanel` 不再傳 `view`、`useSelectedPodExport` 閘件調整。
5. `GraphCanvas`:刪 `onContextSelect` / `cxttap` 開 detail 的 wiring 與 prop;更新其測試。
6. 同步 `panel-rendering` spec 三個 requirement 的 scenario。
7. typecheck / lint / test:ci / build 綠燈;demo stack 視覺驗證(屬性恆顯、條件區塊、n/a)。

回退:單一 feature 分支,git revert 即還原(無資料 migration、無後端改動)。

## Open Questions

- 屬性區塊的 section 標題用「Properties」還是「Attributes」?(暫定 Properties)
- 是否保留一個 no-op `cxttap` `preventDefault` 以抑制右鍵原生選單?(暫定不保留,待 UX 回饋)
- 屬性區塊是否略過 `kind`(header 已有 badge)以免重複?(暫定略過 kind row,其餘 attrs 全顯)
