# panel-rendering delta — edge-red-metrics

## ADDED Requirements

### Requirement: Hover Tooltip 顯示邊 RED metrics

當使用者 hover 於一條**帶有 `data.metrics`** 的邊時,`HoverTooltip` MUST 在既有 `edgeType` row **之後**、`labels` 分隔線**之前**,依序追加最多三個 promoted attr rows(key 名為固定英文 UI 字串):

| row key | 來源欄位 | 顯示格式 |
| --- | --- | --- |
| `rate` | `metrics.rate` | `<value> req/s` |
| `errorRate` | `metrics.errorRate` | `<value×100>%` |
| `duration(p90)` | `metrics.p90ServerMs` | `< 1000` 時 `<value> ms`;`>= 1000` 時換算為 `<value/1000> s` |

數值格式化規則(three 個 row 共用同一組純函式):

- 數值 MUST 以最多 **3 位有效數字**呈現,尾隨的零 MUST 去除(`5` 不是 `5.00`、`3.2` 不是 `3.20`)。
- **非零值 MUST NOT 被格式化為 `0`**:捨入只可損失位數,MUST NOT 損失量級。極小值(例如 `3.86e-7` req/s、`6.7e-8` 比例)MUST 以完整小數或指數表示法保留其量級,由該值的數量級決定採用何者。
- `errorRate` 為比例(`[0,1]`),顯示前 MUST 乘以 100 並附 `%`;`0` MUST 顯示為 `0%`(代表「已量測且無失敗」)。

失敗強調規則:`errorRate` 為**已量測且非零**(`errorRate !== 0`)時,該 row 的**值** MUST 以 theme 的 error 色呈現,key 維持 secondary 色以免整列脫離清單節奏。判斷 MUST 依**數值本身**而非格式化後的字串——`6.7e-8` 呈現為 `0.0000067%`,仍是真實的失敗比例。`errorRate: 0` MUST 維持中性色;`errorRate` 缺席時 MUST 不產生任何 row(故亦無顏色)。其餘 row(`rate` / `duration(p90)`)MUST NOT 著色。

省略規則:

- 邊**無** `data.metrics` 時,tooltip MUST 與現況完全一致——不顯示任何 RED row、不顯示標題、不顯示 `N/A` 之類的 placeholder。
- `metrics` 存在但 `errorRate` 不存在時 MUST NOT 顯示 `errorRate` row(**尤其 MUST NOT 顯示 `0%`**:省略代表「未能量測」,與量測到 0 是不同狀態)。`p90ServerMs` 不存在時同理不顯示 `duration(p90)` row。
- RED 值 MUST NOT 出現在 `labels` 區塊——它們來自 `data.metrics`,不是後端 labels map。

RED 僅影響 hover 浮動模式下的**邊** tooltip。pinned 釘選模式僅適用於被選取的**節點**,故不受本需求影響;畫布上的邊顏色、線寬、線型與 label MUST NOT 因 RED 而改變。

#### Scenario: Hover 帶完整 RED 的邊顯示三列

- **WHEN** 使用者 hover 於一條 `edgeType: 'pod-calls-service'`、`data.metrics = { rate: 5, errorRate: 0.2, p90ServerMs: 45 }` 的邊
- **THEN** tooltip 依序顯示 `edgeType: pod-calls-service`、`rate: 5 req/s`、`errorRate: 20%`、`duration(p90): 45 ms`
- **AND** 三個 RED row 位於 `edgeType` 之後、`labels` 分隔線之前

#### Scenario: 無 metrics 的邊維持現況

- **WHEN** 使用者 hover 於一條 `pod-mounts-pvc` 邊(無 `data.metrics`)
- **THEN** tooltip 僅顯示 `source → target` title、`edgeType` row 與既有 labels,無任何 RED row、無 placeholder

#### Scenario: 省略的 errorRate 不顯示為 0%

- **WHEN** 使用者 hover 於一條 `data.metrics = { rate: 3 }` 的邊(`errorRate` / `p90ServerMs` 皆不存在)
- **THEN** tooltip 僅追加 `rate: 3 req/s` 一列;MUST NOT 出現 `errorRate` 或 `duration(p90)` row

#### Scenario: 量測到零失敗顯示 0%

- **WHEN** 使用者 hover 於一條 `data.metrics = { rate: 1, errorRate: 0 }` 的邊
- **THEN** tooltip 顯示 `errorRate: 0%`(與上一情境的「不顯示」明確區分)
- **AND** 該值以中性文字色呈現,MUST NOT 使用 error 色

#### Scenario: 非零失敗率以 error 色標示

- **WHEN** 使用者 hover 於一條 `data.metrics = { rate: 5, errorRate: 0.2 }` 的邊
- **THEN** `errorRate` row 的**值**以 theme 的 error 色呈現,key 維持既有 secondary 色
- **AND** 同一 tooltip 中的 `rate` 與 `duration(p90)` row MUST NOT 被著色

#### Scenario: 極小值不被格式化為 0

- **WHEN** 使用者 hover 於一條 `data.metrics = { rate: 3.86e-7, errorRate: 6.7e-8 }` 的邊
- **THEN** `rate` row 顯示 `3.86e-7 req/s`(指數表示法),`errorRate` row 顯示 `0.0000067%`(完整小數)
- **AND** 兩者 MUST NOT 顯示為 `0 req/s` / `0%`
- **AND** 該 `errorRate` 仍以 error 色呈現(著色依數值 `6.7e-8 !== 0`,非依格式化字串)

#### Scenario: 長耗時以秒呈現

- **WHEN** 使用者 hover 於一條 `data.metrics.p90ServerMs = 2500` 的邊
- **THEN** `duration(p90)` row 顯示 `2.5 s`(而非 `2500 ms`)

#### Scenario: RED 不改變畫布視覺

- **WHEN** 圖中同時存在帶 RED 與不帶 RED 的邊
- **THEN** 兩者的線色、線寬、線型、箭頭與 canvas label 完全依既有 edge-type / ingressPath / relation 規則決定,與 `metrics` 無關
