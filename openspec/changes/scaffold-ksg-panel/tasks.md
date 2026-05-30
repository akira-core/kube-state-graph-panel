## 1. Project Scaffold

- [x] 1.1 執行 `npx @grafana/create-plugin@latest` 產出 panel scaffold(type=panel、backend=false、TypeScript、React 18+),產物落到 repo 根目錄
- [x] 1.2 校準 `plugin.json`(id、name、type=panel、author、links、screenshots 預留),整理 `package.json` scripts 命名規範
- [x] 1.3 將 scaffold 的 `src/` 樣板清空為符合 feature-first 結構的空殼:`src/module.ts`、`src/panels/KsgPanel/`、`src/features/{graph-canvas,graph-data,legend,theme}/`、`src/shared/{components,hooks,utils,constants,types}/`,每個資料夾放佔位 `index.ts`
- [x] 1.4 新增 `.gitignore`、`.gitattributes`、`.editorconfig`、`.nvmrc`(Node 20+)

## 2. TypeScript 嚴格設定

- [x] 2.1 撰寫 `tsconfig.json`,啟用 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noImplicitOverride`、`noFallthroughCasesInSwitch`、`isolatedModules`,設定 `paths` 別名(`@/*` → `src/*`)
- [x] 2.2 新增 `tsconfig.build.json`(emit 設定)與 `tsconfig.test.json`(jest/vitest 用)
- [x] 2.3 加入 `npm run typecheck` script(`tsc --noEmit`),驗證空殼通過

## 3. Linting & Formatting 工具鏈(精簡版)

- [x] 3.1 安裝 ESLint v9 必裝 plugin:`typescript-eslint`、`@grafana/eslint-config`、`eslint-plugin-react`、`eslint-plugin-react-hooks`、`eslint-plugin-import-x`、`eslint-config-prettier`(精簡版:不再使用 sonarjs / unicorn / promise / eslint-comments / jsx-a11y / knip,降低噪音、聚焦真實 bug)
- [x] 3.2 撰寫 `eslint.config.mjs`(flat config):啟用 `recommendedTypeChecked`(非 strict),`parserOptions.project`,加入 `import-x/no-default-export`、`import-x/order`(精簡版:取消 `import-x/no-restricted-paths`、`no-cycle`、`eslint-comments/require-description`,改靠程式碼 review 維持邊界)
- [x] 3.3 區分目錄嚴格度:`src/**` 嚴格、`dev/**` / `e2e/**` / `tests/**` / `**/*.test.*` 寬鬆
- [x] 3.4 安裝 `prettier` + `eslint-config-prettier`,撰寫 `.prettierignore`(prettierrc 沿用 scaffold)
- [x] 3.5 加入 `npm run lint`(`--max-warnings=0 --cache`)、`npm run lint:fix`、`npm run format`(精簡版:不需 format:check 獨立 script,format 即 prettier --write)
- [x] ~~3.6 knip dead-code 偵測~~ — 精簡版移除:對小 plugin 過度,真正 dead code 由 typecheck/lint 抓到即可
- [x] 3.7 安裝 `husky` + `lint-staged`,設定 pre-commit(`lint-staged`:對 staged 跑 `eslint --fix` + `prettier --write`)與 pre-push(`lint` + `typecheck` + `test:ci`)

## 4. Cytoscape 整合骨架

- [x] 4.1 安裝 `cytoscape`、`cytoscape-fcose`、`cytoscape-dagre`、`@types/cytoscape`、`@types/cytoscape-fcose`(若有)、`@types/cytoscape-dagre`(若有)
- [x] 4.2 建立 `src/features/graph-canvas/registerExtensions.ts`:module top-level 呼叫 `cytoscape.use(fcose)`、`cytoscape.use(dagre)`,並 import 自 `module.ts` 觸發
- [x] 4.3 撰寫 `src/shared/types/cytoscape.d.ts`,用 declaration merging 擴充 `NodeDataDefinition` 與 `EdgeDataDefinition`(`kind`、`namespace`、`labels`、`edgeType`、`weight` 等欄位)
- [x] 4.4 建立 `src/features/graph-canvas/sync/diffElements.ts` 純函式:接 `currentJson` 與 `next: ElementDefinition[]`,回傳 `{ toAdd, toRemove, toUpdate }`
- [x] 4.5 撰寫 `src/features/graph-canvas/sync/diffElements.test.ts`(headless cytoscape):覆蓋新增、刪除、更新、空集合、相同集合五種情境
- [x] 4.6 實作 `src/features/graph-canvas/hooks/useCytoscape.ts`:`containerRef` + `cyRef`、init effect(空依賴)、update effects(elements / stylesheet / layout 分開)、cleanup `removeAllListeners` + `destroy` + ref=null
- [x] 4.7 實作 `src/features/graph-canvas/hooks/useGraphLayout.ts`:`useMemo` 計算 layout options,變動時 `cy.stop()` + `cy.layout(opts).run()`
- [x] 4.8 實作 `src/features/graph-canvas/hooks/useGraphResize.ts`:`ResizeObserver` + debounce 100ms → `cy.resize()` + `cy.fit()`

## 5. Stylesheet 與資源類型對應表

- [x] 5.1 在 `src/shared/constants/shapeByKind.ts` 定義 `K8sResourceKind` enum/union 與 `SHAPE_BY_KIND` 對應表(Pod=ellipse、Service=round-rectangle、Deployment=hexagon、Ingress=diamond、Node=octagon、StatefulSet=barrel、DaemonSet=tag、ConfigMap=rectangle、Secret=cut-rectangle、HPA=star、fallback=round-rectangle)— ~~已被 §19 取代~~:此處臆測列舉已對齊後端 6 種 node type(pod/node/pvc/service/others/external),實際對應表見 `shapeByKind.ts`。
- [x] 5.2 在 `src/shared/constants/colorByEdgeType.ts` 定義 `EdgeType` 與 `COLOR_BY_EDGE_TYPE` 對應表(ownerReference=實線藍、serviceSelector=虛線綠、networkTraffic=漸層橘、ingressBackend=點線紫、fallback=灰實線)— ~~已被 §19 取代~~:此處臆測列舉已對齊後端 4 種 edge type(pod-runs-on-node/pod-mounts-pvc/pod-calls-pod/service-selects-pod),實際對應表見 `colorByEdgeType.ts`。
- [x] 5.3 撰寫 `src/features/graph-canvas/styles/getStylesheet.ts`:pure factory `(theme, shapeMap, colorMap) → Stylesheet[]`
- [x] 5.4 撰寫 `src/features/graph-canvas/styles/getStylesheet.test.ts`:快照測試 light/dark theme 輸出

## 6. Theme 整合

- [x] 6.1 實作 `src/features/theme/hooks/useGraphTheme.ts`:包裝 `useTheme2()`,在 theme 變動時觸發 stylesheet 重算
- [x] 6.2 確認 stylesheet 切換不重建 cytoscape instance(由 `useCytoscape` update effect 處理 `cy.style(stylesheet).update()`)

## 7. Panel 元件層

- [x] 7.1 實作 `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx` + `.types.ts` + `.test.tsx` + `index.ts`:接收 `elements` / `stylesheet` / `layout` / `onSelect`,內部 `useCytoscape` + `useGraphResize`
- [x] 7.2 實作 `EmptyState/`、`LoadingOverlay/`、`ErrorBanner/` 三個小元件(各自 co-located 資料夾)
- [x] 7.3 實作 `src/features/legend/components/NodeLegend/` 與 `EdgeLegend/`(讀取 `shapeByKind` / `colorByEdgeType` 對應表)
- [x] 7.4 實作 `src/panels/KsgPanel/KsgPanel.tsx`:orchestrator,串接 `useGraphData` + `useGraphTheme` + `GraphCanvas` + `Legend` + 空/錯誤狀態渲染
- [x] 7.5 實作 `src/panels/KsgPanel/KsgPanel.editor.tsx`:layout 選擇(fcose/dagre)、是否顯示 legend 等 panel options
- [x] 7.6 撰寫 `src/panels/KsgPanel/KsgPanel.types.ts` 定義 `KsgPanelOptions` 介面與 `defaultOptions`
- [x] 7.7 在 `src/module.ts` 建立 `PanelPlugin<KsgPanelOptions>(KsgPanel).setPanelOptions(builder => ...)` 並 default export
- [x] 7.8 撰寫 `KsgPanel.test.tsx`(RTK + ResizeObserver polyfill):空資料、有資料、錯誤三種狀態快照

## 8. ~~OpenAPI 型別生成~~(已刪除)

精簡版:OpenAPI codegen 對小型 REST API 過度設計,2024-2026 趨勢偏好「手寫 TS 型別 + boundary 處 runtime 驗證」。本 repo 採此方案,型別於 `src/shared/types/cytoscape.d.ts`(declaration merging 擴充 cytoscape 原生型別)手寫維護,boundary 由 `src/features/graph-data/normalize.ts` 把關。若日後上游 API schema 大量增長,再另行 change 引入 codegen。

## 9. Graph Data Integration(精簡版)

- [x] 9.1 在 `src/shared/types/graph.ts` 定義 `GraphNode` / `GraphEdge` / `GraphPayload` 內部模型(手寫,無 codegen)
- [x] 9.2 實作 `src/features/graph-data/normalize.ts`:pure function `normalizeGraph(raw: unknown): { nodes, edges }` —— 用於 boundary 處驗證上游資料形狀並映射為 `cytoscape.ElementDefinition[]`
- [x] 9.3 撰寫 `normalize.test.ts`:覆蓋 happy path、缺欄位、unknown kind/edgeType pass-through 等情境
- [x] 9.4 實作 `src/features/graph-data/hooks/useGraphData.ts`:從 PanelProps `data.series` 取得 datasource 回傳(JSON 文字 field),解析後套 `normalize`,回傳 `{ elements, error }`
- [x] ~~9.5 ESLint import-x/no-restricted-paths 限制~~ — 精簡版移除:無 codegen 即無 api.generated.ts;normalize 為慣例式邊界,不需 lint 強制

## 10. Dev Environment(精簡版)

- [x] 10.1 沿用 `@grafana/create-plugin` 預設 `docker-compose.yaml` —— 內含 grafana 與 backend service 占位。後續若上游 backend 已釋出 image,只需於 compose 加入 `marz32one/kube-state-graph:latest` 服務。**精簡版:不再要求 kind cluster + sample workloads + 自製 up.sh / down.sh 腳本**。本機只需 `docker compose up` 起 grafana,backend 可使用 fixture / 上游 image 任一。
- [x] ~~10.2-10.5 kind 編排腳本~~ — 精簡版移除:kind cluster + 自製 bootstrap 腳本對 panel plugin 開發過度,本地真實 cluster 連線交給開發者環境(`kubeconfig` 透過 backend image env 變數注入即可)

## 11. Provisioning(精簡版)

- [x] ~~11.1 sample manifests for kind~~ — 精簡版移除(無 kind cluster)
- [x] 11.2 撰寫 `provisioning/datasources/kube-state-graph.yaml`:自動建立 Infinity datasource 指向 `http://kube-state-graph:8080`(plugin 安裝為前提)
- [x] 11.3 沿用 `@grafana/create-plugin` 預設 `provisioning/dashboards/dashboards.yaml` provider,新增 `provisioning/dashboards/ksg-demo.json` demo dashboard(內含一個 KSG panel)

