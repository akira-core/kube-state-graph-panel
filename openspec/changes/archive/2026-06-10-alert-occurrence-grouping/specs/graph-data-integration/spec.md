## ADDED Requirements

### Requirement: 告警 (alerts) 正規化與 time_records 解析

`normalizeGraph` SHALL 在 anti-corruption boundary(`parseAlerts`)將上游 leaf node 的選用欄位 `alerts`(陣列)正規化為 panel 內部 `NodeAlert[]`,並以 `timeRecords: number[]` 承載同一 alert 的**所有發生時間**(取代既有的單一 `time` scalar)。規則:

- 每筆 alert MUST 至少帶非空 `name` 與非空 `severity`(自由字串),否則丟棄。
- 發生時間自上游 wire 欄位 `time_records`(數字陣列)取得:MUST 僅保留有限(`Number.isFinite`)且 ≥ 0 的值,並**升序排序**後存為 `timeRecords`。
- **相容舊後端**:缺 `time_records`(或其元素全部無效)時,MUST 退讀 legacy scalar 欄位 `time`(Unix 秒,須有限且 ≥ 0)→ `timeRecords: [time]`。
- 經上述過濾後 `timeRecords` 仍為空的 alert MUST 丟棄(沿用 partial-parse 契約,不拋例外)。
- `pod` / `service` / `id` 為選用字串,缺值則省略。
- 分組容器(`cluster` / `isStorageClass`)MUST NOT 攜帶 `alerts`(即使上游帶亦丟棄)。

下游(`AlertTable`)由 `timeRecords` 衍生:Count = `timeRecords.length`、Last occurred = `max(timeRecords)`(因升序故為末元素),不另存欄位。

#### Scenario: time_records 解析為升序 timeRecords

- **WHEN** 上游 node `alerts` 含 `{ name: 'HighMem', severity: 'critical', time_records: [1717500300, 1717500000] }`
- **THEN** 產出 `NodeAlert.timeRecords` 為 `[1717500000, 1717500300]`(升序);其 Count 衍生為 `2`、last occurred 衍生為 `1717500300`

#### Scenario: 相容 legacy scalar time

- **WHEN** 上游 alert 僅帶 `time: 1717500000`(無 `time_records`)
- **THEN** 產出 `timeRecords: [1717500000]`(等價單次發生),不報錯

#### Scenario: 過濾非有限 / 負值發生時間

- **WHEN** 上游 alert `time_records: [1717500000, -5, NaN, 1717500300]`
- **THEN** 產出 `timeRecords: [1717500000, 1717500300]`(濾掉 `-5` 與 `NaN`,升序)

#### Scenario: 丟棄無有效發生時間的 alert

- **WHEN** 上游 alert 的 `time_records` 為 `[]` 或元素全部非有限 / 負值,且無有效 scalar `time`
- **THEN** 該 alert 被丟棄,不出現於 `data.alerts`;同節點其餘合法 alert 不受影響

#### Scenario: 缺 name / severity 的 alert 丟棄

- **WHEN** 上游 alert 缺 `name` 或 `severity` 為空字串
- **THEN** 該 alert 被丟棄(即使 `time_records` 有效),其餘合法 alert 正常解析

#### Scenario: 分組容器不帶 alerts

- **WHEN** 上游 `cluster` 或 `storageclass` 節點帶 `alerts`
- **THEN** 正規化結果該節點 MUST NOT 有 `data.alerts`
