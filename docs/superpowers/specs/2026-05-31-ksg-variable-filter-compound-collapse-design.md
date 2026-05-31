# KSG Panel — Grafana 變數過濾 + Compound Node 收合 設計

- **日期**:2026-05-31
- **OpenSpec change**:`scaffold-ksg-panel`(延伸,非新 change)
- **Capability**:`panel-rendering`(主)、`graph-data-integration`(provisioning/變數)、`dev-environment`(demo backend 版本)
- **狀態**:設計待 review

## 1. 目標

在現有 `marz32one-ksg-panel` 上新增兩塊功能,外加一組配套的視覺調整:

- **A. Grafana 變數過濾**(Feature 1):用 dashboard template variables 依 **cluster / namespace / k8s resource name**(可選含 edge type)過濾圖。過濾**在後端 `/v1/graph` 以 query 參數完成**(已驗證後端原生支援),panel 維持 panel-only、幾乎不動程式;node-kind 過濾仍由 panel client-side 負責(後端無 kind 參數),兩層互補。
- **B. Compound node 收合**(Feature 2):用 `cytoscape-expand-collapse` 擴充套件,讓 **cluster 容器**與 **k8s node 容器**可收合/展開以簡化版面。收合的 cluster 仍以聚合 **meta-edge** 表現跨 cluster 連線。控制鈕做在 **legend panel**(全域 toggle)並保留 canvas 上每節點的 **+/- cue**(雙向同步)。
- **C. 視覺調整**(配合 B):node-kind 形狀重配、leaf 節點放大、legend 區段重排與互動化。

**非目標**(YAGNI,見 §10):focus/traversal(`root`/`depth`/`direction`)鄰域模式、panel 內 scope 指示晶片、任何後端程式改動。

## 2. 現況關鍵事實(實作前已確認)

### 2.1 後端 `/v1/graph`(已讀原始碼驗證 — `feat/build-graph-api` 分支)

- `parseGraphRequest`(`internal/api/handlers.go`)+ `graph.NewScope`(`internal/graph/scope.go`)支援 **9 個 query 參數**:
  - `start`、`end`(必填,Unix 秒或 RFC3339)
  - `cluster`、`namespace`、`name`、`edge_type`(**皆可重複**;同名 OR、跨名 AND)
  - `root`、`depth`(0–6)、`direction`(in/out/both)— 本次**不使用**
- 過濾在**圖建好後於 projection 層 in-memory 套用**(`internal/graph/project.go` 的 `nodePassesFilters`),**不進 PromQL**。語意:
  - `cluster` 比對 `node.labels["cluster"]`;**cluster 過濾啟用時 external node 一律被排除**。
  - `namespace` 比對 `node.labels["namespace"]`。
  - `name` 比對 `node.Name()`,為 **set 精確比對**(非子字串/regex)。
  - `edge_type` 僅 3 值:`pod-mounts-pvc` / `pod-calls-pod` / `service-selects-pod`。
  - edge 連帶:端點被過濾掉的 edge 隨之消失(後端 projection 完成)。
- **重要:後端 `q["cluster"]` 不拆逗號** → 多值必須用重複參數 `cluster=a&cluster=b`。
- **空值參數語意**(provisioning 須避開):送 `cluster=`(空字串)會被 `stringSet` 當成「過濾值=空字串」→ 比不到任何 node → 回空集合(**非**「無過濾」)。故變數**不可**展開成空值(見 §4.3);實作期 `curl` 確認此行為。
- 兩個探索端點可直接餵 Grafana query 變數:**`GET /v1/clusters`**、**`GET /v1/edge-types`**。
- 認證:`/v1/*` 可選 `X-API-Key`(未設 key 時為 no-op,demo 不受影響)。
- 輸出模型(`internal/api/serialise.go`):node `data = { id, name, type, parent?, ipaddress?, labels }`;`labels` 鍵含 `cluster` / `namespace` / `node`(pod 指向其 k8s node id)/ `volume`。cluster 容器 = `{ id:"cluster/<name>", type:"cluster", labels:{} }`。`/v1/graph` 回應另帶頂層 `clusters: [...]` 陣列。巢狀:pod→node→cluster、node/svc/pvc→cluster、others/external 無 parent。

### 2.2 ⚠️ 版本相依(已拍板)

scope 參數 + `/v1/clusters` + `/v1/edge-types` 都在後端**未發布分支**(version `dev`、無 release tag),demo 目前釘 `v0.0.14`(很可能無這些參數)。**決策**:鎖定最新後端,demo 改用 **`:latest`** tag(見 §4.5)。

