# KSG Panel — Status 外框 + 底部 Node Detail 浮層 設計

- **日期**:2026-05-31
- **OpenSpec change**:`scaffold-ksg-panel`(延伸,非新 change)
- **Capability**:`panel-rendering`
- **狀態**:設計待 review

## 1. 目標

在現有 `marz32one-ksg-panel` 上新增三項功能(歸為兩塊):

- **A. Status 外框**(需求 1 + 2,耦合):每個 `pod` / `node` / `pvc` 依其 `status` 顯示紅 / 黃 / 綠外框;graph node 讀取 backend `data.status`,`normal=綠`、`warning=黃`、`critical=紅`,**缺值預設 `normal`(綠框)**。
- **B. 底部 Node Detail 浮層**(需求 3):點擊 graph node 後,在 canvas 底部浮出一個面板(蓋在圖上、不縮圖),先開好欄位骨架(標題列 + `Alert Name` / `Alert Content` 兩個空區段),內容後續再補;點擊面板以外位置可關閉。

## 2. 現況關鍵事實(實作前已確認)

- `features/graph-data/normalize.ts` 是 anti-corruption layer,目前只挑 `id/type/name/parent/namespace/ipaddress/labels`,**未帶入 `status`** → 需顯式新增。
- `features/graph-canvas/styles/getStylesheet.ts` 已採 single-source 常數表 + function mapper 模式(shape / edge color 皆是)。
- `features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx` **已內建 `onSelect?` callback + `cy.on('tap')` handler**:node tap → `onSelect(id)`、背景 / 邊 tap → `onSelect(null)`。但 `KsgPanel` 尚未接上 `onSelect`。⇒ 需求 3 的「點擊偵測 + 點外面關閉」底層已存在,只差接線與面板 UI。
- K8s `node` 這個 kind 在 compound 結構下是 `node:parent`(框住 pod),stylesheet 內 `node:parent` 選擇器會覆蓋其 border ⇒ status 外框需以**排序**蓋過它(見 §4.3)。
- Legend 各區段(`NodeLegend`/`EdgeLegend`/`ClusterLegend`)共用 `legendListStyles()`,以 swatch / glyph + 文字呈現;`KsgPanel` 的 `legendArea` 用 `& > div + div` 規則自動在每段間加分隔線。

## 3. 資料流

```
backend node.data.status
   └─▶ normalize(驗證 → 合法值用之,否則 'normal';非 cluster node 一律帶 status)
         └─▶ node.data.status : NodeStatus
               ├─▶ getStylesheet  : status 外框選擇器(僅 pod/node/pvc)
               ├─▶ NodeDetailPanel: 標題列 status badge
               └─▶ StatusLegend   : 三色說明

GraphCanvas onSelect(id|null) ─▶ KsgPanel.selectedNodeId(useState)
   ├─▶ 受控回傳 selectedId ─▶ GraphCanvas effect 同步 cy 單選(藍框)
   └─▶ useMemo 依 id 從 elements 解析 node.data ─▶ NodeDetailPanel(canvasArea 底部浮層)
```

## 4. A. Status 外框

### 4.1 型別與常數(single-source)

**`src/shared/constants/types.ts`** 新增:

```ts
export type NodeStatus = 'normal' | 'warning' | 'critical';
```

**新檔 `src/shared/constants/colorByStatus.ts`**(比照 `colorByEdgeType.ts`):

```ts
import type { NodeKind, NodeStatus } from './types';

// Single source of truth for status border colour. Hardcoded hex (not theme
// semantic) per product decision; stylesheet + StatusLegend both derive from this.
export const STATUS_COLOR: Record<NodeStatus, string> = {
  normal: '#73BF69', // green
  warning: '#F2CC0C', // yellow
  critical: '#E02F44', // red
};

// Absent / unparseable status defaults here.
export const FALLBACK_STATUS: NodeStatus = 'normal';

// Only these kinds render a status border (product decision). Other kinds keep
// the theme's neutral border. K8s `node` is included even though it is a
// compound parent — see getStylesheet selector ordering.
export const STATUS_BORDER_KINDS: readonly NodeKind[] = ['pod', 'node', 'pvc'];
```

**`src/shared/types/cytoscape.d.ts`** 的 `NodeDataDefinition` 加:

```ts
status?: NodeStatus; // mapped from upstream data.status; defaults to 'normal' in normalize
```

(同時 import `NodeStatus`。)

### 4.2 normalize 帶入 status

在 `normalize.ts` 的 node 迴圈,對**非 cluster** node 一律帶 `status`:

