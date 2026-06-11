## Context

node-detail feature 是畫布左下角的浮動面板,使用者**左鍵 tap**節點時開啟(`GraphCanvas` 的 `cy.on('tap', …)` → `onSelect(nodeId)` → `KsgPanel` 的 `selectedNodeId` 受控狀態 → `selectSingle()` 同步 cytoscape 選取)。面板顯示 label、kind/status badge 與 Alerts 區塊(`AlertTable`,已含 `alert-occurrence-grouping` 的 Count / Last occurred / `timeRecords[]` 行為——該變更已於 2026-06-10 archive,同檔衝突解除)。

本變更為 pod/controller 節點加上兩個區塊:**Application**(ArgoCD app name + 單一 URL 按鈕)與 **Containers**(每 container 一列 name + image + URL 按鈕)。右鍵觸發、同一面板同位置同版型。實作前的關鍵事實(已於程式碼層驗證):

- **觸發**:目前**只有左鍵 `tap`,完全沒有 `cxttap`(右鍵)**;右鍵是全新接線,且 cytoscape `cxttap` 不會自動 `preventDefault` DOM 原生右鍵選單。
- **資料**:現行資料流**完全沒有** container/image 資料(backend 回應、`normalize.ts`、demo seeder、`cytoscape.d.ts` 皆無);`application` 欄位亦不存在。依本變更約定,**backend 新版將在 pod 節點輸出 `application` 與 `containers`**;panel 端透傳 + controller 聚合。
- **🔴 合成 controller 無 backend 欄位**:controller(kind=`deployment`/`statefulset`/`daemonset`/`job`/`cronjob`,`isController=true`)是 panel 端從 pod 的 `data.owner` **合成**(`normalize.ts` 的 controller 合成段),backend 不送 controller 節點——兩欄位必須自子 pod 聚合。
- **告警現況**:pod 帶 `data.alerts`(`NodeAlert[]`,經 `parseAlerts` 防腐:name/severity/timeRecords + 選用 `pod`/`service`/`id`);合成 controller 僅聚合 `worstStatus`(status 排名),**不帶 `alerts`** → controller 的 detail 面板告警表恆「No alerts」。`AlertTable` 已有 Pod 欄(`alert.pod ?? '—'`)。
- **無 HTTP**:面板零 imperative HTTP;`@grafana/runtime`(v12.4.2)已宣告但未 import;`getBackendSrv`/`fetch`/`window.open` 皆未使用。
- **約束**:feature-first 共置 + barrel 匯出、named export only、function component、props `Readonly<T>`、`@grafana/ui` `useStyles2`、TS strict(`noUncheckedIndexedAccess` 使 map 查值為 `string | undefined`、`exactOptionalPropertyTypes`)、ESLint `no-floating-promises` / `no-misused-promises` zero-warning。

## Goals / Non-Goals

**Goals:**

- pod 與 workload controller 節點**右鍵** → 同一 node-detail 面板顯示 Application 區塊(app name + 單一 URL 按鈕)與 Containers 區塊(每 container 列 name/image/URL 按鈕),皆**新分頁**開啟。
- 以最小、慣例一致的方式引入面板**首個 imperative REST surface**,走 Grafana 後端 proxy(`getBackendSrv()`),指向**同一個 graph API backend**。
- 兩個查詢**共用同一組 input**(application name / controller kind / controller name / current time);application-detail 回單一 URL,image-detail 回 container→URL map(**無 image 參數**)。
- backend 新欄位 `application` / `containers` 的透傳與 controller 子 pod 聚合,落在 `normalizeGraph`(anti-corruption boundary)。
- 對欄位缺失(舊版 backend)、未設定 endpoint、REST 失敗的情況**優雅降級**,不影響面板其餘功能。
- **告警 pod → controller 傳播**:controller 節點的告警表格顯示其子 pod 聚合的 alerts;**status 仍為唯一上色來源**(`worstStatus` 邏輯與 stylesheet 不動)。

**Non-Goals:**

- 不做 label 解析(`argocd.argoproj.io/instance`):app name 改由 backend `application` 欄位提供,label 來源已被取代。
- 不修改 kube-state-graph 後端(本 repo panel-only);backend 欄位與 endpoint 屬上游交付物,此處只定契約。
- 不做 ArgoCD 即時狀態/同步資訊拉取;只負責「input → URL → 按鈕」。
- 不引入新的 HTTP client 相依。
- 不做點按鈕才查詢(lazy-per-button)——右鍵一次預取,見 D5。

## Decisions

### D1 — 右鍵(`cxttap`)觸發雙查詢,沿用受控選取

