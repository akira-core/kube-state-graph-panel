# dev-environment Specification

## Purpose

TBD - created by archiving change scaffold-ksg-panel. Update Purpose after archive.
## Requirements

### Requirement: Plugin Scaffold 來源

專案 SHALL 以 `@grafana/create-plugin` 產出的 panel scaffold 為基礎,語言為 TypeScript,框架為 React 18(或更高);scaffold 內含的 `.config/` webpack 設定 MUST 保留,以便享有官方升級路徑。

#### Scenario: scaffold 一致性檢查

- **WHEN** 對比 `package.json`、`.config/`、`plugin.json`
- **THEN** 三者皆符合 `@grafana/create-plugin` 最新穩定版本之結構與必要欄位(`type: panel`、`backend: false`)

### Requirement: Docker Compose orchestration

`docker-compose.yaml` SHALL orchestrate exactly **one** service: `grafana` (the official
image), with the plugin's `dist/` bind-mounted into its plugin path and the Infinity
datasource plugin auto-installed via `GF_INSTALL_PLUGINS`. There SHALL be no Compose
profiles, no backend service, no metrics store, and no seeder.

A plain `docker compose up -d` SHALL bring the demo fully to life. Because the only dashboard
target is `source: "inline"`, Grafana issues no request on the panel's behalf and there is
nothing to wait for, fail against, or configure a tag for.

#### Scenario: One service, no profiles

- **WHEN** running `docker compose config --services`
- **THEN** the output is exactly `grafana`, and `docker compose --profile backend config --services` prints the same single service

#### Scenario: Healthy after start with no other container

- **WHEN** running `docker compose up -d` and waiting 30 seconds
- **THEN** `docker compose ps` shows `grafana` running and `http://localhost:3000/api/health` returns 200

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

### Requirement: E2E tests (reduced scope)

E2E tests SHALL use `@grafana/plugin-e2e` and consist of a smoke spec against the **showcase**
dashboard: open the provisioned `ksg-switch-demo.json`, assert `[data-testid="graph-canvas"]`
mounts, and assert the legend controls that depend on the fixture's content are present.

This is the only e2e spec the repository can have, and that is a property of the design
rather than a gap: with no backend, there is no second data path to smoke-test. What the spec
proves that unit tests cannot is the round trip — that the generated payload survives the
dashboard JSON and the Infinity inline target and reaches a mounted cytoscape graph.

Developer-triggered locally (`npm run e2e`); not run in CI.

#### Scenario: Showcase smoke spec passes against a plain `docker compose up`

- **WHEN** a developer runs `npm run e2e` against a Grafana started with no profile
- **THEN** the showcase spec passes with no backend container running

### Requirement: Developer documentation

`README.md` SHALL contain: Prerequisites (Node 22+, Docker), Quick Start
(`npm install` → `npm run build` → `docker compose up -d` → open the showcase dashboard),
Architecture overview, Linting & testing, and Troubleshooting.

Quick Start MUST be completable on a clean checkout with **no** image to pull beyond Grafana
and no credentials, and MUST NOT reference a backend service, a metrics store, a seeder, an
image tag, or a Compose profile. The documentation SHALL state where the demo data comes
from and how to change it (edit the fixture, run `npm run fixture:build`).

Troubleshooting SHALL cover the unsigned-plugin warning, port conflicts, and a stale
generated dashboard.

#### Scenario: Quick Start works offline of any backend

- **WHEN** a new developer follows Quick Start on a clean checkout
- **THEN** the showcase dashboard renders a populated graph, and no step mentions a backend

### Requirement: The typed fixture is the single source of the panel's demo data

`src/shared/fixtures/showcaseGraph.ts` SHALL export `SHOWCASE_GRAPH`, annotated with the
`WireGraph` type from `src/shared/types/wire.ts`, as **the** graph the local demo, the
Playwright showcase spec, and the fixture coverage suite all read. The repository SHALL
contain no service, script, or dashboard that obtains graph data from a running
kube-state-graph server, a Prometheus-compatible store, or a Kubernetes cluster.

The `WireGraph` annotation is the mechanism, not decoration: because `normalizeGraph`
accepts `unknown` and validates at runtime, a field the panel learns to read would otherwise
be invisible to every compile-time check. Typing the fixture makes teaching normalize a new
field and forgetting the demo a `npm run typecheck` failure instead of a blank spot nobody
re-reads.