### 2.3 Panel 端現況

- `features/element-filter`:`computeVisibility(elements, visibleKinds, visibleEdgeTypes)` → `{ visibleNodeIds, visibleEdgeIds }`;`useElementFilter` 以 `cy.batch` 對所有 node/edge 設 `cy.style('visibility','visible'|'hidden')`,**不重跑 layout**;edge 在端點隱藏時連帶隱藏;**未知 kind / 未知 edgeType 預設可見**。過濾來源是 panel options 的 `visibleKinds` / `visibleEdgeTypes`(MultiSelect)。後端**沒有** node-kind 參數,故 kind 過濾只能在 panel client-side。
- `features/graph-canvas/hooks/useCytoscape.ts`:3 個 effect —(1)init(empty deps、`layout:'preset'`、結束時 `removeAllListeners()+destroy()+cyRef=null`)、(2)**elements diff-patch**(deps `[elements]`,用 `diffElements` 算 `{toAdd,toRemove,toUpdate}` 後 `cy.batch` patch)、(3)stylesheet swap(deps `[stylesheet]`)。`isReady` 旗標讓子 effect 在實例建立後才(重)綁定。
- `features/graph-canvas/hooks/useGraphLayout.ts`:**唯一** layout 執行點(`cy.layout(opts).run()`),mount 與 layout 名稱改變時跑。
- `GraphCanvas.tsx`:組裝 `useCytoscape`/`useGraphLayout`/`useGraphResize`/`useElementFilter`;`cy.on('tap')` → `onSelect(id|null)`;受控 `selectedId` 經 `selectSingle` 同步藍框。
- `getStylesheet.ts`:純工廠;`node`(base,shape 由 `resolveShape(data.kind)`、`width/height:36`)→ `node:parent`(容器 round-rectangle)→ `node[?isCluster]`(cluster 半透明背板,`events:'no'`)→ status 外框 → `node:selected`(藍框)→ `edge`。
- legend:`NodeLegend`/`EdgeLegend`/`ClusterLegend`/`StatusLegend` **皆純展示**(無 onClick);`ClusterLegend` 在無 cluster 時 **return null**(不渲染 DOM)。`KsgPanel` 在 `legendArea` 依序渲染 Node→Edge→Cluster→Status,`& > div + div` 自動加分隔線。
- `package.json`:有 `cytoscape` / `cytoscape-fcose` / `cytoscape-dagre`,**無** `cytoscape-expand-collapse`。
- `registerExtensions.ts`:module 層 `cytoscape.use(fcose)` / `cytoscape.use(dagre)`,由 `module.ts` import。

## 3. 架構總覽:三層過濾/簡化

```
                       ┌──────────────────────────────────────────────┐
 dashboard variables   │  Grafana template vars (cluster/namespace/    │
 (使用者下拉選)         │  name/edge_type) ─ customqueryparam 插值       │
                       └───────────────┬──────────────────────────────┘
                                       ▼  (Infinity query URL)
   ① 資料源頭縮減    /v1/graph?…&cluster=a&cluster=b&namespace=x&name=…&edge_type=…
   (backend scope)                     │  後端 in-memory projection 回傳子圖
                                       ▼
                            PanelData.series → useGraphData → normalizeGraph
                                       ▼  ElementDefinition[](結構不可知;子圖照常渲染)
   ② 視覺精修        useElementFilter:visibleKinds / visibleEdgeTypes
   (panel client)            └─ cy.style('visibility') 不重跑 layout(後端無 kind 參數)
                                       ▼
   ③ 視覺簡化        cytoscape-expand-collapse:收合 cluster / k8s node 容器
   (panel collapse)          └─ legend 全域 toggle + canvas +/- cue;meta-edge 聚合連線
```

三層**正交且可組合**:① 在後端決定「圖裡有哪些東西」、② 在前端決定「哪些 kind/edge 可見」、③ 在前端決定「哪些容器收合」。

## 4. A. Grafana 變數過濾(backend query-param)

> **決策回顧**:Feature 1 範圍 = 基本變數過濾(不做 focus/traversal);過濾在後端;多值用**純 Grafana `customqueryparam`**(不動後端);鎖定最新後端 + `:latest`。

### 4.1 兩層過濾分工(務必清楚)