在 `GraphCanvas` 既有 `tap` listener 旁新增 `cy.on('cxttap', handler)`,並新增 `onContextSelect(nodeId)` prop。右鍵 pod/controller 節點時:(1) 比照左鍵**選取該節點**(同一受控 `selectedNodeId` → `selectSingle()`,面板開啟),(2) 觸發該節點的 application-detail + image-detail 查詢。同時抑制 DOM 原生右鍵選單(container 層 `contextmenu` `preventDefault`,或 handler 內 `evt.originalEvent.preventDefault()`)。左鍵行為不變、**不**觸發查詢。

- **Rationale**:右鍵 = 「我要外部連結」的明確意圖,避免每次左鍵選取就打 API;沿用同一 `selectedNodeId` 受控狀態,避免第二條選取路徑與藍色 highlight 失同步。
- **Alternatives**:左鍵自動 fetch(每次選取都打 API);自訂右鍵 context-menu UI(過重)。

### D2 — REST 傳輸:`getBackendSrv()` 走 Grafana proxy,單一 hook 並行雙請求

新增 hook `useNodeDetailUrls(input | undefined)`(共置 `node-detail/hooks/`),input 為 `{ application, kind, name, time }`;內部以 `@grafana/runtime` 的 `getBackendSrv()` 對**解析後的 endpoint**(依 D7 順序解析;hook 仍接 endpoint 字串)發出**兩個並行請求**(application-detail、image-detail),回傳 `{ loading, applicationUrl, urlByContainer, applicationError, containersError }`(實作定案:錯誤**按查詢分開**而非單一 `error`——spec 要求「任一查詢失敗只影響對應區塊」,單一 error 無法表達單邊失敗另一邊保留)。input 為 `undefined`(未右鍵、左鍵選取)或解析後 endpoint 為空時不發請求。

- **Rationale**:沿用 Grafana 認證、同源無 CORS、plugin-validator 認可路徑;兩查詢同 input 同生命週期,單一 hook 管理一組 loading/error/abort 較兩個 hook 簡單。
- **REST 契約(路徑與回傳形狀已定案)**:application-detail 查詢 = `GET <endpoint>/api/v1/config_changes` 回 `{ "url": string }`;image-detail 查詢 = `GET <endpoint>/api/v1/code_changes` 回 `{ [containerName]: { "url": string } }`(巢狀物件,非扁平 map)。hook 解析層 MUST 將後者**攤平**為 `urlByContainer: Record<string, string>`,UI 端只認扁平 map。query 參數 `application` / `kind` / `name` / `time`(Unix 秒,參數名仍為假設);參數名若變僅影響 hook 內解析層。
- **async 正確性**:`AbortController` 在 input 變更 / unmount 時中止;StrictMode 雙掛載冪等;`void` + `.catch` 滿足 `no-floating-promises` / `no-misused-promises`;不在 unmount 後 setState。

### D3 — 資料來源:backend `application` / `containers` 欄位,controller 由子 pod 聚合

- **pod**:`normalizeGraph` 原樣透傳 backend 的 `data.application`(非空字串)與 `data.containers`(逐項驗證 `{ name, image }` 皆非空字串,形狀不符項目丟棄)。
- **controller**:合成時自子 pod 聚合——`application` 取任一帶值子 pod(穩定排序確定性選取);`containers` 取所有子 pod 聯集、以 `(name, image)` 去重、穩定排序。
- 欄位缺失/驗證後為空 → **省略**該欄(`exactOptionalPropertyTypes`),面板據此隱藏區塊。
- **Rationale**:backend 已決定送結構化欄位,優於 label 解析(label 只能載 app name、載不了 containers);合成 controller 無 backend 欄位,聚合**必須**在 normalize 做。
- **Alternatives**:label 解析(原設計,已被 backend 欄位取代);面板端現場聚合(把聚合邏輯散進 UI,違反 anti-corruption boundary)。

### D4 — 欄位經 `resolveSelectedNode` 傳入 `NodeDetailData`

`cytoscape.d.ts` 宣告 `application?: string`、`containers?: Array<{ name: string; image: string }>`(獨立型別 `ContainerSpec` 放 `shared/types`)。`NodeDetailData` 新增同名欄位,`resolveSelectedNode()`(`KsgPanel.tsx`)讀出傳入。pod 的 controller kind/name 查詢參數取自 `data.owner`;controller 取自身;無 owner 的 standalone pod 以自身 kind(`pod`)+ name 帶入。

### D5 — 右鍵一次預取,按鈕渲染為已解析的連結

