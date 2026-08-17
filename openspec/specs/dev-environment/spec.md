# dev-environment Specification

## Purpose

TBD - created by archiving change scaffold-ksg-panel. Update Purpose after archive.
## Requirements
### Requirement: Plugin Scaffold 來源

專案 SHALL 以 `@grafana/create-plugin` 產出的 panel scaffold 為基礎,語言為 TypeScript,框架為 React 18(或更高);scaffold 內含的 `.config/` webpack 設定 MUST 保留,以便享有官方升級路徑。

#### Scenario: scaffold 一致性檢查

- **WHEN** 對比 `package.json`、`.config/`、`plugin.json`
- **THEN** 三者皆符合 `@grafana/create-plugin` 最新穩定版本之結構與必要欄位(`type: panel`、`backend: false`)

### Requirement: Docker Compose 編排

`docker-compose.yaml` SHALL 編排一個恆啟的 `grafana` service(官方 image),以及置於 **Compose `backend` profile** 的 backend 三件組(`kube-state-graph`(`marz32one/kube-state-graph` Docker Hub image)+ `victoriametrics` + `ksg-seeder`)作為**可選**啟用;所有 service 位於同一 docker network,Grafana 可以 `http://kube-state-graph:8080` 解析到 backend。預設 `docker compose up`(無 profile)只起 `grafana`(供 backend-free 的 inline showcase 使用);`docker compose --profile backend up` 額外起 backend 三件組(`KSG Demo` 改由真實 backend 驅動)。`grafana` MUST NOT 對 backend 設 `depends_on`(否則無 profile 啟動會因相依未啟用之 service 而報錯;datasource 為延遲解析)。**精簡版:不再要求 kind cluster + bootstrap 腳本;backend 連線目標由開發者環境決定。**

#### Scenario: 啟動後 service 健康

- **WHEN** 執行 `docker compose up -d` 後等待 30 秒
- **THEN** `docker compose ps` 顯示 `grafana` 為 `running` 狀態,且 Grafana 健康檢查端點 `http://localhost:3000/api/health` 回傳 200

#### Scenario: backend profile 為可選

- **WHEN** 比對 `docker compose config --services` 與 `docker compose --profile backend config --services`
- **THEN** 前者只列出 `grafana`;後者另列出 `kube-state-graph` / `victoriametrics` / `ksg-seeder`

### Requirement: Plugin 熱重載

開發環境 SHALL 支援 plugin source 變更後 Grafana 不需重啟 container 即可載入新 bundle:`dist/` 目錄 bind mount 進 Grafana plugin 路徑,Grafana 以 `GF_DEFAULT_APP_MODE=development` 與 `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=<plugin-id>` 啟動。

#### Scenario: 修改 source 後瀏覽器 reload 看到新版

- **WHEN** Webpack watch (`npm run dev`) 執行中,開發者修改 `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx` 並儲存
- **THEN** Webpack 在 5 秒內輸出新 bundle 到 `dist/`,瀏覽器 reload Grafana panel 後看到變更生效,且未執行 `docker compose restart`

### Requirement: ESLint 基線(精簡版)

專案 SHALL 採用 ESLint v9 flat config (`eslint.config.mjs`),整合下列 plugin 為必裝:`typescript-eslint`(`recommendedTypeChecked`)、`@grafana/eslint-config`、`eslint-plugin-react`、`eslint-plugin-react-hooks`、`eslint-plugin-import-x`、`eslint-config-prettier`;`npm run lint` MUST 以 `--max-warnings=0` 執行。

**精簡版:取消 sonarjs、unicorn、promise、eslint-comments、jsx-a11y、knip、`import-x/no-restricted-paths` 等規則 —— 對小 plugin 噪音 > 訊號,真正的邊界由 code review + barrel 慣例維持。**

#### Scenario: Lint 通過為零警告

- **WHEN** CI 執行 `npm run lint`
- **THEN** 結束代碼為 0,輸出顯示 `0 errors, 0 warnings`

### Requirement: TypeScript 嚴格設定

`tsconfig.json` SHALL 啟用 `strict: true`、`noUncheckedIndexedAccess: true`、`exactOptionalPropertyTypes: true`、`noImplicitOverride: true`、`noFallthroughCasesInSwitch: true`、`isolatedModules: true`;`npm run typecheck` 對應 `tsc --noEmit` MUST 通過。

#### Scenario: Typecheck 通過

- **WHEN** CI 執行 `npm run typecheck`
- **THEN** 結束代碼為 0,無 type error 輸出

### Requirement: Prettier 格式化

專案 SHALL 採用 `prettier` 作為唯一格式化工具,`.prettierrc.js` 沿用 scaffold 預設;`eslint-config-prettier` 必須關閉所有與 prettier 衝突的 ESLint 規則。`npm run format` 可一鍵格式化全 repo。

#### Scenario: Format 一致

- **WHEN** 開發者執行 `npm run format`
- **THEN** Prettier 對全 repo 重寫格式,後續再執行 `prettier --check .` 結束代碼為 0

### Requirement: Pre-commit 與 Pre-push Hook

專案 SHALL 透過 `husky` + `lint-staged` 設定 git hook:`pre-commit` 對 staged 檔案執行 `eslint --fix` + `prettier --write`;`pre-push` 執行完整 `npm run lint`、`npm run typecheck`、`npm run test:ci`;任一失敗 MUST 阻擋 commit / push。

#### Scenario: Pre-commit 阻擋 lint error

- **WHEN** 開發者 commit 一個含 ESLint error 的 staged 變更
- **THEN** Hook 執行 `lint-staged`,失敗並阻擋 commit,終端顯示 ESLint 錯誤訊息

