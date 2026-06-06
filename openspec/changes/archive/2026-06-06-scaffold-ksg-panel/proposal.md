## Why

Kubernetes 集群中的資源拓撲(Pod、Service、Deployment、Ingress 等)及其相互關係難以僅憑表格與 metrics 直觀理解。後端 `kube-state-graph`(`feat/build-graph-api` 分支)已能將 k8s 資源與 service graph metrics 輸出為 cytoscape.js 格式的 nodes/edges,但目前缺少前端視覺化載體。在 Grafana 中以原生 panel plugin 形式呈現,可讓使用者把 k8s 拓撲圖嵌入既有 dashboard,與 metrics、logs 並列觀察,降低 SRE 排查鏈路問題的認知負擔。

## What Changes

- 新增 Grafana panel plugin 專案骨架(基於 `@grafana/create-plugin`,React 18 + TypeScript)。
- 整合 cytoscape.js 作為圖形渲染引擎,封裝為 React 元件並支援 Grafana panel lifecycle(resize、theme、data refresh)。
- 透過 Grafana datasource(預設 HTTP/Infinity 或自訂 backend datasource,二擇一於 design 階段決定)消費 `kube-state-graph` API,並從上游 repo 的 OpenAPI 規格自動產生 TypeScript 型別。
- 不同 k8s 資源類型對應不同節點形狀(例如 Pod=ellipse、Service=round-rectangle、Deployment=hexagon、Ingress=diamond、Node=octagon 等),完整對應表於 specs 階段定義。
- 不同邊類型(owner reference、service selector、network traffic、ingress backend 等)對應不同顏色/線型。
- 滑鼠 hover 於節點/邊時顯示 metadata tooltip(節點:name + kind + namespace + key labels;邊:edgeType + source→target + key labels),tooltip 固定渲染於 canvas 右上角,不覆蓋圖形,且 `pointer-events: none` 不阻擋互動。
- 透過 Grafana panel options(sidebar)的 MultiSelect 提供 node kind / edge type 過濾,被過濾元素以 `visibility: hidden` 隱藏(不重跑 layout、保留位置),邊在任一端點被隱藏時自動隱藏。
- 開發環境支援熱重載(plugin source 變更後 Grafana 自動載入,無需重新 build container),透過 docker-compose 編排 `grafana` + `kube-state-graph` backend image + 本地 `kind` cluster。
- 提供 sample workload manifests(deployment/service/ingress/configmap 多樣化組合)部署到 kind cluster,確保各種節點形狀與邊類型在開發與 E2E 測試中皆可觸發。
- E2E / integration 測試在 CI 與本機皆啟動 kind cluster,實際打通 `kind → kube-state-graph → grafana panel` 端到端鏈路驗證渲染結果。

## Capabilities

### New Capabilities

- `panel-rendering`:Grafana panel 主體,負責 cytoscape.js 容器掛載、節點/邊樣式對應、佈局演算法選擇、主題適配(light/dark)、互動行為(zoom/pan/click/hover)、hover tooltip 顯示元素 metadata、依 node kind / edge type 過濾顯示、Grafana panel options 面板。
- `graph-data-integration`:資料來源整合層,負責呼叫 `kube-state-graph` API、依據上游 OpenAPI 產生並維護 TypeScript 型別契約、將 API response 正規化為 cytoscape.js elements、處理錯誤與 loading 狀態。
- `dev-environment`:本機開發與測試基礎建設,涵蓋 docker-compose 編排(grafana + backend + kind)、kind cluster bootstrap 腳本、sample k8s workloads、hot reload 設定、E2E 測試(以 Playwright 驅動 Grafana UI)。
- `pod-parent-mode`:Pod compound 視角切換能力(legend 互動按鈕)。涵蓋 `applyPodParentMode` 純函式(`service` 模式把 pod 重新掛到其 service、合成 pod→node 的 `pod-runs-on-node` drawn edge、移除對應 `service-selects-pod` 邊;無 service 的 pod 維持掛 node)、模式相依的可繪製邊集合 `drawnEdgeTypesForMode` 與 legend/stylesheet 適配、模式切換的重新佈局。`panel-rendering` 的「Node Kind / Edge Type 過濾」需求同步擴充 orphan 級聯隱藏(過濾後失去所有可見連線且無可見子節點的節點遞迴隱藏)。

### Modified Capabilities

(無 — 此為全新 repo 的初始骨架)

## Impact

- **新檔案**:`src/`(panel 元件與 hooks,含 `src/features/hover-tooltip/` 與 `src/features/element-filter/`)、`src/types/`(從 OpenAPI 產生的型別)、`provisioning/`(Grafana datasource + dashboard 預配置)、`dev/docker-compose.yml`、`dev/kind-config.yaml`、`dev/manifests/`(sample workloads)、`dev/scripts/`(bootstrap + teardown)、`e2e/`(Playwright 測試)、`plugin.json`、`package.json`、`tsconfig.json`、`.config/`(Grafana plugin webpack 設定)。
- **外部相依**:`@grafana/data`、`@grafana/ui`、`@grafana/runtime`、`cytoscape`、`cytoscape-fcose`(或其他 layout extension);dev 相依 `docker`、`kind`、`kubectl`、`@playwright/test`。
- **上游依賴**:`Marz32onE/kube-state-graph` `feat/build-graph-api` 分支需提供 OpenAPI spec 端點(或於 repo 中維護 `openapi.yaml`);若上游尚未提供,需先協調補上。
- **CI**:需要可執行 Docker 與 kind 的 runner(GitHub Actions `ubuntu-latest` 即可),CI job 啟動 kind → 部署 backend → 跑 E2E。
- **不影響**:現有 `kube-state-graph` 後端程式碼(本 repo 不嵌入其原始碼,僅透過 image 與 OpenAPI 契約整合)。