| 維度               | 過濾位置                | 機制                                                           |
| ------------------ | ----------------------- | -------------------------------------------------------------- |
| **cluster**        | backend                 | `&cluster=`(scope projection)                                  |
| **namespace**      | backend                 | `&namespace=`                                                  |
| **name(resource)** | backend                 | `&name=`(**精確比對**)                                         |
| **edge_type**      | backend(可選)           | `&edge_type=`                                                  |
| **node kind**      | **panel client**        | `computeVisibility` + `visibility:hidden`(後端無此參數)        |
| edge type          | panel client(既有,保留) | `computeVisibility`;與 backend `edge_type` 變數**可並存**(AND) |

> `edge_type` 同時可在 dashboard 變數(後端)與 panel option(client)過濾;兩者 AND。本次**不移除** panel 既有的 `visibleEdgeTypes`/`visibleKinds`(向後相容),只是新增 dashboard 層的後端過濾。

### 4.2 Dashboard template variables(provisioning)

於 demo dashboard `provisioning/dashboards/ksg-demo.json` 新增 `templating.list`(並在文件記錄給真實環境參考)。後端**無** `/v1/namespaces`,故 `namespace`/`name` 採 **Infinity query 變數從 `/v1/graph` 子集萃取 distinct 值**(chained on 上層變數):

| variable    | 類型            | Infinity 來源 / 解析                                                                                                                     | multi | 備註                                           |
| ----------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------- |
| `cluster`   | Query           | `GET /v1/clusters`;JSON root selector → `clusters`(陣列)                                                                                 | ✅    | Include All = **展開為全部實際值**(非自訂 `*`) |
| `namespace` | Query           | `GET /v1/graph?start=…&end=…&${cluster:customqueryparam:cluster:}`;JSONata/UQL 取 `nodes[*].data.labels.namespace` → **distinct/unique** | ✅    | **chained on `cluster`**;refresh on time range |
| `name`      | Query           | 同上來源,取 `nodes[*].data.name` → **distinct/unique**(chained on cluster/namespace)                                                     | ✅    | 後端**精確比對**(§4.1)                         |
| `edge_type` | Custom 或 Query | 固定 3 值,或 `GET /v1/edge-types`                                                                                                        | ✅    | 可選                                           |

設計註:

- `/v1/clusters` / `/v1/edge-types` 的確切 JSON 形狀(推測 `{apiVersion, clusters:[…]}` / `{apiVersion, edgeTypes:[…]}`)於實作時 `curl` 確認再定 root selector;`/v1/graph` 的 distinct 萃取以 Infinity 的 **UQL `summarize`/`distinct`** 或 JSONata `$distinct(nodes.data.labels.namespace)` 實作。
- **chained 空鏈**:若上層變數(cluster)無結果,下游(namespace/name)亦空 → 屬預期;demo seeder 必須至少提供一個 cluster 才能填充變數。
- 變數的 **Include All** 必須展開為「全部實際值」而非自訂 all-value(`*`),否則後端收到 `cluster=*` 比不到 → 回空(見 §2.1 空值語意)。

### 4.3 Query URL 參數化(`customqueryparam`)

Infinity query 的 URL 由原本

```
/v1/graph?start=${__from:date:seconds}&end=${__to:date:seconds}
```

擴充為(多值自動展開成重複參數、去 `var-` 前綴):

```
/v1/graph?start=${__from:date:seconds}&end=${__to:date:seconds}
  &${cluster:customqueryparam:cluster:}
  &${namespace:customqueryparam:namespace:}
  &${name:customqueryparam:name:}
  &${edge_type:customqueryparam:edge_type:}
```

語法說明 `${var:customqueryparam:<paramName>:<valuePrefix>}`:第 1 引數自訂 param 名(去掉標準 `queryparam` 會加的 `var-` 前綴)、第 2 引數為每個值的前綴。**本案用自訂名 + 空 valuePrefix**:`${cluster:customqueryparam:cluster:}` 對多值 `['a','b']` 展開為 `cluster=a&cluster=b`。