- 新增 type guard:`isNodeStatus(v): v is NodeStatus`(檢查 `v === 'normal' | 'warning' | 'critical'`)。
- `const status: NodeStatus = isNodeStatus(d.status) ? d.status : FALLBACK_STATUS;`
- 放進非 cluster 的 `identity` 物件:`{ kind: d.type as NodeKind, status }`。
- cluster 容器不帶 status(維持現狀)。

> 決策:status 帶到**所有**非 cluster node(含 service/others/external),供 detail panel 顯示;但**外框只畫 pod/node/pvc**(由 stylesheet scope)。理由:資料齊全、視覺聚焦。

### 4.3 stylesheet status 外框選擇器

在 `getStylesheet.ts` 的陣列中,於 `node:parent` 與 `node[?isCluster]` **之後**、`node:selected` **之前**,以迴圈從 `STATUS_COLOR × STATUS_BORDER_KINDS` 產生選擇器:

```ts
for (const [status, color] of Object.entries(STATUS_COLOR)) {
  const selector = STATUS_BORDER_KINDS.map((k) => `node[kind="${k}"][status="${status}"]`).join(', ');
  stylesheet.push({
    selector,
    style: { 'border-color': color, 'border-width': 3, 'border-opacity': 1 },
  });
}
```

**排序理由**(cytoscape 後定義者覆蓋同屬性):

1. `node`(base,neutral border 1.5)
2. `node:parent`(container neutral border)
3. `node[?isCluster]`(cluster accent border)
4. **status 外框(新)** — 放在 3 之後,K8s `node`(parent)才會被蓋過,顯示 status 色
5. `node:selected`(藍色高亮 border 3)— 放在 4 之後,選取時藍框優先(代表 detail 開著)
6. `edge`

因 normalize 對 pod/node/pvc 一律設 status(預設 `normal`),三選擇器之一必中 ⇒ 每個 pod/node/pvc 都有色框(預設綠)。`border-opacity: 1` 用來蓋掉 `node:parent` 的 0.6,讓 K8s node 的 status 框清楚。

> **捨棄的替代案**:在 base `node` 用單一 function mapper 計算 border-color。較簡潔,但無法覆蓋 K8s `node` 的 `node:parent` border ⇒ 改用顯式選擇器。

### 4.4 StatusLegend

新元件 `src/features/legend/components/StatusLegend/`(`StatusLegend.tsx` / `StatusLegend.test.tsx` / `index.ts`),比照 `ClusterLegend` 的 swatch 樣式:

- 標題 `<h4>Status</h4>`
- 三列:色塊 swatch(取自 `STATUS_COLOR`)+ 文字(`normal` / `warning` / `critical`)
- 共用 `legendListStyles()`

於 `features/legend/index.ts` export;`KsgPanel` 在 `legendArea` 內 `ClusterLegend` 之後渲染(自動吃到分隔線規則)。

## 5. B. 底部 Node Detail 浮層

### 5.1 新 feature 資料夾

`src/features/node-detail/`:

```
components/NodeDetailPanel/
  NodeDetailPanel.tsx
  NodeDetailPanel.types.ts
  NodeDetailPanel.test.tsx
  index.ts
index.ts            # barrel: export { NodeDetailPanel }
```

### 5.2 NodeDetailPanel(浮層)

**Props**(`NodeDetailPanel.types.ts`):

```ts
export interface NodeDetailData {
  id: string;
  label: string;
  kind?: NodeKind;
  status?: NodeStatus;
}

export interface NodeDetailPanelProps {
  node: NodeDetailData | null; // null ⇒ render null(面板關閉)
  onClose: () => void;
}
```

**版面 / 樣式**(`@grafana/ui` `useStyles2` + `@emotion/css`,mirror HoverTooltip 的 absolute 浮層,但底部、可互動):

- 容器 `position: absolute; left: 8px; right: 8px; bottom: 8px;`,`maxHeight: ~220px; overflowY: auto;`,`background = colors.background.secondary`,`border = 1px colors.border.weak`,`borderRadius: 4`,`boxShadow: theme.shadows.z2`,`pointerEvents: 'auto'`,`zIndex: 11`(HoverTooltip 為 10)。
- 因是獨立 DOM 浮層,點擊面板本身不會傳到 cytoscape canvas(不會誤觸關閉);點面板外的 graph 背景才會關。

**內容**(標題列 + 預分空區段):

- **標題列**:`node.label`(粗體標題)+ `kind` badge + `status` badge(badge 底色取 `STATUS_COLOR[status]`)+ 右側關閉(X)鈕(`@grafana/ui` `IconButton name="times"`,`onClick={onClose}`)。
- **空區段 ×2**(先開好,內容後補):
  - `Alert Name` — 小標題 + 空 body(placeholder)
  - `Alert Content` — 小標題 + 空 body(placeholder)