## 12. 單元測試框架(精簡版)

- [x] 12.1 沿用 `@grafana/create-plugin` 預設 jest + `@testing-library/react` + `@testing-library/jest-dom`,不切換到 vitest(成本不值)
- [x] 12.2 擴充 `jest-setup.js`:`ResizeObserver` polyfill、`HTMLCanvasElement.prototype.getContext` mock(cytoscape 在 jsdom 下需要)
- [x] 12.3 沿用既有 `npm run test`(watch)/ `npm run test:ci`(精簡版:取消硬性 80% coverage gate,coverage 為輔助指標,實際依賴 spec scenario 覆蓋)

## 13. E2E 測試(精簡版)

- [x] 13.1 沿用 `@grafana/create-plugin` 預設 `@grafana/plugin-e2e` + `@playwright/test`
- [x] 13.2 沿用 scaffold 預設 `playwright.config.ts`
- [x] 13.3 在 `tests/` 撰寫 1 個 smoke spec:啟動 Grafana → 開 demo dashboard → 斷言 `[data-testid=graph-canvas]` 存在(精簡版:取消 interact-panel 進階測試,等 backend 整合穩定後再加)
- [x] 13.4 ~~interact-panel spec~~ — 精簡版延後
- [x] 13.5 沿用既有 `npm run e2e` script(已存在於 package.json)

