## Context

`useNodeDetailUrls(input, endpoint)` 目前以 `useEffect` 在 `input`(右鍵建立)變化時**立即併發**送出 `config_changes` + `code_changes` 兩查詢,回傳 `{ loading, applicationUrl, urlByContainer, applicationError, containersError }`。`ApplicationTable` / `ContainerTable` 為 presentational:依 `loading` / `url` / `error` 渲染——成功時為預解析的 `LinkButton`(`<a href target=_blank>`),失敗時僅顯示錯誤訊息(不渲染按鈕)。

問題:backend 未實作該兩端點(404)時,右鍵一開面板,Change Report 欄即全部變「Not Found」。使用者預期預設只見可點按鈕,點擊才查、非 200 才顯示 Not Found。本變更把「右鍵即發」改為「點擊才發」(lazy),設計上反轉既有 D5。

約束(不變):查詢必經 `getBackendSrv()`(不直連外部);endpoint 解析沿用 `resolveDetailEndpoint`(option 覆寫 → datasource proxy 推導 → 空則停用);查詢契約(路徑、回傳格式、共用 input)不變;右鍵抑制原生選單、左鍵不查詢、區塊 gating(kind + 資料存在性)不變。

## Goals / Non-Goals

**Goals:**

- 預設(右鍵開面板)不發查詢、不顯示 Not Found,只呈現可點的 Change Report 按鈕。
- 每顆按鈕獨立的 idle → loading → 成功(開新分頁)/ 失敗(顯示 Not Found、可重試)狀態機。
- Application 與 Containers 兩區塊一致採用此 lazy 行為。
- 保持 hook 集中查詢、表格 presentational 的既有分層。
- panel 開啟期間每個端點**最多呼叫一次**:`code_changes` 回的是整包 container→URL map,所有 container 列共用同一次呼叫的結果(後續點擊重用已解析的 promise、不再發 API);`config_changes` 同。關閉 panel / 換節點清快取。

**Non-Goals:**

- 不改 endpoint 解析、查詢契約、傳輸層(`getBackendSrv()`)。
- 不快取**失敗**結果(非 200 / 格式錯誤不入快取,仍可重試)。
- 不改右鍵/左鍵 gating、區塊顯示條件、Alerts view。
- 不在面板內 inline 呈現成功 URL(成功即開新分頁)。

## Decisions

### D1:`useNodeDetailUrls` 改為 imperative hook(而非 effect eager)

回傳:

```ts
interface ChangeReportState {
  status: 'idle' | 'loading' | 'error';
  error?: string;
}
interface NodeDetailLookups {
  enabled: boolean; // input 為空或 endpoint '' → false(按鈕停用、永不查詢)
  application: ChangeReportState;
  containers: Record<string, ChangeReportState>; // 以 container name 為 key;缺 key = idle
  openApplicationReport: () => void; // 查 config_changes → 開頁 | error
  openContainerReport: (container: string) => void; // 查 code_changes → 開該列 | error
}
```

`openApplicationReport()`:`enabled` 為 false 則 no-op;否則設 application=loading,`getBackendSrv().get(config_changes, input)`;成功且解析出有效 URL → `window.open` 後回 idle;失敗/格式錯誤 → application=error(訊息)。`openContainerReport(name)` 同理,但成功後在回傳 map 找 `name`:有 → 開頁;無 → 該列 error「Not Found」。

換節點(input key 變)時以 `useEffect` 重置所有狀態回 idle,並中止任何 in-flight 查詢(`AbortController`)。

**為何**:查詢時機需由使用者手勢(點擊)決定,imperative 觸發最直接;集中於 hook 維持表格 presentational(替代方案:把 `getBackendSrv` 下放表格——會把 fetch/endpoint 散到 leaf 元件,破壞既有分層,否決)。附帶好處:查詢不再在掛載時發出,React StrictMode 雙掛載自然不重複查詢,可移除既有 abort-on-double-mount 的繞法。

### D2:成功以 `window.open` 開新分頁(取代預解析 `<a href>`)

URL 在點擊查詢回來前未知,無法再用預解析連結。成功時 `window.open(url, '_blank', 'noopener,noreferrer')`。eslint 設定無 `window.open` 禁用規則(原 code 之「never window.open」僅為當時設計註記)。

