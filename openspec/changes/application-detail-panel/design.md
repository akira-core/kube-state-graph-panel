## Context

node-detail feature 目前是畫布左下角的浮動面板,使用者**左鍵 tap**節點時開啟(`GraphCanvas` 的 `cy.on('tap', …)` → `onSelect(nodeId)` → `KsgPanel` 的 `selectedNodeId` 受控狀態 → `selectSingle()` 同步 cytoscape 選取)。面板顯示 label、kind/status badge 與 Alerts 區塊(`AlertTable`)。

本變更要為 pod/controller 節點加上 Application section:右鍵 → 解析 ArgoCD application name → 經 REST 取得參考 URL → 顯示單一連結。實作前的關鍵事實(已於程式碼層驗證):

- **觸發**:目前**只有左鍵 `tap`,完全沒有 `cxttap`(右鍵)**;右鍵是全新接線,且 cytoscape `cxttap` 不會自動 `preventDefault` DOM 原生右鍵選單。
- **資料**:`normalizeGraph` 已把 `data.labels?: Record<string,string>` 原樣帶到節點(`normalize.ts:265`),`cytoscape.d.ts` 也已宣告 `labels`。但 `resolveSelectedNode()`(`KsgPanel.tsx:83-107`)只把 `{id,label,kind?,status?,alerts?}` 放進 `NodeDetailData`,**未傳 labels**;`NodeDetailData` 也沒有 labels 欄位。
- **🔴 合成 controller 無 labels**:controller(kind=`deployment`/`statefulset`/`daemonset`/`job`/`cronjob`,`isController=true`)是 panel 端從 pod 的 `data.owner` **合成**(`normalize.ts:312-357`),backend 不送、合成節點完全沒有 `labels` 欄位。
- **無 HTTP**:面板零 imperative HTTP;`@grafana/runtime`(v12.4.2)已宣告但未 import;`getBackendSrv`/`fetch`/`window.open` 皆未使用。
- **約束**:feature-first 共置 + barrel 匯出、named export only、function component、props `Readonly<T>`、`@grafana/ui` `useStyles2`、TS strict(`noUncheckedIndexedAccess` 使 `labels[key]` 為 `string | undefined`、`exactOptionalPropertyTypes`)、ESLint `no-floating-promises` / `no-misused-promises` zero-warning。
- **協作**:`alert-occurrence-grouping`(僅剩 demo 驗證)已改寫同一「Node Detail 面板」需求並動過 `NodeDetailPanel.tsx` / `NodeDetailPanel.test.tsx` / `KsgPanel.test.tsx`。

## Goals / Non-Goals

**Goals:**

- 對 pod 與 workload controller 節點,**右鍵**即可解析 ArgoCD application 並在 node-detail 面板顯示**單一可跳轉連結**(新分頁)。
- 以最小、慣例一致的方式引入面板**首個 imperative REST surface**,走 Grafana 後端 proxy(`getBackendSrv()`)。
- 讓 controller(無 labels)也能取得 ArgoCD application name——在正規化階段**自子 pod 聚合**。
- 對沒有 ArgoCD label / 未設定 endpoint / REST 失敗的情況**優雅降級**,不影響面板其餘功能。

**Non-Goals:**

- 不支援 annotation 來源(`argocd.argoproj.io/instance` 固定為 **label**;annotation 不在現行資料流,屬後端議題)。
- 不在本變更做 N:M(一節點多 application)的多列表格;只做單一連結,但介面預留可擴充。
- 不修改 kube-state-graph 後端;controller 的 ArgoCD 來源一律 panel 端聚合。
- 不做 ArgoCD 即時狀態/同步資訊的拉取;只負責「name → 參考 URL → 連結」。
- 不引入新的 HTTP client 相依(用原生 `fetch` 經 `getBackendSrv`)。

## Decisions

### D1 — 右鍵(`cxttap`)觸發 ArgoCD lookup,沿用受控選取

