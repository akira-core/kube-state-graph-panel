# pod-list-variable-export Specification

## Purpose

TBD - created by archiving change pod-list-variable-export. Update Purpose after archive.
## Requirements
### Requirement: 變數寫入(Grafana 多值 URL 同步)

寫入模組 SHALL 以 `locationService.partial({ ['var-' + name]: names }, true)` 將名稱清單(alert pod 清單或 alert 名稱清單)寫入目標變數,其中 `names` 為字串陣列(Grafana 序列化為重複參數 `var-x=a&var-x=b`,即官方多值格式,消費端可用 `${alert_names:lucene}`、`${alert_pod_list:singlequote}` 等格式修飾符);第二參數 MUST 為 `true`(history replace,不產生瀏覽歷史條目)。此模組 MUST 是 `src/features/variable-export/` 內唯一 import `@grafana/runtime` 的檔案。兩個變數 MUST 各自獨立寫入(其一停用不影響另一)。

#### Scenario: 多值寫入

- **WHEN** alert pod 擷取結果為 `['mesh-gateway-0', 'mongo-2']` 且目標變數為 `alert_pod_list`
- **THEN** 呼叫 `locationService.partial({ 'var-alert_pod_list': ['mesh-gateway-0', 'mongo-2'] }, true)`

#### Scenario: graph 更新後變數跟進

- **WHEN** dashboard refresh 後 graph 中 pod `nats-0` 新增了 alert
- **THEN** 下一次寫入的 `alert_pod_list` 清單包含 `nats-0`,掛用該變數的其他 panel 因變數變更而 re-query

### Requirement: 寫入防護(等值跳過與空清單哨兵)

寫入前 MUST 以 `locationService.getSearch().getAll('var-' + name)` 讀取現值並做**順序無關**等值比對,相同即 MUST 跳過寫入。清單為空時 MUST 寫入哨兵值 `['$__empty']` 而非刪除 URL key(刪 key 僅解除釘選,變數會殘留過期清單);現值已為 `['$__empty']` 且清單仍為空時,等值跳過同樣適用。防護 MUST 對兩個變數各自獨立適用。

#### Scenario: 等值跳過

- **WHEN** URL 現值為 `var-alert_pod_list=mongo-2&var-alert_pod_list=mesh-gateway-0` 且本次擷取結果為 `['mesh-gateway-0', 'mongo-2']`
- **THEN** 不呼叫 `locationService.partial`(順序差異不構成變更)

#### Scenario: 空清單寫入哨兵

- **WHEN** graph 資料中沒有任何帶 alert 的 pod 且 URL 現值為 `['mongo-2']`
- **THEN** 呼叫 `locationService.partial({ 'var-alert_pod_list': ['$__empty'] }, true)`

#### Scenario: 連續 render 不重複寫入

- **WHEN** elements 內容不變的情況下 panel 連續 re-render 多次
- **THEN** 每變數的 `locationService.partial` 至多被呼叫一次

### Requirement: 錯誤與初載入狀態不寫入

panel 處於查詢錯誤(`seriesError`)、初次載入中(loading 且尚無元素)、整包 normalize 失敗(有 normalize 錯誤且零元素)、或 frames 無可辨識 payload(`useGraphData` 的 `hasPayload === false`:空 series、隱藏/未執行查詢、字串皆不可解析)狀態時,**兩個變數**的匯出 MUST 完全不動作——查詢失敗或沒拿到資料都不等於「沒有 alert」,MUST NOT 把這些狀態寫成 `$__empty` 哨兵。僅在成功載入(`hasPayload === true`)且確實零筆時才寫入哨兵。

#### Scenario: 查詢錯誤不清空變數

- **WHEN** dashboard refresh 的查詢失敗(`data.errors` 非空)且 URL 現值為 `var-alert_pod_list=mongo-2`、`var-alert_names=KubePodCrashLooping`
- **THEN** 不呼叫 `locationService.partial`,兩變數維持原值

#### Scenario: 初次載入中不寫入

- **WHEN** panel 處於 loading 狀態且尚未收到任何元素
- **THEN** 不呼叫 `locationService.partial`

#### Scenario: 無 payload 的 Done frame 不清空變數

- **WHEN** 查詢回傳 `LoadingState.Done` 但 `series` 為空(隱藏/未執行的查詢、transform 移除所有 frame)
- **THEN** 不呼叫 `locationService.partial`,兩變數維持原值

#### Scenario: 成功載入且零筆才寫哨兵

- **WHEN** 成功載入的 payload 正規化後沒有任何帶 alert 的節點
- **THEN** 兩變數各寫入 `['$__empty']` 哨兵

### Requirement: 無自濾迴圈(目標變數與本 panel 查詢隔離)

兩個目標變數 MUST NOT 出現在本 panel 自身的資料查詢 URL 中——寫入 `alert_pod_list` / `alert_names` 只觸發消費端 panel(如 logs / VictoriaMetrics alert 查詢)re-query,MUST NOT 造成本 panel 自身 re-fetch 的回饋迴圈。demo dashboard 以此約束佈建:兩變數皆為 custom + multi + allowCustomValue 型別(多值消費;textbox 僅承接單值)。

#### Scenario: demo dashboard 隔離佈建

- **WHEN** 檢視 `ksg-demo.json` 與 `ksg-switch-demo.json` 中本 panel 的查詢 target
- **THEN** target 不含 `alert_pod_list` / `alert_names` 的任何引用,而兩變數定義存在於 dashboard templating 清單(custom + multi + allowCustomValue)且 panel options 含 `"alertPodListVariable"` / `"alertNameListVariable"` 對應值