- **不可改用 `queryparam`**:標準 `queryparam` 會輸出 `var-cluster=a&var-cluster=b`(帶 `var-` 前綴),後端讀不到 `cluster`。
- **驗證要求**:Grafana docs 的 `customqueryparam` 範例為「自訂名 **+** 非空前綴」(`v-servers:x-`);「空 valuePrefix」這一變體須在 **目標 Grafana 版本實測確認**輸出無前綴的 `cluster=a&cluster=b`,並記錄測試版本。
- **空值/All**:選 All → 展開全部實際值 → 等同無過濾;無選任何值 → 期望不輸出該段(無空 `cluster=`)。實測若仍輸出空值,改以變數預設=All 規避(見 §2.1)。
- **後備方案 B**(僅在踩到 Infinity 多值 URL 已知地雷 #293/#1265 時啟用):後端 `stringSet` 加逗號拆分、Grafana 改用 `${cluster:csv}`。列為風險後備,本次不預先採用。

### 4.4 Panel 端影響(最小)

- `normalizeGraph` 結構不可知 → 後端回的任意子圖照常正規化,**無需改動**。
- 空集合已有處理:`KsgPanel` 對 `elements.length===0` 顯示 `No graph data`;重度過濾→空圖會走此路徑(可考慮文案微調為「No data for current filters」,屬選配)。
- **不**新增 scope 指示晶片(Feature 1 = basic)。panel options(`visibleKinds`/`visibleEdgeTypes`)維持不變。

### 4.5 後端版本 / demo(`dev-environment`)

- `docker-compose` 的 `kube-state-graph` 服務改用含 scope 參數的後端映像(`KSG_BACKEND_TAG` 預設 → `latest`)。
- demo dashboard 加上 §4.2 變數 + §4.3 URL;seeder 已涵蓋多 cluster/namespace,足以示範過濾。
- 文件(README / CLAUDE.md「Local demo」)更新:說明變數過濾、`:latest` 相依、`/v1/clusters` 與 `/v1/edge-types` 探索端點。

## 5. B. Compound node 收合(`cytoscape-expand-collapse`)

> **決策回顧**:用擴充套件;cluster 與 k8s node 皆可收合;控制 = legend 全域 toggle + canvas +/- cue,React 與 cue 事件雙向同步。
>
> **已查證**(iVis-at-Bilkent README):init `cy.expandCollapse(options)`;api `collapse(nodes)`/`expand(nodes)`/`collapseAll()`/`expandAll()`/`isExpandable(n)`/`isCollapsible(n)`/`getCollapsedChildren(n)`/`getCollapsedChildrenRecursively(n)`;class `cy-expand-collapse-collapsed-node`(收合節點)、`cy-expand-collapse-meta-edge`(聚合 edge)、`cy-expand-collapse-collapsed-edge`;事件 `expandcollapse.aftercollapse` / `expandcollapse.afterexpand`(及 `before*` 對應)。

### 5.1 依賴與註冊(rule 4)

- `package.json` 加 `cytoscape-expand-collapse`(+ 型別;若無官方型別則於 `cytoscape.d.ts` 補最小宣告:`cy.expandCollapse(opts)` 與 api 介面)。
- `registerExtensions.ts` 在 module 層 `cytoscape.use(expandCollapse)`(與 fcose/dagre 並列,once-guard)。**絕不**在 hook/component 內註冊。

### 5.2 初始化與生命週期(新 hook `useExpandCollapse`)

- 新增 `features/graph-canvas/hooks/useExpandCollapse.ts`。props:`{ cyRef, isReady, apiRef, collapsedIdsRef, onCollapsedChange, suppressRef }`(ref 由 GraphCanvas 持有,見 §5.3)。
- 一個依賴 `[cyRef, isReady]` 的 effect:
  - `isReady===false` 或 `cy===null` → 不動作。
  - `isReady===true`:`apiRef.current = cy.expandCollapse({ layoutBy:null, fisheye:false, animate:false, undoable:false, cueEnabled:true });` 並綁定 cue 事件(§5.3)。
    - `layoutBy:null` → 套件**不自跑** layout(`useGraphLayout` 仍是唯一 layout 源,rule 2);`animate:false` 避免與 fcose/dagre 動畫疊加。
  - cleanup:`cy.off('expandcollapse.aftercollapse expandcollapse.afterexpand', handler); apiRef.current = null;`(cy 本身由 useCytoscape 的 init effect 統一 `destroy()`,本 hook **不** destroy cy)。
- **重建**(StrictMode/hot-reload):`isReady` false→true 會重跑此 effect、取得**新** api、重綁事件;false 期間 cleanup 解綁並清 `apiRef`。

### 5.3 狀態模型、型別與雙向同步

- 唯一事實仍是 cy 實例;「哪些容器被收合」在 React 持有,以驅動 legend 並於資料 refresh 後重建收合。
- **狀態提升到 `KsgPanel`**:`const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());`(被收合的 **parent 容器 id** 集合)。理由:legend 控制鈕與 `GraphCanvas` 為兄弟,需共享。
- `KsgPanel` 由 `elements` 推導(比照現有 `clusterEntries` 的 `useMemo`):
  - `clusterContainerIds: string[]` = `data.isCluster===true` 的 id。
  - `k8sNodeContainerIds: string[]` = `data.kind==='node'` 且存在某 node `data.parent===此 id` 者。
- **新型別**:
  - `GraphCanvasProps` 增:`collapsedIds?: Set<string>; onCollapsedChange?: (next: Set<string>) => void;`(選配 → 不傳時行為同現況,向後相容)。
  - legend props 見 §5.9。
- **`onCollapsedChange` 契約**:**一律回傳「完整的下一個 collapsed id `Set`」**(非單節點 delta),符合 React state 慣例、簡化 reconcile。
- **GraphCanvas 內**建立穩定 ref:`apiRef = useRef<ExpandCollapseApi|null>(null)`、`suppressRef = useRef(false)`、`collapsedIdsRef = useRef(collapsedIds)`(以 `useEffect` 鏡像 `collapsedIdsRef.current = collapsedIds`),三者傳給 `useExpandCollapse` 與(§5.4)`useCytoscape`。
- legend toggle handler(在 `KsgPanel`):收合所有 cluster = `setCollapsedIds(prev => prev ∪ clusterContainerIds)`、展開 = 差集;k8s node 同理對 `k8sNodeContainerIds`。`KsgPanel` 收到 `onCollapsedChange(next)` 時 `setCollapsedIds(next)`。
- **cue → state(雙向同步 + guard)**:`useExpandCollapse` 綁 `expandcollapse.aftercollapse/afterexpand`;handler 內:**若 `suppressRef.current===true`(程式化套用中)→ 直接 return**;否則讀 `cy.nodes('.cy-expand-collapse-collapsed-node').map(n=>n.id())` 組成新集合 → `onCollapsedChange(new Set(...))`。**guard 旗標**(`suppressRef`)在 §5.4 程式化 `expandAll`/`collapse` 期間設 `true`、結束設 `false`,避免「程式化操作」回灌成「使用者操作」造成迴圈。

資料流:

```
KsgPanel.collapsedIds(Set<string>)
  ├─▶ ClusterLegend / NodeLegend toggle ─ 改 collapsedIds
  └─▶ GraphCanvas(collapsedIds, onCollapsedChange)
        ├─▶ collapsedIdsRef 鏡像;apiRef/suppressRef 由 useExpandCollapse 設定
        └─▶ cue 事件(suppress=false)─▶ onCollapsedChange(完整新 Set)─▶ KsgPanel.setCollapsedIds
```

### 5.4 與 diff-patch 同步的整合(★ load-bearing)

**問題**:收合會把 child 從圖中移除、加入 meta 元素。若 diff 直接比對「收合中的 cy 視圖」會把被收走的 child 當成「該重加」、把 meta 當成「該移除」,每次資料 refresh 與收合打架(違反 rule 3 精神)。

**機制**:**element diff 永遠對「完全展開的真實圖」進行,收合在 patch 後立即重套**,且全程在 `useCytoscape` **既有的單一** diff-patch effect 內完成(維持單一更新週期)。把該 effect 改為 **collapse-aware**,由 GraphCanvas 注入選配 ref(`apiRef`/`collapsedIdsRef`/`suppressRef`);**未注入時與現況完全相同**(向後相容)。

修訂後 diff-patch effect(pseudocode,取代 `useCytoscape.ts:57–81` 內容、deps **`[elements, collapseKey]`**):

```ts
const cy = cyRef.current;
if (cy === null) return;
const api = apiRef?.current ?? null;

// 1) 還原真實圖。無 api 或無收合 → no-op。首次掛載 elements 已在 constructor → diff 為空、
//    且尚無收合,故與 apiRef 設定時序無 race(useExpandCollapse 在 isReady 後才設 apiRef)。
if (api) {
  suppressRef.current = true;
  api.expandAll();
}

// 2) 對「真實 vs incoming」diff-patch（與現況相同：remove → add → update，cy.batch 包覆）
const current = cy.elements().jsons() as cytoscape.ElementDefinition[];
const diff = diffElements(current, elements);
cy.batch(() => {
  /* …與現況相同… */
});

// 3) 重套收合
if (api) {
  const present = new Set(cy.nodes(':parent').map((n) => n.id())); // patch 完成後仍存在的 parent 容器
  const recollapse = reconcileCollapse(collapsedIdsRef.current, present);
  if (recollapse.length > 0) {
    api.collapse(cy.collection(recollapse.map((id) => cy.getElementById(id))));
  }
  suppressRef.current = false;
  // 4) 修剪：collapsedIds 內已不存在的 parent（被這次更新移除）剔除後回報，僅在有縮減時
  if (recollapse.length !== collapsedIdsRef.current.size) onCollapsedChange?.(new Set(recollapse));
}
```

- **ref 歸屬**:`apiRef`/`suppressRef` 由 GraphCanvas 建立,同時傳給 `useExpandCollapse`(寫 api)與 `useCytoscape`(讀)。`collapsedIdsRef` 鏡像 `collapsedIds`,避免把它放進 diff-patch deps 造成多餘重跑。
- **無 race(首次掛載)**:elements 經 constructor 帶入 → 首次 diff 空、尚無收合;`useExpandCollapse`(deps `[cyRef,isReady]`)在 `isReady` 翻 true 後設 `apiRef`;其後 elements 變動時 apiRef 已就緒。
- **`expandAll()` 安全性**:無收合時為 no-op(已查證 api 語意),呼叫無副作用。
- **`collapseKey` 修正(legend toggle bug fix)**:effect deps 實際為 `[elements, collapseKey]`,其中 `collapseKey` 由 GraphCanvas 以 `runToken`(= `useCollapseRunToken` 的輸出,僅在 `collapsedIds` **內容**改變時 bump)傳入。如此當 legend toggle 更新 `collapsedIds`(但 `elements` 不變)時,同一個 expandAll → diff → reconcile → collapse 週期仍會執行 → 收合立即生效,不必等下次資料 refresh。no-collapse path 不傳 `collapseKey`(undefined)→ deps 實質為 `[elements, undefined]`,行為與修正前完全相同。GraphCanvas 中 `useCytoscape` 在 `useGraphLayout` 之前呼叫,故 collapse 套用(useCytoscape effect)先於 relayout(useGraphLayout effect)在同一 commit 內執行。

**純函式(可單測)**:

```ts
/**
 * 回傳應重套收合的 parent id（= desired ∩ 目前實際存在的 parent）。
 * presentParents 為 patch 完成後 cy.nodes(':parent') 的 id 集合。
 * 例：desired={A,B,C}, presentParents={A,B}（C 已被本次更新移除）→ ['A','B']。
 * 不分 cluster / k8s-node：兩者皆為 :parent，行為一致。
 */
export function reconcileCollapse(desired: ReadonlySet<string>, presentParents: ReadonlySet<string>): string[];
```

### 5.5 與 layout 的整合(rule 2)

- 收合/展開改變節點數與尺寸 → 需重排,但**不可**在收合處直接呼叫 `cy.layout()`。
- `useGraphLayout` 增 `runToken: number` 輸入,其唯一 layout effect deps `[cyRef, name, runToken]`,token 改變即重跑當前 layout ⇒ **`useGraphLayout` 仍是唯一呼叫 `cy.layout()` 處**。
- **bump 條件**:僅在 `collapsedIds` **內容**改變時 bump(以 size + 排序後 join 的等值比較判定,避免 ref 變動造成多餘重排);**mount 不額外 bump**(避免 double-layout —— init 仍 `preset`,首跑由既有 mount 邏輯負責)。
- **`runToken` / `collapseKey` 共用信號**:`runToken`(由 `useCollapseRunToken` 產生)同時作為 `collapseKey`(傳入 `useCytoscape`)與 `runToken`(傳入 `useGraphLayout`)。GraphCanvas 內的 hook 呼叫順序:①`useCytoscape`(collapse 套用)→②`useGraphLayout`(relayout)— 因此在同一 React commit 內,collapse 先完成、layout 再對「已收合的圖」執行,確保 layout 正確計算收合後的尺寸與位置。

### 5.6 與 element-filter 的整合

- child 收合後不在圖中(無需處理);收合 parent 保留**真實 id** → 仍在 `visibleNodeIds` → 依 kind 過濾正常。
- **meta-edge 例外(必處理)**:meta-edge id 為套件合成、不在 `elements` → 不在 `visibleEdgeIds` → 照現行 forEach 會被誤設 `hidden`。規則:meta-edge **不參與 edge-type 過濾**(聚合多型別),可見性僅依兩端端點。`useElementFilter` 於既有 `cy.batch` 迴圈後**追加一段**(class 已查證):

```ts
cy.edges('.cy-expand-collapse-meta-edge').forEach((e) => {
  const visible = e.source().style('visibility') === 'visible' && e.target().style('visibility') === 'visible';
  e.style('visibility', visible ? 'visible' : 'hidden');
});
```

- 順序:收合(§5.4)在資料更新週期內先完成;filter effect(deps `[cyRef, sets]`)隨後對「收合後的當前圖」套 visibility。

### 5.7 與選取 / Node Detail 的整合

- **可點性原則(解決矛盾)**:
  - **展開狀態的 cluster 維持純裝飾**(`node[?isCluster]` 的 `events:'no'` 不變)→ 不可選、不顯示 detail。
  - **收合狀態的 cluster 才可點**(展開 / 看 detail):對 class `node.cy-expand-collapse-collapsed-node` 覆寫 `events:'yes'`(宣告於 `node[?isCluster]` 之後)。
  - **k8s node 容器**本就可點(展開或收合皆是,現況 `node:parent` 即 interactive)。
- 收合容器(meta-node)保留真實 id,點擊 → 既有 `onSelect(id)` → Node Detail 顯示;**僅對收合容器**可於 detail 顯示「收合了 N 個子節點」(讀 `api.getCollapsedChildren(node).length`,選配)。
- `+/-` cue 由套件繪製、獨立捕捉點擊,不受 `events` 影響。
- 被收走而消失的選取節點 → `resolveSelectedNode` 找不到 → 面板自動關(沿用既有行為)。

### 5.8 stylesheet(收合節點 + meta-edge)

class 名稱已對照 README 查證。於 `getStylesheet.ts` 追加(維持純工廠、排序語意):

- `node.cy-expand-collapse-collapsed-node`:強調可展開(略粗 border;可選顯示子節點數標籤);其中 **cluster** 收合節點同時覆寫 `events:'yes'`(§5.7),宣告於 `node[?isCluster]` 之後。
- `edge.cy-expand-collapse-meta-edge`(及 `cy-expand-collapse-collapsed-edge`):中性聚合線(neutral 色、稍粗),與 §5.6 的過濾豁免一致。

### 5.9 Legend 收合控制(互動化)

- 新增**選配 props**(無 handler 時維持純展示、向後相容,既有測試不破):
  - `ClusterLegend`:`onToggleCollapseAll?: () => void; allCollapsed?: boolean;`
  - `NodeLegend`:`onToggleCollapseAll?: () => void; allCollapsed?: boolean; showCollapseToggle?: boolean;`(`showCollapseToggle` 由 `k8sNodeContainerIds.length > 0` 控制)
- **兩顆獨立 toggle**:Cluster 區一顆(收合↔展開**所有 cluster**)、Node 區一顆(收合↔展開**所有 k8s node**)。有 handler 時於該區段標題列渲染小 `IconButton`。
- `KsgPanel` 計算各自 `allCollapsed`(`ids.length > 0 && ids.every((id) => collapsedIds.has(id))`)並接上 handler。

## 6. C. 視覺調整

### 6.1 Node-kind 形狀重配(single-source `SHAPE_BY_KIND`)

`src/shared/constants/shapeByKind.ts` 改動(legend 與 stylesheet 皆自動跟隨):

| kind       | 現在            | 改成                |
| ---------- | --------------- | ------------------- |
| `service`  | round-rectangle | **hexagon**         |
| `node`     | pentagon        | **round-rectangle** |
| `pvc`      | barrel          | **pentagon**        |
| `pod`      | ellipse         | (不變)              |
| `others`   | diamond         | (不變)              |
| `external` | star            | (不變)              |

- **`node` 用 `round-rectangle`**:`node`(kind)的 leaf 形狀僅在「**無 child 的孤立 node**」或「**收合後**的 node」(此時不再是 `:parent`,落回 base `node` shape)生效;「**有 pod 的 node**」仍由 `node:parent` 畫成 round-rectangle 容器框。三種情況皆 round-rectangle → 視覺一致,呼應「node 是 compound node」。legend 的 node glyph 也呈 round-rectangle。
- 更新檔內「多邊形不可彼此混淆」註解:新組合 pod=ellipse / service=hexagon / node=round-rectangle / pvc=pentagon / others=diamond / external=star,於小尺寸仍可區分。

### 6.2 Leaf 節點放大

`getStylesheet.ts` base `node` 的 `width/height` **36 → 40**;legend 的 `ShapeGlyph` 尺寸同步微調以對齊。

### 6.3 Legend 區段重排 + 互動化

- `KsgPanel` 的 `legendArea` 渲染順序改為 **Cluster → Node → Edge → Status**(Cluster 移到最上)。
- `ClusterLegend` 無 cluster 時 **return null**(不產生 DOM 節點),故 `& > div + div` 分隔線規則仍正確(此時 NodeLegend 成為第一個可見區段、無上框線);無需改 CSS。
- Cluster 與 Node 區段帶 §5.9 的收合 toggle。

## 7. 測試策略(維持 ≥80%,TDD)

- `shapeByKind`(若有測):更新形狀斷言。
- `getStylesheet`:base node `width/height===40`;`node.cy-expand-collapse-collapsed-node` 與 `edge.cy-expand-collapse-meta-edge` 選擇器存在且排序正確(collapsed-cluster 的 `events:'yes'` 在 `node[?isCluster]` 之後);更新 snapshot。
- `reconcileCollapse`:純函式 —— 全部仍在 → 全部重套;部分被移除 → 只重套存在者;空集合 → 空。
- collapse-aware diff-patch / `useExpandCollapse`:沿用 headless cytoscape 慣例。**`expand-collapse` 與 fcose/dagre 一樣在 jest 不註冊** → 以 `jest.spyOn(cy,'expandCollapse')` 回傳假 api(`expandAll`/`collapse`/`getCollapsedChildren`/`on` mock),驗證 expandAll→patch→recollapse 呼叫順序、`suppressRef` 進出、`runToken` bump 與 `onCollapsedChange` 回傳**完整 Set**,而非真實收合幾何。
- `useElementFilter`:新增 case —— meta-edge(`.cy-expand-collapse-meta-edge`)不被 edge-type 過濾隱藏、僅隨端點可見性。
- `ClusterLegend`/`NodeLegend`:有 handler → 渲染 toggle 並可觸發;無 handler → 維持純展示(既有測試不破);`NodeLegend` 的 `showCollapseToggle===false` 時不顯示 node toggle。
- `KsgPanel`(RTL):legend toggle → `collapsedIds` 變更傳入 `GraphCanvas`;cluster legend 在無 cluster 時不渲染。
- Feature 1 多為 provisioning/文件,無單元測試;以手動/Playwright 視覺驗證(選配),並在目標 Grafana 版本實測 `customqueryparam` 多值展開(§4.3)。

## 8. OpenSpec 整合

依「延伸 `scaffold-ksg-panel`」:

- `specs/panel-rendering/spec.md` 新增 requirement/scenario:
  - **Compound node 收合**(cluster/k8s-node 收合、meta-edge 連線保留、legend toggle + cue、與 filter/layout/選取 的互動)。
  - **Node-kind 形狀重配 + 尺寸 + legend 重排**(可併入既有 styling/legend requirement)。
- `specs/graph-data-integration/spec.md` 新增 requirement/scenario:
  - **Dashboard 變數驅動的後端過濾**(cluster/namespace/name/edge_type 經 query 參數;`customqueryparam` 多值;探索端點變數來源;All/空值語意)。
- `specs/dev-environment/spec.md`:demo backend 鎖定 `:latest`、變數 provisioning、文件更新。
- `tasks.md` 新增工作節(`## 21. Grafana 變數過濾`、`## 22. Compound node 收合 + 視覺調整`)。
- 本設計文件 commit 進 git。

## 9. 風險 / 取捨

- **expand-collapse × diff-patch reconciliation**(§5.4)為最高風險:以 `reconcileCollapse` 純函式 + expandAll→patch→recollapse 單一週期 + `suppressRef` guard + 選配注入 降低耦合;必測呼叫順序、guard 進出、與資料 refresh 後收合保持。
- **Infinity 多值 URL**(社群 #293/#1265):`customqueryparam` + 空 valuePrefix 為依 Grafana docs 推得的可行路徑,但**空前綴變體未見官方範例**,須於目標 Grafana 版本實測;失敗則啟用 §4.3 後備方案 B(後端逗號拆分)。
- **namespace/name 變數來源**:後端無對應探索端點,靠 Infinity 從 `/v1/graph` distinct 萃取;`name` 後端為精確比對(文件已明示限制)。
- **後端未發布分支**:`:latest` 為移動標的;設計以目前 `feat/build-graph-api` 行為為準,實作期 `curl` 確認 `/v1/clusters`、`/v1/edge-types` 回傳形狀與空值行為。
- **cue × legend 雙向同步**:已以 `suppressRef` guard 定義(§5.3/§5.4);實作須確保程式化操作全程包在 guard 內。

## 10. 不做(YAGNI)

- 不做 focus/traversal(`root`/`depth`/`direction`)鄰域模式(可作後續;與 Node Detail 的「以選取節點為錨」很搭,但本次不納)。
- 不做 panel 內 scope 指示晶片。
- 不改後端程式(逗號拆分僅列為風險後備)。
- 不移除 panel 既有 `visibleKinds`/`visibleEdgeTypes` 過濾(與後端過濾並存)。
- 不做 legend 區段自身的折疊(此處「收合」專指圖上的 compound 容器)。
