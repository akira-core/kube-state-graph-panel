# Clean Code 專案審查報告

審查日期：2026-06-24  
專案：`kube-state-graph-panel`  
審查範圍：`src/` 主要 TypeScript/React 程式碼、測試、lint/typecheck/build/test 設定、CI workflow 與專案規範。  
審查角度：Clean Code 原則，包括單一職責、模組邊界、重複性、命名與意圖表達、錯誤處理、型別真實性、可測試性與維護成本。

## 摘要

整體評價：良好，偏成熟。

這個專案已經有清楚的 feature-first 結構、嚴格 TypeScript 設定、以純函式為核心的資料正規化與視圖轉換、大量單元測試，以及 CI 中的 typecheck/lint/test/build/plugin validator。從 Clean Code 角度看，主要風險不是格式或命名，而是少數核心檔案逐漸承擔太多 orchestration 與副作用協調，導致認知負擔上升。

建議優先順序：

1. 拆小 `KsgPanel.tsx` 的 orchestration 邏輯，讓 panel component 只負責組裝畫面。
2. 將 selection/detail 解析移回 node-detail domain，避免 panel 與 detail/dashboard eligibility drift。
3. 抽出重複的 abortable/keyed backend request hook，降低 detail/dashboard URL hooks 的重複狀態機。
4. 讓 runtime 資料型別更誠實，避免把未知 backend kind/edge type 直接 cast 成已知 union。
5. 用 ESLint 強制 feature barrel 邊界，補上 coverage、Playwright typecheck 與可選 E2E CI。
6. 將大型測試檔拆成更聚焦的 hook/pure-function/component 測試。

## 目前做得好的地方

- `tsconfig.json` 啟用 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`isolatedModules` 等設定，能有效防止常見 null/undefined 與 optional field 誤用。
- `eslint.config.mjs` 對 `src/**/*.{ts,tsx}` 使用 type-aware ESLint，並禁止 default export，符合專案 feature-first 與 barrel import 規範。
- `src/features/graph-data/normalize.ts` 明確扮演 anti-corruption layer，將外部 payload 轉成 Cytoscape elements，且支援 partial parse error，不讓單筆壞資料整個炸掉。
- `src/features/graph-canvas/hooks/useCytoscape.ts` 遵守 Cytoscape/React 的 imperative boundary：初始化、元素同步、stylesheet 更新分離，cleanup 也有 `removeAllListeners()` 與 `destroy()`。
- `src/shared/constants/*` 扮演單一來源，shape/color/category 等映射集中維護，降低 UI 與資料行為分歧。
- 測試密度高。`src/` 內可見約 200 多個 TS/TSX 檔，測試案例約 600+ 個，且核心純函式、hooks、component 都有覆蓋。
- CI workflow 依序執行 typecheck、lint、unit tests、build、plugin metadata validation，品質閘門完整。

## 主要發現

### P1：`KsgPanel.tsx` 承擔過多職責

位置：`src/panels/KsgPanel/KsgPanel.tsx`

此檔同時處理資料狀態、graph transform pipeline、visibility、selection、right-click detail flow、dashboard URL flow、variable export、legend model、collapse state、空狀態與錯誤 UI。雖然每段都有清楚註解，但整體已接近「上帝 component」：讀者需要在同一檔案中追蹤多組 state、effects、memo 與 callback 的互動。

Clean Code 影響：

- 違反單一職責原則，component 同時是 orchestration layer、view model builder 與 side-effect coordinator。
- 新增功能時容易把更多邏輯塞進同一檔案，讓回歸風險集中。
- 測試被迫集中在大型 `KsgPanel.test.tsx`，造成測試意圖較難快速掃描。

建議：

- 抽出 `useGraphViewModel`：處理 `baseElements -> elements -> visibility -> selectedNode`。
- 抽出 `useNodeDetailFlow`：處理 select/context select、detail query input、dashboard params 與 lookup。
- 抽出 `useLegendModel`：集中 cluster/namespace/container/storageclass/edge legend entries。
- 抽出 `useDefaultCollapseSeed`：集中 controller/storageclass 的 default collapse effect。

### P1：backend request hooks 有重複的狀態機

位置：

- `src/features/node-detail/hooks/useNodeDetailUrls.ts`
- `src/features/node-detail/hooks/useNodeDashboardUrl.ts`

兩個 hook 都實作了類似模式：建立 stable request key、用 ref 保存 latest args、用 `AbortController` Set 管理 in-flight request、在 key 變更與 unmount 時 cleanup、用 tagged state 避免 stale result。這些邏輯本身寫得謹慎，但 duplication 讓未來修 bug 時很容易只修到其中一邊。

