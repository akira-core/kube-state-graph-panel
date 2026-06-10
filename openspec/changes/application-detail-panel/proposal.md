## Why

在 KSG 拓撲圖中檢視 Kubernetes pod / workload-controller 節點的維運人員,需要兩條從拓撲圖直達部署事實的捷徑:(1)「這是哪個 workload」→「它的 GitOps 部署來源」——ArgoCD 是部署的 source of record;(2)「這個 pod 跑了哪些 container、各用什麼 image」→「該 image 的進一步資訊(registry 詳情 / 掃描報告等外部頁面)」。目前 node-detail 面板只揭露 kind / status / alerts,兩者皆無出口。本變更補上這個缺口:對 pod/controller 節點右鍵,在**同一個 node-detail 面板(與 Alerts 區塊同位置、同版型)**顯示 (a) ArgoCD application 連結與 (b) Containers 區塊——每個 container 的 name 與 image,並各帶一顆 URL 按鈕跳轉該 image 的外部詳情頁(URL 由同一個 graph API backend 提供)——讓拓撲圖成為事件處理(incident triage)時跳轉 ArgoCD 與 image 詳情的起點。

## What Changes

- 新增**右鍵(cytoscape `cxttap`)互動**:在 pod/controller 節點上右鍵 → 開啟既有 node-detail 面板(與左鍵 tap 同一受控選取狀態、同位置同版型)並觸發本變更的 REST lookup。這是面板第一個 `cxttap` handler,需抑制瀏覽器原生右鍵選單,且右鍵選取需與既有 `tap`(左鍵)受控選取保持同步。
- node-detail 面板新增兩個區塊,**僅對 pod 與 workload controller**(`pod` / `deployment` / `statefulset` / `daemonset` / `job` / `cronjob`)節點顯示;其餘 kind 不顯示:
  - **Application section**(沿用原設計,**並存**;邏輯比照 Containers section):顯示該節點的 ArgoCD application name 與**單一 URL 按鈕**——以**同一組 input** 呼叫 backend、但回傳**單一** Argo app detail URL,按鈕以**新分頁**(`target="_blank"` + `rel="noopener"`)開啟。
  - **Containers section**(本次新增):**pod** 列出自身 containers(container name + image);**controller** 聚合其子 pod 的 containers(以 name+image 去重)。每列一顆 **URL 按鈕**,開新分頁到該 container image 的外部詳情 URL。
- **ArgoCD application name 來源改版**:backend 將在 pod 節點新增 **`application` 屬性**(取代原規劃的 `argocd.argoproj.io/instance` label 解析);**controller 因為是 panel 端從 pod `data.owner` 合成、本身不帶此屬性**,由其**子 pod 聚合**(取任一子 pod 的 `application` 值)。
- **containers 資料來源**:backend 將在 pod 節點新增 **`containers` 欄位**(形如 `[{ name, image }]`);`normalizeGraph` 對 pod 原樣透傳、對合成 controller 自子 pod 聚合。欄位缺失(舊版 backend)時區塊**優雅隱藏**,不影響面板其餘功能。
- **告警(alerts)pod → controller 傳播**(本次新增):合成 controller 節點時,自其**子 pod 聚合 `alerts`**(穩定 pod 排序串接;缺 `pod` 欄的項目以來源 pod label 回填,使 controller 告警表可歸屬到 pod;帶 `id` 的項目跨 pod 以 `id` 去重)——controller 的 node-detail 告警表格因此顯示旗下所有 pod 的告警(現況:controller 無 `alerts`,表格恆「No alerts」)。**節點顏色維持只由 status 驅動**(既有 `worstStatus` 彙整不變,alerts 不參與上色)。面板端零修改(`resolveSelectedNode` / `AlertTable` 已照 `data.alerts` 渲染)。
- **image-detail REST lookup**:右鍵觸發後,呼叫**同一個 graph API backend** 的 image-detail endpoint(面板**首次**引入 imperative HTTP,經 `@grafana/runtime` 的 `getBackendSrv()` 走 Grafana proxy):
  - **input**(兩個查詢共用):ArgoCD application name / pod-controller kind / pod-controller name / current time(pod 節點的 controller kind/name 取自其 owner;controller 節點取自身)。
  - **output**:**image-detail 查詢**(`/api/v1/code_changes`)回 **map(container name → URL)**——面板以 container name 查 map,為每列 URL 按鈕綁定對應 URL,**不含 image 參數**;**application-detail 查詢**(`/api/v1/config_changes`)回**單一 URL**(Argo app detail)。一次右鍵觸發兩個查詢,涵蓋該節點所有 containers 與 app 連結。
  - 需處理 loading / error 狀態,並在元件卸載 / StrictMode 雙重掛載下可中止、避免 unmount 後 setState。
- 新增**面板選項**供部署環境配置 REST endpoint(proxy route / 路徑)。
- **demo**:seeder 新增 container/image 假資料(視 backend 版本支援,如 `kube_pod_container_info` 型 series),讓 showcase/demo 可見新區塊。
- 元件:**ApplicationTable**(原規劃)與 **ContainerTable**(新)皆 co-located 於 `node-detail` feature、經 barrel 匯出,含單元測試;更新受影響的既有測試 fixture(`NodeDetailPanel.test.tsx` / `KsgPanel.test.tsx`)。

