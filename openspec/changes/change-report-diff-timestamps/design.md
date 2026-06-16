## Context

node-detail 面板的 Change Report 欄目前只給「一個外部連結」(eager 預取、ready 時為 `<a href target="_blank" rel="noopener noreferrer">` anchor、unavailable 時為 muted「Not found」),使用者看不出該連結比較的是**哪兩個時間點**的變更 diff。後端即將在 `config_changes`(application-detail)與 `code_changes`(image-detail,每個 container entry)的回應內補上 diff 的兩個時間戳(current → prev),面板需把它們以兩個欄位(Current / Previous)呈現,並把兩區塊的 Change Report header 正名為語意更精確的標題(Application =「Deployment Changes」、Containers =「Code Changes」)。

既有分層必須沿用:`useNodeDetailUrls(input, endpoint)` 為集中查詢的 eager hook,經 `getBackendSrv()` 併發發出 `config_changes` + `code_changes`,於 `parseApplicationUrl` / `parseUrlByContainer` 以 anti-corruption 方式解析回傳(`isPlainObject` 守衛,格式不符即丟棄),回傳 discriminated-union 狀態給 presentational 的 `ApplicationTable` / `ContainerTable`,再由共用 `ChangeReportCell` 渲染三態。面板的 `timeZone`(`PanelProps.timeZone`)已存在一條既有路徑流到 `AlertTable`(`KsgPanel` → `NodeDetailPanel` → `AlertTable`,經 `@grafana/data` `dateTimeFormat` 格式化告警時間),本變更的時間欄沿用同一機制與慣例。

約束(不變):查詢必經 `getBackendSrv()`(不直連外部);端點名稱(`config_changes` / `code_changes`)、sibling 推導(`resolveDetailEndpoint` / `detailPaths`)、共用 input、快取語意(每端點每次開啟最多一次、僅快取成功、換節點 / 關閉清快取並中止 in-flight)、區塊 gating(kind ∈ `DETAIL_URL_KINDS` + 對應資料存在性)、右鍵 / 左鍵行為、`InteractiveTable` 帶 header 版型與失敗隔離,皆維持不變;連結欄本身(eager 預取、anchor、unavailable muted「Not found」)行為不變,只改 header 文字與新增兩個時間欄。

## Goals / Non-Goals

**Goals:**

- `config_changes` 回應由 `{ url }` 擴充為 `{ url, current_time, previous_time }`;`code_changes` 每個 container entry 由 `{ url }` 擴充為 `{ url, current_time, previous_time }`。`current_time` / `previous_time` 為 RFC 3339 / ISO 8601(UTC)字串(如 `2026-06-16T10:30:00Z`)。
- 兩時間戳為 **best-effort**:缺漏 / 非字串 / 解析失敗時該欄顯示 muted(`theme.colors.text.secondary`)「—」,**MUST NOT** 影響同列的 url anchor、其餘欄、或其餘列(沿用既有 anti-corruption:格式不符即丟棄該欄)。
- Application 與 Containers 兩表格各新增 **Current Change Time** 與 **Previous Change Time** 兩欄,呈現該 change diff 的 current → prev 時間戳。
- 呈現:以 `@grafana/data` `dateTimeFormat` 依**面板 `timeZone`** 格式化為在地化絕對時間(如 `2026-06-16 10:30:00`);完整 ISO 原字串入該 cell 的 `title`;無值 / 解析失敗 → muted「—」。
- Header 正名:Application 區塊連結欄 header → **「Deployment Changes」**;Containers 區塊連結欄 header → **「Code Changes」**。
- 維持 hook 集中查詢、表格 presentational 的既有分層;沿用既有 `timeZone` 傳遞路徑。

**Non-Goals:**

- 不改傳輸層(`getBackendSrv()`)、端點名稱、sibling 推導(`resolveDetailEndpoint` / `detailPaths` 不動)、快取語意、區塊 gating、右鍵 / 左鍵行為。
- 不改連結欄的 eager 預取、anchor、unavailable「Not found」三態行為(僅改其 header 文字)。
- 不在解析層把 RFC 3339 轉為 `Date` / `DateTime`(原字串往上帶,顯示層才格式化)。
- 不提供相對時間(如「3 天前」)或互動式時間範圍跳轉(時間欄為純呈現,不可點)。