- 區段以小標題 + 空容器呈現,之間以 hairline 分隔(比照 tooltip 的 divider)。

### 5.3 KsgPanel 接線

- `const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);`
- 傳給 `GraphCanvas`:`onSelect={setSelectedNodeId}` 與**受控** `selectedId={selectedNodeId}`。
- `useMemo` 解析:從 `elements` 找 `group==='nodes' && data.id===selectedNodeId && data.isCluster!==true`,取出 `{ id, label, kind, status }` 成 `NodeDetailData`;找不到 → `null`(資料 refresh 移除該 node、或被選的是 cluster 時,面板自動關)。
- 在 `canvasArea`(已是 `position: relative`)**內、`<GraphCanvas>` 之後**渲染 `<NodeDetailPanel node={selectedNode} onClose={() => setSelectedNodeId(null)} />`。root 版面**不需改動**(浮層方案)。

### 5.4 GraphCanvas 受控選取同步

`GraphCanvasProps` 新增 `selectedId?: string | null`。新增一個 effect(依賴 `[cyRef, selectedId, isReady]`):

```ts
const cy = cyRef.current;
if (cy === null) return;
cy.$(':selected').unselect();
if (selectedId != null) {
  cy.getElementById(selectedId).select();
}
```

效果:cy 的藍色選取框與面板狀態恆一致——tap 開 / X 關 / 背景點關,藍框都正確同步,且維持單選。既有 `onSelect` tap handler 不變。

### 5.5 關閉行為(滿足「點面板以外關閉」)

- 點 graph 背景 / 邊 → 既有 `onSelect(null)` → 面板關 + cy 取消選取。
- 點另一個 node → `onSelect(newId)` → 切換。
- X 鈕 → `onClose` → `selectedNodeId=null` → 面板關 + §5.4 effect 清除藍框。
- cluster 框 `events:'no'`,本就不可點 → 自然排除。

> **scope 註**:被 element-filter 隱藏(`visibility:hidden`,非 remove)的 node 仍在 `elements`,故若已開著其 detail 不會因隱藏而關。屬可接受的次要行為,本次不額外處理。

## 6. 測試策略(維持 ≥80%,TDD)

- `colorByStatus`:常數表內容、`FALLBACK_STATUS`、`STATUS_BORDER_KINDS` 純測。
- `normalize`:新增 case ——「合法 status 帶入」「缺 status → normal」「非法 status → normal」「service 也帶 status」;沿用 golden fixture。
- `getStylesheet`:斷言三 status 選擇器存在、只含 pod/node/pvc、排序在 `node:parent` 之後且在 `node:selected` 之前;更新 snapshot(`getStylesheet.test.ts.snap`)。
- `StatusLegend`:渲染三列、swatch 色取自 `STATUS_COLOR`。
- `NodeDetailPanel`:`node===null` 回 `null`;標題 / kind badge / status badge / 兩空區段渲染;X 觸發 `onClose`。
- `GraphCanvas`:headless cytoscape 驗證 `selectedId` 變更會單選 / 取消(沿用既有 headless 慣例,layout stub)。
- `KsgPanel`(RTL):選取 node → 浮層出現;X / 背景點 → 浮層消失。

## 7. Demo / backend 注意事項

v0.0.14 backend 由 PromQL 推導 graph,**目前很可能不送 `data.status`** → demo 會全部顯示預設綠框。面板實作本身正確(優雅預設)。實作期間會 `curl` 跑著的 backend 確認;若不送 status,要在 demo 呈現黃 / 紅需 backend 改動(本 repo 為 panel-only),列為**已知限制 / 後續項**,不阻擋本次。

## 8. OpenSpec 整合

依「use current openspec change」:

- `openspec/changes/scaffold-ksg-panel/specs/panel-rendering/spec.md`:新增兩組 requirement/scenario(`Status border` 與 `Node detail panel`)。
- `openspec/changes/scaffold-ksg-panel/tasks.md`:新增 `## 20. Status 外框與 Node Detail 浮層` 工作節。
- 本設計文件 commit 進 git。

## 9. 不做(YAGNI)

- 不做 status 的 panel options 開關 / 自訂配色 UI(固定 hex)。
- 不做 detail 面板的實際內容(僅骨架;Alert Name / Alert Content 留空)。
- 不做 document 級 click-outside 監聽(canvas 背景 tap 已涵蓋「點外面關閉」)。
- 不改 backend、不在 panel 端注入假 status。

```

```
