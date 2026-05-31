# KSG Panel — Status 外框 + 底部 Node Detail 浮層 實作計畫

## Goal

在 `marz32one-ksg-panel` 新增:(A) `pod`/`node`/`pvc` 依 `data.status` 顯示紅/黃/綠外框(缺值預設 `normal`=綠);(B) 點擊 graph node 在 canvas 底部浮出 detail 面板(浮層、不縮圖,標題列 + `Alert Name`/`Alert Content` 兩個空區段,點面板外關閉)。

## Context

- 設計文件(source of truth,含取捨理由):`docs/superpowers/specs/2026-05-31-ksg-status-border-node-detail-design.md`
- OpenSpec change:延伸現有 `scaffold-ksg-panel`(非新 change),capability = `panel-rendering`
- 既有關鍵事實:
  - `GraphCanvas` 已內建 `onSelect?` + `cy.on('tap')`(node→`onSelect(id)`、背景/邊→`onSelect(null)`),`KsgPanel` 尚未接上。
  - K8s `node` kind 是 compound `node:parent`,status 外框需以 stylesheet **排序**蓋過 `node:parent`。
  - stylesheet/legend/filter 皆從 single-source 常數表衍生。
- 慣例(務必遵守):feature-first 目錄 + co-location(`<Name>.tsx`/`.types.ts`/`.test.tsx`/`index.ts`);named export(`src/**` 禁 default export);`@grafana/ui` `useStyles2`+`@emotion/css`;cytoscape 整合 7 條規則;TDD(測試先行);`strict` TS(index access 為 `T|undefined`)。
- 工具注意:本機 Bash 經 `rtk` proxy 會竄改 `cat/grep/git…` 輸出 → 讀檔用 Read 工具、跑檢查用 `npm`;git 指令加 `&&`/`| cat` 可繞過 rtk。

## 驗證指令(每階段共用)

```bash
npx jest <single-file>           # 單檔
npm run typecheck                # tsc --noEmit
npm run lint                     # eslint --max-warnings=0
npm run test:ci                  # jest --passWithNoTests --maxWorkers 4
npm run build                    # production build
```

---

## Phase 1：Status 資料模型 + 配色常數 + normalize

**Goal:** node data 帶 `status:NodeStatus`(非 cluster 一律有值,缺值/非法→`normal`);單源配色常數就位。系統照常運作(status 尚未被視覺消費)。

### Task 1.1：型別與常數(測試先行)

- 新增 `src/shared/constants/colorByStatus.test.ts`:斷言 `STATUS_COLOR` 三鍵為 `normal/warning/critical` 且值為設計指定 hex(`#73BF69`/`#F2CC0C`/`#E02F44`)、`FALLBACK_STATUS==='normal'`、`STATUS_BORDER_KINDS` 等於 `['pod','node','pvc']`。
- 執行 `npx jest src/shared/constants/colorByStatus.test.ts` → 應 **FAIL**(檔案未建)。

### Task 1.2：實作型別與常數

- `src/shared/constants/types.ts`:加 `export type NodeStatus = 'normal' | 'warning' | 'critical';`
- 新檔 `src/shared/constants/colorByStatus.ts`:內容見設計 §4.1(`STATUS_COLOR` / `FALLBACK_STATUS` / `STATUS_BORDER_KINDS`,皆 import 自 `./types`)。
- `src/shared/types/cytoscape.d.ts`:import `NodeStatus`,於 `NodeDataDefinition` 加 `status?: NodeStatus;`(附註解:mapped from data.status，normalize 預設 normal)。
- 若 `src/shared/constants/index.ts` 是 barrel(re-export 其他常數),依其既有風格加上 `colorByStatus` 的 re-export;否則略過。
- `npx jest src/shared/constants/colorByStatus.test.ts` → **PASS**。

### Task 1.3：normalize 帶入 status(測試先行)