Clean Code 影響：

- DRY 風險：request lifecycle 分散在多個 hook。
- 狀態機細節多，讀者要重複理解同一套 abort/stale-result 防護。
- 若要改 loading/unavailable/error 行為，會有一致性成本。

建議：

- 抽出小型共用 primitive，例如 `useKeyedBackendRequest` 或 `useAbortableBackendRequests`。
- 保留 feature hook 的 domain parser 與 return shape，僅共用 request lifecycle。
- 先不要過度泛型化；以 `key + enabled + execute(signal) + deriveState` 為最小抽象即可。

### P1：runtime data 型別比實際 payload 更樂觀

位置：

- `src/features/graph-data/normalize.ts`
- `src/shared/types/cytoscape.d.ts`
- `src/features/element-filter/computeVisibility.ts`

專案設計上明確允許未知 node kind / edge type 預設可見，這是很好的 forward-compatible 決策。但 `normalize.ts` 仍有多處把 `d.type` cast 成 `NodeKind` / `EdgeType`。這讓 TypeScript 以為資料一定屬於已知 union，和 runtime 實際支援未知類型的行為不完全一致。

Clean Code 影響：

- 型別沒有完整表達 domain truth。
- 下游程式碼可能在未來不小心對 `NodeKind` 做 exhaustive assumption，導致未知 kind 行為破裂。
- 需要依靠註解記住「未知也會存在」，而不是由型別保護。

建議：

- 引入 `type GraphNodeKind = NodeKind | (string & {})` 與 `type GraphEdgeType = EdgeType | (string & {})`，或在 Cytoscape declaration 中把 `kind` / `edgeType` 調整為可承載未知字串。
- 保留 `isFilterableKind` / `KNOWN_EDGE_TYPES` 作為已知集合判斷。
- 把「known vs unknown」的分支集中在 helper，避免散落 cast。

### P1：selection/detail domain 邏輯放在 panel 層，容易和 node-detail drift

位置：

- `src/panels/KsgPanel/KsgPanel.tsx`
- `src/features/node-detail/assembleDashboardParams.ts`
- `src/features/node-detail/components/NodeDetailPanel/NodeDetailPanel.types.ts`

`resolveSelectedNode` 與 `hasCollapsedAncestor` 目前定義在 panel 檔內，但它們產出的 `NodeDetailData` 與 eligibility 判斷屬於 node-detail domain。`assembleDashboardParams.ts` 的資格判斷也需要與 selection 解析保持一致，目前主要靠註解提醒。

Clean Code 影響：

- domain 邊界模糊，panel 層持有太多 node-detail 規則。
- detail panel 開啟條件與 dashboard params 組裝可能在未來改動時悄悄分歧。
- 測試會持續從 `KsgPanel` 匯入 domain helper，強化錯置。

建議：

- 將 `resolveSelectedNode` 與 `hasCollapsedAncestor` 移到 `features/node-detail` 內部，並由 barrel export。
- 讓 `isDashboardEligible`、detail query target、dashboard params eligibility 共用同一個 domain helper。
- 保留 panel-level tests 作 wiring 驗證，新增 node-detail 層的純函式測試。

### P1：feature boundary 主要靠文件，缺少 lint 強制

位置：

- `eslint.config.mjs`
- `src/features/theme/hooks/useGraphTheme.ts`
- `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx`

專案規範要求跨 feature import 只能走 barrel，但目前 ESLint 只強制 import order 與 no default export，沒有 `no-restricted-imports` 或 boundaries rule。代理抽查也指出 `theme` 直接依賴 `graph-canvas` 內部 hook/style 型別，未來重構 `graph-canvas` internals 時容易破壞 theme feature。

Clean Code 影響：

- 架構規範無法被工具自動守住。
- feature 依賴方向可能逐步倒置。
- review 需要人工記得檢查 import path。

建議：

- 在 ESLint 加入 `no-restricted-imports`，禁止跨 feature 匯入 `features/*/components/*`、`hooks/*`、`styles/*`、`sync/*` 等 internal path。
- 若確實需要分享 `CyStylesheet` 或 `getStylesheet`，改由 feature barrel export，或移到 `shared`/更中性的 adapter。
- 對例外情境用明確 allowlist，不要讓規範只停留在文件。

### P2：註解品質高，但數量已開始掩蓋結構問題

位置：

- `src/panels/KsgPanel/KsgPanel.tsx`
- `src/features/graph-canvas/hooks/useCytoscape.ts`
- `src/features/node-detail/components/NodeDetailPanel/NodeDetailPanel.tsx`
- `src/features/node-detail/hooks/useNodeDetailUrls.ts`

