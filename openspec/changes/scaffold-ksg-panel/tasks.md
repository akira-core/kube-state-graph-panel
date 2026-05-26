## 1. Project Scaffold

- [ ] 1.1 執行 `npx @grafana/create-plugin@latest` 產出 panel scaffold(type=panel、backend=false、TypeScript、React 18+),產物落到 repo 根目錄
- [ ] 1.2 校準 `plugin.json`(id、name、type=panel、author、links、screenshots 預留),整理 `package.json` scripts 命名規範
- [ ] 1.3 將 scaffold 的 `src/` 樣板清空為符合 feature-first 結構的空殼:`src/module.ts`、`src/panels/KsgPanel/`、`src/features/{graph-canvas,graph-data,legend,theme}/`、`src/shared/{components,hooks,utils,constants,types}/`,每個資料夾放佔位 `index.ts`
- [ ] 1.4 新增 `.gitignore`、`.gitattributes`、`.editorconfig`、`.nvmrc`(Node 20+)

## 2. TypeScript 嚴格設定

- [ ] 2.1 撰寫 `tsconfig.json`,啟用 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noImplicitOverride`、`noFallthroughCasesInSwitch`、`isolatedModules`,設定 `paths` 別名(`@/*` → `src/*`)
- [ ] 2.2 新增 `tsconfig.build.json`(emit 設定)與 `tsconfig.test.json`(jest/vitest 用)
- [ ] 2.3 加入 `npm run typecheck` script(`tsc --noEmit`),驗證空殼通過

## 3. Linting & Formatting 工具鏈

- [ ] 3.1 安裝 ESLint v9 與必裝 plugin:`typescript-eslint`、`@grafana/eslint-config`、`eslint-plugin-react`、`eslint-plugin-react-hooks`、`eslint-plugin-jsx-a11y`、`eslint-plugin-import-x`、`eslint-plugin-unicorn`、`eslint-plugin-sonarjs`、`eslint-plugin-promise`、`eslint-config-prettier`、`eslint-plugin-eslint-comments`
- [ ] 3.2 撰寫 `eslint.config.js`(flat config):啟用 `strict-type-checked` + `stylistic-type-checked`,設定 `parserOptions.project`,加入 `import-x/no-default-export`、`import-x/no-restricted-paths`(禁跨 feature 越界 import)、`import-x/order`、`no-cycle`,設定 `eslint-comments/require-description`
- [ ] 3.3 區分目錄嚴格度:`src/**` 嚴格、`dev/**` / `e2e/**` 寬鬆
- [ ] 3.4 安裝 `prettier` + `eslint-config-prettier`,撰寫 `.prettierrc` 與 `.prettierignore`
- [ ] 3.5 加入 `npm run lint`(`--max-warnings=0 --cache`)、`npm run lint:fix`、`npm run format`、`npm run format:check`
- [ ] 3.6 安裝 `knip`,撰寫 `knip.config.ts`,加入 `npm run lint:knip`(unused exports / unused deps / orphan files 任一非零即失敗)
- [ ] 3.7 安裝 `husky` + `lint-staged`,設定 pre-commit(`lint-staged`:對 staged 跑 `eslint --fix` + `prettier --write`)與 pre-push(`lint` + `typecheck` + `test`)

## 4. Cytoscape 整合骨架

- [ ] 4.1 安裝 `cytoscape`、`cytoscape-fcose`、`cytoscape-dagre`、`@types/cytoscape`、`@types/cytoscape-fcose`(若有)、`@types/cytoscape-dagre`(若有)
- [ ] 4.2 建立 `src/features/graph-canvas/registerExtensions.ts`:module top-level 呼叫 `cytoscape.use(fcose)`、`cytoscape.use(dagre)`,並 import 自 `module.ts` 觸發
- [ ] 4.3 撰寫 `src/shared/types/cytoscape.d.ts`,用 declaration merging 擴充 `NodeDataDefinition` 與 `EdgeDataDefinition`(`kind`、`namespace`、`labels`、`edgeType`、`weight` 等欄位)
- [ ] 4.4 建立 `src/features/graph-canvas/sync/diffElements.ts` 純函式:接 `currentJson` 與 `next: ElementDefinition[]`,回傳 `{ toAdd, toRemove, toUpdate }`
- [ ] 4.5 撰寫 `src/features/graph-canvas/sync/diffElements.test.ts`(headless cytoscape):覆蓋新增、刪除、更新、空集合、相同集合五種情境
- [ ] 4.6 實作 `src/features/graph-canvas/hooks/useCytoscape.ts`:`containerRef` + `cyRef`、init effect(空依賴)、update effects(elements / stylesheet / layout 分開)、cleanup `removeAllListeners` + `destroy` + ref=null
- [ ] 4.7 實作 `src/features/graph-canvas/hooks/useGraphLayout.ts`:`useMemo` 計算 layout options,變動時 `cy.stop()` + `cy.layout(opts).run()`
- [ ] 4.8 實作 `src/features/graph-canvas/hooks/useGraphResize.ts`:`ResizeObserver` + debounce 100ms → `cy.resize()` + `cy.fit()`

## 5. Stylesheet 與資源類型對應表

- [ ] 5.1 在 `src/shared/constants/shapeByKind.ts` 定義 `K8sResourceKind` enum/union 與 `SHAPE_BY_KIND` 對應表(Pod=ellipse、Service=round-rectangle、Deployment=hexagon、Ingress=diamond、Node=octagon、StatefulSet=barrel、DaemonSet=tag、ConfigMap=rectangle、Secret=cut-rectangle、HPA=star、fallback=round-rectangle)
- [ ] 5.2 在 `src/shared/constants/colorByEdgeType.ts` 定義 `EdgeType` 與 `COLOR_BY_EDGE_TYPE` 對應表(ownerReference=實線藍、serviceSelector=虛線綠、networkTraffic=漸層橘、ingressBackend=點線紫、fallback=灰實線)
- [ ] 5.3 撰寫 `src/features/graph-canvas/styles/getStylesheet.ts`:pure factory `(theme, shapeMap, colorMap) → Stylesheet[]`
- [ ] 5.4 撰寫 `src/features/graph-canvas/styles/getStylesheet.test.ts`:快照測試 light/dark theme 輸出

## 6. Theme 整合

- [ ] 6.1 實作 `src/features/theme/hooks/useGraphTheme.ts`:包裝 `useTheme2()`,在 theme 變動時觸發 stylesheet 重算
- [ ] 6.2 確認 stylesheet 切換不重建 cytoscape instance(由 `useCytoscape` update effect 處理 `cy.style(stylesheet).update()`)

## 7. Panel 元件層

- [ ] 7.1 實作 `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx` + `.types.ts` + `.test.tsx` + `index.ts`:接收 `elements` / `stylesheet` / `layout` / `onSelect`,內部 `useCytoscape` + `useGraphResize`
- [ ] 7.2 實作 `EmptyState/`、`LoadingOverlay/`、`ErrorBanner/` 三個小元件(各自 co-located 資料夾)
- [ ] 7.3 實作 `src/features/legend/components/NodeLegend/` 與 `EdgeLegend/`(讀取 `shapeByKind` / `colorByEdgeType` 對應表)
- [ ] 7.4 實作 `src/panels/KsgPanel/KsgPanel.tsx`:orchestrator,串接 `useGraphData` + `useGraphTheme` + `GraphCanvas` + `Legend` + 空/錯誤狀態渲染
- [ ] 7.5 實作 `src/panels/KsgPanel/KsgPanel.editor.tsx`:layout 選擇(fcose/dagre)、是否顯示 legend 等 panel options
- [ ] 7.6 撰寫 `src/panels/KsgPanel/KsgPanel.types.ts` 定義 `KsgPanelOptions` 介面與 `defaultOptions`
- [ ] 7.7 在 `src/module.ts` 建立 `PanelPlugin<KsgPanelOptions>(KsgPanel).setPanelOptions(builder => ...)` 並 default export
- [ ] 7.8 撰寫 `KsgPanel.test.tsx`(RTK + ResizeObserver polyfill):空資料、有資料、錯誤三種狀態快照

## 8. OpenAPI 型別生成

- [ ] 8.1 安裝 `openapi-typescript`,加入 `npm run codegen:api` script(從上游 OpenAPI URL 或本地檔生成 `src/shared/types/api.generated.ts`,輸出 header 含 「DO NOT EDIT — auto-generated」)
- [ ] 8.2 與上游確認 OpenAPI spec 來源(`/openapi.json` 端點或 repo 內 `openapi.yaml`);若上游尚未提供,先在本 repo 維護 `openapi/ksg.yaml` 過渡並開 issue 給上游
- [ ] 8.3 執行首次 codegen,將產物 commit 進 git
- [ ] 8.4 撰寫 GitHub Action `.github/workflows/codegen-sync.yml`:cron 每週一執行,變動時自動 PR
- [ ] 8.5 撰寫 `.github/workflows/codegen-drift.yml`(PR check):跑 codegen 後 `git diff --exit-code`,有 diff 即失敗

## 9. Graph Data Integration

- [ ] 9.1 在 `src/shared/types/graph.ts` 定義 `GraphNode` / `GraphEdge` 內部模型
- [ ] 9.2 實作 `src/features/graph-data/normalize.ts`:pure function,把 `api.generated.ts` 型別映射為 `GraphNode[] + GraphEdge[]`
- [ ] 9.3 撰寫 `normalize.test.ts`:覆蓋所有 k8s 資源類型與邊類型轉換,純函式特性(同 input 同 output)
- [ ] 9.4 實作 `src/features/graph-data/hooks/useGraphData.ts`:使用 `getDataSourceSrv()` 取得 datasource、執行 query、套用 `normalize`、回傳 `{ data, isLoading, error }`
- [ ] 9.5 在 ESLint config 加入 `import-x/no-restricted-paths` 規則:`src/features/graph-canvas/**` 與 `src/panels/**` 禁止 import `src/shared/types/api.generated.ts`(強制走 normalize)

## 10. Dev Environment 編排

- [ ] 10.1 撰寫 `dev/docker-compose.yml`:`grafana` service(官方 image 最新穩定版,env 設 `GF_DEFAULT_APP_MODE=development`、`GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=<plugin-id>`,bind mount `dist/` → `/var/lib/grafana/plugins/<plugin-id>`,bind mount `provisioning/` → `/etc/grafana/provisioning`)+ `kube-state-graph` service(`image: marz32one/kube-state-graph:<tag>`,bind mount `dev/.kube/config`,port 8080)
- [ ] 10.2 撰寫 `dev/kind-config.yaml`(單 control-plane + 一個 worker,啟用 ingress port mapping)
- [ ] 10.3 撰寫 `dev/scripts/up.sh`:idempotent(`kind get clusters` 檢查是否已存在 `ksg-dev`),建立 cluster → 匯出 kubeconfig → 部署 sample workloads → `docker compose up -d`
- [ ] 10.4 撰寫 `dev/scripts/down.sh`:`docker compose down -v` + `kind delete cluster --name ksg-dev`
- [ ] 10.5 加入 `npm run dev:up` / `npm run dev:down` / `npm run dev`(webpack watch)scripts

## 11. Sample Workloads & Provisioning

- [ ] 11.1 撰寫 `dev/manifests/` 含 10 種資源類型(Deployment、StatefulSet、DaemonSet、Service ClusterIP、Service Headless、Ingress、ConfigMap、Secret、獨立 Pod、HPA),命名空間用 `demo`
- [ ] 11.2 撰寫 `provisioning/datasources/kube-state-graph.yaml`:自動建立 Infinity datasource 指向 `http://kube-state-graph:8080`
- [ ] 11.3 撰寫 `provisioning/dashboards/dashboards.yaml` provider 與 `provisioning/dashboards/ksg-demo.json` demo dashboard(內含一個 KSG panel)

## 12. 單元測試框架

- [ ] 12.1 安裝 `jest` 或 `vitest`(`@grafana/create-plugin` 預設用 jest,沿用即可),加入 `@testing-library/react`、`@testing-library/jest-dom`
- [ ] 12.2 撰寫 `jest.setup.ts`:`ResizeObserver` polyfill、`HTMLCanvasElement.prototype.getContext` mock(cytoscape 在 jsdom 下需要)
- [ ] 12.3 加入 `npm run test`、`npm run test:watch`、`npm run test:coverage`(目標 80%+ statements/branches/functions/lines)

## 13. E2E 測試

- [ ] 13.1 安裝 `@grafana/plugin-e2e` + `@playwright/test`,執行 `npx playwright install --with-deps chromium`
- [ ] 13.2 撰寫 `playwright.config.ts`:baseURL `http://localhost:3000`、trace `on-first-retry`、video `retain-on-failure`
- [ ] 13.3 撰寫 `e2e/journeys/load-panel.spec.ts`:登入 → 開 demo dashboard → 斷言至少一個 cytoscape 節點 DOM 存在
- [ ] 13.4 撰寫 `e2e/journeys/interact-panel.spec.ts`:點擊節點 → 斷言 selected class 出現
- [ ] 13.5 加入 `npm run e2e` script(內部呼叫 `dev/scripts/up.sh` 後跑 playwright)

## 14. CI Workflow

- [ ] 14.1 撰寫 `.github/workflows/ci.yml`,五個並行 job:`lint`、`typecheck`、`test`、`knip`、`build`,皆走 Node 20 + npm cache
- [ ] 14.2 撰寫 `.github/workflows/e2e.yml`:在 `ubuntu-latest` 上使用 `helm/kind-action` 起 kind → `docker compose up` → `npm run e2e`,失敗時 upload trace + screenshot artifact
- [ ] 14.3 設定 branch protection 規則(於 README 文件化):所有 PR 需通過上述 7 個 check

## 15. 文件

- [ ] 15.1 撰寫 `README.md`,含 Prerequisites / Quick Start / Architecture overview / Linting & testing / Troubleshooting 五章節
- [ ] 15.2 撰寫 `CONTRIBUTING.md`:branch 命名、commit message、PR checklist、新增節點形狀/邊類型的步驟
- [ ] 15.3 撰寫 `docs/architecture.md`:feature-first 結構說明 + cytoscape × React 關鍵流程圖
- [ ] 15.4 在 `README.md` 中引用 OpenSpec change `scaffold-ksg-panel` 為決策來源

## 16. 收尾與驗收

- [ ] 16.1 完整跑 `npm run dev:up` → `npm run dev`,瀏覽器開 Grafana 確認 demo dashboard 顯示節點與邊
- [ ] 16.2 手動驗收 hot reload:修改 `GraphCanvas.tsx` 顏色常數,reload 瀏覽器後生效,期間 docker container 未重啟
- [ ] 16.3 跑完整 CI 流程本機 dry-run:`npm run lint && npm run typecheck && npm run test && npm run lint:knip && npm run build && npm run e2e` 全綠
- [ ] 16.4 對齊 specs 中所有 scenario:逐條 mapping 到測試或手動驗收紀錄(填入 `docs/spec-coverage.md`)
- [ ] 16.5 執行 `/opsx:verify` 確認 implementation ↔ artifacts 對齊
- [ ] 16.6 執行 `/opsx:archive` 歸檔本 change
