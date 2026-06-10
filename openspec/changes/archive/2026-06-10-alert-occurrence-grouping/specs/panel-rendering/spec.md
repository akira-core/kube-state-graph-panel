## MODIFIED Requirements

### Requirement: Node Detail 面板

Panel SHALL 在點擊節點時,於 canvas 底部以浮層(不縮放 graph)開啟 detail 面板,顯示節點 name、kind、status 三項,以及一個**告警表格**(`@grafana/ui` `InteractiveTable`,欄位 Pod / Service / Alert / Severity / **Count** / **Last occurred**);並在點擊背景 / 邊、切換到另一節點、或按關閉鈕時關閉。cytoscape 單選的藍色高亮 MUST 與面板開關同步。cluster 容器不可點選。

告警資料來自上游 graph JSON 節點的選用欄位 `alerts: NodeAlert[]`(`normalizeGraph` 攜帶至 `data.alerts`,缺值或空陣列→無列)。每筆 `NodeAlert` 以 `timeRecords: number[]`(Unix 秒,升序,同一 alert 的所有發生時間)表示重複發生;後端已把同一 alert 分組為**單筆**(panel **不**再去重),故告警表格**一列代表一個 alert**。**Count** 欄 MUST 顯示 `timeRecords.length`(發生次數),並 MUST 透過 `@grafana/ui` `Tooltip` 列出全部發生時間(依 `timeZone` 格式化)——即完整的「occur time」清單。**Last occurred** 欄 MUST 顯示最後發生時間 `max(timeRecords)`(格式化),且 MUST 為可點擊元素:點擊時以 `t = max(timeRecords)`(Unix 秒)為中心、固定 ±5 分鐘(300 秒),呼叫 `onChangeTimeRange({ from: (t-300)*1000, to: (t+300)*1000 })`(毫秒)倒帶 dashboard 時間範圍。`severity` 為自由字串:`info` / `warning` / `critical` 取單一資料源 `SEVERITY_COLOR` 對應色,其餘自訂標籤 MUST 原樣保留並以 `FALLBACK_SEVERITY_COLOR`(critical 色)著色,不報錯。節點無告警時 MUST 顯示「No alerts」訊息而非空表格。

#### Scenario: 點節點開啟面板

- **WHEN** 使用者點擊任一節點
- **THEN** 底部浮層顯示該節點 label、kind badge、status badge,覆蓋於 graph 之上且不改變 graph 尺寸
- **AND** 該節點的選取高亮與開啟的面板同步

#### Scenario: 點外面或關閉鈕關閉

- **WHEN** 使用者點擊 graph 背景或邊,或按下關閉鈕
- **THEN** detail 面板關閉,且選取高亮清除

#### Scenario: 切換節點

- **WHEN** 面板開啟時使用者點擊另一個節點
- **THEN** 面板切換為新點擊的節點

#### Scenario: 顯示告警表格(分組,一列一個 alert)

- **WHEN** 選取的節點帶有 `data.alerts`(一或多筆)
- **THEN** detail 面板以 `InteractiveTable` 逐列顯示告警,**一列代表一個 alert**,欄位為 Pod / Service / Alert / Severity / Count / Last occurred
- **AND** Pod 或 Service 缺值時該格顯示 `—`

#### Scenario: Count 徽章與發生時間 Tooltip

- **WHEN** 某 alert 的 `timeRecords` 含 N 個發生時間
- **THEN** 該列 Count 欄顯示 `N`(= `timeRecords.length`)
- **AND** hover Count 時以 `@grafana/ui` `Tooltip` 列出全部 N 個發生時間(依 `timeZone` 格式化)

#### Scenario: Severity 著色(自由字串 + SEVERITY_COLOR)

- **WHEN** 告警 `severity` 為 `info` / `warning` / `critical`
- **THEN** 該列 Severity 以對應 `SEVERITY_COLOR` 著色徽章呈現
- **WHEN** `severity` 不在 `SEVERITY_COLOR` 中(自訂標籤,如 `fatal`)
- **THEN** 以 `FALLBACK_SEVERITY_COLOR`(critical 色)著色、且徽章原樣保留該標籤文字,不報錯

#### Scenario: 點 Last occurred 倒帶時間範圍

- **WHEN** 使用者點擊某列的 Last occurred 欄,該 alert `timeRecords` 的最大值為 `t`(Unix 秒)
- **THEN** panel 呼叫 `onChangeTimeRange({ from: (t-300)*1000, to: (t+300)*1000 })`(±5 分鐘,毫秒)
- **AND** dashboard 時間範圍倒帶至該窗(以最後發生時間為中心)

#### Scenario: 無告警空狀態

- **WHEN** 選取的節點無 `alerts` 欄位或為空陣列
- **THEN** detail 面板顯示「No alerts」訊息,不渲染表格