右鍵後 hook 立即發出雙查詢;成功後 ApplicationTable / ContainerTable 的 URL 按鈕以 `@grafana/ui` `LinkButton`(或 `<a>`)渲染,`href` 為已解析 URL、`target="_blank"` + `rel="noopener"`,**不** `window.open`、不自動導頁。狀態機:

- **左鍵選取**:`alerts` view,不渲染兩區塊(view 分流——見 spec「Node Detail Application 與 Containers 區塊」)。
- **右鍵但 endpoint 解析為空**(option 空且無法自 datasource 推導,D7):`detail` view 區塊照資料渲染(name/image 可見),URL 按鈕**停用**(無查詢)。
- **右鍵後 loading** → 兩區塊顯示 loading 指示,不阻塞其餘區塊。
- **成功** → 按鈕帶 href;`urlByContainer` 查無該 container name(`noUncheckedIndexedAccess` → `undefined`)→ 該列按鈕停用/隱藏,name/image 照常。
- **失敗** → 對應區塊錯誤/空狀態,header / Alerts / 另一區塊不受影響。

- **Rationale**:點按鈕才 fetch 再 `window.open` 會被 popup blocker 擋(async 後開窗失去 user-gesture);預取讓按鈕成為普通連結,可右鍵複製、可中鍵開,UX 與安全(`rel="noopener"` 防 reverse tabnabbing)皆優。
- **Alternatives**:per-button lazy fetch + `window.open`(popup blocker、不可複製 URL);自動開分頁(突兀)。

### D6 — kind 範圍釘死於 spec

「pod/controller」= `pod` + 5 種 controller(`deployment`/`statefulset`/`daemonset`/`job`/`cronjob`),其餘 kind 不渲染兩區塊。已釘於 panel-rendering spec。

### D7 — endpoint 解析:自 panel datasource 自動推導,面板選項為覆寫(2026-06-11 改版)

`KsgPanelOptions.detailEndpoint` 保留,但語意自「唯一來源」改為**覆寫**。解析順序(panel 層 helper,共置 `node-detail` feature、經 barrel 匯出;hook 介面不變,仍接 endpoint 字串):

1. option 非空 → 以其為準(hook 既有 trim / 去尾斜線行為)。
2. 否則依序檢視 `data.request?.targets` 中**非隱藏且帶 datasource ref** 的 targets,以 `getDataSourceSrv().getInstanceSettings(ref)?.url` 為 base(僅接受非空字串),取**第一個解析成功**者——`hide` 的 target 與解析不出 url 的 ref(如 expression `__expr__`)跳過續查。`access: proxy` 的 datasource 其 instance settings `url` 即 Grafana 改寫後的 proxy base path `/api/datasources/proxy/uid/<uid>`(`frontendsettings` 行為;已於 Grafana 12.4 + Infinity 3.8 實測 `/api/datasources/proxy/uid/ksg-default/...` 回 200)。
3. 皆無 → `''`(沿用既有 idle / 停用語意)。

- **Rationale**:面板本就知道資料來自哪個 datasource(targets 的 ref);instance settings `url` 在 `access: proxy` 下天然就是 proxy base path——零設定即可用(demo 的 `ksg-default` 已 provisioned `url: http://kube-state-graph:8080`),且仍走 Grafana dataproxy,「不直連外部」不變量不破。選項保留為 escape hatch(datasource 無 `url`、或 detail endpoint 在另一個 backend)。
- **限制 / 風險**:Grafana 12 dataproxy 不擋 backend plugin,但 datasource 記錄 MUST 有非空 `url`——UI 新建的 Infinity 預設無 `url`(設定頁已移除該欄),proxy 會 502,且 client 端無法預檢(instance settings `url` 一律被改寫為 proxy path);失敗面化為兩區塊的 error 狀態,以 option 覆寫解套。Infinity 的 resource route(`/api/datasources/uid/<uid>/resources/*`)只有 `ping` / `reference-data`,不可作 passthrough。dataproxy 的 id-based 形式已棄用(v13 預設停用),MUST 只用 uid 形式。
- **Alternatives**:僅手動選項(原 D7——每個部署多填一格、demo 無法開箱即用);Infinity resource passthrough / `getResource()`(不存在該 resource);讀 datasource 原始 URL 直連(破「不直連外部」不變量、CORS、容器內 hostname 不可達)。
- 其餘不變:**不**提供 label key 選項(label 來源已廢)、不分開設定兩條 route(同一 backend,無必要)。

### D8 — 元件:ApplicationTable 與 ContainerTable 共置,同一渲染邏輯

