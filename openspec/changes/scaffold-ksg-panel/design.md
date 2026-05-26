## Context

本 change 為一個全新 repo 的骨架建立。上游 `Marz32onE/kube-state-graph`(`feat/build-graph-api` 分支)是 Go 撰寫的 backend service,讀取 k8s API 並輸出符合 cytoscape.js elements 規格的 JSON,同時整合 service graph metrics。本 repo 只負責 Grafana panel 端的渲染與互動,不嵌入上游原始碼,純粹透過 **OpenAPI 契約 + Docker image** 兩個窄介面整合。

主要技術約束:

- Grafana panel plugin 必須符合 `@grafana/data` 的 `PanelProps<TOptions>` 介面與生命週期,並要求 React 18。
- Plugin 在 Grafana 內部執行於沙箱化的 iframe-less 環境,需注意 CSP 與第三方 script 載入。
- 開發體驗硬需求:source 變更後 Grafana 不需重 build container 即可看到結果(熱重載)。
- 測試硬需求:本機與 CI 都要能起 kind cluster + backend + grafana,跑通端到端鏈路。
- 上游 backend 目前處於 `feat/build-graph-api` 分支,API 尚未定版,後續可能調整 schema。

## Goals / Non-Goals

**Goals:**

- 用 `@grafana/create-plugin` 產生 panel scaffold,React 18 + TypeScript + Webpack dev server。
- 確立 **單一 datasource 整合策略**(Infinity datasource consume backend HTTP),避免自建 backend plugin 增加維護成本。
- 確立 **型別契約自動化**:從上游 OpenAPI 規格產生 TS 型別,版本納入 git 追蹤。
- 確立 **docker-compose + kind** 開發環境拓樸,並讓 plugin source 透過 volume mount 達到熱重載。
- 為 panel-rendering、graph-data-integration、dev-environment 三個 capability 訂出共用的目錄結構與資料流。
- 提供節點形狀/邊顏色擴充點(常數對應表),讓 specs 階段填具體規則。

**Non-Goals:**

- 不在本 change 撰寫具體 k8s 資源類型與形狀的對應表(留給 specs)。
- 不實作所有節點/邊樣式渲染邏輯,僅建立 scaffold 與最小可運作 demo(顯示至少一種節點+邊)。
- 不處理 Grafana plugin 簽署(signing)、私有 catalog、企業版授權等發佈議題。
- 不擴充上游 backend 功能;若上游 API 缺少欄位,先於本 repo 用 OpenAPI override 暫補,並向上游回報。
- 不導入狀態管理函式庫(Redux/Zustand),panel 內部以 React hooks 為主即可。

## Decisions

### Datasource 策略:Grafana Infinity datasource(非自建 backend datasource)

**Decision:** 使用社群維護的 `yesoreyeram-infinity-datasource` 作為通用 HTTP JSON datasource,呼叫 `kube-state-graph` REST API。Panel 透過 `getBackendSrv()` 或 datasource query response 取得 cytoscape elements。

**Why:**

- Infinity datasource 已支援 JSON/CSV/GraphQL 並能設定 baseURL、auth header,完全覆蓋我們對 HTTP GET 的需求。
- 自建 backend datasource(Go plugin)會新增第二個 Go 子專案、額外的簽署與打包流程,違反「panel repo 保持輕量」的目標。
- 使用者已習慣 Grafana datasource UI 設定連線資訊,符合既有心智模型。

**Alternatives considered:**

- *自建 backend datasource*:控制力最強(可做 server-side cache、auth proxy),但維護成本顯著上升,且 panel 與 datasource 強耦合無法重用。
- *Panel 內直接 fetch*:違反 Grafana plugin 安全模型(panel 不應直接打外部 URL,需走 datasource proxy),且失去 datasource 設定 UI。

### 型別契約:OpenAPI → TypeScript 自動生成

**Decision:** 在 `package.json` 加入 `openapi-typescript` script,從上游指定的 OpenAPI URL 或本地 spec 檔案產生 `src/types/api.generated.ts`。產物納入 git。`npm run codegen:api` 為手動觸發,並由 GitHub Action 每週自動 PR 更新。