### Requirement: CI Workflow(精簡版)

GitHub Actions CI workflow SHALL 提供單一 job 依序執行 `lint` → `typecheck` → `test:ci` → `build`;失敗 MUST 標記 PR check failed,阻擋 merge。Node 版本鎖定於 `.nvmrc` 對應之 LTS。

**精簡版:取消 5-job 平行矩陣 + 獨立 E2E workflow + 獨立 knip job —— 小 plugin 一個 job 即足夠;E2E 由開發者本機觸發,待後續穩定再加入 CI。**

#### Scenario: CI 通過所有檢查

- **WHEN** PR 被推送
- **THEN** GitHub Actions 「Checks」清單顯示一個 `ci` job,完成 lint/typecheck/test/build 四步皆通過

### Requirement: E2E 測試(精簡版)

E2E 測試 SHALL 使用 `@grafana/plugin-e2e`(Playwright 包裝)撰寫一個 smoke spec:啟動 grafana(docker-compose) → 開啟 demo dashboard → 斷言 `[data-testid="graph-canvas"]` DOM 存在。**精簡版:取消 kind cluster + 多 journey + CI 跑 E2E 的要求,改為本機開發者觸發。**

#### Scenario: 本機 E2E 跑通

- **WHEN** 開發者於已啟動 grafana 環境執行 `npm run e2e`
- **THEN** Playwright 完成 smoke spec 並通過

### Requirement: 開發者文件

`README.md` SHALL 包含以下章節:Prerequisites(Node 22+、Docker)、Quick Start(`npm install` → `docker compose up -d` → `npm run dev` → 開瀏覽器)、Architecture overview、Linting & testing、Troubleshooting(常見問題:unsigned plugin 警告、port 衝突、backend 無法連線 cluster)。

#### Scenario: README 包含必要章節

- **WHEN** 檢視 `README.md`
- **THEN** 上述五個章節皆存在,且 Quick Start 步驟可被新開發者照做完成本機環境啟動

### Requirement: Demo seeder 推送 RED 來源序列

`dev/victoriametrics/seed.sh` MUST 於每個 tick 除既有的 `traces_service_graph_request_total` 之外,額外推送兩組 RED 來源序列,使 `docker compose --profile backend up` 的 `KSG Demo` 能實際產生 `data.metrics`:

- `traces_service_graph_request_failed_total` —— 失敗計數器。
- `traces_service_graph_request_server_seconds_bucket` —— server 端耗時的 **classic histogram**(累積式 bucket,含 `le` label)。

後端以**完整 label set 的精確比對**(除 `__name__`;histogram 另除 `le`)把三組序列 join 到同一條邊,因此:

- 兩組新序列的 label set MUST 與其對應的 `traces_service_graph_request_total` 序列**逐字完全一致**(histogram 僅可多出 `le`)。任何多出、少掉或拼字不同的 label 都會使 join 落空,`error_rate` 與 `p90_server_ms` 靜默消失。
- 三組序列 MUST 與既有 total 一樣**每 tick 遞增**(至少兩個樣本落在查詢視窗內),否則 `rate()` 為 0,後端不產生量測值。
- 失敗計數 MUST 嚴格小於對應的 total 計數且大於 0,使 `error_rate` 落在開區間 `(0,1)`,demo 才看得出非零錯誤率。
- histogram MUST 至少提供兩個 `le` 邊界並**必定包含 `le="+Inf"`**,且值為累積(單調不減),否則後端無法計算 p90 而省略 `p90_server_ms`。

seeder MUST NOT 為任一序列加上 `edge_relation="link"` label(後端對 RED 來源序列排除該值,加上會使該邊失去量測)。

fixture MUST 同時涵蓋**有 RED** 與**無 RED** 兩種邊,使前端的「省略即不顯示」行為在 demo 中可被肉眼驗證:指向 `external` 節點的那條邊(`api.payments.io`)依後端契約永不帶 `metrics`,故其存在即滿足此要求,無須額外新增序列。

#### Scenario: 每 tick 三組序列一併推送

- **WHEN** `ksg-seeder` 容器完成一次 tick
- **THEN** 該次 push 的 payload 同時含 `traces_service_graph_request_total`、`traces_service_graph_request_failed_total` 與 `traces_service_graph_request_server_seconds_bucket` 三種 metric,且三者的計數值皆較上一 tick 增加

#### Scenario: 新序列的 label set 與 total 完全對齊

- **WHEN** 檢視 seeder 為某一條邊(例如 `prod/gateway → dr/consumer`)推送的三組序列
- **THEN** `_failed_total` 的 label set 與該邊的 `_total` 逐字相同;`_server_seconds_bucket` 的 label set 亦相同,僅多一個 `le`

#### Scenario: histogram 具備可計算 p90 的形狀

- **WHEN** 檢視某條邊的 `_server_seconds_bucket` 序列
- **THEN** 其含有至少兩個 `le` 邊界並包含 `le="+Inf"`,且 bucket 值沿 `le` 遞增方向單調不減

#### Scenario: demo 同時呈現有 RED 與無 RED 的邊

- **WHEN** 開發者以 `docker compose --profile backend up` 啟動全端 demo 並在 `KSG Demo` 上 hover 各條邊
- **THEN** `pod-calls-service`(gateway → mongo-svc、consumer → nats-svc)與跨叢集 `pod-calls-pod`(prod/gateway → dr/consumer)顯示 RED rows
- **AND** 指向 `external` 節點 `api.payments.io` 的邊不顯示任何 RED row

