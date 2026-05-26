## ADDED Requirements

### Requirement: Grafana Panel Plugin 註冊

系統 SHALL 在 `src/module.ts` 預設匯出一個 `PanelPlugin` 實例,完整實作 `@grafana/data` 的 panel plugin 介面,使 Grafana 載入後可在 panel type 清單中選擇本 plugin。

#### Scenario: Plugin 於 Grafana 中被發現

- **WHEN** Grafana 啟動並掃描 `/var/lib/grafana/plugins/<plugin-id>`
- **THEN** plugin 出現在「Add panel → Visualization」清單中,plugin id 與 `plugin.json` 一致,類型為 `panel`,且 unsigned 警告不阻擋載入(開發模式下)

#### Scenario: PanelPlugin 公開 options 編輯器

- **WHEN** 使用者於 dashboard 編輯 panel
- **THEN** 右側顯示 plugin 提供的 options 編輯器,且 options schema 與 `KsgPanel.types.ts` 定義一致

### Requirement: Cytoscape 畫布渲染

Panel SHALL 透過 cytoscape.js 在指定 DOM 容器中渲染 nodes 與 edges,並使用 fcose 作為預設 layout 演算法;當使用者切換為 dagre layout 時系統 MUST 重新佈局而不重建 instance。

#### Scenario: 預設 layout 顯示節點與邊

- **WHEN** Panel 收到 ≥1 個 node 與 ≥1 個 edge 的資料
- **THEN** cytoscape canvas 顯示對應數量的節點與邊,佈局為 fcose,且無 console 錯誤或警告

#### Scenario: Layout 切換不重建 instance

- **WHEN** 使用者於 panel options 將 layout 從 `fcose` 切換為 `dagre`
- **THEN** 同一 cytoscape instance 呼叫 `cy.stop()` 後執行 `cy.layout({ name: 'dagre' }).run()`,節點透過動畫過渡到新位置,instance reference 不變

### Requirement: 節點形狀依資源類型對應

系統 SHALL 透過集中於 `src/shared/constants/shapeByKind.ts` 的對應表,將不同 Kubernetes 資源類型(kind)映射到不同 cytoscape node shape;對應表為唯一資料源,stylesheet 與 legend 元件皆從此匯入。

#### Scenario: 已知資源類型對應到正確形狀

- **WHEN** 節點 data 帶有 `kind: 'Pod'`(或其他已定義 kind)
- **THEN** 該節點以對應 shape(例如 Pod=ellipse)渲染,且形狀對應與 `shapeByKind.ts` 一致

#### Scenario: 未知資源類型走 fallback

- **WHEN** 節點 data 的 `kind` 不在對應表中
- **THEN** 該節點以 fallback shape(`round-rectangle`)渲染,並於 console 以 `debug` 等級提示未對應的 kind,不拋出例外

### Requirement: 邊顏色依關係類型對應

系統 SHALL 透過 `src/shared/constants/colorByEdgeType.ts` 將不同 edge type(例如 `ownerReference`、`serviceSelector`、`networkTraffic`、`ingressBackend`)映射到不同顏色與線型,並由同一份對應表供 stylesheet 與 legend 共用。

#### Scenario: 已知邊類型對應到正確顏色

- **WHEN** 邊 data 帶有 `edgeType: 'serviceSelector'`(或其他已定義 type)
- **THEN** 該邊以對應顏色與線型渲染,且與 `colorByEdgeType.ts` 定義一致

#### Scenario: 未知邊類型走 fallback

- **WHEN** 邊 data 的 `edgeType` 不在對應表中
- **THEN** 該邊以 fallback 灰色實線渲染,不拋出例外

### Requirement: Grafana Theme 適配

Panel SHALL 依 Grafana 當前 theme(light/dark)動態產生 cytoscape stylesheet,當使用者切換 Grafana theme 時,panel 必須在不重建 cytoscape instance 的前提下即時更新樣式。

#### Scenario: Theme 切換不重建 instance

- **WHEN** 使用者於 Grafana 全域切換 dark ↔ light theme
- **THEN** `useGraphTheme` hook 取得新 `GrafanaTheme2`,以新 theme 重算 stylesheet 並呼叫 `cy.style(stylesheet).update()`;`cyRef.current` 引用不變

### Requirement: 元件設計遵循 feature-first 結構與 co-location

