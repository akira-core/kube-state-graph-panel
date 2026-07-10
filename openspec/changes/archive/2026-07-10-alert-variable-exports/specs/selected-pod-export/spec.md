# selected-pod-export — Delta (alert-variable-exports)

## MODIFIED Requirements

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