## Decisions

### D1:時間戳解析(best-effort,沿用 anti-corruption)

`parseApplicationUrl` / `parseUrlByContainer` 在沿用 `isPlainObject` 守衛抽出 `url` 之外,額外抽出 `current_time` / `previous_time`:各欄僅當其值為**非空字串**時保留為原 RFC 3339 字串,否則該欄丟棄(置 `undefined`)。url 與兩時間戳的丟棄相互獨立——`url` 仍是「該 entry 是否可用」的唯一判準(無 url 仍視為 shape mismatch / 該列 unavailable),兩時間戳缺失不影響 url anchor。

解析層 **MUST NOT** 把 RFC 3339 轉成 `Date` / `DateTime`,只透傳原字串。`code_changes` 內部 map 的元素由 `container → url`(`Record<string, string>`)擴為 `container → { url, currentTime?, previousTime? }`。

**為何**:沿用既有 anti-corruption 模式(`isPlainObject` + 逐欄型別檢查 + 丟棄),把「契約寬鬆度」集中在解析層,讓上層狀態與 UI 不必處理髒資料。**不在解析層轉 `Date`** 是因為 (1) 時區格式化屬顯示關注點、依賴面板 `timeZone`(解析層拿不到、也不應拿),(2) `title` 需要的是**完整 ISO 原字串**,過早轉 `Date` 會丟失原字串,(3) RFC 3339 解析相容性的判定延後到 `dateTimeFormat` 一處(D3),避免解析層與顯示層各有一套寬嚴不一的解析。
**替代方案**:在解析層即轉 `DateTime` 並回傳數值 epoch——被否決,因會丟失 ISO 原字串(`title` 需要)、把時區格式化責任錯置到無 `timeZone` 的層、且讓 best-effort 失敗點分散兩處。

### D2:狀態形狀(discriminated union 攜帶時間戳)

`DetailLookup` 的 `ready` 變體由 `{ status: 'ready'; url: string }` 擴為:

```ts
| { status: 'ready'; url: string; currentTime?: string; previousTime?: string }
```

`loading` / `unavailable` 變體不變。`NodeDetailLookups.containers.byName` 仍為 `Record<string, DetailLookup>`(null-proto),其 `ready` 項自然攜帶兩時間戳;`application` 亦同。`useNodeDetailUrls` 內 `codeResult` 的 map 型別由 `Record<string, string>` 改為 `Record<string, { url: string; currentTime?: string; previousTime?: string }>`,`containers` 的 `useMemo` 在組 `byName` 時把三欄一併寫入 `ready` 項。

兩時間戳掛在 `ready` 變體上(而非 `loading` / `unavailable`):只有解析成功(必有 url)的 entry 才可能帶時間戳;loading 尚未解析、unavailable 無 entry,兩者本就不該有時間。在 `exactOptionalPropertyTypes` 下,optional `currentTime?` / `previousTime?` **不得**被賦 `undefined` 值——解析層丟棄時應「不設該鍵」而非設為 `undefined`(沿用既有 `...(cond ? { k } : {})` 慣例)。

**為何用 discriminated union 而非到處塞 optional**:沿用既有 D(eager 變更)的理由——以判別欄位 `status` 區隔三態,讓「ready 必有 url」「unavailable 無 url」在型別層即成立,避免單一 interface 帶 `url?` / `currentTime?` / `error?` 時出現「ready 卻無 url」「unavailable 卻有 time」等非法組合。把兩時間戳收進 `ready` 變體,延續同一型別保證:時間戳只在「有 entry」時存在。
**替代方案**:把 `currentTime?` / `previousTime?` 提升到 `DetailLookup` 頂層或另開平行的 `Record<string, TimePair>`——被否決,前者重新引入跨三態的非法組合,後者把「同一 entry 的 url + 兩時間」拆散到兩個 map、徒增 key 對齊風險。