**Why:**

- 上游 API 仍在演進,固定快照型別可隔離 panel build 與上游變更節奏。
- `openapi-typescript` 輸出 plain types(非 runtime client),不增加 bundle size。
- 自動 PR 讓型別漂移立即可見,避免悄悄破壞。

**Alternatives considered:**

- *手寫 types*:初期快,但長期與上游脫節風險高。
- *Protobuf / gRPC*:overkill,且 Grafana panel 環境不適合 gRPC-Web。

### Cytoscape 整合方式:`cytoscape` core + `cytoscape-fcose` + 自製 React hook

**Decision:** 直接相依 `cytoscape` 與 `cytoscape-fcose`(force-directed)、`cytoscape-dagre`(階層式 owner ref tree)。不使用 `react-cytoscapejs` 套件,改在 `src/hooks/useCytoscape.ts` 自行管理 lifecycle(useEffect 建立/銷毀 instance、useLayoutEffect 處理 resize)。

**Why:**

- `react-cytoscapejs` 已多年未活躍維護,且抽象層限制細粒度的 batch update 與 layout 切換。
- 自製 hook 約 80–120 行,複雜度可控,且可緊密整合 Grafana panel resize 事件。
- `fcose` 對 service mesh 拓樸視覺效果最佳;`dagre` 適合 owner reference 樹狀結構,給使用者切換選項。

**Alternatives considered:**

- *D3 force-directed*:可程度更高,但需從零實作所有互動,放大開發範圍。
- *vis-network*:API 較封閉,擴充樣式對應較難。

### Cytoscape.js × React × TypeScript 整合慣例

**Decision:** 嚴格遵循 2024–2025 社群主流 cytoscape × React 整合模式,核心是「**cytoscape instance 為唯一真實狀態源,React 僅負責 mount/unmount 與 imperative 同步**」。具體規約:

**1. Lifecycle 與 instance 管理**

- 在 `src/features/graph-canvas/hooks/useCytoscape.ts` 封裝所有 lifecycle。Hook 內部:
  - `const containerRef = useRef<HTMLDivElement | null>(null);`
  - `const cyRef = useRef<cytoscape.Core | null>(null);`
- **Init 與 update 嚴格拆成不同的 `useEffect`**:
  - Init effect 依賴空陣列(或僅 container ref),負責 `cytoscape({ container, ... })` 建立 + cleanup `cy.destroy()`。
  - Update effects(elements / styles / layout)個別監聽對應 props,**透過 `cy.batch()` mutate existing instance,不重建**。
- **React 18/19 StrictMode double-mount 防護**:cleanup 一律呼叫 `cy.removeAllListeners()` + `cy.destroy()`,並把 `cyRef.current = null`;重新 mount 時若 `cyRef.current` 已存在亦先 destroy,確保 idempotent。
- **元素同步走 diff-and-patch**,不用「先 `cy.elements().remove()` 再 `cy.add()`」的 nuclear 模式:用 `cy.elements().jsons()` 比較 incoming `ElementDefinition[]`,僅 add/remove/update 差異節點,維持 layout 連續性與動畫流暢度。實作放 `src/features/graph-canvas/sync/diffElements.ts`。

**2. Extension 註冊**

- `cytoscape.use(fcose)`、`cytoscape.use(dagre)` 等 extension 註冊**只在 module top-level 執行一次**(`src/features/graph-canvas/registerExtensions.ts`,由 `module.ts` import 觸發);**禁止在 component / hook 內呼叫 `cytoscape.use(...)`**(會在 React 重新 render 或 hot reload 時重複註冊導致警告)。

**3. TypeScript 型別紀律**

- 使用 cytoscape 原生型別,不自製重複 wrapper:`cytoscape.Core`、`cytoscape.ElementDefinition`、`cytoscape.NodeDefinition`、`cytoscape.EdgeDefinition`、`cytoscape.Stylesheet`、`cytoscape.LayoutOptions`、`cytoscape.EventObject`。
- **自訂 node/edge `data` 欄位透過 declaration merging 擴充**,集中放 `src/shared/types/cytoscape.d.ts`:
  ```ts
  declare module 'cytoscape' {
    interface NodeDataDefinition {
      kind?: K8sResourceKind;
      namespace?: string;
      labels?: Record<string, string>;
    }
    interface EdgeDataDefinition {
      edgeType?: EdgeType;
      weight?: number;
    }
  }
  ```