#### Scenario: backend demo 無 alert 資料時誠實呈現

- **WHEN** `ksg-demo`(backend seed 無 alert 契約)載入完成
- **THEN** 兩變數為 `$__empty`(零筆哨兵),dashboard 說明文字載明此為 seed 資料限制而非故障

### Requirement: Panel options 指定兩個目標變數(預設停用)

Panel options SHALL 提供兩個文字輸入:`alertPodListVariable`(帶 alert 的 pod 名稱清單)與 `alertNameListVariable`(alert 名稱清單);預設值 MUST 皆為空字串。各 option 的值經 trim 後為空時,**該變數**的匯出 MUST 完全停用(不讀取 URL、不呼叫 `locationService`),兩者獨立 gating——只設定其一亦可運作。Panel MUST NOT 嘗試建立變數或注入變數選項——目標變數假設已存在於 dashboard,由使用者自行定義(Grafana 公開 API 無此能力)。舊 option key `podListVariable` MUST NOT 被讀取(硬更名,無 fallback)。

#### Scenario: 預設不寫入

- **WHEN** panel 以預設 options 渲染並取得含 alert pod 的 graph 資料
- **THEN** 不發生任何 `locationService.partial` 呼叫,URL 不出現 `var-` 參數變化

#### Scenario: 設定變數名後啟用

- **WHEN** `alertPodListVariable` 設為 `alert_pod_list`、`alertNameListVariable` 設為 `alert_names`,且 panel 取得 graph 資料
- **THEN** 匯出邏輯分別以 `var-alert_pod_list` / `var-alert_names` 為 URL key 執行寫入流程

#### Scenario: 單獨啟用其一

- **WHEN** 僅 `alertNameListVariable` 設為 `alert_names`(`alertPodListVariable` 為空)
- **THEN** 只寫入 `var-alert_names`;pod 清單路徑不呼叫 `locationService`

#### Scenario: 舊 key 不再生效

- **WHEN** dashboard JSON 的 panel options 僅含舊 key `"podListVariable": "pod_list"`
- **THEN** 不發生任何變數匯出(舊 key 被忽略,匯出停用)

### Requirement: Alert pod 名稱擷取(資料層)

擷取函式 SHALL 自 normalize 後的 `ElementDefinition[]` 取出 `data.kind === 'pod'` **且 `data.alerts` 為非空陣列**的節點顯示名稱 `data.label`(空值時 fallback `data.id`),去重複並依字典序排序後回傳。alert 的 `severity` MUST NOT 影響取捨(任何 severity 都算有 alert)。輸入 MUST 為 normalize 直接輸出的元素(未經 pod-parent mode 視圖變換):collapse 摺疊狀態、legend/filter 可見性與 pod-parent mode MUST NOT 影響輸出;無 alert 的 pod、非 pod 節點(即使帶 alerts,如 node/pvc/controller)與 edges MUST 被忽略。

#### Scenario: 只取帶 alert 的 pod

- **WHEN** elements 含 pod `mongo-2`(`alerts` 非空)、pod `mongo-0`/`mongo-1`(無 `alerts`)、node `worker-1`(`alerts` 非空)與 edges
- **THEN** 擷取結果為 `['mongo-2']`(無 alert 的 pod 與非 pod 節點皆排除)

#### Scenario: severity 不影響取捨

- **WHEN** pod `a` 只有 `severity:'info'` 的 alert,pod `b` 有 `severity:'critical'` 的 alert
- **THEN** 擷取結果為 `['a', 'b']`

#### Scenario: 去重與排序

- **WHEN** 兩個 cluster 各有一個名為 `gateway` 且帶 alert 的 pod,另有帶 alert 的 pod `consumer`
- **THEN** 擷取結果為 `['consumer', 'gateway']`(去重、字典序)

#### Scenario: 摺疊不影響輸出

- **WHEN** 某 cluster 容器處於 collapse 狀態,其內含帶 alert 的 pod `nats-0`
- **THEN** `nats-0` 仍出現在擷取結果中

### Requirement: Alert 名稱擷取(資料層、跨節點種類)

擷取函式 SHALL 自 normalize 後的 `ElementDefinition[]` 走訪**所有** node 元素的 `data.alerts`,收集每筆 `NodeAlert.name`,去重複並依字典序排序後回傳——不限 pod:node、pvc、service 等節點自帶的 alerts 與 controller 聚合自子 pod 的 alerts MUST 一併收集(重複名稱由去重吸收)。輸入同 alert pod 擷取(normalize 直接輸出,視圖狀態無關);edges 與無 `alerts` 的節點 MUST 被忽略。輸出供消費端(如 VictoriaMetrics)以 alertname 維度查詢。

#### Scenario: 跨節點種類收集

- **WHEN** elements 含 pod `mongo-2`(alerts:`KubePodCrashLooping`、`KubePodNotReady`)、node `worker-1`(alert:`KubeNodeMemoryPressure`)、pvc `data-mongo-2`(alert:`VolumeNearFull`)
- **THEN** 擷取結果為 `['KubeNodeMemoryPressure', 'KubePodCrashLooping', 'KubePodNotReady', 'VolumeNearFull']`

#### Scenario: controller 聚合的重複名稱去重

- **WHEN** pod `mongo-2` 帶 alert `KubePodCrashLooping`,其 controller 節點因 normalize 聚合亦帶同名 alert
- **THEN** `KubePodCrashLooping` 在擷取結果中只出現一次

#### Scenario: 無任何 alert 時回傳空清單

- **WHEN** 成功載入的 graph 中沒有任何節點帶 `alerts`
- **THEN** 擷取結果為 `[]`(寫入端轉為 `$__empty` 哨兵)