## Capabilities

### New Capabilities

(無——本變更的行為併入既有 node-detail 面板渲染與資料正規化能力,不新增 capability。)

### Modified Capabilities

- `panel-rendering`:擴充「Node Detail 面板」需求,新增 **Application section** 與 **Containers section** 行為——SHALL 僅對 pod/controller kind 顯示;右鍵觸發 REST 取得 container→URL map;涵蓋 application/containers 存在/不存在(區塊隱藏)、REST loading、REST 成功(每 container 列一顆可點擊 URL 按鈕 + 單一 ArgoCD 連結)、REST 失敗(錯誤/空狀態,不影響其餘區塊)、map 缺某 container key(該列按鈕停用/隱藏)、右鍵觸發與原生選單抑制等 scenario。**delta 必須以 `alert-occurrence-grouping` 改寫後的「Node Detail 面板」需求文字為基準**(Count / Last occurred 欄位、`timeRecords[]`),而非 spec baseline 中尚殘留的舊欄位描述。
- `graph-data-integration`:擴充正規化需求——`normalizeGraph` 透傳 pod 節點的 **`application`** 與 **`containers`** 新欄位;在**合成 controller 節點時,自其子 pod 聚合**兩者(application 取任一、containers 以 name+image 去重合併);並明確記載「欄位缺失時為 `undefined`、面板據此優雅隱藏」的契約。另新增「controller 告警自子 pod 聚合」需求:合成 controller 時聚合子 pod `alerts`(pod 回填 / `id` 去重 / 無值省略),且 MUST NOT 影響 `worstStatus`——**status 仍為唯一上色來源**。

## Impact

- **受影響程式碼**
  - `src/features/node-detail/components/NodeDetailPanel/NodeDetailPanel.tsx`:新增 Application + Containers section JSX 與「依 kind 條件顯示」邏輯(沿用既有 sticky `.section` / `.sectionTitle` 樣式)。
  - `src/features/node-detail/components/NodeDetailPanel/NodeDetailPanel.types.ts`:擴充 `NodeDetailData`(`application`、`containers`)與 `NodeDetailPanelProps`(REST 狀態 / callback)。
  - `src/features/node-detail/components/ApplicationTable/*`:**新元件資料夾**(ArgoCD 連結),比照 `AlertTable` 共置慣例。
  - `src/features/node-detail/components/ContainerTable/*`:**新元件資料夾**(container/image 列 + URL 按鈕)。
  - `src/features/node-detail/hooks/*`:**新 hook**(以 `getBackendSrv()` 呼叫 image-detail 與 application-detail 查詢,共用同一組 input,回傳 `{ loading, urlByContainer, applicationUrl, error }`,支援中止;單一 hook 或兩個 hook 於 design 釘)。
  - `src/features/node-detail/index.ts`:barrel 匯出新元件(必要時含 hook)。
  - `src/panels/KsgPanel/KsgPanel.tsx`:`resolveSelectedNode()` 傳遞 `application` / `containers`;右鍵選取與 REST 觸發接線。
  - `src/panels/KsgPanel/KsgPanel.types.ts`:新增面板選項(REST endpoint / proxy route)。
  - `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx`:新增 `cy.on('cxttap', ...)` handler 與 `onContextSelect` prop,抑制原生 contextmenu、與 `selectSingle()` 受控選取同步。
  - `src/features/graph-data/normalize.ts`:透傳 pod `application` / `containers`;合成 controller 時自子 pod 聚合兩欄位,並聚合子 pod `alerts`(pod 回填 / `id` 去重)。
  - `src/shared/types/cytoscape.d.ts`:宣告 `application?: string` 與 `containers?: Array<{ name: string; image: string }>`。
  - `dev/victoriametrics/seed.sh` / `provisioning/*`:demo 假資料補 container/image(視 backend 支援)。
  - `openspec/specs/panel-rendering/spec.md`、`openspec/specs/graph-data-integration/spec.md`:經 `openspec/changes/application-detail-panel/specs/` 產生 MODIFIED delta。
- **相依 / 系統**
  - **上游 backend 配合**:需要 kube-state-graph backend 新版在 pod 節點輸出 `application` / `containers` 欄位,並提供 image-detail endpoint(input:app name / controller kind / controller name / current time;output:container→URL map)。舊版 backend → 欄位缺失 → 區塊優雅隱藏,純增量、無 schema 遷移。
  - `@grafana/runtime`(v12.4.2,已宣告但尚未使用)將首次被 import;走 Grafana proxy,毋須新增 HTTP client 相依。
  - **面板首個對外 HTTP surface**:CI 的 plugin-validator 對外部網路存取較敏感,`getBackendSrv()` + proxy route 為官方認可路徑,可降低被標記風險。
- **變更協作風險**
  - **與 `alert-occurrence-grouping` 衝突**:該變更已改寫同一個「Node Detail 面板」需求並動過 `NodeDetailPanel.tsx` / `NodeDetailPanel.test.tsx` / `KsgPanel.test.tsx`。本變更的 spec delta 與程式碼須以其改寫後狀態為基準,理想上待其 land / archive 後再進行,以免產生 stale / 衝突 delta。