### D3:顯示格式化 helper(包 `dateTimeFormat`)

新增純函式,共置於 `node-detail` feature(與表格元件同 feature),簽名約:

```ts
function formatChangeTime(iso: string | undefined, timeZone?: string): string | undefined;
```

行為:`iso` 為 `undefined` / 空字串 → 回 `undefined`;否則以 `@grafana/data` `dateTimeFormat(iso, { timeZone })` 格式化為在地化絕對時間並回傳;若 `dateTimeFormat` 判定非法日期(回 `'Invalid date'` 之類哨兵或 `dateTime(iso)` 不 `isValid()`)→ 回 `undefined`。回 `undefined` 即由 cell 呈現 muted「—」;成功時 cell 以**原 ISO 字串**入 `title`(非格式化後字串)。`timeZone` 沿用 `AlertTable` 的傳法:`timeZone !== undefined ? { timeZone } : {}`(`exactOptionalPropertyTypes`)。

**為何抽純函式**:格式化是純粹的 `(iso, timeZone) → string | undefined` 映射,抽出後可 straight Jest 直接覆蓋 best-effort 缺值 / 非法字串 / 正常路徑,且讓 cell 元件保持 dumb;`dateTimeFormat` 是 `AlertTable` 已用的同一工具,行為一致、無新依賴。**在 helper 內判非法日期**(而非信任 `dateTimeFormat` 永遠回可讀字串)是因為對非法輸入 `dateTimeFormat` 會回 `'Invalid date'`,直接顯示會洩漏壞字串;helper 收斂為 `undefined` → 統一降級為「—」。
**替代方案**:在每個 cell inline 呼叫 `dateTimeFormat`——被否決,會在兩處重複非法判定與 `timeZone` 防呆,且難以單測。

### D4:timeZone 取得與傳遞

`timeZone` 來自 `PanelProps.timeZone`,沿用既有路徑並向下延伸到時間 cell:

- `KsgPanel`:已自 props 取 `timeZone` 並傳給 `NodeDetailPanel`(現況不變)。
- `NodeDetailPanel`:已收 `timeZone?: string`(現用於 `AlertTable`);新增把它傳給 `ApplicationTable` 與 `ContainerTable`(沿用 `...(timeZone !== undefined ? { timeZone } : {})` 慣例)。
- `ApplicationTable` / `ContainerTable`:`props` 新增 `timeZone?: string`,在組 columns 時以 `formatChangeTime(state.currentTime, timeZone)` 等推導每格顯示值傳給時間 cell。

`timeZone` 維持 optional(`string | undefined`):缺省時 `dateTimeFormat` 採 Grafana 預設時區,與 `AlertTable` 對齊。

**為何沿用既有路徑**:`NodeDetailPanel → AlertTable` 已驗證可行,延伸到兩個 detail 表格一致、零新概念;`timeZone` 是面板層關注點,自上而下傳是 React 慣用做法。
**替代方案**:在表格內以 `getTemplateSrv` / 全域讀面板時區——被否決,繞過 props、難測、與既有 `AlertTable` 模式分歧。

### D5:欄位佈局、欄序與右對齊

最終欄序(後續 specs / tasks 引用此為準):

- **Application**:`Name` → `Current` → `Previous` → `Deployment Changes`(連結欄維持最右)。
- **Containers**:`Name` → `Image` → `Current` → `Previous` → `Code Changes`(連結欄維持最右)。

連結欄維持最右、`disableGrow`;`Name`(及 Containers 的 `Image`)維持既有 grow 行為(`Image` 為唯一 grow 欄,soak up 剩餘寬度;Application 的 `Name` soak up 剩餘寬度)。新增的 `Current` / `Previous` 兩欄 `disableGrow`(時間字串寬度固定、不應撐表)。

