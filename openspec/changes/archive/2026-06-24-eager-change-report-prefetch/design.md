## Context

`useNodeDetailUrls(input, endpoint)` 目前(lazy)為 **imperative hook**:右鍵只建立 input,回傳 `{ enabled, application: ChangeReportState, containers: Record<string, ChangeReportState>, openApplicationReport, openContainerReport }`;查詢於 `open*` 觸發函式(按鈕點擊)時才經 `getBackendSrv()` 發出,成功時 `window.open(url, '_blank', 'noopener,noreferrer')`。

兩個問題:

1. `window.open` 在 `await`(查詢回傳)之後呼叫,逸出使用者手勢的 transient activation → 開新分頁到 Azure DevOps 等 SPA 時**首次空白、需手動 refresh**,偶發彈窗被擋(lazy 已知 risk)。
2. lazy 的反面成本:沒有「右鍵即預解析」的好處。

本變更改回 **eager prefetch**,把「何時查」由點擊移回 effect(右鍵開啟即併發),URL 在點擊前已解析,故按鈕改回**真正的 `<a href>` anchor**(無 `window.open`)。為避免重蹈當初促成 lazy 的「右鍵就滿欄 Not Found、像壞掉」,失敗 / 無資料改以 **muted「No change report」提示**呈現。

約束(不變):查詢必經 `getBackendSrv()`(不直連外部);查詢契約之**端點名稱**(`config_changes` / `code_changes`)、**回傳格式**、共用 input 不變;endpoint base 的 sibling 推導(`resolveDetailEndpoint` / `detailPaths`)不動;右鍵抑制原生選單、左鍵不查詢、區塊 gating(kind + 資料存在性)、帶 header 的 `InteractiveTable` 版型與 Change Report 欄右緣對齊不變。

## Goals / Non-Goals

**Goals:**

- 右鍵開啟 detail view(`enabled`)即**併發預取** `config_changes` + `code_changes`,無需點擊。
- 每個 Change Report 目標三態:**loading**(spinner)→ **ready**(anchor)/ **unavailable**(muted「No change report」)。
- 成功改回**預解析 anchor**(`<a href target=_blank rel="noopener noreferrer">`)——點擊為一般使用者手勢導頁,修掉 `window.open`-after-await 空白頁與彈窗被擋。
- 保持 hook 集中查詢、表格 presentational 的既有分層。
- **快取機制不變**:每端點每次開啟最多呼叫一次、僅快取成功、失敗清 slot、換節點 / 換 endpoint / 關閉 panel 清快取並中止 in-flight。

**Non-Goals:**

- 不改傳輸層(`getBackendSrv()`)、端點名稱、回傳格式、sibling 推導(`resolveDetailEndpoint` / `detailPaths` 不動)。
- 不改右鍵/左鍵 gating、區塊顯示條件、Alerts view、`InteractiveTable` 帶 header 版型。
- 不在面板內 inline 呈現成功 URL 的文字(成功即為可點 anchor)。

## Decisions

### D1:`useNodeDetailUrls` 改回 eager effect(反轉 lazy D1)

回傳形狀改為解析後狀態(無 `open*` 觸發):

```ts
export type DetailLookup =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'unavailable'; error?: string };

export interface NodeDetailLookups {
  enabled: boolean;
  application: DetailLookup;
  containers: {
    phase: 'loading' | 'settled'; // 'loading' = 整包 code_changes 請求進行中
    byName: Record<string, DetailLookup>; // 僅 'ready' 項;settled 時缺 key ⇒ unavailable(見 D4)
  };
}
```

以 `useEffect`(keyed by request key)在 `enabled && input` 時併發發出兩查詢;成功 → `ready` / map;失敗 → `unavailable` / `phase:'settled'` 空 byName。`DetailLookup` 為 **discriminated union**(非單一 interface 帶 `url?`/`error?`),在 `exactOptionalPropertyTypes` 下避免 `ready` 漏 `url` 的非法狀態。

**為何**:eager 讓 URL 在點擊前解析,是改回 anchor(D2)的前提;effect 驅動最直接。沿用 `requestKeyFor` / `parseApplicationUrl` / `parseUrlByContainer` / `errorMessage`。

### D2:成功改回預解析 `<a href>` anchor(反轉 lazy D2 的 `window.open`)

URL 預取已知,Change Report cell 在 `ready` 時渲染 `<a href={url} target="_blank" rel="noopener noreferrer">`(`@grafana/ui` `Icon` + 文字)。**移除** `window.open` 與「Pop-up blocked」分支。

**為何**:`window.open` 在 `await` 後呼叫逸出 transient activation,導致 Azure DevOps 等 SPA 首次空白、需 refresh,且偶被彈窗攔截。預解析 anchor 的點擊是**全新使用者手勢的頂層導航**,等同一般連結——無 `window.open`、無空白頁、無彈窗攔截,且支援中鍵 / Ctrl+點擊另開、右鍵複製連結。

### D3:非成功 = muted「No change report」提示(反轉 lazy D3 的紅色「Not Found」+ 可重試按鈕)

`unavailable`(查詢失敗 / 成功但該 container 缺 key / 無有效 URL)時,Change Report cell 顯示 **muted(`theme.colors.text.secondary`)** 文字「No change report」;完整失敗訊息入 `title`(保留錯誤可見性)、過長截斷。**不渲染 anchor / 按鈕**。

**為何**:eager 下沒有「可重試的觸發按鈕」,失敗即定局(快取語意見 D5)。muted 提示讀作「尚無變更報告」而非紅色「壞掉」——正是當初把 eager 改 lazy 想避免的觀感;改用 muted 後即可安全恢復 eager。