在 `GraphCanvas` 既有 `tap` listener 旁新增 `cy.on('cxttap', handler)`,並新增 `onContextSelect(nodeId)` prop。右鍵 pod/controller 節點時:(1) 比照左鍵**選取該節點**(同一受控 `selectedNodeId` → `selectSingle()`,面板開啟),(2) 觸發該節點的 ArgoCD lookup。同時在 cytoscape container 抑制 DOM 原生右鍵選單(`container.oncontextmenu = e => e.preventDefault()` 或於 handler 內 `evt.originalEvent.preventDefault()`)。

- **Rationale**:brief 明確要求右鍵;右鍵作為「我要 app 連結」的明確意圖,避免每次左鍵選取就打 API。沿用同一 `selectedNodeId` 受控狀態,避免第二條選取路徑與藍色 highlight 失同步。
- **Alternatives**:純左鍵自動 fetch(違背 brief、且每次選取都打 API);純 `cxttap` 自訂 context-menu UI 元件(過重,且仍要解決原生選單)。
- **觸發語意**:lookup 由右鍵驅動(lazy),非「選取即抓」。

### D2 — REST 傳輸用 `getBackendSrv()` 走 Grafana proxy

新增 hook `useArgoApplicationUrl(appName)`,內部以 `@grafana/runtime` 的 `getBackendSrv().get(route, params)` 發出請求,`route` 來自面板選項;回傳 `{ loading, url, error }`。

- **Rationale**:沿用 Grafana 認證、同源無 CORS、為 plugin-validator 認可路徑;`@grafana/runtime` 已是宣告相依,毋須新增 HTTP client。
- **Alternatives**:原生 `fetch` 直打絕對 URL(自理 CORS/auth/mixed-content);Infinity datasource query(被 dashboard query/refresh 語意綁住,不適合 per-click 即時動作)。
- **async 正確性**:hook 內以 `AbortController` 在 `appName` 變更 / unmount 時中止;對 StrictMode 雙掛載冪等;呼叫端以 `void` + `.catch` 滿足 `no-floating-promises` / `no-misused-promises`;不在 unmount 後 setState。

### D3 — ArgoCD app name 固定 label `argocd.argoproj.io/instance`,controller 由子 pod 聚合

- **pod**:讀 `data.labels['argocd.argoproj.io/instance']`(`noUncheckedIndexedAccess` → `string | undefined`,以 `?? undefined` 收斂)。
- **controller**:於 `normalize.ts` 合成 controller(現行 312-357)時,自其**任一子 pod** 的該 label 聚合,寫到合成節點。
- **Rationale**:合成 controller 本無 labels;同一 controller 的 pods 通常屬同一 Argo app,取任一即可;`argocd.argoproj.io/instance` 是 ArgoCD 預設 tracking **label**(非 annotation),符合現行資料流。
- **Alternatives**:pods-only(違背「pod/controller」);backend 補 controller label(需後端改版,較慢);可設定 label key(user 已選固定)。

### D4 — 在正規化階段把 app name 落成節點欄位,經 `resolveSelectedNode` 傳入 `NodeDetailData`

新增節點 data 欄位 `argoAppName?: string`(`cytoscape.d.ts` 宣告);`normalize.ts` 對 pod 自身 label、對 controller 自子 pod 聚合,皆寫入此欄位。`NodeDetailData` 新增 `argoAppName?: string`,`resolveSelectedNode()` 讀出傳入。

- **Rationale**:controller 無 labels,聚合**必須**在 normalize 做;為一致,pod 也在 normalize 落同一欄位,面板與 hook 只認單一欄位,不必在 UI 端分別處理 pod/controller 的來源差異。
- **Alternatives**:面板現場讀 `node.labels[key]`(對 controller 行不通);把整包 labels 透傳(揭露過多、仍需面板分流 pod/controller)。

### D5 — 單一連結、lazy fetch、新分頁,優雅降級

Application section 僅在 `kind ∈ {pod, deployment, statefulset, daemonset, job, cronjob}` 時渲染。狀態機:

- **無 `argoAppName`** → section 不顯示(避免雜訊);右鍵該節點時可給「無 ArgoCD application」輕量提示(細節由 specs 釘)。
- **右鍵觸發後 loading** → 顯示 loading 指示。
- **成功** → 顯示**單一可點擊連結**,`<a target="_blank" rel="noopener">`(或 `@grafana/ui` `LinkButton`),不自動開啟。
- **失敗** → 顯示錯誤/空狀態,不影響面板其餘區塊。