多數註解都在解釋重要的「為什麼」，不是低價值註解，這點值得保留。不過部分檔案註解密度非常高，代表程式結構本身需要讀者持續記住大量隱含規則。Clean Code 偏好讓命名、函式切分與型別先表達意圖，註解補充不可避免的外部限制。

Clean Code 影響：

- 新進維護者需要讀完整段歷史脈絡才能安全修改。
- 註解與程式碼可能在未來 drift。
- 長 component/hook 的心理成本偏高。

建議：

- 保留描述第三方限制、瀏覽器/Grafana/Cytoscape bug workaround 的註解。
- 將流程型註解改成命名良好的 helper，例如 `deriveDetailQueryInput`、`deriveClusterLegendEntries`、`seedDefaultCollapsedControllers`。
- 對「設計決策」改用短註解加測試名稱承載行為。

### P2：大型測試檔使測試意圖集中且不易定位

位置：

- `src/panels/KsgPanel/KsgPanel.test.tsx`

`KsgPanel.test.tsx` 覆蓋大量 panel-level 行為，包含資料錯誤、legend、collapse、selection、detail URL、dashboard URL、variable export 等。這對防回歸很有價值，但檔案很大，且因為 `GraphCanvas` 被 mock，測試多半驗證 orchestrator wiring，而不是每個行為的最小單元。

Clean Code 影響：

- 測試檔本身成為維護負擔。
- 失敗時定位成本較高。
- 促使產品邏輯留在 `KsgPanel.tsx`，因為測試也圍繞它累積。

建議：

- 隨著 P1 拆 hook，把對應測試搬到 hook/pure-function 層。
- 保留少量 panel integration tests 確認主要 wiring。
- 讓測試檔按行為分組，例如 `KsgPanel.selection.test.tsx`、`KsgPanel.legend.test.tsx`、`KsgPanel.detail-flow.test.tsx`，或以新 hook 名稱分檔。

### P2：品質閘門完整，但缺 coverage、E2E CI 與根目錄 tests typecheck

位置：

- `package.json`
- `.github/workflows/ci.yml`
- `tests/`
- `tsconfig.test.json`

目前 CI 與 pre-push 已涵蓋 typecheck、lint、unit tests、build 與 plugin validation，這是很好的基礎。不過 `test:ci` 沒有 coverage 收集或門檻，Playwright E2E 未進 CI，根目錄 `tests/` 的 Playwright specs 也未被一般 `npm run typecheck` 覆蓋。

Clean Code 影響：

- 缺少 coverage 趨勢，難以量化重構後的測試保護程度。
- E2E 與 Playwright spec 型別錯誤可能到本機手動執行時才出現。
- UI dashboard smoke test 不在 PR quality gate 內。

建議：

- 新增 coverage script，先產生報告與 artifact，再逐步設定合理門檻。
- 在 CI 增加 `tsc --noEmit -p tsconfig.test.json` 或等效 Playwright typecheck。
- 評估以 nightly、manual dispatch 或 PR label-triggered 方式執行 E2E，避免每個 PR 都承擔完整成本。

### P2：少數低成本測試缺口值得補齊

位置：

- `src/panels/KsgPanel/useCollapseGroup.ts`
- `src/panels/KsgPanel/KsgPanel.editor.tsx`
- `src/features/node-detail/detailUrlKinds.ts`
- `src/shared/constants/categoryByKind.ts`

代理審查指出多數核心邏輯已有測試，但仍有幾個低成本、高訊號缺口：collapse group hook、panel options editor、detail URL kind 推導與 category/icon maps 的 contract guard。

建議：

- 為 `useCollapseGroup` 補 `renderHook` 測試，涵蓋全 collapse、全 expand、空 ids 與 partial state。
- 為 panel options editor 補測試，確認 registered option path/defaultValue 與 MultiSelect onChange 映射。
- 為 `detailUrlKinds` / `categoryByKind` 補 exhaustive 或 snapshot-style contract tests，避免 Workloads 集合改動 silent drift。

### P2：`useGraphData` 使用 JSON fingerprint 有隱藏成本

位置：`src/features/graph-data/hooks/useGraphData.ts`

目前用 `JSON.stringify(payload)` 做 fingerprint，再 `JSON.parse(fingerprint)` 進入 normalize。這讓相同 payload 可重用 memo，避免下游 diff/layout/legend 重算，目的合理。不過對大型 graph，這會在每次 Grafana series identity 改變時付出完整 stringify 成本，且 parse 再做一次配置。

Clean Code 影響：