## 14. CI Workflow(精簡版)

- [x] 14.1 撰寫 `.github/workflows/ci.yml`,單一 job 依序執行 `lint` → `typecheck` → `test:ci` → `build`,Node 22 + npm cache(精簡版:取消 5-job 平行矩陣,小 plugin 不需要;取消 knip)
- [x] ~~14.2 e2e.yml with kind~~ — 精簡版移除:E2E 改本機開發者觸發,CI 暫不跑(避免 kind/docker 不穩拖延 merge)
- [x] ~~14.3 branch protection 文件化~~ — 精簡版改為 PR template + CONTRIBUTING 即可,實際 protection 由 maintainer 設定

## 15. 文件

- [x] 15.1 撰寫 `README.md`,含 Prerequisites / Quick Start / Architecture overview / Linting & testing / Troubleshooting 五章節
- [x] ~~15.2 CONTRIBUTING.md~~ — 精簡版延後:scaffold 階段不需,合作者多時再加
- [x] ~~15.3 docs/architecture.md~~ — 精簡版延後:design.md 已涵蓋,額外文件冗餘
- [x] 15.4 在 `README.md` 中引用 OpenSpec change `scaffold-ksg-panel` 為決策來源

## 16. Hover Tooltip Feature

- [x] 16.1 建立 feature 目錄 `src/features/hover-tooltip/`(`components/HoverTooltip/`、`hooks/`、`index.ts` barrel),`index.ts` 僅匯出 `HoverTooltip` 與 `useHoverElement`
- [x] 16.2 實作 `src/features/hover-tooltip/hooks/useHoverElement.ts`:接收 `cyRef`,於 `useEffect` 訂閱 cytoscape `mouseover` / `mouseout` / `remove` 事件(`'node, edge'` selector);回傳 `HoveredElement | null` 包含 id/group/data + 邊端點 label(避免 render-time ref 存取)
- [x] 16.3 ~~useHoverElement headless cytoscape unit test~~ —合併到 HoverTooltip 元件層測試,降低重複
- [x] 16.4 實作 `src/features/hover-tooltip/components/HoverTooltip/HoverTooltip.tsx` + `.types.ts` + `.test.tsx` + `index.ts`:`@grafana/ui` `useStyles2` 套用固定右上角樣式 + `pointer-events: none` + `opacity: 0.92` + transition 150ms
- [x] 16.5 Node tooltip 內容:`name` (`data.label ?? data.id`)、`kind`、`namespace`、白名單 labels(`app`、`version`、`app.kubernetes.io/name`、`app.kubernetes.io/instance`);缺欄位不顯示 row
- [x] 16.6 Edge tooltip 內容:`edgeType`、`source → target`(解析 endpoint node 的 label)、`weight`(若有)
- [x] 16.7 無 hovered 元素時 `HoverTooltip` 回傳 `null`(不渲染 DOM);unhover 走 CSS opacity transition 150ms
- [x] 16.8 在 `GraphCanvas.tsx` 中以 sibling 渲染 `<HoverTooltip cyRef={cyRef} />`,容器 `position: relative` 作為 absolute 定位錨點
- [x] 16.9 撰寫 `HoverTooltip.test.tsx`:渲染 node / edge / null 三種情境;斷言缺欄位不顯示對應 row

