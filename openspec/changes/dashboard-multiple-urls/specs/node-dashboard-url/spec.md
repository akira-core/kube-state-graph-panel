## MODIFIED Requirements

### Requirement: Dashboard URL 預取、端點解析與可用性判定

當 node-detail 面板**開啟**(**左鍵 alerts view 或右鍵 detail view 皆然**)時,Panel SHALL **eager-prefetch** 一次 `GET <base>/dashboard`,**每個被開啟節點最多一次**(at-most-once per opened node;同值 data refresh MUST NOT 重發),經 Grafana runtime(`@grafana/runtime` `getBackendSrv()`)發往同一 graph API backend——MUST NOT 自 `src/**` 直接以 `fetch` / `axios` / `XMLHttpRequest` 連線外部 backend。此預取與右鍵專屬的 `config_changes` / `code_changes`(application-detail / image-detail)查詢**互相獨立**:Dashboard 預取的觸發條件為**面板開啟**而非右鍵,故左鍵 alerts view 亦會發出。

可用性 MUST 嚴格以 **HTTP 200 + 至少一筆非空連結** 判定:回傳 body 經 `parseDashboardLinks` 解析後得到**一筆或以上** `{ label, url }`(`url` 皆非空) → **available**;非 200、解析結果為空、回應格式錯誤、或網路錯誤 → **unavailable**(按鈕**不渲染**,且 MUST NOT 對使用者顯示任何錯誤訊息)。

回應格式:

- **新格式**:`{ "urls": [{ "label"?: string, "url": string }, …] }` — 略過無效項目;`label` 缺省時由 panel 補 fallback。
- **舊格式(向後相容)**:`{ "url": string }` — 視為單一連結 `[{ label: "Dashboard", url }]`。
- 當 `urls` 為非空陣列時 MUST **優先**採用 `urls`;僅在 `urls` 缺漏或過濾後為空時才 fallback 至 `url`。

#### Scenario: 200 + urls 陣列視為可用

- **WHEN** `/dashboard` 回傳 HTTP 200 且 body 為 `{ "urls": [{ "label": "Metrics", "url": "https://a" }, { "label": "Logs", "url": "https://b" }] }`
- **THEN** 該查詢狀態為 available,`DashboardLookup` 為 `{ status: 'ready', urls: […] }`(兩筆)

#### Scenario: 200 + 非空 url(舊格式)視為可用

- **WHEN** `/dashboard` 回傳 HTTP 200 且 body 為 `{ "url": "https://…" }`(`url` 非空)
- **THEN** 該查詢狀態為 available,`urls` 為單元素陣列 `[{ label: "Dashboard", url }]`

#### Scenario: 空 urls / 空 url / 格式錯誤視為不可用且不報錯

- **WHEN** `/dashboard` 回 `{ "urls": [] }`、或 `{ "url": "" }`、或回應非物件、或網路失敗
- **THEN** 該查詢狀態為 unavailable,Dashboard 按鈕 MUST NOT 渲染,且 MUST NOT 顯示任何錯誤訊息

### Requirement: Dashboard 按鈕呈現

當某節點的 `/dashboard` 查詢為 **available** 時,Panel SHALL 於 node-detail 面板 **header 的節點名稱旁**渲染 Dashboard 入口,且在 **`alerts`(左鍵)與 `detail`(右鍵)兩個 view 皆顯示**。查詢為 **loading** 或 **unavailable** 時 MUST 不渲染任何按鈕(無 spinner、無錯誤、無 placeholder)。

- **單一連結**(`urls.length === 1`):MUST 渲染一顆 `LinkButton` 文案 **Dashboard**,以新分頁開啟該 `url`(`target="_blank"`、`rel="noopener noreferrer"`)。
- **多個連結**(`urls.length >= 2`):MUST 渲染一顆 **Dashboards** 觸發鈕與下拉 `Menu`,每個項目顯示對應 `label`,點擊以新分頁開啟該 `url`。

#### Scenario: 單一連結維持 Dashboard 按鈕

- **WHEN** `/dashboard` 解析為一筆連結
- **THEN** header 顯示文案為 **Dashboard** 的連結按鈕

#### Scenario: 多連結顯示 Dashboards 選單

- **WHEN** `/dashboard` 解析為兩筆或以上連結
- **THEN** header 顯示 **Dashboards** 觸發鈕;展開後每個 `label` 可點擊並以新分頁開啟對應 `url`