The fixture SHALL carry the complete response envelope the backend sends — `apiVersion`,
`clusters`, and `elements` — not `elements` alone, so the demo exercises the same body shape
a deployment would receive. `clusters` SHALL list Kubernetes cluster names only; an ONTAP
cluster name MUST NOT appear in it.

The fixture MAY carry fields no backend release emits — `status`, `alerts`, `time_records`,
and the `switch` / `network` kinds with their `switch-to-switch` / `node-to-switch` edges are
the panel's own extension surface. Where it does, the fixture and the wire types MUST record
that provenance in a comment, so a reader cannot mistake a panel-only field for part of the
backend contract and "correct" the backend to match.

#### Scenario: No backend anywhere in the repository

- **WHEN** inspecting `docker compose config --services`, `provisioning/datasources/`, and every file under `dev/` and `tests/`
- **THEN** the only Compose service is `grafana`, the provisioned Infinity datasource carries no `url`, and no file addresses a kube-state-graph, VictoriaMetrics, or Kubernetes endpoint

#### Scenario: A wire field added to normalize without fixture coverage fails typecheck

- **WHEN** a new field is added to `WireGraph` as required, and `SHOWCASE_GRAPH` is not updated
- **THEN** `npm run typecheck` fails

### Requirement: The demo dashboard is generated from the fixture, and drift fails the build

`provisioning/dashboards/ksg-switch-demo.json` SHALL contain exactly one Infinity target with
`source: "inline"`, whose `data` string is **generated** from `SHOWCASE_GRAPH` by
`dev/buildFixtureDashboard.mjs` and never hand-edited.

- `npm run fixture:build` SHALL rewrite that target and leave the rest of the dashboard
  byte-identical.
- `npm run fixture:check` SHALL exit non-zero when the committed dashboard does not match
  what the fixture would produce, naming `npm run fixture:build` as the remedy.
- The check SHALL run in CI and in the `pre-push` hook.

The generator SHALL fail loudly rather than write a partial file when the dashboard does not
contain exactly one inline target: a dashboard whose shape moved must stop the build, not
silently publish a demo carrying stale data.

Grafana provisioning reads dashboard JSON from disk, so the payload has to physically live
in the committed file; the drift gate is what keeps a generated artefact from forking away
from its source on the first hand-edit.

#### Scenario: Regenerating a committed dashboard is a no-op

- **WHEN** `npm run fixture:build` runs against a tree where the fixture and dashboard agree
- **THEN** the dashboard file is unchanged and `npm run fixture:check` exits 0

#### Scenario: A fixture edit that was never compiled in fails CI

- **WHEN** `SHOWCASE_GRAPH` is edited and the dashboard is left untouched
- **THEN** `npm run fixture:check` exits non-zero and prints the `npm run fixture:build` remedy

### Requirement: The fixture covers every kind and edge type the panel can draw

`src/shared/fixtures/showcaseGraph.test.ts` SHALL assert that `normalizeGraph(SHOWCASE_GRAPH)`
produces:

- an empty `errors` array — the partial-parse channel exists for a real backend having a bad
  day, so anything landing there is this repository's own mistake;
- no edge whose `source` or `target` is absent from the fixture's own nodes, and no node
  whose `parent` is;
- at least one element for **every** key of `ICON_SVG_BY_KIND` and **every** key of
  `EDGE_STYLE_BY_TYPE`.

Coverage SHALL be asserted against those two canonical maps rather than the panel's
filterable subset, so the virtual `network` wrapper counts. Anchoring there makes "add a kind
to the map" and "show it in the demo" one enforced task.

The suite SHALL additionally pin the demo cases that exist to be looked at rather than
merely parsed: all three `ready_status` values, a claim that joined an aggregate beside one
that did not, a QoS-capped storage edge beside an uncapped one, a measured error rate beside
a measured-clean zero beside an unmeasured edge, a legitimately tiny rate that must not round
to nothing, and both `labels.role` ingress shapes with their differing dash and visibility
behaviour.

#### Scenario: A newly drawable kind with no fixture element fails

- **WHEN** a key is added to `ICON_SVG_BY_KIND` and no fixture node carries that kind
- **THEN** `showcaseGraph.test.ts` fails, naming the uncovered kind