- performance trade-off 隱藏在 hook 內，未來資料量變大時可能成為瓶頸。
- 註解說明很多，但缺少明確的效能邊界或測量。

建議：

- 保留現設計，但加一個 focused benchmark 或大 graph regression test。
- 若 payload 原本是 string，優先使用原始 string 作 fingerprint，避免 parse object 後再 stringify。
- 若 meta.custom.data 經常是 object，可考慮在 normalize 結果層做 last-fingerprint cache，避免 parse/stringify 成為主要成本。

### P3：跨 feature 依賴目前可接受，但 `GraphCanvas` 已靠近 feature boundary

位置：`src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx`

`GraphCanvas` 匯入 `element-filter`、`hover-tooltip`、`switch-topology` 等 feature barrel。這仍符合「跨 feature 透過 barrel」規範，但語義上 canvas feature 同時知道 filtering、tooltip、switch constraints 與 selection focus。若後續再加入更多 graph 行為，canvas 可能逐步變成第二個 orchestrator。

Clean Code 影響：

- feature ownership 可能變模糊。
- Canvas 的 reusable surface 變窄。

建議：

- 暫不需要立即重構。
- 若功能再增加，考慮讓 `KsgPanel` 或一個 `GraphInteractionLayer` 組合 filtering/tooltip/switch constraints，讓 `GraphCanvas` 更聚焦在 cytoscape instance lifecycle。

## 低風險觀察

- `diffElements.ts` 用 `JSON.stringify` 比較 nested object。因目前 normalized data shape 受控，風險不高；若未來資料欄位更多或 key order 不穩，應改用穩定 deep equal 或 canonical normalize。
- `useGraphLayout.ts` 對 Cytoscape layout options 使用 `as unknown as cytoscape.LayoutOptions`，主要是第三方型別限制。建議保留但集中在 helper 或 typed adapter，避免 cast 擴散。
- `eslint-disable` 使用量低且多數有明確理由，目前不是 Clean Code 問題。
- CI 未跑 E2E 是專案規範中的有意選擇；從風險角度，重大 UI flow 仍建議在 release 前本機跑 `npm run e2e`。

## 建議的重構路線

### 第一階段：降低 `KsgPanel.tsx` 認知負擔

目標是只搬移，不改行為。

- 抽 `derive*` 純函式：detail query input、legend entries、container ids、empty message。
- 抽 `useKsgSelection`：selected id、context selection、alert time click。
- 抽 `useKsgLegendModel`：所有 legend row 與 collapse group view model。
- 抽 `useDefaultCollapseSeed`：controller/storageclass default collapse。

驗證方式：跑 `npm run typecheck`、`npm run lint`、`npm run test:ci`，並保留現有 panel tests。

### 第二階段：共用 request lifecycle

目標是消除 duplicate abort/stale-result machinery。

- 新增 `src/shared/hooks/useKeyedBackendRequest.ts` 或放在 `features/node-detail/hooks/` 內部。
- 先只服務 `useNodeDetailUrls` 與 `useNodeDashboardUrl`。
- 把 parser 與 UI state shape 留在各 feature hook，避免過度抽象。

### 第三階段：修正 graph data 型別真實性

目標是讓 unknown kind/edge type 成為型別層可見的正常狀態。

- 擴充 Cytoscape data declaration。
- 集中 known/unknown helper。
- 補測試：未知 kind/edge type 不消失，且 legend/filter 不會誤以為它是已知 togglable type。

### 第四階段：讓架構與測試規範可被工具守住

目標是降低人工 review 記憶負擔。

- 新增 ESLint import boundary rule，禁止跨 feature deep import。
- 增加 coverage script/報告，先觀察趨勢，再設定門檻。
- 在 CI 中納入 Playwright spec typecheck。
- 評估以 nightly、manual dispatch 或 PR label-triggered 方式執行 E2E。

## 驗證狀態

已執行以下品質閘門，整體 exit code 為 0：

- `npm run typecheck`
- `npm run lint`
- `npm run test:ci`

結果：

- ESLint：無問題。
- Jest：68 個 test suites passed、638 個 tests passed、1 個 snapshot passed。
- 備註：測試過程中有 Moment 針對無效日期測試資料輸出的 console warning；不影響測試結果。

本報告的發現主要來自靜態審查與重點檔案抽查，不依賴測試失敗作為前提。

## 結論

這是一個整體乾淨、測試充足、邊界意識強的前端 panel 專案。最值得投資的不是大規模重寫，而是有節制地拆分核心 orchestration：把已經被註解清楚描述的流程，轉成命名清楚、可單獨測試的 hook 與純函式。這會直接降低新功能與 bugfix 的認知成本，也能讓現有高品質測試更聚焦。

