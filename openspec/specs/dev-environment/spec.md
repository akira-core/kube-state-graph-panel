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
