## Why

node-detail 面板的 Change Report 欄目前只給「一個外部連結」,使用者看不出該連結比較的是**哪兩個時間點**的變更 diff,也看不出該 code change 的**變更型別**(新增 / 更新 / 取代 / 移除 / 重新命名…)。後端即將在 `config_changes` / `code_changes` 回應內補上該 diff 的兩個時間戳(current → prev),並在 `code_changes` 每個 container entry 補上 `result_type`(變更型別)。面板需把時間戳以兩個欄位呈現、把 `result_type` 以一個彩色 **Change Type** 欄呈現(僅 Containers),讓使用者一眼看出變更比較的時間窗與變更性質。同時把兩區塊的 Change Report header 正名為語意更精確的標題(Application = Deployment Changes、Containers = Code Changes)。

## What Changes

- **查詢契約擴充(後端,跨 repo)**:
  - `config_changes`(application-detail)回應由 `{ "url": string }` 擴充為 `{ "url": string, "current_time": string, "previous_time": string }`。
  - `code_changes`(image-detail)每個 container entry 由 `{ "url": string }` 擴充為 `{ "url": string, "current_time": string, "previous_time": string, "result_type": string }`。
  - `current_time` / `previous_time` 為 **RFC 3339 / ISO 8601(UTC)** 字串(如 `2026-06-16T10:30:00Z`)——自描述時區、無秒/毫秒歧義、`@grafana/data` 可直接解析、與後端既有 `start`/`end` 接受 RFC 3339 一致。
  - `result_type`(僅 `code_changes`)為變更型別字串,已知列舉值 `UNCHANGED` / `UPDATED` / `REPLACED` / `ADDED` / `REMOVED` / `RENAMED`(大寫)。
  - 兩時間戳與 `result_type` 皆為 **best-effort**:缺漏 / 非字串 / 解析失敗時該欄顯示 muted「—」,**MUST NOT** 影響 url anchor 與其餘欄(沿用既有 anti-corruption 解析:格式不符即丟棄該欄);`result_type` 為未知值時照原字串以中性灰渲染(visible-by-default,不靜默丟棄)。
- **新增欄位(時間欄兩表格皆加)**:Application 與 Containers 兩表格各新增 **Current Change Time** 與 **Previous Change Time** 兩欄,呈現該 change diff 的 current → prev 時間戳。
- **新增欄位(Change Type,僅 Containers)**:Containers 表格新增一個 **Change Type** 欄(置於 Image 與 Current Change Time 之間),呈現該 container 的 `result_type`。
- **呈現(時間)**:時間以 Grafana `dateTimeFormat`(依面板 `timeZone`)格式化為**在地化絕對時間**(如 `2026-06-16 10:30:00`),完整 ISO 字串入 `title`;無值 / 解析失敗顯示 muted「—」。
- **呈現(Change Type)**:以**彩色文字**(非 badge 底色)渲染——已知列舉值依單一來源色彩映射(`shared/constants/colorByResultType.ts`,鏡像 `colorBySeverity`)上色(ADDED=綠 / REMOVED=紅 / UPDATED=藍 / REPLACED=橘 / RENAMED=紫 / UNCHANGED=灰),未知值以中性灰 fallback 呈現,缺漏 / 非字串 / 空字串顯示 muted「—」;色彩查找對大小寫不敏感、顯示一律大寫。色彩來源為 hardcoded hex(與面板既有 `STATUS_COLOR` / `SEVERITY_COLOR` 產品決定一致)。
- **Header 正名**:Application 區塊原 Change Report header → **「Deployment Changes」**;Containers 區塊原 Change Report header → **「Code Changes」**。連結欄的 eager 預取、`<a href target="_blank" rel="noopener noreferrer">` anchor、unavailable muted「Not found」提示等行為不變,僅 header 文字改變。
- **不變**:查詢時機(eager 預取,右鍵開啟即併發)、傳輸(`getBackendSrv()`)、端點名稱(`config_changes` / `code_changes`)、sibling 推導(`resolveDetailEndpoint` / `detailPaths`)、快取語意(每端點每次開啟最多一次、僅快取成功、換節點/關閉清快取並中止 in-flight)、區塊 gating(kind + 資料存在性)、右鍵/左鍵行為、`InteractiveTable` 帶 header 版型與失敗隔離。

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `panel-rendering`: 修改「Node Detail Application 與 Containers 區塊」需求——(1)查詢契約擴充(`config_changes` / `code_changes` 回傳新增 RFC 3339 `current_time` / `previous_time`,best-effort;`code_changes` 另新增 `result_type` best-effort);(2)兩表格各新增 **Current** / **Previous** 欄(在地化絕對時間、完整 ISO 入 `title`、無值 muted「—」);(3)Containers 表格新增 **Change Type** 欄(彩色文字、已知列舉語義色、未知中性灰、無值 muted「—」;Application 無此欄);(4)Change Report header 正名(Application →「Deployment Changes」、Containers →「Code Changes」);(5)更新對應的表格版型 scenario(欄位集合與 header 文字)並新增時間戳與 Change Type 呈現的 scenario。

## Impact

- `src/features/node-detail/hooks/useNodeDetailUrls.ts`:`parseApplicationUrl` / `parseUrlByContainer` 擴充解析兩時間戳(best-effort,沿用 `isPlainObject` 守衛);`parseUrlByContainer` 另解析 `result_type`(best-effort,僅 containers);`DetailLookup` 的 `ready` 變體攜帶 `currentTime?` / `previousTime?`(RFC 3339 原字串)/ `resultType?`;containers 內部 map 由 `container → url` 擴為 `container → { url, currentTime?, previousTime?, resultType? }`。及其測試。
- 新增**時間格式化 helper**(包 `@grafana/data` `dateTimeFormat`,依面板 `timeZone` 將 RFC 3339 字串轉為在地化絕對時間;非法字串回 undefined)——共置於 `node-detail` feature。
- 新增**變更型別色彩映射** `src/shared/constants/colorByResultType.ts`(鏡像 `colorBySeverity`:已知列舉 → hardcoded hex map + 中性灰 fallback + `resultTypeColor()` lookup,大小寫不敏感)。及其測試。
- 新增**Change Type cell** `src/features/node-detail/components/ChangeTypeCell/`(presentational:有值 → 彩色原字串、無值 → muted「—」;鏡像 `ChangeTimeCell`)。及其測試。
- `src/features/node-detail/components/ApplicationTable/`、`.../ContainerTable/`:ApplicationTable 新增 **Current** / **Previous** 兩欄;ContainerTable 新增 **Change Type** / **Current** / **Previous** 三欄;兩表格 Change Report header 文字正名、右緣對齊 CSS 確認(連結欄維持 `th:last-child`)。及其測試。
- `src/features/node-detail/components/ChangeReportCell/`:維持連結 anchor 欄職責;新增時間欄 cell(抽出共用 `ChangeTimeCell` 呈現格式化時間 / muted「—」)。
- 面板層需把 `timeZone`(panel props)傳達至格式化 helper(`KsgPanel` → NodeDetailPanel → 表格)。
- 不變:`resolveDetailEndpoint.ts`、`detailPaths.ts`、傳輸層、`graph-data-integration` 規格(端點名稱 / sibling 推導 / 傳輸不動,只擴充回傳欄位)。
- **後端(kube-state-graph)**:`config_changes` / `code_changes` 需回傳 `current_time` / `previous_time`(RFC 3339 UTC);`code_changes` 每個 container entry 另需回傳 `result_type`(變更型別字串)——跨 repo 契約變更,須與 backend 協調交付。
