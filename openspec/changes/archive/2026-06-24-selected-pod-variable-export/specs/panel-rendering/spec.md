## ADDED Requirements

### Requirement: 左鍵選取非 normal pod 匯出至 selectedPodVariable

啟用 `selectedPodVariable`(非空)時,Panel 的**左鍵**節點選取路徑(`alerts` view,`detailRequest === null`)除了開啟 detail 面板(見「Node Detail 面板」需求)外,MUST 在所選節點為 **pod** 且 `status` ∈ `{ warning, critical }` 時,額外將該 pod 的 `data.label` 寫入 `selectedPodVariable`;否則(normal / status 缺值 / 非 pod / 取消選取 / 右鍵)MUST 清除該變數。完整契約見 `selected-pod-export` capability;此需求僅釘住「左鍵選取會驅動該匯出」這一整合點,與既有開面板行為並存、互不干擾。

#### Scenario: 左鍵 critical pod 同時開面板並匯出

- **WHEN** `selectedPodVariable=selected_pod`,使用者左鍵點擊一個 `status:'critical'` 的 pod
- **THEN** detail 面板以 `alerts` view 開啟(既有行為),且 `var-selected_pod` 寫入該 pod 的 `label`

#### Scenario: 左鍵 normal pod 開面板但不匯出

- **WHEN** 使用者左鍵點擊一個 `status:'normal'` 的 pod
- **THEN** detail 面板照常開啟,但 `selectedPodVariable` 被清除(不寫入該 pod 名)
