# graph-data-integration Delta Spec

## MODIFIED Requirements

### Requirement: 載入與錯誤狀態傳遞

`useGraphData` hook SHALL 對外公開 `{ elements, error, hasPayload }` 三個欄位;載入狀態由 `PanelProps.data.state` 直接判斷(無需 hook 重複封裝),錯誤狀態由 `PanelProps.data.errors[0]` 或 normalize 失敗訊息提供。`hasPayload` MUST 區分「frames 中完全沒有可辨識的 graph payload」(空 series、隱藏/未執行的查詢、所有字串候選皆無法解析 → `false`)與「payload 成功載入但正規化出零元素」(真正的空 graph → `true`):帶副作用的下游消費者(如 pod-list 變數匯出)據此避免把「沒拿到資料」當成「graph 是空的」。

#### Scenario: Hook 取資料並 normalize

- **WHEN** Panel mount 並收到 `PanelProps.data.series` 含 JSON 欄位(Infinity datasource 預設形式)
- **THEN** `useGraphData` 的 `extractJsonFromFrames` 掃描所有 frame/field,挑出**看起來像 graph payload 的值**(物件含 `elements` 或同時含 `nodes`/`edges`,或可 `JSON.parse` 為此形狀的字串),套 `normalizeGraph`,回傳 `{ elements: [...], error: undefined, hasPayload: true }`;掃描 MUST 略過 `apiVersion`(字串)與 `clusters`(陣列)等非 graph 欄位,避免誤取

#### Scenario: Hook 在 normalize 失敗時公開 error

- **WHEN** `normalizeGraph` 回傳含 errors 的結果(payload 形狀錯誤)
- **THEN** `useGraphData` 回傳 `{ elements: [], error: '<first error message>', hasPayload: true }`

#### Scenario: 無 payload 與空 graph 可區分

- **WHEN** `data.series` 為空陣列(隱藏/未執行的查詢),或所有候選字串皆無法解析
- **THEN** `useGraphData` 回傳 `hasPayload: false`;而收到 `{ nodes: [], edges: [] }` 的合法空 payload 時回傳 `hasPayload: true`