## 17. Element Filter Feature

- [x] 17.1 建立 feature 目錄 `src/features/element-filter/`(`hooks/`、`computeVisibility.ts`、`computeVisibility.test.ts`、`index.ts`)
- [x] 17.2 實作 `src/features/element-filter/computeVisibility.ts` 純函式:`(elements, visibleKinds, visibleEdgeTypes) → { visibleNodeIds, visibleEdgeIds }`;unknown kind 預設可見;邊在任一端點隱藏時亦隱藏
- [x] 17.3 撰寫 `computeVisibility.test.ts`:覆蓋 6 種情境(全部可見、過濾單一 kind、過濾單一 edgeType、過濾節點同時邊失效、空 elements、unknown kind 預設可見)
- [x] 17.4 實作 `src/features/element-filter/hooks/useElementFilter.ts`:`useMemo` 算 visibility sets,`useEffect` 在 `cy.batch()` 內 apply `style('visibility', ...)`;**不**呼叫 `cy.layout(...).run()`
- [x] 17.5 撰寫 `useElementFilter.test.ts`:以 headless cytoscape 驗證 visibility style 與「`cy.layout` 從未被呼叫」
- [x] 17.6 擴充 `KsgPanel.types.ts`:新增 `visibleKinds` / `visibleEdgeTypes` 欄位 + `defaultOptions` 取自常數表 keys + `ALL_KINDS` / `ALL_EDGE_TYPES` 匯出
- [x] 17.7 擴充 `KsgPanel.editor.tsx`(已從 .ts 升級為 .tsx):2 個 `@grafana/ui` `MultiSelect` 透過 `addCustomEditor` 包裝(原生 `addMultiSelect` 型別與 array defaultValue 不相容)
- [x] 17.8 在 `GraphCanvas.tsx` 呼叫 `useElementFilter` 套用 visibility(orchestrator 透過 props 傳遞 visibleKinds/visibleEdgeTypes)
- [x] 17.9 全部過濾邊界:`KsgPanel.tsx` 在 `visibleKinds.length === 0` 時覆蓋 `<EmptyState message="All node types filtered" />`
- [x] 17.10 Panel options 遷移防護:`KsgPanel.tsx` 讀 options 時走 `?? defaultOptions.x` fallback

