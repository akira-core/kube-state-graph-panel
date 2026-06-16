## Why

node-detail 面板的 Change Report 欄目前只給「一個外部連結」,使用者看不出該連結比較的是**哪兩個時間點**的變更 diff。後端即將在 `config_changes` / `code_changes` 回應內補上該 diff 的兩個時間戳(current → prev),面板需把它們以兩個欄位呈現,讓使用者一眼看出變更比較的時間窗。同時把兩區塊的 Change Report header 正名為語意更精確的標題(Application = Deployment Changes、Containers = Code Changes)。

## What Changes

- **查詢契約擴充(後端,跨 repo)**:
  - `config_changes`(application-detail)回應由 `{ "url": string }` 擴充為 `{ "url": string, "current_time": string, "previous_time": string }`。
  - `code_changes`(image-detail)每個 container entry 由 `{ "url": string }` 擴充為 `{ "url": string, "current_time": string, "previous_time": string }`。
  - `current_time` / `previous_time` 為 **RFC 3339 / ISO 8601(UTC)** 字串(如 `2026-06-16T10:30:00Z`)——自描述時區、無秒/毫秒歧義、`@grafana/data` 可直接解析、與後端既有 `start`/`end` 接受 RFC 3339 一致。
  - 兩時間戳為 **best-effort**:缺漏 / 非字串 / 解析失敗時該欄顯示 muted「—」,**MUST NOT** 影響 url anchor 與其餘欄(沿用既有 anti-corruption 解析:格式不符即丟棄該欄)。
- **新增欄位(兩表格皆加)**:Application 與 Containers 兩表格各新增 **Current Change Time** 與 **Previous Change Time** 兩欄,呈現該 change diff 的 current → prev 時間戳。
- **呈現**:時間以 Grafana `dateTimeFormat`(依面板 `timeZone`)格式化為**在地化絕對時間**(如 `2026-06-16 10:30:00`),完整 ISO 字串入 `title`;無值 / 解析失敗顯示 muted「—」。
- **Header 正名**:Application 區塊原 Change Report header → **「Deployment Changes」**;Containers 區塊原 Change Report header → **「Code Changes」**。連結欄的 eager 預取、`<a href target="_blank" rel="noopener noreferrer">` anchor、unavailable muted「Not found」提示等行為不變,僅 header 文字改變。
- **不變**:查詢時機(eager 預取,右鍵開啟即併發)、傳輸(`getBackendSrv()`)、端點名稱(`config_changes` / `code_changes`)、sibling 推導(`resolveDetailEndpoint` / `detailPaths`)、快取語意(每端點每次開啟最多一次、僅快取成功、換節點/關閉清快取並中止 in-flight)、區塊 gating(kind + 資料存在性)、右鍵/左鍵行為、`InteractiveTable` 帶 header 版型與失敗隔離。

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `panel-rendering`: 修改「Node Detail Application 與 Containers 區塊」需求——(1)查詢契約擴充(`config_changes` / `code_changes` 回傳新增 RFC 3339 `current_time` / `previous_time`,best-effort);(2)兩表格各新增 **Current** / **Previous** 欄(在地化絕對時間、完整 ISO 入 `title`、無值 muted「—」);(3)Change Report header 正名(Application →「Deployment Changes」、Containers →「Code Changes」);(4)更新對應的表格版型 scenario(欄位集合與 header 文字)並新增時間戳呈現的 scenario。

## Impact

- `src/features/node-detail/hooks/useNodeDetailUrls.ts`:`parseApplicationUrl` / `parseUrlByContainer` 擴充解析兩時間戳(best-effort,沿用 `isPlainObject` 守衛);`DetailLookup` 的 `ready` 變體攜帶 `currentTime?` / `previousTime?`(RFC 3339 原字串);containers 內部 map 由 `container → url` 擴為 `container → { url, currentTime?, previousTime? }`。及其測試。
- 新增**時間格式化 helper**(包 `@grafana/data` `dateTimeFormat`,依面板 `timeZone` 將 RFC 3339 字串轉為在地化絕對時間;非法字串回 undefined)——共置於 `node-detail` feature。
- `src/features/node-detail/components/ApplicationTable/`、`.../ContainerTable/`:新增 **Current** / **Previous** 兩欄、Change Report header 文字正名、右緣對齊 CSS 調整(連結欄不再必為 `th:last-child`)。及其測試。
- `src/features/node-detail/components/ChangeReportCell/`:維持連結 anchor 欄職責;新增時間欄 cell(評估抽出共用 `ChangeTimeCell` 呈現格式化時間 / muted「—」)。
- 面板層需把 `timeZone`(panel props)傳達至格式化 helper(`KsgPanel` → NodeDetailPanel → 表格)。
- 不變:`resolveDetailEndpoint.ts`、`detailPaths.ts`、傳輸層、`graph-data-integration` 規格(端點名稱 / sibling 推導 / 傳輸不動,只擴充回傳欄位)。
- **後端(kube-state-graph)**:`config_changes` / `code_changes` 需回傳 `current_time` / `previous_time`(RFC 3339 UTC)——跨 repo 契約變更,須與 backend 協調交付。
