## ADDED Requirements

### Requirement: Plugin Scaffold 來源

專案 SHALL 以 `@grafana/create-plugin` 產出的 panel scaffold 為基礎,語言為 TypeScript,框架為 React 18(或更高);scaffold 內含的 `.config/` webpack 設定 MUST 保留,以便享有官方升級路徑。

#### Scenario: scaffold 一致性檢查

- **WHEN** 對比 `package.json`、`.config/`、`plugin.json`
- **THEN** 三者皆符合 `@grafana/create-plugin` 最新穩定版本之結構與必要欄位(`type: panel`、`backend: false`)

### Requirement: Docker Compose 編排

`dev/docker-compose.yml` SHALL 編排兩個 service:`grafana`(以官方 image)與 `kube-state-graph`(以 Docker Hub `marz32one/kube-state-graph` image);兩 service 位於同一 docker network,Grafana 可以 `http://kube-state-graph:8080` 解析到 backend。

#### Scenario: 啟動後 service 健康

- **WHEN** 執行 `docker compose -f dev/docker-compose.yml up -d` 後等待 30 秒
- **THEN** `docker compose ps` 顯示兩個 service 皆為 `running` 狀態,且 Grafana 健康檢查端點 `http://localhost:3000/api/health` 回傳 200

#### Scenario: Backend image 來源為 Docker Hub

- **WHEN** 檢視 `dev/docker-compose.yml` 中 `kube-state-graph` service 設定
- **THEN** `image:` 欄位值為 `marz32one/kube-state-graph:<tag>`(無 `build:` context),`tag` 為明確版本(非空、可為 `latest` 暫定)

### Requirement: Kind Cluster Bootstrap

`dev/scripts/up.sh` SHALL 在 host 端以 `kind` CLI 建立(或重用)一個名為 `ksg-dev` 的 cluster,kubeconfig 輸出至 `dev/.kube/config`;腳本必須 idempotent — 若 cluster 已存在則跳過建立而非報錯。

#### Scenario: 首次啟動建立 cluster

- **WHEN** 在無既有 `ksg-dev` cluster 的環境執行 `dev/scripts/up.sh`
- **THEN** `kind get clusters` 列出 `ksg-dev`,`dev/.kube/config` 檔案存在且可以 `kubectl --kubeconfig dev/.kube/config get nodes` 成功列出節點

#### Scenario: 重複執行不重建

- **WHEN** 在已有 `ksg-dev` cluster 的環境再次執行 `dev/scripts/up.sh`
- **THEN** 腳本偵測到既有 cluster,跳過 `kind create cluster`,以非零執行時間 < 5 秒完成

### Requirement: Backend 與 Kind 整合

`docker-compose` 中 `kube-state-graph` service MUST 透過 bind mount 取得 `dev/.kube/config`,並以 `host.docker.internal` 或等價機制連線到 host 上的 kind API server,使 backend 能讀取 kind 內的 k8s 資源。

#### Scenario: Backend 取得 cluster 節點清單

- **WHEN** Compose 啟動後對 backend 健康端點 `http://localhost:8080/api/v1/nodes`(或對應路徑)發送 GET
- **THEN** 回應為 200 且 JSON body 包含 kind cluster 的節點資訊

### Requirement: Sample Workloads

`dev/manifests/` SHALL 包含一組 Kubernetes YAML,部署後 cluster 內至少存在以下資源類型各 ≥1 個:`Deployment`、`StatefulSet`、`DaemonSet`、`Service`(ClusterIP)、`Service`(Headless)、`Ingress`、`ConfigMap`、`Secret`、`Pod`(獨立)、`HorizontalPodAutoscaler`;以確保 panel-rendering spec 的所有 shape/edge type 皆能於開發與測試中觸發。

#### Scenario: 部署後資源數量達標

- **WHEN** 執行 `kubectl --kubeconfig dev/.kube/config apply -f dev/manifests/` 並等待 60 秒
- **THEN** 對 cluster 查詢上述 10 種資源類型,每種皆回傳 ≥1 個 ready 實例

### Requirement: Plugin 熱重載

開發環境 SHALL 支援 plugin source 變更後 Grafana 不需重啟 container 即可載入新 bundle:`dist/` 目錄 bind mount 進 Grafana plugin 路徑,Grafana 以 `GF_DEFAULT_APP_MODE=development` 與 `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=<plugin-id>` 啟動。

#### Scenario: 修改 source 後瀏覽器 reload 看到新版

- **WHEN** Webpack watch (`npm run dev`) 執行中,開發者修改 `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx` 並儲存
- **THEN** Webpack 在 5 秒內輸出新 bundle 到 `dist/`,瀏覽器 reload Grafana panel 後看到變更生效,且未執行 `docker compose restart`

### Requirement: 一鍵啟動腳本

`npm run dev:up` SHALL 一次完成:啟動 kind cluster → 部署 sample workloads → `docker compose up -d`;對應的 `npm run dev:down` 必須完整清理(`docker compose down`、`kind delete cluster --name ksg-dev`)。

#### Scenario: dev:up 後環境就緒

- **WHEN** 在乾淨環境執行 `npm run dev:up`
- **THEN** 腳本在 5 分鐘內結束,結束時 kind cluster、sample workloads、grafana、backend 四者皆 ready,Grafana UI 可開啟並見 demo dashboard

#### Scenario: dev:down 完整清理