- **不使用 `any`**;cytoscape callbacks 的事件物件以 `cytoscape.EventObject` 解構,target 用 `evt.target as cytoscape.NodeSingular` 等具體型別。
- Stylesheet selector function 的回傳值用泛型守住:`{ selector: 'node', style: { shape: (ele: cytoscape.NodeSingular) => Shape } }`。

**4. Styling**

- Stylesheet 由 **pure factory function** 產生,接受 Grafana theme + shape/color map:`getStylesheet(theme: GrafanaTheme2, shapeMap: ShapeMap, colorMap: ColorMap): cytoscape.Stylesheet[]`,純函式,易於單元測試與快照測試。
- **禁止直接 inline `style: cy.style().selector(...)` 鏈式呼叫**;統一以 `Stylesheet[]` 陣列管理,可序列化、可比對、可 snapshot。
- 顏色/形狀對應表為**唯一資料源**,定義於 `src/shared/constants/{shapeByKind,colorByEdgeType}.ts`,供 stylesheet 與 legend feature 共用。

**5. Layout**

- Layout 切換以 **`cy.layout(options).run()`** 觸發,並在執行前 `cy.stop()` 取消前一個 layout,避免殘留動畫造成抖動。
- Layout 選項由 `useGraphLayout` hook 管理,依照 panel options(layout name + 參數)以 `useMemo` 計算,僅在輸入變動時觸發 `run()`。
- **fcose** 為預設(力導向、最佳通用視覺),**dagre** 提供作為 owner-reference 階層視圖選項;兩者於 `registerExtensions.ts` 一次性註冊。

**6. Events 與 React 同步**

- 事件 handler 在 init effect 用 `cy.on('tap', 'node', handler)` 註冊,cleanup 走 `cy.removeAllListeners()`;**不要在每次 props 變動就 on/off**。
- 若需要將 cytoscape 事件轉成 React state(例如「選中節點」傳給 sidebar),用 `useSyncExternalStore`(React 18+)訂閱 cytoscape 事件並提供 snapshot,避免在 effect 內 setState 造成額外 render cycle。

**7. 容器尺寸變化**

- 用 **`ResizeObserver`**(於 `useGraphResize` hook 內)監聽 container,變化時 debounced 呼叫 `cy.resize()` + 視需要 `cy.fit(undefined, padding)`。
- **不依賴 Grafana panel 的 `onOptionsChange`** 偵測尺寸;`ResizeObserver` 更穩定且通用。

**8. Headless mode 用於測試**

- 單元測試以 `cytoscape({ headless: true, styleEnabled: true, elements: [...] })` 建立 instance,完全不需 jsdom DOM;測試重點為「diff 邏輯」、「stylesheet factory 輸出」、「layout option 計算」、「element normalize」等純函式。
- 元件互動測試(React Testing Library)用 `@testing-library/react` + cytoscape 實體 instance,並提供 `mockResizeObserver` polyfill。

**9. Performance**

- 大量元素更新一律包 `cy.batch(() => { ... })`,避免每個操作觸發 layout/style recalculation。
- Stylesheet、Element、Layout 三組 input 在 React 端用 `useMemo` 穩定 reference,讓 sync effect 的 dependency check 可靠。
- Bundle 大小:cytoscape core ~300KB(min+gzip),fcose / dagre 各 ~50KB;允許,不額外做 dynamic import。若日後加超過 3 個 extension 再評估 code splitting。

**10. 命名與 API 邊界**

- 對外的 hook 公開 API 為 `useCytoscape({ elements, stylesheet, layout, onSelect, ... }): { containerRef, cy: cytoscape.Core | null }`;**不洩漏 cytoscape internals 到 panel 層**。`GraphCanvas` 元件僅持有 `containerRef`,所有 cytoscape 操作走 hook 暴露的 API。

**Why:**