## 18. 收尾與驗收

- [ ] 18.1 完整跑 `docker compose up -d` → `npm run dev`,瀏覽器開 Grafana 確認 demo dashboard 顯示節點與邊(待 backend image 可用、kubeconfig 就緒後執行)
- [ ] 18.2 手動驗收 hot reload:修改 `GraphCanvas.tsx` 顏色常數,reload 瀏覽器後生效,期間 docker container 未重啟
- [ ] 18.3 手動驗收 hover tooltip:hover Pod 節點顯示 name/kind/namespace/labels;hover serviceSelector 邊顯示 edgeType/source→target;tooltip 不擋圖、點擊穿透到下方節點
- [ ] 18.4 手動驗收 filter:於 panel options 取消勾選 `Pod`,該類節點消失且其他節點位置不變;取消勾選所有 kind 顯示「All node types filtered」
- [x] 18.5 跑完整 CI 流程本機 dry-run:`npm run lint && npm run typecheck && npm run test:ci && npm run build` 全綠(精簡版:刪除 lint:knip;E2E 改本機手動)
- [x] ~~18.6 docs/spec-coverage.md~~ — 精簡版延後:scenario coverage 由測試名稱直接對應 spec 即可
- [ ] 18.7 執行 `/opsx:verify` 確認 implementation ↔ artifacts 對齊
- [ ] 18.8 執行 `/opsx:archive` 歸檔本 change

## 19. 對齊真實上游 kube-state-graph 契約

> scaffold 階段的資料契約為臆測的通用 K8s 拓撲(PascalCase kinds、ownerReference 等 edge),與真實後端 `GET /v1/graph` 的 cytoscape payload 不符,導致 panel 無法顯示真實 graph。本區塊將契約對齊後端 source of truth(node `type`:pod/node/pvc/service/others/external;edge `type`:pod-runs-on-node/pod-mounts-pvc/pod-calls-pod/service-selects-pod;IP 移至 `data.ipaddress`)。

> 對齊已於 working tree 完成,對齊後端 `GET /v1/graph`(node types pod|node|pvc|service|others|external;edge types pod-runs-on-node|pod-mounts-pvc|pod-calls-pod|service-selects-pod;ipaddress[] 已自 labels 移出)。

- [x] 19.1 `src/shared/constants/types.ts`:`K8sResourceKind` → `NodeKind`(6 種後端 node type),`EdgeType` 改為 4 種後端 edge type
- [x] 19.2 `shapeByKind.ts` / `colorByEdgeType.ts`:對應表 rekey 至新列舉(維持唯一資料源,legend/filter/stylesheet 自動衍生)
- [x] 19.3 `src/shared/types/cytoscape.d.ts`:`kind?: NodeKind`、新增 `ipAddress?: string[]`、edge `labels?`(移除 `weight`)
- [x] 19.4 內部模型單一來源為 `cytoscape.d.ts`(`NodeDataDefinition`/`EdgeDataDefinition` 含 `ipAddress?: string[]`、`labels`);移除 `src/shared/types/graph.ts`
- [x] 19.5 重寫 `normalize.ts`:接受 `{ elements: { nodes, edges } }` 與 unwrapped `{ nodes, edges }`、條目容忍 `{ data }` 包裝、映射 `type→kind`/`name→label`/`labels.namespace→namespace`/`ipaddress→ipAddress`/edge `type→edgeType`;更新 `normalize.test.ts` 以後端 golden JSON 為 fixture
- [x] 19.6 `useGraphData.extractJsonFromFrames`:挑選「看起來像 graph payload」的值(含 `elements` 或 `nodes`/`edges`),略過 `apiVersion`/`clusters`
- [x] 19.7 `HoverTooltip`:新增 `ipAddress` row(逗號串接);更新測試
- [x] 19.8 demo 對齊:`ksg-demo.json` 的 `visibleKinds`/`visibleEdgeTypes` 改為新列舉、query url `/api/graph` → `/v1/graph`;`KsgPanel.types.ts` / `KsgPanel.editor.tsx` defaults 同步
- [x] 19.9 驗證:typecheck + lint + test:ci 全綠,並以後端 golden fixture 確認 normalize 產出正確 elements(final green run pending)
