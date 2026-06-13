# pod-list-variable-export Delta Spec

## ADDED Requirements

### Requirement: Panel option 指定目標變數(預設停用)

Panel options SHALL 提供文字輸入 `podListVariable`,指定 pod 名稱要寫入的 dashboard 變數名稱;預設值 MUST 為空字串。值經 trim 後為空時,匯出功能 MUST 完全停用(不讀取 URL、不呼叫 `locationService`)。Panel MUST NOT 嘗試建立變數或注入變數選項——目標變數假設已存在於 dashboard,由使用者自行定義(Grafana 公開 API 無此能力)。

#### Scenario: 預設不寫入

- **WHEN** panel 以預設 options 渲染並取得含 pod 節點的 graph 資料
- **THEN** 不發生任何 `locationService.partial` 呼叫,URL 不出現 `var-` 參數變化

#### Scenario: 設定變數名後啟用

- **WHEN** `podListVariable` 設為 `pod_list` 且 panel 取得 graph 資料
- **THEN** 匯出邏輯以 `var-pod_list` 為 URL key 執行寫入流程

### Requirement: Pod 名稱擷取(資料層、全量)

擷取函式 SHALL 自 normalize 後的 `ElementDefinition[]` 取出所有 `data.kind === 'pod'` 節點的顯示名稱 `data.label`(normalize 自上游 `data.name` 映射;空值時 fallback `data.id`),去重複並依字典序排序後回傳。輸入 MUST 為 normalize 直接輸出的元素(未經 pod-parent mode 視圖變換):collapse 摺疊狀態、legend/filter 可見性與 pod-parent mode MUST NOT 影響輸出;非 pod 節點(node、service、pvc、controller、cluster 容器等)與 edges MUST 被忽略。

#### Scenario: 混合元素中只取 pod

- **WHEN** elements 含 pod(`mongo-0`、`mongo-1`)、service、node、cluster 容器與 edges
- **THEN** 擷取結果為 `['mongo-0', 'mongo-1']`

#### Scenario: 去重與排序

- **WHEN** 兩個 cluster 各有一個名為 `gateway` 的 pod,且另有 pod `consumer`
- **THEN** 擷取結果為 `['consumer', 'gateway']`(去重、字典序)

#### Scenario: 摺疊不影響輸出

- **WHEN** 某 cluster 容器處於 collapse 狀態,其內含 pod `nats-0`
- **THEN** `nats-0` 仍出現在擷取結果中

### Requirement: 變數寫入(Grafana 多值 URL 同步)

寫入模組 SHALL 以 `locationService.partial({ ['var-' + name]: names }, true)` 將 pod 名稱清單寫入目標變數,其中 `names` 為字串陣列(Grafana 序列化為重複參數 `var-x=a&var-x=b`,即官方多值格式,消費端可用 `${pod_list:lucene}` 等格式修飾符);第二參數 MUST 為 `true`(history replace,不產生瀏覽歷史條目)。此模組 MUST 是 `src/features/variable-export/` 內唯一 import `@grafana/runtime` 的檔案。

#### Scenario: 多值寫入

- **WHEN** 擷取結果為 `['mongo-0', 'mongo-1']` 且目標變數為 `pod_list`
- **THEN** 呼叫 `locationService.partial({ 'var-pod_list': ['mongo-0', 'mongo-1'] }, true)`

#### Scenario: graph 更新後變數跟進

- **WHEN** dashboard refresh 後 graph 新增 pod `nats-0`
- **THEN** 下一次寫入的清單包含 `nats-0`,掛用該變數的其他 panel 因變數變更而 re-query

### Requirement: 寫入防護(等值跳過與空清單哨兵)

寫入前 MUST 以 `locationService.getSearch().getAll('var-' + name)` 讀取現值並做**順序無關**等值比對,相同即 MUST 跳過寫入。pod 清單為空時 MUST 寫入哨兵值 `['$__empty']` 而非刪除 URL key(刪 key 僅解除釘選,變數會殘留過期 pod 清單);現值已為 `['$__empty']` 且清單仍為空時,等值跳過同樣適用。

#### Scenario: 等值跳過

- **WHEN** URL 現值為 `var-pod_list=mongo-1&var-pod_list=mongo-0` 且本次擷取結果為 `['mongo-0', 'mongo-1']`
- **THEN** 不呼叫 `locationService.partial`(順序差異不構成變更)

#### Scenario: 空清單寫入哨兵

- **WHEN** graph 資料中沒有任何 pod 節點且 URL 現值為 `['mongo-0']`
- **THEN** 呼叫 `locationService.partial({ 'var-pod_list': ['$__empty'] }, true)`

#### Scenario: 連續 render 不重複寫入

- **WHEN** elements 內容不變的情況下 panel 連續 re-render 多次
- **THEN** `locationService.partial` 至多被呼叫一次

### Requirement: 錯誤與初載入狀態不寫入

panel 處於查詢錯誤(`seriesError`)、初次載入中(loading 且尚無元素)、整包 normalize 失敗(有 normalize 錯誤且零元素)、或 frames 無可辨識 payload(`useGraphData` 的 `hasPayload === false`:空 series、隱藏/未執行查詢、字串皆不可解析)狀態時,匯出 MUST 完全不動作——查詢失敗或沒拿到資料都不等於「沒有 pod」,MUST NOT 把這些狀態寫成 `$__empty` 哨兵。僅在成功載入(`hasPayload === true`)且確實零 pod 時才寫入哨兵。

#### Scenario: 查詢錯誤不清空變數

- **WHEN** dashboard refresh 的查詢失敗(`data.errors` 非空)且 URL 現值為 `['mongo-0']`
- **THEN** 不呼叫 `locationService.partial`,變數維持 `['mongo-0']`

#### Scenario: 初次載入中不寫入

- **WHEN** panel 處於 loading 狀態且尚未收到任何元素
- **THEN** 不呼叫 `locationService.partial`

#### Scenario: 無 payload 的 Done frame 不清空變數

- **WHEN** 查詢回傳 `LoadingState.Done` 但 `series` 為空(隱藏/未執行的查詢、transform 移除所有 frame)
- **THEN** 不呼叫 `locationService.partial`,變數維持原值

#### Scenario: 成功載入且零 pod 才寫哨兵

- **WHEN** 成功載入的 payload 正規化後沒有任何 pod 節點(例如只有 service)
- **THEN** 呼叫 `locationService.partial({ 'var-pod_list': ['$__empty'] }, true)`

### Requirement: 無自濾迴圈(目標變數與本 panel 查詢隔離)

目標變數 MUST NOT 出現在本 panel 自身的資料查詢 URL 中——此為與既有 `name` scope 變數的本質差異:寫入 `pod_list` 只觸發消費端 panel(如 ES logs)re-query,MUST NOT 造成本 panel 自身 re-fetch 的回饋迴圈。demo dashboard 以此約束佈建。

#### Scenario: demo dashboard 隔離佈建

- **WHEN** 檢視 `ksg-demo.json` 中本 panel 的查詢 target URL
- **THEN** URL 不含 `pod_list` 的任何引用(`${pod_list...}` 不出現),而 `pod_list` 變數定義存在於 dashboard 的 templating 清單(custom multi 型別)且 panel options 含 `"podListVariable": "pod_list"`