- 上述模式是社群多年踩坑後的共識:**instance 為單一真實源、React 只當 mount 載體、diff-and-patch、ext 註冊全域一次、StrictMode 防呆**,避免「兩個 ref 不同步」「extension 重複註冊警告」「StrictMode 雙 mount 殘留 listener」三大常見 bug。
- 顯式 batch + memoized inputs 在 100+ 節點情境下實測差距明顯。
- 用 cytoscape 原生型別 + declaration merging 維持與上游 `@types/cytoscape` 同步,不自製平行型別系統。
- Headless 測試讓邏輯層可獨立驗證,搭配元件層的 RTL 測試形成兩層覆蓋,符合本 repo 的 80% 覆蓋率要求。

**Alternatives considered:**

- *`react-cytoscapejs`*:已多年未活躍維護,且其抽象限制細粒度更新;TypeScript 型別不完整。
- *把 elements 當 props 全量替換*:UX 差(每次 update 重新 layout、節點跳動)、效能差。
- *把 cytoscape instance 放 React state*:會觸發 React 重新 render 整顆樹,反模式。
- *Class component + lifecycle methods*:與本 repo「function-only」決策衝突,且不必要。
- *用 `useImperativeHandle` 把 cytoscape API 暴露給父元件*:過早抽象;通常 hook 公開 API 已足夠。

**Trade-offs:** diff-and-patch 比 nuclear 替換複雜度高(預估 ~100 行),但維持動畫連續性與互動穩定性的收益遠超實作成本,且 diff 邏輯純函式可完整單測。

### Hot Reload 機制:Webpack watch + Grafana plugin auto-discovery

**Decision:** 使用 `@grafana/create-plugin` 預設 webpack 設定的 `--watch` 模式輸出到 `dist/`;docker-compose 把 `dist/` 目錄 read-only mount 到 Grafana container 的 `/var/lib/grafana/plugins/<plugin-id>`。Grafana 啟動時設 `GF_DEFAULT_APP_MODE=development` 與 `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=<plugin-id>`,讓未簽署 plugin 可載入;前端透過 Grafana UI 的 Cmd+R 即可看到新版 bundle(無需重啟 container)。

**Why:**

- 完全符合官方推薦的 plugin 開發流程,文件齊全。
- 無需 nodemon、無需自製 file watcher。
- 不需要重啟 docker-compose,iteration 時間 < 5 秒。

**Alternatives considered:**

- *Grafana plugin SDK hot module replacement*:目前對 panel plugin 支援不穩定,實測常需手動 reload。
- *跑 Grafana on host(非 docker)*:可省略 mount,但開發者環境差異大,且 backend image 還是要 docker。

### Docker Compose 拓樸:kind 在 host,backend/grafana 在 compose

**Decision:** Kind cluster 由 host 上 `kind` CLI 建立(`dev/scripts/up.sh` 內呼叫),kubeconfig 寫入 `dev/.kube/config`。docker-compose 中 `kube-state-graph` service 透過 bind mount 讀取此 kubeconfig,並使用 `host.docker.internal` 連線到 kind API server。`grafana` service 在同一 compose network 連到 backend。

