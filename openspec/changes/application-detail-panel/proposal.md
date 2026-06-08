## Why

在 KSG 拓撲圖中檢視 Kubernetes pod / workload-controller 節點的維運人員,需要一條從「這是哪個 workload」直達「它的 GitOps 部署來源 / 即時狀態」的捷徑。ArgoCD 是部署的 source of record,而 workload 已經(或可以)以 label 帶上自己的 ArgoCD application name。目前 node-detail 面板只揭露 kind / status / alerts,沒有任何往 ArgoCD 的出口。本變更補上這個缺口:對 pod/controller 節點,從 label 解析 ArgoCD application name,向 REST endpoint 取得該 application 的參考 URL,並在面板中以連結呈現——讓拓撲圖成為事件處理(incident triage)時跳轉 ArgoCD 的起點。

## What Changes

- 在 node-detail 面板新增 **Application section**,**僅對 pod 與 workload controller**(`pod` / `deployment` / `statefulset` / `daemonset` / `job` / `cronjob`)節點顯示;其餘 kind(node/pvc/service/external/switch/cluster/storageclass)不顯示此區塊。
- 新增**右鍵(cytoscape `cxttap`)互動**:在 pod/controller 節點上右鍵 → 解析其 ArgoCD application name → 經 REST 取得參考 URL → 於 Application section 顯示**單一可點擊連結**,以**新分頁**(`target="_blank"` + `rel="noopener"`)開啟。這是面板第一個 `cxttap` handler,需抑制瀏覽器原生右鍵選單,且右鍵選取需與既有 `tap`(左鍵)受控選取狀態保持同步。
- ArgoCD application name 來源固定為 label key **`argocd.argoproj.io/instance`**;**pod** 直接讀自身 `data.labels`,而 **controller 因為是 panel 端從 pod `data.owner` 合成、本身不帶 labels**,改由其**子 pod 聚合**(取任一子 pod 的該 label 值)取得。
- 透過 `@grafana/runtime` 的 **`getBackendSrv()`** 走 Grafana 後端 proxy 發出 REST 呼叫(面板**首次**引入 imperative HTTP);input 為 ArgoCD application name,回傳結果含可跳轉的參考 URL。需處理 loading / error 狀態,並在元件卸載 / StrictMode 雙重掛載下可中止、避免 unmount 後 setState。
- 將 ArgoCD application name(及聚合結果)透過 `normalizeGraph` 與 `resolveSelectedNode()` 串接到 `NodeDetailData`,使面板可見(目前 `resolveSelectedNode()` 只傳 `id/label/kind/status/alerts`,**未傳 labels**)。
- 新增**面板選項**供部署環境配置 REST endpoint(proxy route / 路徑)。
- 新增 ApplicationTable 元件(co-located 於 `node-detail` feature,經 barrel 匯出)與對應單元測試,並更新受影響的既有測試 fixture(`NodeDetailPanel.test.tsx` / `KsgPanel.test.tsx`)。

## Capabilities

### New Capabilities

（無——本變更的行為併入既有 node-detail 面板渲染與資料正規化能力,不新增 capability。）

### Modified Capabilities

- `panel-rendering`:擴充「Node Detail 面板」需求,新增 **Application section** 行為——SHALL 僅對 pod/controller kind 顯示;當節點解析得到 ArgoCD application name 時,經 REST 取得 URL 並以單一連結(新分頁)呈現;涵蓋 app-name 存在/不存在(區塊隱藏或顯示空狀態)、REST loading、REST 成功(可點擊連結)、REST 失敗(錯誤/空狀態)、右鍵觸發與原生選單抑制等 scenario。**delta 必須以 `alert-occurrence-grouping` 改寫後的「Node Detail 面板」需求文字為基準**(Count / Last seen 欄位、`timeRecords[]`),而非 spec baseline 中尚殘留的舊 Pod/Service/Alert/Severity/Time 欄位描述。
- `graph-data-integration`:擴充正規化需求——`normalizeGraph` 在**合成 controller 節點時,自其子 pod 聚合 `argocd.argoproj.io/instance` label**,使 controller 也帶有 ArgoCD application name;並明確記載此 label-key 約定與「application name 串接至節點資料供面板取用」的契約(pod 端 labels 已原樣透傳,controller 端為新增的聚合行為)。

## Impact

- **受影響程式碼**
  - `src/features/node-detail/components/NodeDetailPanel/NodeDetailPanel.tsx`：新增 Application section JSX 與「依 kind 條件顯示」邏輯(沿用既有 sticky `.section` / `.sectionTitle` 樣式)。
  - `src/features/node-detail/components/NodeDetailPanel/NodeDetailPanel.types.ts`：擴充 `NodeDetailData`(ArgoCD application name)與 `NodeDetailPanelProps`(新 callback / prop)。
  - `src/features/node-detail/components/ApplicationTable/*`：**新元件資料夾**(`.tsx` / `.types.ts` / `.test.tsx` / `index.ts`),比照 `AlertTable` 共置慣例。
  - `src/features/node-detail/hooks/useArgoApplicationUrl.ts`：**新 hook**,以 `getBackendSrv()` 發出 REST 呼叫,回傳 `{ loading, url, error }`,支援中止。
  - `src/features/node-detail/index.ts`：barrel 匯出 ApplicationTable(必要時含 hook)。
  - `src/panels/KsgPanel/KsgPanel.tsx`：擴充 `resolveSelectedNode()` 傳遞新欄位;新增 `onApplicationLinkClick` / 右鍵選取的接線。
  - `src/panels/KsgPanel/KsgPanel.types.ts`：新增面板選項(REST endpoint / proxy route)。
  - `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx`：新增 `cy.on('cxttap', ...)` handler 與 `onContextSelect` prop,並抑制原生 contextmenu、與 `selectSingle()` 受控選取同步。
  - `src/features/graph-data/normalize.ts`：於 controller 合成(現行 lines 312–357,合成節點無 labels)加入自子 pod 聚合 ArgoCD label 的邏輯。
  - `src/shared/types/cytoscape.d.ts`：`labels` 已宣告;僅在新增專屬 app-name 欄位時才需更動。
  - `openspec/specs/panel-rendering/spec.md`、`openspec/specs/graph-data-integration/spec.md`：經 `openspec/changes/application-detail-panel/specs/` 產生 MODIFIED delta。
- **相依 / 系統**
  - `@grafana/runtime`(v12.4.2,已宣告但尚未使用)將首次被 import;`fetch` 走 Grafana proxy,毋須新增 HTTP client 相依。
  - **面板首個對外 HTTP surface**:CI 的 plugin-validator 對外部網路存取較敏感,`getBackendSrv()` + proxy route 為官方認可路徑,可降低被標記風險。
  - 需要一條可用的 Grafana 後端 proxy / datasource route(由部署環境提供 / 設定)。
- **變更協作風險**
  - **與 `alert-occurrence-grouping` 衝突**:該變更(僅剩 demo 驗證未完)已改寫同一個「Node Detail 面板」需求並動過 `NodeDetailPanel.tsx` / `NodeDetailPanel.test.tsx` / `KsgPanel.test.tsx`。本變更的 spec delta 與程式碼須以其改寫後狀態為基準,理想上待其 land / archive 後再進行,以免產生 stale / 衝突 delta。