兩元件皆共置 `node-detail/components/`、比照 `AlertTable`(`.tsx` / `.types.ts` / `.test.tsx` / `index.ts`、barrel 匯出、props `Readonly<T>`、`useStyles2`)。ContainerTable 接 `{ containers, urlByContainer, loading, error }` 渲染多列;ApplicationTable 接 `{ application, url, loading, error }` 渲染單列(同一列版型:名稱 + URL 按鈕),介面預留多列成長空間。

**表格版型(2026-06-11 增補)**:兩元件改以 `@grafana/ui` `InteractiveTable` 渲染(與 `AlertTable` 同元件、同版型)——ApplicationTable 欄位 **Name / Change Report**;ContainerTable 欄位 **Name / Image / Change Report**,每欄帶 column header、各列沿欄對齊。Change Report 欄 `disableGrow`(ApplicationTable 的 Name 欄、ContainerTable 的 Image 欄填滿剩餘寬度),兩表的按鈕欄因此同樣靠右、上下對齊(使用者回饋:app URL 位置對齊 container URL)。實作約束:columns / data 皆 `useMemo`(react-table 要求);`getRowId` 穩定(ContainerTable 用 `name/image` + index、ApplicationTable 用 application name + index——比照 `AlertTable` 的 index 後綴慣例);image 欄維持 monospace、改 `word-break: break-all` 換行(無空白的 registry/repo@tag 字串若不換行會把欄撐出面板;cell 內 span);**查詢結果槽**位於 Change Report 欄 cell 內(2026-06-11 使用者回饋:結果要長在按鈕旁)——進行中:停用按鈕 + 右側 spinner 提示;成功:按鈕 + 右側解析 URL(次要色);**失敗:僅渲染錯誤色訊息、不渲染按鈕**(使用者回饋:not found 時只顯示提示);皆過長截斷 + `title` 完整值,idle / 缺 key 僅停用按鈕、槽位空白;**不再有表格外的 loading / error 列**(單一真實來源在列內);URL 欄 cell 維持既有 `LinkButton` 語意(成功帶 `href` + `target="_blank"` + `rel="noopener"`、無 URL 停用),不自動導頁。

- **Rationale**:與 Alerts 表格共用同一表格元件 → header 樣式、欄距、字級全面一致,欄位天然整齊對齊,免手刻 grid/欄寬;一個面板內三個區塊視覺統一。
- **Alternatives**:CSS grid 手排 header 列(欄寬要自己維護、與 InteractiveTable 樣式漂移);維持無 header flex row(本次需求明確否決)。

### D9 — 告警 pod → controller 傳播:normalize 聚合,面板零修改

合成 controller 時自子 pod 聚合 `data.alerts`(比照 D3 的聚合位置——anti-corruption boundary,UI 不做現場聚合):

- **順序**:以既有 `sortedOwned`(podId 穩定排序)串接各子 pod 的 alerts,pod 內保持 `parseAlerts` 解析後順序——對相同輸入確定性。
- **pod 歸屬回填**:`AlertTable` 有 Pod 欄;聚合副本若缺 `pod` 欄,以來源 pod 的 label 回填,讓 controller 表格每列可歸屬到 pod;已帶 `pod` 的項目保留原值。回填作用於**新物件**(spread),來源 pod 元素自身的 alerts 不被觸碰(immutable)。
- **去重**:帶 `id` 的項目跨 pod 以 `id` 去重(同一 backend 告警下發到多 pod 時不重複列出),穩定順序下首見者勝;無 `id` 的項目不去重(無安全身分鍵)。
- **省略**:無任一子 pod 帶 alerts → controller MUST NOT 帶 `alerts` 欄(`exactOptionalPropertyTypes`)。
- **顏色不變**:`worstStatus`(status-only)彙整、controller 去重、owns 邊皆不受影響;alerts 不進 stylesheet——**status 仍為唯一上色來源**(對齊基線「採 status 非 alert severity」決策)。
- **範圍**:僅 panel 合成的 controller。k8s `node` 容器為 backend 實體節點(帶不帶 alerts 由 backend 決定),panel 不代為聚合。

- **Rationale**:controller 是 panel 合成物,backend 永遠不會給它 alerts;pod 收進 controller 盒後,使用者仍需在 controller 的 detail 面板看到旗下告警——與 `worstStatus` 邊框同一動機(資料層的對應物)。面板端零修改:`resolveSelectedNode` / `AlertTable` 已照 `data.alerts` 渲染。
- **Alternatives**:面板端(`resolveSelectedNode`)現場聚合——把聚合邏輯散進 UI,違反 anti-corruption boundary(同 D3 的否決理由);以 alerts 推導節點顏色——明確不做(status 上色為既定決策)。