右對齊 CSS:既有 `& th:last-child { textAlign: 'right' }` 之所以成立,是因為連結欄為 last-child;新增兩時間欄後**連結欄仍為 last-child**,故該規則對連結欄 header 持續成立,無需改動。`Current` / `Previous` 兩個時間欄沿用 InteractiveTable 預設(左對齊),其 cell 內以 D6 的時間 cell 呈現;若視覺上需與右側連結欄協調,時間欄維持左對齊即可(不強加右對齊,避免與 last-child 規則衝突)。

**為何把時間欄置於連結欄左側**:連結欄是「動作」(可點外連),時間欄是「描述該 diff 的時間窗」,語意上時間先於動作;且連結欄維持 last-child 可讓既有右對齊 CSS 不動。**Current 在 Previous 左**(current → prev,由近到遠),對應提案的「current → prev」呈現順序。
**替代方案**:把時間欄放最右、連結欄移左——被否決,會破壞既有 `th:last-child` 右對齊規則並改動連結欄對齊行為(本變更明定連結欄行為不變)。

### D6:時間 cell——抽出共用 `ChangeTimeCell`

抽出共用 presentational 元件 `ChangeTimeCell`(共置於 `node-detail` feature,與 `ChangeReportCell` 同層),職責:收一個「已格式化字串或 `undefined`」與對應 ISO 原字串,渲染為「在地化絕對時間 + `title`=ISO」或 muted「—」。簽名約:`{ formatted?: string; title?: string }` 或 `{ iso?: string; timeZone?: string }` 二擇一——採**前者**(由表格先用 `formatChangeTime` 算好 `formatted`、並把 ISO 原字串作 `title` 傳入),讓 cell 保持 dumb、不重複呼叫 `dateTimeFormat`。muted「—」用 `theme.colors.text.secondary`(`themeColors(theme).text.secondary`)。

**為何抽共用 cell 而非 inline**:`Current` / `Previous`、兩個表格共四處用法形狀相同(格式化值 / muted「—」/ `title`),抽出後可單測一次、避免四處重複 muted 樣式與「—」哨兵,並與既有 `ChangeReportCell` 的「共用 cell」模式一致。把格式化留在表格、cell 只呈現,符合既有 presentational 慣例。
**替代方案**:在表格 columns 的 `cell` 渲染器 inline JSX——被否決,muted 樣式 / 哨兵 / `title` 邏輯會在四處重複,單測需透過表格繞行。

### D7:測試策略

- **純函式**:`formatChangeTime`(D3)以 straight Jest 覆蓋——正常 RFC 3339(UTC)→ 依 `timeZone` 在地化絕對時間;`undefined` / 空字串 → `undefined`;非法字串(如 `"not-a-date"`)→ `undefined`;`timeZone` 缺省路徑。解析層(D1)`parseApplicationUrl` / `parseUrlByContainer` 以 straight Jest 覆蓋——三欄齊全;缺時間戳(僅 url)；非字串 / 空字串時間戳被丟棄但 url 保留;non-object payload → undefined;malformed container entry 丟棄。
- **cell component**:`ChangeTimeCell`(`@testing-library/react`)——格式化值呈現 + `title`=ISO;`undefined` → muted「—」且無 `title`。
- **表格 component**:`ApplicationTable` / `ContainerTable`(`@testing-library/react`)——驗證新欄序(Name/Current/Previous/Deployment Changes、Name/Image/Current/Previous/Code Changes)、header 文字正名、ready 列同時呈現 anchor + 兩時間、best-effort 缺時間戳列呈現「—」但 anchor 不受影響、both tables 覆蓋。
- **hook**:`useNodeDetailUrls` 既有測試擴充——`ready` 狀態攜帶 `currentTime` / `previousTime`;後端缺時間戳時 `ready` 不帶兩欄;`code_changes` map 元素新形狀。

**為何此策略**:沿用專案既有分層(純函式 straight Jest、元件 `@testing-library/react`),把 best-effort 降級的關鍵分支集中在純函式與 cell 層快速覆蓋,表格層只驗欄序 / header / 整合;符合 CLAUDE.md 測試慣例。