所有 React 元件 MUST 遵循 design.md 「React 元件設計」決策:採 feature-first 目錄結構、元件 co-location(每個元件一個資料夾、含同名 `.tsx` / `.types.ts` / `.test.tsx` / `index.ts`)、function component only、禁止 default export(`module.ts` 除外)、跨 feature 不可越界 import 對方內部檔案。

#### Scenario: 結構 lint 通過

- **WHEN** CI 執行 `npm run lint`
- **THEN** ESLint 對 `src/**` 的目錄結構與 import 邊界規則(`import-x/no-default-export`、`import-x/no-restricted-paths`)通過,零警告

#### Scenario: 每個元件具備同名測試與型別檔

- **WHEN** 對 `src/features/**/components/*/` 進行檔案掃描
- **THEN** 每個元件資料夾皆同時存在 `<Name>.tsx`、`<Name>.types.ts`、`<Name>.test.tsx`、`index.ts` 四個檔案

### Requirement: Cytoscape × React 整合慣例

cytoscape 的整合 MUST 遵循 design.md 「Cytoscape.js × React × TypeScript 整合慣例」14 條規則;尤其是「instance 為單一真實狀態源」、「init 與 update effect 拆分」、「diff-and-patch 更新」、「extension 只在 module top-level 註冊一次」、「StrictMode cleanup 完整呼叫 `removeAllListeners` + `destroy`」。

#### Scenario: StrictMode 下無 listener 殘留與重複註冊警告

- **WHEN** 開發環境(React StrictMode 啟用)mount panel
- **THEN** cytoscape 完成 mount → unmount → re-mount 三步流程後,console 無 "Extension already registered" 警告,且 instance listener 數量等於初次 mount 後的數量

#### Scenario: 元素更新走 diff-and-patch

- **WHEN** props `elements` 從 N 個變為 N+M 個(M 個新增),且既有 N 個未變
- **THEN** cytoscape 對既有 N 個節點不執行 remove / re-add,僅新增 M 個節點;layout 平滑過渡而非全圖重排

### Requirement: 容器尺寸響應

Panel SHALL 使用 `ResizeObserver` 監聽 cytoscape 容器尺寸變化,並以 debounce(預設 100ms)觸發 `cy.resize()` 與 `cy.fit(undefined, padding)`,確保 Grafana panel 大小調整時 graph 自動適配。

#### Scenario: Panel 尺寸變化後自動 fit

- **WHEN** 使用者拖曳 Grafana panel 改變大小
- **THEN** `ResizeObserver` 在 debounce 後呼叫 `cy.resize()` 與 `cy.fit()`,所有節點仍在可視範圍內

### Requirement: 互動與選取狀態

Panel SHALL 支援節點點擊選取,選取狀態透過 cytoscape 內建 `:selected` style 視覺化,且可選地透過 `onSelect` callback 將被選節點 id 傳出供其他元件消費。

#### Scenario: 點擊節點觸發選取與 callback

- **WHEN** 使用者點擊任一節點
- **THEN** 該節點被 cytoscape 標記為 `:selected` 並套用對應樣式,若提供 `onSelect` prop 則以節點 id 呼叫之

### Requirement: 圖例 (Legend)

Panel SHALL 提供 legend 元件,顯示當前圖中出現的節點形狀與邊類型對應說明,legend 的形狀/顏色資料源 MUST 與 cytoscape stylesheet 共用同一份對應表(`shapeByKind.ts` / `colorByEdgeType.ts`)。

#### Scenario: Legend 與圖中元素一致

- **WHEN** Panel 收到含 Pod / Service / Deployment 節點與 ownerReference / serviceSelector 邊的資料
- **THEN** Legend 區域顯示三種節點形狀與兩種邊顏色的對應說明,且形狀/顏色與 canvas 中渲染一致

### Requirement: 空狀態與錯誤狀態渲染

當資料為空、載入中、或上游 API 回傳錯誤時,Panel MUST 顯示對應狀態 UI(empty / loading / error),不可顯示空白 canvas 或拋例外到 React 樹外。

#### Scenario: 資料為空時顯示 empty state

- **WHEN** Panel 收到 `elements: []`
- **THEN** Panel 顯示 `EmptyState` 元件,文字提示無資料,canvas 區域留白

#### Scenario: API 錯誤時顯示 error 提示

- **WHEN** datasource query 失敗
- **THEN** Panel 顯示 `@grafana/ui` 風格的錯誤 banner,內含錯誤訊息與重試提示,不顯示破損的 cytoscape canvas