### D10 — 收合容器的 worstStatus 含 normal(2026-06-11 使用者回饋)

原行為「最差為 `normal` 時省略 `worstStatus`」(收合框維持中性)改為**normal 也畫**:

- **controller**:必有 ≥1 子 pod,`worstStatus` **一律寫入**(全 normal → `'normal'` → 收合畫綠框)。
- **k8s node**:於**有 status 資訊**時寫入(自身帶合法 `status` 或至少一個子 pod);自身無 status 且無子 pod 時省略——「無資訊」不得偽裝成 normal(中性框)。為此 `childWorstStatusRank` pre-pass 改為**記錄所有**帶 parent 的 pod(含 rank 0),使 `has(nodeId)` 可判別「有無子 pod」。
- stylesheet 零修改:`node[worstStatus="normal"].cy-expand-collapse-collapsed-node` 綠框 selector 本就由 `STATUS_COLOR` 迭代生成,只差 normalize 寫入。
- alerts 仍不參與(D9 不變):normal pod + critical alert → `worstStatus: 'normal'`(寫入但不升級)。

- **Rationale**:「沒消息」與「明確的好消息」在收合框上應可區分;全健康容器收合後綠框是主動訊號。
- **Alternatives**:維持省略(原設計,使用者否決);無資訊也畫綠(把「backend 沒給 status」誤報成健康,否決)。

## Risks / Trade-offs

- **[backend 欄位與 endpoint 尚未交付]** → 契約(欄位形狀、query 參數、回傳 JSON)已釘於 specs + D2 假設;panel 端全程優雅降級(欄位缺失→區塊隱藏、未設 endpoint→停用),可先行實作並以 mock/測試覆蓋;demo seeder 待 backend 版本支援後補。
- **[合成 controller 無欄位,直接讀會永遠空]** → D3 子 pod 聚合;測試覆蓋「有子 pod 帶值 / 無任何子 pod 帶值 / 多子 pod 去重」三路。
- **[面板首個 HTTP surface,plugin-validator 對外部網路敏感]** → `getBackendSrv()` + proxy route(官方認可);不直打外部絕對 URL;spec 含 source-scan scenario。
- **[React + strict ESLint 下的 async]** → hook 內 `AbortController` + 冪等 + `void`/`catch`;effect 清理中止;不在 unmount 後 setState。
- **[右鍵原生選單與第二選取路徑]** → container 層 `preventDefault`;右鍵走與左鍵同一受控 `selectedNodeId`,維持 `selectSingle()` 單一真實來源。
- **[map 查值 undefined]** → `noUncheckedIndexedAccess` 強制處理;spec 已釘「缺 key → 按鈕停用」。
- **[慣例違反導致 pre-push/CI 失敗]** → 新元件/hook 只經 `node-detail/index.ts` barrel 匯出、named export、props `Readonly<T>`。

## Migration Plan

- **部署前提**(營運側):kube-state-graph backend 升至輸出 `application`/`containers` 與兩個 detail endpoint 的版本;面板查詢的 datasource 帶非空 `url`(預設自動推導 proxy path,見 D7);特殊環境以面板選項覆寫 endpoint。
- **降級 / rollback**:舊版 backend(無欄位)→ 區塊隱藏;無 endpoint → 區塊停用;REST 失敗 → 錯誤狀態。三者皆**不影響**圖形與其餘面板。純增量、無資料遷移、無 schema 變更;移除變更即回現狀。
- **落地順序**:specs(已完成)→ design(本文件)→ tasks 重排 → 實作(normalize 透傳/聚合 → 型別/resolveSelectedNode → cxttap 接線 → hook → 元件 → 面板選項)→ 測試 → demo 驗證(視 backend 版本)。

## Open Questions

- **REST 契約收尾**:子路徑與回傳 JSON 形狀已定案(`/api/v1/config_changes` 回 `{url}`;`/api/v1/code_changes` 回 `{name:{url}}`);僅剩 query 參數名(D2 為假設)待上游 backend 確認——只影響 hook 解析層。
- **proxy route 由誰提供**(已解,見 D7):預設自 panel datasource 推導 `/api/datasources/proxy/uid/<uid>`;部署側只需確保該 datasource 帶非空 `url`(demo 已 provisioned),特殊環境以 option 覆寫。
- **`time` 參數語意**:backend 用 current time 做什麼(版本對位?快取鍵?)——不影響 panel 實作(送查詢當下 Unix 秒),但值得上游文件化。
- **快取**:同節點重複右鍵是否快取結果——後續最佳化,本變更不快取。
