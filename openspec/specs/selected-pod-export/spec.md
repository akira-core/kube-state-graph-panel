# selected-pod-export Specification

## Purpose

TBD - created by archiving change selected-pod-variable-export. Update Purpose after archive.
## Requirements
### Requirement: Panel option 指定目標變數(預設停用)

Panel options SHALL 提供兩個文字輸入:`selectedPodVariable`(被選取 pod 名稱的目標變數)與 `clusterVariable`(被選取節點所屬 cluster 名稱的目標變數);預設值 MUST 皆為空字串。各 option 的值經 trim 後為空時,**該變數**的匯出 MUST 完全停用(不讀取 URL、不呼叫 `locationService`),且兩者獨立 gating——只設定其一亦可正常運作。Panel MUST NOT 嘗試建立變數或注入變數選項——目標變數假設已存在於 dashboard,由使用者自行定義。此二選項與資料驅動的 alert 清單匯出(`alertPodListVariable` / `alertNameListVariable`)為**各自獨立**的變數匯出,互不影響。

#### Scenario: 預設不寫入

- **WHEN** panel 以預設 options 渲染,使用者左鍵點擊任一節點
- **THEN** 不發生任何 `locationService.partial` 呼叫(兩 option 皆為空 → 全停用)

#### Scenario: 設定變數名後啟用

- **WHEN** `selectedPodVariable` 設為 `selected_pod`、`clusterVariable` 設為 `cluster_sel`
- **THEN** 匯出邏輯分別以 `var-selected_pod` / `var-cluster_sel` 為 URL key 執行寫入/清除流程

#### Scenario: 單獨啟用其一

- **WHEN** 僅 `selectedPodVariable` 設為 `selected_pod`(`clusterVariable` 為空),使用者左鍵點擊一個 pod
- **THEN** 只寫入 `var-selected_pod`;`clusterVariable` 路徑不呼叫 `locationService`

### Requirement: 無自濾迴圈(目標變數與本 panel 查詢隔離)

兩個目標變數 MUST NOT 出現在本 panel 自身的資料查詢 URL 中:寫入 `selectedPodVariable` / `clusterVariable` 只應觸發**消費端** panel(如 ClickHouse logs panel)re-query,MUST NOT 造成本 panel 自身 re-fetch 的回饋迴圈。文件 MUST 載明:單值消費(cluster)可用 **textbox**(或 custom + `allowCustomValue`)型別;多值消費(controller 點擊的 pod 清單)MUST 用 **custom + multi + `allowCustomValue`** 型別——textbox 僅承接單值,`query`/options 型別變數會以其選項集合 revalidate 並**丟棄**外部寫入、不在選項內的值。

#### Scenario: 變數不被 graph query 引用

- **WHEN** 檢視本 panel 的 graph 查詢 target URL
- **THEN** URL 不含 `selectedPodVariable` 與 `clusterVariable` 兩變數的任何引用(`${selected_pod...}`、`${cluster_sel...}` 不出現)

### Requirement: 左鍵點擊 pod 匯出名稱與 cluster

啟用時,當使用者左鍵選取一個 `kind === 'pod'` 節點,Panel SHALL 將該 pod 的顯示名稱(`data.label`)以單元素陣列寫入 `selectedPodVariable`,並將解析出的 cluster 名稱寫入 `clusterVariable`。`data.status` MUST NOT 影響匯出——normal、warning、critical 與缺值一視同仁。cluster 解析規則:沿 `data.parent` 祖先鏈取最近 `isCluster === true` 祖先的 `data.cluster`,fallback 為節點自身 `labels.cluster`;皆無 → `clusterVariable` 清除(pod 名照常寫入)。

#### Scenario: 點擊 normal pod 寫入名稱與 cluster

- **WHEN** `selectedPodVariable=selected_pod`、`clusterVariable=cluster_sel`,使用者左鍵點擊 `kind:'pod'`、`status:'normal'`、`label:'mongo-0'`、cluster 祖先為 `prod` 的節點
- **THEN** 呼叫 `writeDashboardVariable('selected_pod', ['mongo-0'])` 與 `writeDashboardVariable('cluster_sel', ['prod'])`

#### Scenario: status 缺值的 pod 仍匯出

- **WHEN** 使用者左鍵點擊一個 `kind:'pod'` 但無 `data.status` 的節點
- **THEN** pod 名與 cluster 名照常匯出(不再視為 normal 而清除)