**為何**:符合使用者選定的「點擊 → 直接開報告」單擊流程。替代方案(先 reveal URL 再二次點擊)可免彈窗攔截,但使用者明確選擇單擊開頁。

### D5:Change Report 按鈕釘於欄右緣、提示置於左側(維持兩區塊上下對齊)

兩區塊的 Change Report 欄皆 `disableGrow` 靠右,既有規格要求其**上下對齊**。最初把 loading/error 提示放在按鈕**右側**(`[button][hint]`),會在提示出現時把按鈕往左推——實測(Playwright bounding box)顯示:全 idle 時兩區塊按鈕對齊(Δ=0),但一旦兩區塊狀態不同(例:點了 Application、Containers 仍 idle),按鈕錯位 **42px**。改為 `urlCell { justifyContent: flex-end }` 並把提示渲染在按鈕**左側**(`[hint][button]`):按鈕恆貼齊 cell 右緣 = 欄右緣 = 面板右緣,故跨列、跨區塊、跨狀態(含混合)皆對齊。

**為何**:固定欄寬會截斷較長的錯誤訊息;右釘按鈕 + 左置提示在不犧牲訊息可讀性下,robust 地還原「兩區塊 Change Report 上下對齊」。jsdom 無法量版面,對齊以 Playwright bounding-box 量測佐證,單元測試僅鎖定 DOM 順序(提示在按鈕之前)。

### D6:每個端點每次開啟最多呼叫一次(成功快取、共用 in-flight promise)

`code_changes` 一次回傳整包 container→URL map,但最初版每點一個 container 就重打一次、只取所點列。改為:hook 以 request key 為界,用 ref 快取該端點**成功**回應的 promise(`appCacheRef` / `codeCacheRef`)——第一次點擊建立並快取 promise,其後任一 container 點擊**重用同一 promise**(連續快點也只打一次,因共用的是 in-flight promise 而非已解析值)。失敗(reject / 格式錯誤→reject)**不入快取**(`promise.catch` 清掉該 slot),故仍可重試;成功 map 中缺某 container = 該列確定性「Not Found」(用快取、不重打)。快取掛在既有 `[key]` effect cleanup,換節點 / unmount(關閉 panel)時與 in-flight abort 一併清除。

**為何**:後端已把整包資料一次回傳,逐列重打是浪費;共用快取讓「開啟期間每個端點一次」成立,同時保留失敗可重試與換節點重取的正確性。

### D3:失敗保留按鈕、旁顯「Not Found」(可重試)

既有規格為「失敗僅顯示錯誤訊息、不渲染按鈕」,理由是「停用按鈕配 Not Found 像壞 UI」。lazy 模式下按鈕是**可點的觸發器**(非停用),失敗後保留按鈕 + 旁顯 Not Found 讀作「試過、失敗、可再點重試」,語意正當。

### D4:按鈕由 `LinkButton` 改 `Button` + `onClick`

無 `href` 可言(點擊才查),改用 `@grafana/ui` `Button`(`size=sm` `fill=outline` `variant=secondary` `icon=external-link-alt`),`onClick` 呼叫對應觸發函式;`enabled` 為 false 或 `status==='loading'` 時 `disabled`。`data-testid`(`application-url-button` / `container-url-button`)維持,既有測試之 `href`/`target`/`rel` 斷言改為點擊行為斷言。移除成功 inline 結果槽(`*-url-result`)。

## Risks / Trade-offs

- **彈窗攔截**:async fetch 之後呼叫 `window.open` 可能被瀏覽器擋(transient activation 通常於數秒內仍有效,查詢快多半 OK)→ Mitigation:`window.open` 回 `null` 時設 error 狀態顯示「Pop-up blocked」提示,使用者可重試或允許彈窗。
- **每次點擊各自查 `code_changes`(回整個 map 卻只用一列)**→ Mitigation:container 數極少(通常 1–3),重複查成本可忽略;不引入快取以維持簡單(YAGNI)。
- **反轉既有 D5 與多條 scenario**→ Mitigation:本變更以 delta 完整改寫 panel-rendering 對應需求與 scenario,並同步更新元件註解與測試,避免規格漂移。

## Migration Plan

純前端面板行為變更,無資料遷移。部署即生效;回退為還原本變更的程式與規格 delta。