- **WHEN** 對既有 dev 環境執行 `npm run dev:down`
- **THEN** `kind get clusters` 不含 `ksg-dev`,`docker compose ps` 對本專案 compose 無 service running

### Requirement: ESLint 強制基線

專案 SHALL 採用 ESLint v9 flat config (`eslint.config.js`),整合下列 plugin / config 為必裝:`typescript-eslint`(`strict-type-checked` + `stylistic-type-checked`)、`@grafana/eslint-config`、`eslint-plugin-react`、`eslint-plugin-react-hooks`、`eslint-plugin-jsx-a11y`、`eslint-plugin-import-x`、`eslint-plugin-unicorn`、`eslint-plugin-sonarjs`、`eslint-plugin-promise`、`eslint-config-prettier`;`npm run lint` MUST 以 `--max-warnings=0` 執行。

#### Scenario: Lint 通過為零警告

- **WHEN** CI 執行 `npm run lint`
- **THEN** 結束代碼為 0,輸出顯示 `0 errors, 0 warnings`

#### Scenario: 必裝 plugin 全部存在

- **WHEN** 對 `package.json` `devDependencies` 與 `eslint.config.js` 進行檢查
- **THEN** 上述每個 plugin / config 皆出現在 dependencies 且於 flat config 中啟用

### Requirement: TypeScript 嚴格設定

`tsconfig.json` SHALL 啟用 `strict: true`、`noUncheckedIndexedAccess: true`、`exactOptionalPropertyTypes: true`、`noImplicitOverride: true`、`noFallthroughCasesInSwitch: true`、`isolatedModules: true`;`npm run typecheck` 對應 `tsc --noEmit` MUST 通過。

#### Scenario: Typecheck 通過

- **WHEN** CI 執行 `npm run typecheck`
- **THEN** 結束代碼為 0,無 type error 輸出

### Requirement: Knip 死碼偵測

專案 SHALL 整合 `knip`,提供 `npm run lint:knip` script;偵測未使用 exports、未使用 dependencies、孤立檔案;CI 階段以非零警告數失敗。

#### Scenario: Knip 報告為零

- **WHEN** CI 執行 `npm run lint:knip`
- **THEN** Knip 輸出 unused exports / unused deps / orphaned files 三類數量皆為 0

### Requirement: Prettier 格式化

專案 SHALL 採用 `prettier` 作為唯一格式化工具,`.prettierrc` 集中設定;`npm run format:check` 對所有 `*.ts` `*.tsx` `*.md` `*.yaml` `*.json` 檔案 MUST 通過;`eslint-config-prettier` 必須關閉所有與 prettier 衝突的 ESLint 規則。

#### Scenario: Format check 通過

- **WHEN** CI 執行 `npm run format:check`
- **THEN** 結束代碼為 0,無檔案被列為「would be reformatted」

### Requirement: Pre-commit 與 Pre-push Hook

專案 SHALL 透過 `husky` + `lint-staged` 設定 git hook:`pre-commit` 對 staged 檔案執行 `eslint --fix` + `prettier --write`;`pre-push` 執行完整 `npm run lint`、`npm run typecheck`、`npm run test`;任一失敗 MUST 阻擋 commit / push。

#### Scenario: Pre-commit 阻擋 lint error

- **WHEN** 開發者 commit 一個含 ESLint error 的 staged 變更
- **THEN** Hook 執行 `lint-staged`,失敗並阻擋 commit,終端顯示 ESLint 錯誤訊息

### Requirement: CI 並行 Job

GitHub Actions CI workflow SHALL 提供以下五個獨立 job 並行執行:`lint`、`typecheck`、`test`、`knip`、`build`;任一 job 失敗 MUST 標記 PR check failed,阻擋 merge。

#### Scenario: 五個 job 並行執行

- **WHEN** PR 被推送
- **THEN** GitHub Actions 「Checks」清單顯示五個獨立 job,皆於同一 workflow 內並行排程

### Requirement: E2E 測試

E2E 測試 SHALL 使用 `@grafana/plugin-e2e`(Playwright 包裝)撰寫,測試流程涵蓋:啟動 kind + sample workloads → 啟動 docker-compose → Playwright 訪問 Grafana → 開啟 demo dashboard → 斷言節點/邊渲染與互動;CI 與本機跑同一份測試腳本。

#### Scenario: E2E 在 CI 跑通

- **WHEN** GitHub Actions e2e job 執行 `npm run e2e`
- **THEN** Playwright 完成至少一個關鍵 journey(panel 載入 + 至少一個節點顯示),測試通過並產出 trace + screenshot artifact

#### Scenario: E2E 失敗保留 artifact

- **WHEN** E2E 任一 spec 失敗
- **THEN** GitHub Actions upload artifact 包含 Playwright trace、screenshots、video,供事後除錯

### Requirement: 開發者文件

`README.md` SHALL 包含以下章節:Prerequisites(Node 20+、Docker、kind、kubectl)、Quick Start(`npm install` → `npm run dev:up` → `npm run dev`)、Architecture overview、Linting & testing、Troubleshooting(常見問題:kind 啟動失敗、unsigned plugin 警告、port 衝突)。

#### Scenario: README 包含必要章節

- **WHEN** 檢視 `README.md`
- **THEN** 上述五個章節皆存在,且 Quick Start 步驟可被新開發者照做完成本機環境啟動