#### Scenario: cluster 解析失敗只清 cluster 變數

- **WHEN** 使用者左鍵點擊一個無 `isCluster` 祖先且自身無 `labels.cluster` 的 pod
- **THEN** `selectedPodVariable` 寫入該 pod 名;`clusterVariable` 被清除(`$__empty`)

### Requirement: 左鍵點擊 controller 匯出全部子 pod 名稱與 cluster

啟用時,當使用者左鍵選取一個 `data.isController === true` 的 compound 節點,Panel SHALL 收集其**直接子節點**中 `kind === 'pod'` 者的 `data.label`,**去重並依字典序排序**後以多值陣列寫入 `selectedPodVariable`,並依 pod 相同規則解析與寫入 `clusterVariable`。收集 MUST 以傳入 GraphCanvas 的當前 view elements(`data.parent === <controller id>`)為準;expand-collapse 摺疊狀態 MUST NOT 影響輸出(React 端 elements 不因摺疊改變)。子 pod 為 0 時 `selectedPodVariable` 清除。(node pod-parent mode 下 controller tier 被移除、不可點擊,無此互動——不需 owner 反查。)

#### Scenario: 點擊 controller 匯出全部子 pod(多值)

- **WHEN** `selectedPodVariable=selected_pod`,使用者左鍵點擊 controller `mongo`(其直接子 pod 為 `mongo-2`、`mongo-0`、`mongo-1`,cluster 祖先 `prod`)
- **THEN** 呼叫 `writeDashboardVariable('selected_pod', ['mongo-0', 'mongo-1', 'mongo-2'])`(排序去重)與 `writeDashboardVariable('cluster_sel', ['prod'])`

#### Scenario: 已摺疊 controller 照樣匯出

- **WHEN** controller compound 處於 collapse 狀態,使用者左鍵點擊該(摺疊後的)節點
- **THEN** 其全部子 pod 名仍被匯出(收集自 elements,非 cy instance)

#### Scenario: 無子 pod 的 controller 清除 pod 變數

- **WHEN** 使用者左鍵點擊一個無任何 `kind:'pod'` 直接子節點的 controller
- **THEN** `selectedPodVariable` 被清除;`clusterVariable` 依解析結果寫入或清除

### Requirement: 寫入重用單一寫入路徑(單/多值 + 哨兵 + 等值跳過)

匯出 MUST 透過既有 `src/features/variable-export/writeDashboardVariable.ts` 寫入,不另建 `@grafana/runtime` 觸點。pod 名值為單元素(pod 點擊)或多元素(controller 點擊)陣列;cluster 值為單元素陣列;清除時寫入**空陣列**,由 `writeDashboardVariable` 轉為 `$__empty` 哨兵(刪 URL key 會殘留過期值)。寫入前的**順序無關等值比對** MUST 適用:相同值連續選取 / data-refresh 連續 re-render MUST NOT 重複呼叫 `locationService.partial`;第二參數維持 `true`(history replace)。兩變數 MUST 各自獨立寫入(其一失敗或停用不影響另一)。

#### Scenario: 多值寫入

- **WHEN** controller 點擊產生 `['mongo-0', 'mongo-1', 'mongo-2']`
- **THEN** 最終呼叫 `locationService.partial({ 'var-selected_pod': ['mongo-0', 'mongo-1', 'mongo-2'] }, true)`(URL 出現重複 `var-selected_pod=` 參數)

#### Scenario: 點擊非 pod/controller 節點清除兩變數

- **WHEN** 使用者左鍵點擊 `service` / `node` / `pvc` / namespace group 等非 pod、非 controller 節點
- **THEN** 兩變數皆被清除(各寫入 `['$__empty']`)

#### Scenario: 取消選取清除兩變數

- **WHEN** 已匯出值後,使用者點擊背景(或不可選取的 cluster 背板)取消選取
- **THEN** 呼叫 `locationService.partial({ 'var-selected_pod': ['$__empty'] }, true)` 與 `locationService.partial({ 'var-cluster_sel': ['$__empty'] }, true)`

#### Scenario: 等值跳過(不重複寫入)

- **WHEN** 已匯出 `['mongo-0']` 後,panel 因 data refresh 連續 re-render 但選取不變
- **THEN** 每變數的 `locationService.partial` 至多被呼叫一次(等值跳過)