### D4:container 狀態以 `{ phase, byName }` 表達(區分 loading 與 settled-missing)

container **清單**來自 `node.containers`(node data),非 `code_changes` map;故表格可能有 map 中不存在的列。必須區分「整包 map 載入中」(全列 spinner)與「settled 但該 name 缺」(該列 unavailable):

- `phase === 'loading'` → 每列 `{ status:'loading' }`(spinner)。
- `phase === 'settled'` → `byName[name] ?? { status:'unavailable' }`(有則 anchor,缺則提示)。

`byName` 只放成功解析(`parseUrlByContainer` 已丟棄無效 / 空 URL 項)。`noUncheckedIndexedAccess` 下 `byName[name]` 為 `DetailLookup | undefined`,`?? { status:'unavailable' }` 同時滿足型別與「查無 = unavailable」語意。

**為何**:扁平 `Record<string, DetailLookup>`(缺 key = unavailable)無法表達「整包尚在載入」——會在 loading 期間誤顯「No change report」。

### D5:at-most-once per open(effect 只鍵在 request-key 字串,不用 ref 快取)

預取 effect **只依賴 `key` 字串**(`requestKeyFor`,涵蓋 endpoint + 每個 input 欄位);live 的 `input`/`base` 經一個 ref(`argsRef`,每次 commit 更新)讀取,不列入 deps。如此:同一節點的資料 refresh 給出**新 identity、同值**的 `input` 物件時,`key` 不變 → effect 不重跑 → 不重發、已解析的 anchor 不閃回 loading;換節點(新 key)才重跑一次。`controllersRef` 在 cleanup(換 key / unmount)abort in-flight,resolve/reject 以 `aborted` 早退;remount 因元件重建必重發(失敗不會被「快取」住,符合「remount 重取」)。成功 map 缺某 container = 該列確定性 unavailable(ContainerTable 以 `Object.hasOwn` 判定,不重發)。

**為何**:後端整包回傳,逐次重打浪費;at-most-once 由「effect 不為同 key 重跑」直接保證即可。原 lazy 的 `appCacheRef`/`codeCacheRef` 在 eager 下是**死碼**——`[key]` cleanup 會在任何重跑前先把兩 ref 清成 null(React 先 cleanup 再跑 body),故快取永遠命中不到、`promise.catch` 清 slot 也永不生效;移除之,改以 effect 鍵化達成等價且真實的 at-most-once。

### D6:stale-write 防護與 StrictMode 取捨

resolve / reject handler 以 `controller.signal.aborted` 早退(cleanup 在換節點 / unmount 時 abort 該 key 所有 controller),外加最終衍生狀態以 `key` 比對過濾——雙重保證舊節點的延遲回應 MUST NOT 寫入新節點。移除 lazy 的 `ctxRef`(僅為點擊時讀 context 而存在)。

cleanup 一律 abort in-flight(滿足規格「換節點 / 關閉 panel 中止 in-flight」)。**取捨**:React 18 StrictMode dev 雙掛載(mount→cleanup→mount,同 key)會在第二次掛載重跑 effect → **dev 環境每端點可能發 2 次**。此為 dev-only:Grafana production 不以 StrictMode 包裹 panel、預設 `renderHook` 亦無 StrictMode,故 production 與單元測試皆每端點一次。不為消除 dev 雙取而犧牲「換節點 / 關閉即中止 in-flight」的正確性(該正確性是規格要求);故不加「StrictMode 只取一次」測試。

### D7:`KsgPanel` 的 `detailQueryInput` 以 `useMemo` 穩定(cheap stabilization)

`KsgPanel` 的 `detailQueryInput` 以 `useMemo`(keyed by `[selectedNode, detailRequest]`)建立。`time` 取自 `detailRequest.time`(右鍵當下設一次),故同一選取期間值穩定。

**為何**:D5 把預取 effect 鍵在 `key` **字串**並經 ref 讀 input 後,「同 key、新 identity 的 input」已不會觸發重跑,故此 memo **不再是防重發的必要條件**;保留它僅為避免每 render 配置新物件(`selectedNode` 隨資料 refresh 重建,inline 物件會跟著換 identity)的廉價穩定化。先前版本(effect 把 `input` 列入 deps)時它才是 load-bearing;那是本次 code review 修掉的 bug。

## Risks / Trade-offs

- **eager 每次開啟發兩請求(成本 / 節流)**:這是相對 lazy 的刻意反轉。緩解:`appCacheRef` / `codeCacheRef`(以 request key 為界)保證每開啟**恰一次** `config_changes` + 一次 `code_changes`;re-render 與任何 per-row 重算重用快取 promise;`showErrorAlert:false` 使 404 靜默。
- **StrictMode dev 雙取**:見 D6——dev-only,production / 測試單取;不為此犧牲清快取正確性。
- **反轉既有 lazy D1/D2/D3 與多條 scenario**:本變更以 delta 完整改寫 panel-rendering 對應需求與 scenario,並同步更新元件註解與測試,避免規格漂移。lazy 的 proposal/design(archived)為歷史,不再編輯;eager 的 why-reversed 留於本 design.md。

## Migration Plan

純前端面板行為變更,無資料遷移。前置:已先 `openspec archive lazy-change-report-lookup`(使 baseline 反映 lazy),本變更再以 MODIFIED delta 改回 eager。部署即生效;回退為還原本變更程式 + spec delta。