元件 `ApplicationTable`(共置於 `node-detail/components/ApplicationTable/`,比照 `AlertTable`)。介面預留可成長為多列(接 `Application[]`),目前 1:1。

- **Rationale**:brief 是「顯示一個 url 給使用者跳轉」=可見連結而非自動開;`rel="noopener"` 防 reverse tabnabbing;lazy 避免無謂 API 呼叫。
- **Alternatives**:自動 `window.open`(突兀、易被 popup blocker 擋、看不到/複製不到 URL);一開始就多列 InteractiveTable(目前過重)。

### D6 — kind 範圍釘死於 spec

「pod/controller」明確定義為 `pod` + 5 種 controller(`deployment`/`statefulset`/`daemonset`/`job`/`cronjob`),於 panel-rendering spec 釘死,避免在不帶此 label 的 kind 上顯示空/錯誤區塊。

### D7 — 面板選項僅新增 REST endpoint

`KsgPanelOptions` 新增 endpoint(proxy route / 路徑)設定。**label key 不做選項**(固定 `argocd.argoproj.io/instance`)。未設定 endpoint → Application section 停用/不顯示。

## Risks / Trade-offs

- **[與 `alert-occurrence-grouping` 改同需求/同檔案]** → spec delta 與程式碼以其改寫後狀態(Count/Last seen、`timeRecords[]`)為基準;理想上待其 land/archive 後再 land 本變更碼,降低 stale/衝突 delta 與 merge 衝突(`NodeDetailPanel.tsx` / 兩個 test 檔)。
- **[合成 controller 無 labels,直接讀會永遠空]** → 採 D3 子 pod 聚合;以測試覆蓋「controller 有子 pod 帶 label / 無任何子 pod 帶 label」兩路。
- **[面板首個 HTTP surface,plugin-validator 對外部網路敏感]** → 採 D2 `getBackendSrv()` + proxy(官方認可);不直打外部絕對 URL。
- **[React + strict ESLint 下的 async]** → hook 內 `AbortController` + 冪等 + `void`/`catch`;effect 清理中止;不在 unmount 後 setState。
- **[右鍵原生選單與第二選取路徑]** → container 層 `preventDefault` 原生 contextmenu;右鍵走與左鍵同一受控 `selectedNodeId`,維持 `selectSingle()` 單一真實來源。
- **[label vs annotation 誤判]** → 固定為 label `argocd.argoproj.io/instance`(已確認為 label);annotation 明列 Non-Goal。
- **[慣例違反導致 pre-push/CI 失敗]** → `ApplicationTable` 只經 `node-detail/index.ts` barrel 匯出、named export、props `Readonly<T>`、`labels[key]` 以 `?? undefined` 處理 `noUncheckedIndexedAccess`。

## Migration Plan

- **部署前提**(營運側):workload 需帶 `argocd.argoproj.io/instance` label;Grafana 需有可用的後端 proxy route;面板選項填入 endpoint。
- **降級 / rollback**:無 endpoint → section 停用;無 label → section 隱藏;REST 失敗 → 錯誤狀態。三者皆**不影響**圖形與其餘面板。功能為純增量、無資料遷移、無 schema 變更;移除變更即回到現狀。
- **落地順序**:先 specs(本步之後)→ 待 `alert-occurrence-grouping` archive → 實作碼 → 測試 → demo 驗證。

## Open Questions

- **REST 契約**:endpoint route path、query 參數名(app name 帶法)、回傳 JSON 形狀(假設 `{ url: string }`)——待後端/部署方確認,寫入 specs 前定案。
- **`getBackendSrv` proxy 接法**:走 datasource plugin 的 route proxy,還是 Grafana 既有 API route?面板無自家後端,需釐清 proxy 由誰提供。
- **無 app name 的 UX**:section 完全隱藏 vs 右鍵時顯示「此節點無 ArgoCD application」提示——由 specs 定案。
- **快取**:同節點重複右鍵是否快取 lookup 結果(避免重打)——可作後續最佳化,本變更可先不快取。
- **排序**:是否硬性等 `alert-occurrence-grouping` archive 後才開始實作碼。