**Backend image source:** 直接拉取上游已發佈的 Docker Hub image — `marz32one/kube-state-graph`(https://hub.docker.com/repository/docker/marz32one/kube-state-graph/)。`dev/docker-compose.yml` 中 backend service 寫法:

```yaml
services:
  kube-state-graph:
    image: marz32one/kube-state-graph:latest  # tag 待 specs 階段固定為對應分支 tag
    volumes:
      - ./dev/.kube/config:/root/.kube/config:ro
    environment:
      KUBECONFIG: /root/.kube/config
    ports:
      - "8080:8080"
```

不在本 repo 建置 backend image(無 build context),保持 panel repo 純前端。CI 與本機環境一致,image 更新走 `docker compose pull` 即可。

**Why:**

- kind 自己就是 dockerized k8s,把它再塞進 compose 會造成 docker-in-docker 與 network 雙層 NAT,在 macOS 上特別不穩定。
- 此拓樸讓 backend 與 grafana 仍享有 compose 的 lifecycle 管理,而 kind 走標準路徑容易除錯。
- E2E 測試可重用同一份 `up.sh`,CI 與本機行為一致。

**Alternatives considered:**

- *全部塞進 docker-compose 含 kind*:macOS 上 docker-in-docker + kind 經常失敗(seccomp、cgroup v2 問題)。
- *Tilt / Skaffold*:工具學習曲線高,且我們的 service 規模不需要這層抽象。

### E2E 測試:`@grafana/plugin-e2e` + Playwright

**Decision:** 使用 Grafana 官方 `@grafana/plugin-e2e`(Playwright 包裝),測試流程:`up.sh` → 部署 sample manifests → Playwright 訪問 Grafana → 開啟預配 dashboard → 斷言節點/邊 DOM 與快照。

**Why:**

- 官方套件已封裝登入、panel 載入、screenshot 比對等常見動作。
- Playwright trace + video 便於 CI 失敗除錯。
- 與 webapp-testing skill 一致,降低開發者上下文切換。

### React 元件設計:feature-first 目錄 + 元件 co-location + function-only 元件慣例

**Decision:** 採用 **feature-first 目錄結構**(以「行為/領域」分組,而非以「檔案類型」分組),元件 co-location(每個元件一個資料夾,內含實作、型別、測試、樣式),只用 function component + hooks,禁止 class component。完整目錄藍圖如下:

```
src/
├── module.ts                       # Grafana plugin entry(必須,Grafana 載入點)
├── plugin.json                     # Grafana plugin metadata
│
├── panels/                         # Grafana panel-level wrapper(對應 PanelProps)
│   └── KsgPanel/
│       ├── KsgPanel.tsx            # 主元件(orchestrator,串接 hooks + presentation)
│       ├── KsgPanel.types.ts       # PanelOptions / FieldConfig 型別
│       ├── KsgPanel.test.tsx
│       ├── KsgPanel.editor.tsx     # panel options editor(右側 UI)
│       └── index.ts                # 對外 re-export
│
├── features/                       # 領域分組,每個 feature 自包含
│   ├── graph-canvas/               # cytoscape 主畫布
│   │   ├── components/
│   │   │   ├── GraphCanvas/
│   │   │   │   ├── GraphCanvas.tsx
│   │   │   │   ├── GraphCanvas.types.ts
│   │   │   │   ├── GraphCanvas.test.tsx
│   │   │   │   └── index.ts
│   │   │   ├── EmptyState/
│   │   │   └── LoadingOverlay/
│   │   ├── hooks/
│   │   │   ├── useCytoscape.ts
│   │   │   ├── useGraphLayout.ts
│   │   │   └── useGraphInteractions.ts
│   │   ├── styles/                 # cytoscape stylesheet 工廠
│   │   │   ├── nodeStyles.ts
│   │   │   └── edgeStyles.ts
│   │   └── index.ts                # 公開 barrel(僅匯出對外 API)
│   │
│   ├── graph-data/                 # API 介接、normalize、cache
│   │   ├── api/
│   │   │   └── ksgClient.ts
│   │   ├── hooks/
│   │   │   └── useGraphData.ts
│   │   ├── normalize.ts            # anti-corruption layer
│   │   └── index.ts
│   │
│   ├── legend/                     # 圖例(節點形狀/邊類型對照)
│   │   ├── components/
│   │   │   ├── NodeLegend/
│   │   │   └── EdgeLegend/
│   │   └── index.ts
│   │
│   └── theme/                      # Grafana theme 適配
│       ├── hooks/useGraphTheme.ts
│       └── index.ts
│
├── shared/                         # 跨 feature 的純元件 / hooks / utils
│   ├── components/                 # 通用 UI primitives(僅放真正可重用元件)
│   ├── hooks/                      # 通用 hooks(如 useDebouncedValue)
│   ├── utils/                      # pure functions(同步、無副作用)
│   ├── constants/                  # 全域常數(SHAPE_BY_KIND、COLOR_BY_EDGE_TYPE)
│   └── types/                      # 跨 feature 共享型別 + api.generated.ts
│
└── __tests__/                      # cross-feature integration tests(option,如需)
```

**Component 規約:**

- **一個元件一個資料夾**,內含 `<Name>.tsx`、`<Name>.types.ts`、`<Name>.test.tsx`、`index.ts`(僅 `export { Name } from './Name'`);超過 ~150 行考慮拆分。
- **Function component only**,以 `export function Name(props: NameProps)` 命名,**禁止 default export**(`eslint-plugin-import-x/no-default-export` 強制),例外:`module.ts` 對 Grafana plugin 需要 default export 為 `PanelPlugin`。
- **Props 型別命名一律 `<ComponentName>Props`**,以 `interface` 宣告(允許宣告合併);內部型別用 `type`。
- **Hooks 命名 `use<Behavior>`**,放在最近的 `hooks/` 資料夾,單一檔案單一 hook。
- **Barrel(`index.ts`)只匯出對外 API**(feature 邊界);內部模組互相 import 走具體路徑,**禁止跨 feature 越界 import 對方內部檔案**,由 `eslint-plugin-import-x/no-restricted-paths` 與 ESLint `no-restricted-imports` 強制。
- **Styles**:Grafana panel 慣例使用 `@grafana/ui` 的 `useStyles2(getStyles)` + Emotion css 函式,**不引入 styled-components 或 CSS Modules**,維持與 Grafana 一致主題系統。
- **狀態管理**:以 React local state + custom hooks 為主;跨元件共享狀態用 `useContext` + reducer,不引入 Redux/Zustand。
- **副作用紀律**:`useEffect` 僅用於「真正的外部副作用」(訂閱、訂閱解除、imperative DOM API 如 cytoscape mount);**衍生狀態用 `useMemo`**,不放 `useEffect` 中 setState。
- **Ref 處理**:需要 imperative handle 時用 `forwardRef` + `useImperativeHandle`;React 19 之後直接接受 `ref` 為 prop 也可,以實際採用版本為準。
- **Memoization**:預設不加,等實際測量證明熱點再加 `useMemo` / `useCallback` / `React.memo`,避免過早優化。
- **檔案命名**:元件檔 `PascalCase.tsx`、hooks/utils `camelCase.ts`、常數 `camelCase.ts`(內部常數用 `SCREAMING_SNAKE_CASE`)、型別檔 `<Name>.types.ts`、測試檔 `<Name>.test.tsx`。
- **JSX**:單一 root,屬性超過 3 個換行;條件渲染優先 `&&` 與三元,避免在 JSX 中嵌套 IIFE。
- **Accessibility**:互動元素必須具語意 (`<button>`、`<a>`);cytoscape canvas 提供文字替代(節點清單 hidden region 給 screen reader),由 `jsx-a11y` 強制 lint。

**Why:**

- Feature-first 結構讓「同一功能的程式碼物理上聚在一起」,新功能進來只需新增資料夾,降低 cross-cutting 修改的認知負擔;比起 `components/`、`hooks/`、`utils/` 三大平坦資料夾,更不容易演化成大泥球。
- Co-location 元件資料夾讓測試與型別緊鄰實作,IDE 跳轉與重構工具更高效。
- 禁止 default export 讓 IDE 自動 import、refactor rename、跨檔案搜尋皆穩定且無歧義(此為 TypeScript 社群 2024–2025 主流共識)。
- 禁止跨 feature 越界 import 在 scaffold 階段就建立邊界,避免日後變成「萬物相依」反模式。
- 以 `@grafana/ui` 為樣式基礎,自動取得 light/dark theme、a11y、字級與既有 Grafana panel 一致的外觀。
- 副作用紀律與 memoization 預設關閉的原則,直接對齊 React 官方文件 2024 改版後的建議。

**Alternatives considered:**

- *Atomic Design(atoms/molecules/organisms/templates/pages)*:對工具/dashboard 類產品過度抽象,且難以決定一個元件該屬於哪一層,實務上分類爭論成本高。
- *按檔案類型分組(`components/`、`hooks/`、`utils/`)*:單 feature 修改時要跨 3–5 個資料夾,scaffold 規模就會痛。
- *Container/Presentational 二分*:Hooks 出現後此分類已過時,React 官方文件亦不再推薦。
- *Allow default exports*:寫起來短一點,但 rename / auto-import 風險不值得。
- *styled-components / CSS Modules*:與 Grafana theme tokens 整合需自寫橋接層,維護成本高。

**Trade-offs:** Feature-first 對「跨 feature 共享元件」需要明確下放到 `shared/`,初期可能有人猶豫東西該放哪;以「被 2+ feature 使用」作為晉升 `shared/` 的門檻即可。

### Linting & Code Quality:ESLint flat config + 主流 TypeScript 生態,零警告政策

**Decision:** 採用 ESLint v9 flat config(`eslint.config.js`),整合以下 plugin 與 config 為必裝基線,CI 與 pre-commit hook 皆執行 `--max-warnings=0`:

- **核心**:`eslint`、`typescript-eslint`(`strict-type-checked` + `stylistic-type-checked` profile,啟用 type-aware rules)
- **Grafana 官方**:`@grafana/eslint-config`(內含 plugin 推薦規則與 Grafana 慣例)
- **React 生態**:`eslint-plugin-react`(`recommended` + `jsx-runtime`)、`eslint-plugin-react-hooks`、`eslint-plugin-jsx-a11y`
- **Imports**:`eslint-plugin-import-x`(維護中、效能優於 `eslint-plugin-import`),強制 `import/order`、`no-cycle`、`no-unresolved`
- **現代化最佳實踐**:`eslint-plugin-unicorn`(`recommended`,擇要 disable 過嚴規則)
- **程式碼異味**:`eslint-plugin-sonarjs`(`recommended`)
- **Promise 安全**:`eslint-plugin-promise`
- **Deprecation 偵測**:`@typescript-eslint/no-deprecated`(v8 內建)
- **未使用程式碼**:`knip`(獨立工具,跑於 `npm run lint:knip`)偵測 dead exports / unused deps / orphaned files
- **格式化**:`prettier` + `eslint-config-prettier`(關閉所有與 prettier 衝突的格式規則),格式化交給 prettier,ESLint 專注於語意。
- **TypeScript 嚴格度**:`tsconfig.json` 啟用 `strict: true`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noImplicitOverride`、`noFallthroughCasesInSwitch`、`isolatedModules`。

**執行點(必過閘門)**:

1. **pre-commit**(`lint-staged` + `husky`):僅對 staged 檔案跑 `eslint --fix` + `prettier --write`,瞬時回饋。
2. **pre-push**:跑完整 `npm run lint`、`npm run typecheck`、`npm run test`。
3. **CI**:`lint`、`typecheck`、`test`、`knip`、`build` 五個獨立 job 並行,任一失敗即阻擋 merge。
4. **PR 上 reviewdog / inline annotation**:ESLint 結果以 inline comment 呈現於 GitHub PR。

**Why:**

- 上述組合涵蓋型別、語意、可讀性、可存取性、依賴衛生、現代化慣例,接近 TypeScript 社群 2025 共識「合理嚴格」上限。
- 啟用 type-aware rules(`strict-type-checked`)能在編譯前抓出 `no-floating-promises`、`no-misused-promises`、`no-unsafe-*` 等 runtime 風險。
- `--max-warnings=0` 零警告政策避免「警告變壁紙」反模式,從第一行開始守住品質。
- `knip` 補 ESLint 無法處理的「跨檔案/跨套件未使用」死碼問題,scaffold 階段即建立基線避免日後清理成本。

**Alternatives considered:**

- *Biome*:Rust-based、極快、單一工具取代 ESLint + Prettier。但目前 React/Grafana plugin 生態仍以 ESLint 為主,Biome 對 type-aware rules 與 `@grafana/eslint-config` 沒有對等支援,暫不採用。可在後續 change 重新評估。
- *oxlint*:更快,但規則覆蓋與外掛生態尚不完整,作為輔助快速檢查可考慮,不取代主 linter。
- *XO*:意見導向 wrapper,客製空間小,與 Grafana 慣例衝突風險高。
- *只用 `recommended` 而不啟 `strict-type-checked`*:遺漏大量真實 bug 防線,違反「scaffold 階段建好基線」原則。

**Trade-offs:** type-aware lint 較慢(每次 lint 需 `tsc --project`),但於 monorepo 規模可控,且 CI 平行化即可吸收。

### Sample Workloads:多樣化 manifests 確保樣式覆蓋

**Decision:** 在 `dev/manifests/` 維護一組涵蓋 Deployment、StatefulSet、DaemonSet、Service(ClusterIP/Headless)、Ingress、ConfigMap、Secret、Pod(獨立)、HPA 的 YAML,部署後可觸發 graph-data-integration spec 所定義的所有節點形狀與邊類型。每新增一種樣式對應,需同步新增可觸發該樣式的 manifest。

## Risks / Trade-offs

- **上游 API 不穩定** → 透過 OpenAPI codegen + CI PR 機制即時偵測 breaking change;在 panel 內部包一層 anti-corruption layer (`src/data/normalize.ts`),把上游欄位映射到 panel 內部模型,避免直接散佈到 UI 元件。
- **未簽署 plugin 在 production Grafana 需手動允許** → 文件清楚標註,並於後續 change 規劃簽署流程(預期走 Grafana Community plugin)。
- **Type-aware lint 拖慢開發 iteration** → mitigation:本機 `eslint` 走增量 cache(`--cache --cache-location node_modules/.cache/eslint/`);pre-commit 只跑 staged,完整 lint 留到 pre-push 與 CI。預期本機單檔 lint < 1 秒。
- **嚴格規則早期阻擋大幅重構** → mitigation:`eslint.config.js` 區分 `src/**` 嚴格、`dev/**` / `e2e/**` 寬鬆;對少數無法避免的特例使用 `// eslint-disable-next-line <rule> -- <reason>` 並要求理由註解(由 `eslint-comments/require-description` 強制)。
- **kind cluster CI 啟動慢(60–90 秒)** → 使用 `helm/kind-action` GitHub Action(已內建 image 快取);本機開發走持久化 cluster(`up.sh` idempotent,detect existing cluster 跳過建立)。
- **cytoscape.js 大圖效能** → 此 scaffold 不處理,於後續 change 視實際 cluster 規模追加 viewport culling 或 collapse-by-namespace。對於 scaffold 階段以 100 個 nodes 內為性能上限假設。
- **react-cytoscapejs 棄用 → 自管 lifecycle** → 風險是 React 18 strict mode 下的 double-mount 重複初始化 cytoscape instance;mitigation 是在 useEffect cleanup 確實呼叫 `cy.destroy()`,並於 useRef 守護 instance。
- **Infinity datasource 是社群套件,非 Grafana core** → 風險是企業環境的 plugin allowlist 限制;mitigation 是文件提供「自建 backend datasource」遷移路徑作為 plan B,且 panel 內部抽象 datasource 介面為 `GraphDataSource` interface,實作可替換。
- **Docker Compose + 外部 kind 拓樸對新手不友善** → mitigation 是 `dev/scripts/up.sh` 一鍵腳本封裝所有步驟,README 提供故障排除章節。

## Migration Plan

此為新 repo,無遷移需求。首次部署步驟:

1. 開發者 clone repo,跑 `npm install`。
2. 確保本機已安裝 Docker、`kind`、`kubectl`、Node 20+。
3. `npm run dev:up` 一鍵啟動 kind + sample workloads + docker-compose(backend + grafana)。
4. `npm run dev` 啟動 webpack watch。
5. 瀏覽器開啟 `http://localhost:3000`,登入 Grafana(admin/admin),預配 dashboard 自動顯示。

回滾策略不適用(新專案)。

## Open Questions

- 上游 `kube-state-graph` 是否已輸出 OpenAPI spec?若無,需要先協調補上 `/openapi.json` 端點,或在本 repo 維護一份手寫 spec 作為過渡。
- panel options 是否需要支援多 backend instance(切換不同 cluster)?暫定 v1 單一 datasource,留待 specs 階段決議。
- 是否需要 panel-level 的 namespace / label selector filter UI?或完全由 datasource query 控制?傾向後者,但需 specs 確認。
- E2E 在 CI 用 `ubuntu-latest` 起 kind 是否需要切換到 self-hosted runner?先試 `ubuntu-latest`,若 timeout 再評估。