- 在 `src/features/graph-data/normalize.test.ts` 新增 case:
  - node 帶合法 `status:'critical'` → 輸出 `data.status==='critical'`。
  - node 無 `status` → 輸出 `data.status==='normal'`。
  - node 帶非法 `status:'weird'` → 輸出 `data.status==='normal'`。
  - `service` kind 帶 `status:'warning'` → 輸出帶 `status`(驗證所有非 cluster 都帶)。
  - cluster 容器(`type:'cluster'`)→ 輸出**不含** `status`。
- 執行該檔 → 新 case **FAIL**。

### Task 1.4：實作 normalize

- `src/features/graph-data/normalize.ts`:加 `isNodeStatus(v): v is NodeStatus` guard;node 迴圈內對非 cluster 算 `status = isNodeStatus(d.status) ? d.status : FALLBACK_STATUS`,併入非 cluster 的 `identity`(`{ kind: d.type as NodeKind, status }`);cluster 分支不動。
- import `FALLBACK_STATUS` 自 `../../shared/constants/colorByStatus`、`NodeStatus` 自 `../../shared/constants/types`。

**Verification:**

- [ ] `npx jest src/shared/constants/colorByStatus.test.ts src/features/graph-data/normalize.test.ts` 全綠
- [ ] `npm run typecheck` 綠
- [ ] `npm run lint` 綠

---

## Phase 2：Status 外框(stylesheet)+ StatusLegend

**Goal:** pod/node/pvc 依 status 顯示色框(預設綠);legend 出現 Status 區段。

### Task 2.1：stylesheet 選擇器(測試先行)

- 在 `src/features/graph-canvas/styles/getStylesheet.test.ts` 新增斷言:
  - 存在三條 status 選擇器,各只含 `pod`/`node`/`pvc`(不含 service/others/external),`border-color` 對應 `STATUS_COLOR`、`border-width:3`、`border-opacity:1`。
  - 排序:status 選擇器的 index **大於** `node:parent` 與 `node[?isCluster]`,且 **小於** `node:selected`。
- 執行 → **FAIL**。

### Task 2.2：實作 stylesheet

- `src/features/graph-canvas/styles/getStylesheet.ts`:import `STATUS_COLOR`/`STATUS_BORDER_KINDS`;以 `Object.entries(STATUS_COLOR)` 產生 selector 物件(見設計 §4.3),於陣列中插在 `node[?isCluster]` 之後、`node:selected` 之前(用 `...statusSelectors` spread)。
- 更新 snapshot:`npx jest src/features/graph-canvas/styles/getStylesheet.test.ts -u`,並人工檢視 `__snapshots__/getStylesheet.test.ts.snap` 差異合理。
- 該檔 → **PASS**。

### Task 2.3：StatusLegend(測試先行 + 實作)

- 新增 `src/features/legend/components/StatusLegend/StatusLegend.test.tsx`:渲染後有三列(`normal`/`warning`/`critical`),各 swatch 行內樣式或 data 屬性帶對應 `STATUS_COLOR` 色;`data-testid="status-legend"`。→ **FAIL**。
- 實作 `StatusLegend.tsx`(比照 `ClusterLegend`:`<h4>Status</h4>` + `legendListStyles()` + 色塊 swatch + 文字),`index.ts` barrel。
- `src/features/legend/index.ts`:加 `export { StatusLegend } from './components/StatusLegend';`
- `src/panels/KsgPanel/KsgPanel.tsx`:於 `legendArea` 內 `<ClusterLegend …/>` 之後渲染 `<StatusLegend />`(吃既有 `& > div + div` 分隔線)。
- 該檔 → **PASS**。

**Verification:**

- [ ] `npx jest src/features/graph-canvas/styles/getStylesheet.test.ts src/features/legend` 全綠
- [ ] `npm run typecheck` 綠;`npm run lint` 綠
- [ ] `npm run build` 綠

---

## Phase 3：NodeDetailPanel 浮層元件(standalone)

**Goal:** 可獨立測試的 detail 浮層元件;尚未接到 panel(系統照常)。

### Task 3.1：元件測試先行

