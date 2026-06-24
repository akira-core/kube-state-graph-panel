# selected-pod-export Specification

## Purpose

TBD - created by archiving change selected-pod-variable-export. Update Purpose after archive.

## Requirements

### Requirement: Panel option 指定目標變數(預設停用)

Panel options SHALL 提供文字輸入 `selectedPodVariable`,指定被選取 pod 名稱要寫入的 dashboard 變數名稱;預設值 MUST 為空字串。值經 trim 後為空時,本功能 MUST 完全停用(不讀取 URL、不呼叫 `locationService`)。Panel MUST NOT 嘗試建立變數或注入變數選項——目標變數假設已存在於 dashboard,由使用者自行定義。此選項與 `podListVariable`(全量 pod 清單匯出)為**各自獨立**的兩個變數匯出,互不影響。

#### Scenario: 預設不寫入

- **WHEN** panel 以預設 options 渲染,使用者左鍵點擊任一節點
- **THEN** 不發生任何 `locationService.partial` 呼叫(`selectedPodVariable` 為空 → 停用)

#### Scenario: 設定變數名後啟用

- **WHEN** `selectedPodVariable` 設為 `selected_pod`
- **THEN** 匯出邏輯以 `var-selected_pod` 為 URL key 執行寫入/清除流程

### Requirement: 左鍵點擊非 normal pod 匯出其名稱

啟用時(`selectedPodVariable` 非空),當使用者**左鍵**選取一個節點且該節點為 **pod** 且其 `data.status` ∈ `{ warning, critical }` 時,Panel SHALL 將該 pod 的顯示名稱(`data.label`)寫入目標變數。**左鍵**的判定為 detail 面板的 `alerts` view 選取路徑(`detailRequest === null`);**右鍵**(detail view)MUST NOT 觸發匯出。`status` 缺值的節點 MUST 視為 normal(不匯出)。

#### Scenario: 左鍵 critical/warning pod 寫入名稱

- **WHEN** `selectedPodVariable=selected_pod`,使用者左鍵點擊一個 `kind:'pod'`、`status:'critical'`(或 `'warning'`)、`label:'mongo-0'` 的節點
- **THEN** 呼叫 `writeDashboardVariable('selected_pod', ['mongo-0'])`(URL 出現 `var-selected_pod=mongo-0`)

#### Scenario: 左鍵 normal pod 不匯出(清除)

- **WHEN** 使用者左鍵點擊一個 `kind:'pod'`、`status:'normal'` 的節點
- **THEN** 目標變數被**清除**(寫入 `$__empty`,見下「寫入」需求),不寫入該 pod 名

#### Scenario: 左鍵 status 缺值的 pod 視為 normal(清除)

- **WHEN** 使用者左鍵點擊一個 `kind:'pod'` 但無 `data.status` 的節點
- **THEN** 視為 normal,不匯出,目標變數被清除

#### Scenario: 左鍵非 pod 節點不匯出(清除)

- **WHEN** 使用者左鍵點擊一個非 pod 節點(如 `service` / `node` / controller),即使其 status 為 critical
- **THEN** 不匯出,目標變數被清除

#### Scenario: 右鍵不匯出(清除)

- **WHEN** 使用者**右鍵**點擊一個 `status:'critical'` 的 pod(開啟 detail view,`detailRequest` 非 null)
- **THEN** MUST NOT 寫入該 pod 名;目標變數被清除(右鍵屬 Change Report / Dashboard 流程,不擁有此變數)

### Requirement: 寫入重用單一寫入路徑(單值 + 哨兵 + 等值跳過)

匯出 MUST 透過既有 `src/features/variable-export/writeDashboardVariable.ts` 寫入,不另建 `@grafana/runtime` 觸點。匯出值為**單元素**陣列 `[label]`;清除時寫入**空陣列**,由 `writeDashboardVariable` 轉為 `$__empty` 哨兵(刪 URL key 僅解除釘選、會殘留過期值)。寫入前的**順序無關等值比對**(現有防護)MUST 適用:相同值連續選取 / 連續 re-render MUST NOT 重複呼叫 `locationService.partial`;第二參數維持 `true`(history replace)。

#### Scenario: 單值寫入

- **WHEN** 左鍵選取 `status:'critical'`、`label:'mongo-0'` 的 pod,目標變數 `selected_pod`
- **THEN** 最終呼叫 `locationService.partial({ 'var-selected_pod': ['mongo-0'] }, true)`

#### Scenario: 清除寫入哨兵

- **WHEN** 目標變數現值為 `['mongo-0']`,使用者點背景取消選取(或選 normal pod / 非 pod / 右鍵)
- **THEN** 呼叫 `locationService.partial({ 'var-selected_pod': ['$__empty'] }, true)`

#### Scenario: 等值跳過(不重複寫入)

- **WHEN** 已匯出 `['mongo-0']` 後,panel 因 data refresh 連續 re-render 但選取與 status 不變
- **THEN** `locationService.partial` 至多被呼叫一次(等值跳過)

### Requirement: 無自濾迴圈(目標變數與本 panel 查詢隔離)

目標變數 MUST NOT 出現在本 panel 自身的資料查詢 URL 中:寫入 `selectedPodVariable` 只應觸發**消費端** panel(如 logs / 詳情 panel)re-query,MUST NOT 造成本 panel 自身 re-fetch 的回饋迴圈。文件 MUST 載明目標變數應為 **textbox**(或 custom + `allowCustomValue`)型別——`query`/options 型別變數會以其選項集合 revalidate 並**丟棄**外部寫入、不在選項內的值。

#### Scenario: 變數不被 graph query 引用

- **WHEN** 檢視本 panel 的 graph 查詢 target URL
- **THEN** URL 不含 `selectedPodVariable` 變數的任何引用(`${selected_pod...}` 不出現)