---

## 處置決策（2026-06-24，由 Claude 評估並執行）

評估方式：以 26 個並行 agent 對各發現做 skeptic fact-check，並逐檔執行註解精簡。報告大方向正確，但有 1 個前提錯誤、1 個被高估。

### 已執行：減註解

核心判斷：本 repo 的設計理由（D1–D11）**已寫在 OpenSpec design docs**（`openspec/changes/*/design.md`、`openspec/specs/*`），程式裡的長註解多為**重複**。策略 = 條文留 OpenSpec，程式碼只留指標。

規則：

- 刪純 restate 程式碼的 what 註解。
- 縮多行設計敘事為一行，保留決策 tag（`(D7)`）與 spec 名。
- 留（只修字）：第三方／Cytoscape／Grafana／StrictMode workaround、單位慣例（Unix 秒 vs ms）、程式碼表達不出的 invariant。
- 不動 `eslint-disable` / `@ts-expect-error` 等工具指令。

成果與驗證：

- 19 檔，`572 +, 1093 −`（淨 −521 行）；整行註解 **2076 → 1555（−25%）**，另有大量 inline 精簡。
- 需新增到 OpenSpec 的條文：**0**——所有理由原本就在 OpenSpec，證實是純重複。
- 只動註解、程式碼零變更（逐 hunk 核對）。`typecheck` ✓ ／ `lint` No issues ✓ ／ `test` **68 suites / 638 tests / 1 snapshot pass** ✓（與基準一致）。4 條 `eslint-disable` 全保留。

### 各發現判決

| #   | 發現                          | 屬實？                            | 判決                | 理由                                                                                              |
| --- | ----------------------------- | --------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------- |
| P1  | KsgPanel 過多職責             | ✅ 698 行 god component            | 走 OpenSpec change  | 拆 hook 屬行為相鄰重構、風險集中；照 OpenSpec-first 流程，勿臨時動                                  |
| P1  | 重複 request 狀態機           | ✅ 但僅 ~4–5% 真共用，89% 各自邏輯 | 暫不抽（defer）     | 抽 `useKeyedBackendRequest` 會 over-couple（雙請求+多 parser vs 單請求）；屬風格非功能。**實為 P2** |
| P1  | runtime 型別過樂觀（cast）    | ✅ 3 處 cast（line 66/384/481）    | 可現在修（safe）    | cascade 低（下游全用 `.hasOwn`/set 防護，無 exhaustive switch）；改 `NodeKind \| (string & {})`，建議併測試 |
| P1  | selection/detail domain 在 panel | ✅                              | 走 OpenSpec change  | 中型搬移。**額外發現**：`deriveLegendKinds.ts` 已重新實作 `hasCollapsedAncestor`，搬家時一併收斂   |
| P1  | feature boundary 缺 lint      | ✅ `useGraphTheme.ts:4-5` 深 import | 走 OpenSpec change  | 非 trivial：加 `no-restricted-imports` 前要先 barrel-export `getStylesheet` + 修既有違規。**實為 P2** |
| P2  | 註解密度                      | ✅                                 | **已執行**          | 見上                                                                                              |
| P2  | 大型測試檔                    | ✅                                 | 跟 KsgPanel 拆分連動 | 隨 P1 拆 hook 一起把測試搬到 hook 層                                                               |
| P2  | 缺 coverage/E2E CI/tests typecheck | ✅                            | defer（CI infra）   | 非程式品質關鍵；建議 coverage script 先觀察 + `tsc -p tsconfig.test.json` + E2E nightly/label       |
| P2  | 低成本測試缺口                | ✅ cheap                           | 可隨手補            | `useCollapseGroup`/editor/`detailUrlKinds`/`categoryByKind` contract test                          |
| P2  | useGraphData JSON fingerprint | ⚠️ **前提錯**                     | skip                | payload 是 object 非 string（`useGraphData.ts:49-57`）→ 報告建議的「用原始 string」不可行。**實為 P3** |
| P3  | GraphCanvas 接近 orchestrator | ✅ 觀察                            | 暫不動              | 功能再加才處理                                                                                    |

低風險觀察（`diffElements` 的 `JSON.stringify`、`useGraphLayout` 的 cast、eslint-disable 量、CI 不跑 E2E）皆同意，維持現狀。

### 下一步（待選）

1. 現在做（低風險）：型別誠實（P1b）+ 補低成本測試，同一 branch。
2. 開 OpenSpec change：KsgPanel 拆分（連 P1d domain 搬移 + 測試檔拆分）、feature boundary lint（P1e）。
3. 只保留本次減註解。