- 新增 `src/features/node-detail/components/NodeDetailPanel/NodeDetailPanel.test.tsx`:
  - `node===null` → render 為 null(查無 `data-testid="node-detail-panel"`)。
  - 給定 node(`label/kind/status`)→ 顯示標題 = label、kind badge、status badge、`Alert Name`、`Alert Content` 兩區段標題、關閉鈕(`aria-label`/`data-testid`)。
  - 點關閉鈕 → 呼叫 `onClose`(jest.fn 斷言)。
- → **FAIL**。

### Task 3.2：實作元件

- `src/features/node-detail/components/NodeDetailPanel/`:
  - `NodeDetailPanel.types.ts`:`NodeDetailData`(`id/label/kind?/status?`)+ `NodeDetailPanelProps`(`node: NodeDetailData|null; onClose: () => void`)(見設計 §5.2)。
  - `NodeDetailPanel.tsx`:`node===null` 回 `null`;否則 `useStyles2(getStyles)` 浮層容器(設計 §5.2 樣式:`absolute` 底部、`pointerEvents:auto`、`zIndex:11`);標題列(label + kind badge + status badge 底色取 `STATUS_COLOR[status]` + `IconButton name="times" aria-label="Close" onClick={onClose}`);兩個空區段(小標題 `Alert Name`/`Alert Content` + 空 body),區段間 hairline。
  - `index.ts`(barrel:`export { NodeDetailPanel }`、`export type { NodeDetailData }`)。
- `src/features/node-detail/index.ts`:`export { NodeDetailPanel, type NodeDetailData } from './components/NodeDetailPanel';`
- → **PASS**。

**Verification:**

- [ ] `npx jest src/features/node-detail` 全綠
- [ ] `npm run typecheck` 綠;`npm run lint` 綠

---

## Phase 4：接線(GraphCanvas 受控選取 + KsgPanel 狀態 + 渲染浮層)

**Goal:** 點 node → 浮層出現且 cy 藍框同步;X/背景點 → 關閉並清藍框;切換 node 正常。完整功能上線。

### Task 4.1：GraphCanvas 受控選取(測試先行)

- 新增/擴充 `src/features/graph-canvas/components/GraphCanvas` 測試(headless cytoscape,沿用既有 hook 測試慣例;layout stub):驗證 `selectedId` 設為某 id → 該 node `:selected`;改為 `null` → 無 `:selected`;切換 id → 僅新 id 被選。
  - 若 GraphCanvas 無既有測試檔,新建 `GraphCanvas.test.tsx`(headless render + 直接驗證 cy 狀態;必要時把同步邏輯抽成可測 helper)。
- → **FAIL**。

### Task 4.2：實作 GraphCanvas

- `GraphCanvas.types.ts`:`GraphCanvasProps` 加 `selectedId?: string | null`。
- `GraphCanvas.tsx`:解構 `selectedId`;新增 effect(依賴 `[cyRef, selectedId, isReady]`)做 `cy.$(':selected').unselect(); if (selectedId != null) cy.getElementById(selectedId).select();`(見設計 §5.4)。既有 `onSelect` effect 不動。
- → **PASS**。

### Task 4.3：KsgPanel 接線(測試先行)

- 擴充 `src/panels/KsgPanel/KsgPanel.test.tsx`(RTL):
  - 模擬選取一個 node(透過觸發傳入 GraphCanvas 的 `onSelect`,或對 mock 的 GraphCanvas 注入)→ 出現 `data-testid="node-detail-panel"` 且標題為該 node label。
  - 觸發 `onSelect(null)` 或點關閉 → 浮層消失。
  - (若直接 render 真 cytoscape 太重,可 mock `GraphCanvas` 暴露 onSelect 以單元化 KsgPanel 狀態邏輯。)
- → **FAIL**。

### Task 4.4：實作 KsgPanel