## Risks / Trade-offs

- **後端尚未交付時間戳** → best-effort 優雅降級:解析層丟棄缺漏 / 非字串時間戳(D1),`ready` 不帶兩欄,cell 顯示 muted「—」,url anchor 與其餘欄、其餘列完全不受影響(D6)。本變更前端可先上線,後端交付後時間自然顯現,無需再改前端。
- **`dateTimeFormat` 時區 / DST 邊界** → 一律以後端的 RFC 3339(UTC,自帶 `Z` 偏移)為輸入,時區換算只發生在 `dateTimeFormat` 一處、依面板 `timeZone`(D3/D4),與 `AlertTable` 同一工具同一語意;DST 由 `@grafana/data` 處理,面板不自行做日期算術,避免重複實作偏移邏輯。
- **RFC 3339 解析相容性**(後端可能回帶毫秒 / 不同秒精度 / 偏移寫法) → 解析層只做「是否非空字串」判定、不解析語意(D1),實際合法性交給 `dateTimeFormat`;`formatChangeTime` 對任何 `dateTimeFormat` 判為非法的輸入收斂為 `undefined` → muted「—」(D3),故非預期格式最壞只降級為「—」,絕不顯示 `Invalid date` 或拋錯。
- **欄數增加可能在窄面板擠壓** → 兩時間欄 `disableGrow`(D5),寬度貼合內容;`Name` / `Image` 仍為 grow 欄吸收剩餘寬度;連結欄維持最右 `disableGrow`,既有右對齊與對齊節奏不變。

## Migration Plan

純前端面板行為變更 + 跨 repo 後端契約擴充(向後相容:`current_time` / `previous_time` 為新增欄,缺漏即 best-effort 降級,舊回應仍正常運作)。實作分兩面:

1. **面板(本 repo)**:擴充解析(D1)、狀態形狀(D2)、新增 `formatChangeTime`(D3)與 `ChangeTimeCell`(D6)、表格新增兩欄並正名 header(D5)、`timeZone` 串接(D4)、各層測試(D7)。
2. **後端(kube-state-graph,跨 repo)**:`config_changes` / `code_changes` 回傳新增 `current_time` / `previous_time`(RFC 3339 UTC)——須與 backend 協調交付;在交付前面板以「—」降級,不阻塞前端上線。

**Archive 順序依賴(MUST)**:baseline `panel-rendering` spec 目前仍為 **lazy**(`window.open`)版本;eager 變更 `eager-change-report-prefetch` 的 delta **尚未 archive、未套用到 baseline**。本變更**建構於 eager**(eager 預取 + 真實 anchor)之上,其 spec delta 以 eager 後的現實為基準。故 archive 順序 **MUST** 為:

1. 先 archive `eager-change-report-prefetch`(把 eager delta 套進 baseline `panel-rendering`)。
2. 再 archive 本變更 `change-report-diff-timestamps`。

若順序顛倒,本變更的 delta 會疊在 lazy baseline 上、產生不一致或衝突的 `panel-rendering` 規格。

## Open Questions

- **欄標題確定為 Current / Previous?** 目前定為英文 `Current` / `Previous`(沿用面板既有英文 header 慣例 `Name` / `Image`)。是否需更明確的措辭(如 `Current image` / `Previous image`、`Changed at` / `Previously`)以避免「Current 指什麼」的歧義?
- **是否要相對時間 tooltip?** 目前 `title` 為完整 ISO 原字串(絕對時間,可複製);是否另需相對時間(如「3 天前」)作為輔助提示,或維持純絕對時間以避免實作 relative-time 與其刷新?(現列為 Non-Goal)
- **兩時間欄是否需與右側連結欄協調對齊?**(D5 暫定左對齊)若視覺評審要求時間欄右對齊,需評估如何在不破壞「連結欄為 last-child 右對齊」既有 CSS 的前提下,對 `Current` / `Previous` 兩個 `<th>` 單獨加右對齊規則(以 column id 對應 nth-child,而非 last-child)。