- `src/panels/KsgPanel/KsgPanel.tsx`:
  - `const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);`
  - `useMemo` 由 `elements` 解析 `selectedNode: NodeDetailData | null`(`group==='nodes' && data.id===selectedNodeId && data.isCluster!==true` → `{ id,label,kind,status }`,否則 null)。
  - `<GraphCanvas … onSelect={setSelectedNodeId} selectedId={selectedNodeId} />`
  - 於 `canvasArea` 內、`<GraphCanvas>` 之後渲染 `<NodeDetailPanel node={selectedNode} onClose={() => setSelectedNodeId(null)} />`(`canvasArea` 已 `position:relative`,root 版面不動)。
  - import `NodeDetailPanel`/`NodeDetailData` 自 `../../features/node-detail`。
- → **PASS**。

**Verification:**

- [ ] `npx jest src/features/graph-canvas src/panels/KsgPanel` 全綠
- [ ] `npm run typecheck` 綠;`npm run lint` 綠
- [ ] `npm run build` 綠
- [ ] 手動:`docker compose up -d` + `npm run dev`,開 Grafana demo dashboard → pod/node/pvc 有(預設綠)外框;點 node 底部浮出面板(標題列 + 兩空區段)+ node 藍框;點背景/ X → 關閉並清藍框;切換 node 正常;legend 出現 Status 區段。

---

## Phase 5：OpenSpec 更新 + 全量驗收 + demo/backend 確認

**Goal:** 規格與工作清單對齊;CI 全綠;釐清 demo 是否能呈現非綠 status。

### Task 5.1：OpenSpec

- `openspec/changes/scaffold-ksg-panel/specs/panel-rendering/spec.md`:新增兩組 requirement + scenario:
  - **Status border**:pod/node/pvc 依 `data.status` 顯示紅/黃/綠外框;缺值/非法→normal(綠);service/others/external 不畫 status 外框但保留 status 資料;StatusLegend 說明三色。
  - **Node detail panel**:點 node 於 canvas 底部浮出面板(浮層不縮圖,標題列 name+kind+status+close,`Alert Name`/`Alert Content` 兩空區段);點背景/邊/X 關閉;切換 node;cluster 不可點。
- `openspec/changes/scaffold-ksg-panel/tasks.md`:新增 `## 20. Status 外框與 Node Detail 浮層`,逐項勾選對應本計畫 Phase 1–4。
- 規格描述「現況」即可(精準直接,不留 superseded/strikethrough)。

### Task 5.2：全量 CI

- 依序跑 `npm run typecheck && npm run lint && npm run test:ci && npm run build`,全綠。覆蓋率維持 ≥80%。

### Task 5.3：demo/backend status 確認

- backend 跑著時:`curl -s "http://localhost:<port>/v1/graph?start=...&end=..." | jq '..|.status? // empty'`(或檢視 node data)確認後端是否送 `data.status`。
- 結果寫入設計文件 §7 / tasks:
  - 若**有送** → demo 應呈現黃/紅,截圖驗證。
  - 若**未送** → demo 全綠屬預期;記為已知限制(需 backend 改動才能展示非綠),本次不在 panel 端注入假 status。

### Task 5.4：commit

- 依 conventional commits 提交(無 attribution,符合使用者全域設定),例如:
  - `feat: status border for pod/node/pvc by data.status`
  - `feat: bottom node detail floating panel on node click`
  - 或合併為單一 `feat:`。pre-commit/pre-push hooks 會跑 lint-staged 與 lint+typecheck+test:ci。
- **push 與否待使用者指示。**

**Verification:**

- [ ] `openspec status --change scaffold-ksg-panel --json`(或 `/opsx:verify`)無新缺漏
- [ ] `npm run typecheck && npm run lint && npm run test:ci && npm run build` 全綠
- [ ] demo/backend status 結論已記錄
- [ ] 變更已 commit(push 待指示)

---

## 不做(YAGNI)

- status 的 panel options 開關/自訂配色 UI(固定 hex)。
- detail 面板的實際內容(僅骨架,Alert Name/Alert Content 留空)。
- document 級 click-outside 監聽(canvas 背景 tap 已涵蓋)。
- 改 backend、或在 panel 端注入假 status。

```

```
