# Code Review — xhigh · whole project（2026-06-11）

> 產出流程：9 個 finder 角度 → 31 個去重候選 → 18 個 verifier（多數附 headless cytoscape 實證）→ 補漏掃描 4 個 → **29 成立 / 2 駁回**。
> 本檔是後續修復的工作清單。每項含證據與修復方向；修完請勾選並補上 commit。
> 審查基準：commit `8d9c657`（feat/node-detail-panel）。行號以該版本為準。

## 修復狀態總覽

| # | ID | 嚴重度 | 檔案:行 | 一句話 | 狀態 |
|---|----|--------|---------|--------|------|
| 1 | V1 | CRITICAL | useCytoscape.ts:154 | cy.remove 的 `#id` selector 未跳脫，刪除批次整批靜默失效 | ☐ |
| 2 | V2 | CRITICAL | KsgPanel.tsx:373 | isLoading 早退卸載 GraphCanvas，每次 refresh 銷毀 cy instance | ☐ |
| 3 | V12 | CRITICAL | useCytoscape.ts:92 | cytoscape alias React 側 elements data，extension 就地改寫污染 | ☐ |
| 4 | S1 | HIGH | useGraphLayout.ts:60 | fixedNodeConstraint 引用被 collapse 移除的節點 → 全圖 NaN | ☐ |
| 5 | V15 | HIGH | useCytoscape.ts:170 | compound parent 移除 cascade 吃掉改宿子節點 | ☐ |
| 6 | V16 | HIGH | diffElements.ts:67 | edge source/target 變更走 data() patch 死路，永不生效 | ☐ |
| 7 | V10 | HIGH | KsgPanel.tsx:376 | 任一筆 parse error 整面 Alert，丟棄 partial parse 結果 | ☐ |
| 8 | V9 | HIGH | computeVisibility.ts:62 | 未知 edgeType 被隱藏（spec 要求 fallback 渲染）+ cascade 連坐 | ☐ |
| 9 | S3 | MED-HIGH | useExpandCollapse.ts:74 | cue handler 從畫布重建 collapsed 集合，巢狀摺疊 id 遺失 | ☐ |
| 10 | V18 | MEDIUM | diffElements.ts:19 | extension 殘留 key 使摺疊過的 parent 永遠進 toUpdate | ☐ |
| 11 | V4 | MEDIUM | GraphCanvas.tsx:195 | mode 切換 rebuild 後選取圈遺失（effect 缺 elements dep） | ☐ |
| 12 | V17 | MEDIUM | KsgPanel.tsx:186 | detail panel 持續描述被 collapse 掉的節點 | ☐ |
| 13 | V11 | MEDIUM | KsgPanel.tsx:415 | EmptyState 取代 GraphCanvas（spec 要求 overlay 保留 instance） | ☐ |
| 14 | V8 | MEDIUM | KsgPanel.tsx:139 | 無 message 的 DataQueryError 被吞掉 | ☐ |
| 15 | V21 | MEDIUM | useHoverElement.ts:74 | hover 把 cytoscape 即時 data 物件存進 React state | ☐ |
| 16 | S2 | LOW-MED | iconSvgByKind.ts:82 | `in` 走原型鏈，kind='toString' 之類會 throw | ☐ |
| 17 | V3 | LOW-MED | ContainerTable.tsx:72 | prototype-ful map 查 'constructor' container 名穿透 guard | ☐ |
| 18 | V7 | LOW-MED | AlertTable.tsx:67 | 單 pod 內重複 alert id → 重複 React key | ☐ |
| 19 | V23 | LOW-MED | seedAddedNodePositions.ts:76 | 無 parent 新節點落 (0,0) 不觸發 relayout | ☐ |
| 20 | S4 | LOW-MED | useGraphLayout.ts:56 | cy.stop() 停不了 fcose 動畫，背靠背 layout 互相拉扯 | ☐ |
| 21 | V19 | LOW | KsgPanel.tsx:107 | owner kind 未對 DETAIL_URL_KINDS 驗證即發查詢 | ☐ |
| 22 | V22 | LOW(潛伏) | useExpandCollapse.ts:78 | cleanup 不 teardown extension，重 init 疊 listener/canvas | ☐ |
| 23 | V6 | LOW | normalize.ts:287 | 重複 id 靜默通過、無 errors[] 記錄 | ☐ |
| 24 | V14 | SPEC | EdgeLegend.tsx:53 | 雙向 legend 列與 baseline spec 矛盾（改 spec） | ☐ |
| 25 | V13 | SPEC | normalize.ts:270 | spec 殘句『仍攜帶 status（預設 normal）』與 code/同 spec 矛盾（改 spec） | ☐ |
| 26 | V24 | PERF | useGraphData.ts:63 | memo 鍵在 series identity，相同 payload 重建整條 pipeline | ☐ |
| 27 | V26 | PERF | KsgPanel.tsx:186 | computeVisibility 相同輸入算兩次 | ☐ |
| 28 | V27 | PERF | KsgPanel.tsx:191 | 『React Compiler memoizes』註解為假，O(n) 裸跑 | ☐ |
| 29 | V28 | CLEANUP | deriveStorageClassContainers.ts:27 | 與 deriveNodeContainers 逐行重複 | ☐ |
| 30 | V29 | CLEANUP | detailUrlKinds.ts:7 | 手維護平行 kind 清單，無窮舉檢查 | ☐ |
| 31 | V30 | CLEANUP | getStylesheet.ts:257 | switch 邊 taxi routing 硬編碼於 stylesheet | ☐ |
| 32 | V31 | CLEANUP | colorByEdgeType.ts:71 | COLOR_BY_EDGE_TYPE + DrawnEdgeType 死碼 | ☐ |

**建議修復分組**（同根問題一起修，見文末「修復順序建議」）：
- **Group A — diff-patch apply 路徑**：#1 V1、#5 V15、#6 V16（都在 useCytoscape 的 patch 迴圈/diffElements 分類）
- **Group B — extension 就地改寫家族**：#3 V12、#10 V18、#15 V21（共同根因：cytoscape/extension 與 React 側共享可變物件）
- **Group C — KsgPanel render gates**：#2 V2、#7 V10、#13 V11、#14 V8（同一段早退邏輯）
- **Group D — collapse 狀態一致性**：#9 S3、#12 V17、#22 V22
- **Group E — 原型鏈查表**：#16 S2、#17 V3（同型修法：`Object.hasOwn` / `Map` / null-prototype）

---

## CRITICAL

### V1 — cy.remove 的 `#id` selector 未跳脫，刪除整批靜默失效

- **位置**：`src/features/graph-canvas/hooks/useCytoscape.ts:154`
- **程式碼**：`cy.remove(diff.toRemove.map((id) => `#${id}`).join(', '));`
- **問題**：panel 合成的 id 含 cytoscape selector 不允許的字元：
  - `normalize.ts:167` → `ctrl/${cluster}/${ns}/${kind}/${name}`
  - `normalize.ts:453` → `syn:controller-owns-pod:${controllerId}:${podId}`
  - `applyPodParentMode.ts:5` → `ppm:pod-runs-on-node:` 前綴
  觸發字元是 `/` 與 `:`（實測 `.` 點號 FQDN id 反而合法可刪）。
- **實證**（headless cytoscape 3.33，專案 node_modules）：
  - `cy.remove('#ctrl/prod/db/x, #ppm:pod-runs-on-node:p1, #a')` → console warn `The selector ... is invalid`、不 throw、**0 個元素被刪**。
  - 一個壞 segment 毒化整串逗號連接的 selector — 連純 `#a` 也不刪。
  - `cy.remove(cy.getElementById('ctrl/prod/db/x'))` 正常刪除（安全替代，已實測）。
- **後果**：預設 controller 模式下任何 refresh 有元素消失時，刪除整批 no-op → 幽靈 controller/pod/邊永久累積，且每次 refresh 重複失敗 + 重複 console warn。
- **修法**：改用 collection：`cy.remove(cy.collection(diff.toRemove.map((id) => cy.getElementById(id)).filter((c) => c.length > 0)))` 或逐一 `cy.getElementById(id).remove()`（放進現有 cy.batch 內）。一行等級的修復。

### V2 — isLoading 早退每次 refresh 銷毀 cy instance

- **位置**：`src/panels/KsgPanel/KsgPanel.tsx:373`（`isLoading` 定義在 :138）
- **程式碼**：`const isLoading = data.state === LoadingState.Loading;` + `if (isLoading) { return <LoadingOverlay />; }`
- **問題**：無 `elements.length === 0`（首載）guard。Grafana panelQueryRunner 在查詢進行中會發出 `{state: Loading, series: 前次資料}` 的 PanelData — 每個 refresh tick 都會經過 Loading 狀態。早退使 GraphCanvas 整棵 unmount，`useCytoscape` cleanup（:99-105）執行 `removeAllListeners + destroy + ref=null`。
- **後果**：後端非瞬時回應時，每次 refresh 銷毀位置/zoom/pan/collapse 幾何，Done 後重 mount 並以 `randomize:true` 重跑 fcose — 整張圖洗牌。diff-and-patch 架構（design D7）從未有機會執行。
- **修法**：只在首載（無既有 elements）時顯示 LoadingOverlay，否則保留 GraphCanvas（可疊半透明 spinner overlay）：`if (isLoading && elements.length === 0) return <LoadingOverlay/>;`

### V12 — cytoscape alias React 側 elements 的 data 物件，extension 就地改寫污染

- **位置**：`src/features/graph-canvas/hooks/useCytoscape.ts:92`（constructor）、`:145`/`:163`（cy.add）、`seedAddedNodePositions.ts:84`（`{...el, position}` 沒 clone data）
- **問題**：cytoscape Element ctor 是 `data: params.data || {}` — 以 reference 收下。expand-collapse extension collapse 時就地寫入 `collapsedChildren`（live collection）、`position-before-collapse`、`size-before-collapse`，並把 boundary edge 的 `data.source`/`data.target` 改寫到 collapsed parent。`applyPodParentMode.ts:7-14` 的註解明確記載這個機制，但它的 cloneElement 只保護 baseElements — 它的**輸出**（KsgPanel.tsx:149 的 memoized `elements`）正是被 cytoscape alias 的那份。
- **實證**：headless + extension：collapse 後原始陣列物件被改寫（`B6 original edge source/target now: ctrl -> ext`、`B9 live cy edge data === original array edge data: true`）。
- **受污染的 consumer**（collapse 期間讀到改寫後拓撲）：KsgPanel 的 computeVisibility(:187)、resolveSelectedNode(:195)、clusterEntries(:221)、presentEdgeTypes(:239)、default-collapse effect(:273)、deriveContainers(:300)、deriveStorageClassContainers(:308)、deriveLegendKinds(:330)、clusterContainerIds(:333)；GraphCanvas 的 buildSwitchConstraints(:79)、useElementFilter(:101)、useSelectionFocus(:200)。
- **後果範例**：collapse 期間 extension 把 gw→pod1 改寫成 gw→ctrl → legend 切換觸發 computeVisibility 重算 → pod1 變成零 incident edge → orphan cascade 把它隱藏。也是已記錄的 first-refresh fold-jump 根因（2026-06-10 rollback 的修復即針對此；機制仍在）。
- **修法**：在交給 cytoscape 前 deep-clone data（constructor 與兩處 cy.add；`structuredClone` 或逐元素 `{...el, data: {...el.data}}`，注意 nested labels/alerts/containers 也要 clone）。或反向：交給 cy 的永遠是 throwaway clone，React 側 `elements` 保持 pristine。**注意與已 rollback 的 pristine-snapshot guard（V25）方案重疊 — 修這條前先跟使用者確認方向**。

---

## HIGH

### S1 — fixedNodeConstraint 引用已被 collapse 移除的節點 → 全圖 NaN

- **位置**：`src/features/graph-canvas/hooks/useGraphLayout.ts:58-62`、`src/features/switch-topology/buildSwitchConstraints.ts:47-66`
- **問題**：`buildSwitchConstraints` 對每個 levelled 節點產生 **fixedNodeConstraint**（絕對位置 pin），來源是完整 React 側 `elements`（GraphCanvas:79）。`useGraphLayout` 在 layout run 時直接 `{...baseOptions, ...constraints}` 展開，**不過濾**live 圖中已不存在的節點。controller 模式 k8s node 被 pin 進 switch fabric，而 k8s node 是 cluster compound 的子節點 — cluster 被 collapse 時它們被移出圖。
- **機制**（sweep agent 追查 cose-base 原始碼；**尚未 headless 實測**）：ConstraintHandler.js ~619-634 以 `xCoords[nodeIndexes.get(missingId)]` 取 undefined → translationAmount NaN → 加到**所有**節點座標。
- **觸發**：collapse cluster（legend 全摺或 cue）後任何 layout 重跑：mode 切換（layoutKey 變）、unanchored 新增觸發 requestRelayout、onMountCollapseApplied。
- **後果**：全圖座標 NaN、畫面消失且不會自行恢復。
- **修法**：在 useGraphLayout 組 options 時過濾：`fixedNodeConstraint.filter((c) => cy.getElementById(c.nodeId).inside())`（relativePlacementConstraint 若未來加入也要同樣處理）。**修復前先寫 headless 重現測試確認 NaN 行為**。

### V15 — compound parent 移除 cascade 吃掉改宿（reparent）的子節點

- **位置**：`src/features/graph-canvas/hooks/useCytoscape.ts:154`（remove 先跑）+ `:170-171`（`if (target.length === 0) { continue; }`）
- **問題**：toRemove 先執行；cytoscape 移除 compound parent 會 cascade 移除其子節點。後續 toUpdate pass 對「parent 改變了、本應 move 的子節點」發現元素已不在而直接 continue。
- **實證**：headless：nodeA(含 pod1)+nodeB，incoming = 刪 nodeA、pod1 改宿 nodeB → `remove('#nodeA')` 連 pod1 一起刪 → update pass skip → pod1 消失，下次 refresh 才以 toAdd 復活。
- **觸發**：node 模式 K8s node 被刪而 pods 同 refresh 改宿；controller 模式 controller 消失而 pods 仍在。
- **修法**：apply 順序改為「先處理 toUpdate 的 parent move（把要保留的子節點先 move 走）再 remove」；或 remove 前把 `toRemove` parent 的仍-in-incoming 子節點先 `target.move({parent: next})`。也可在 diffElements 把「parent 即將被刪的 toUpdate 子節點」標註出來讓 apply 端特判。

### V16 — edge source/target 變更走 data() patch 死路

- **位置**：`src/features/graph-canvas/sync/diffElements.ts:67`（分類）+ `useCytoscape.ts:192`（`target.data(el.data)`）+ `useCytoscape.ts:52-53`（註解宣稱的 remove/add 路徑不存在）
- **問題**：id 穩定但 source/target 變更的 edge 被分類為 toUpdate；cytoscape 的 `.data()` 對不可變鍵（id/source/target/parent）靜默忽略。apply 端唯一的結構 fallback 是 node-only 的 parent move（:193-195）。
- **實證**：headless：`edge.data({target:'n2'})` 後 target 仍是 n1，下一輪 diff 再度標記 toUpdate（無限 churn）。
- **觸發**：`applyPodParentMode.ts:136` 的合成邊 id 只編碼 podId（`ppm:pod-runs-on-node:${podId}`）→ pod 換宿 K8s node 時 id 不變、target 變。後端真實邊免疫（id 是 content-hash，端點變 = id 變 = remove+add）。
- **修法**（二選一）：(a) diffElements 偵測 edge 端點變更時改列 toRemove+toAdd；(b) 合成邊 id 把 target 也編進去（`ppm:pod-runs-on-node:${podId}:${nodeId}`）讓既有 remove+add 路徑自然生效 — (b) 較小但要確認 collapse reconcile 對合成邊 id 的引用。

### V10 — 任一筆 parse error 整面 Alert，丟棄 partial parse

- **位置**：`src/panels/KsgPanel/KsgPanel.tsx:376-381`
- **程式碼**：`if (normalizeError !== undefined) { return (<Alert severity="error" title="Graph data malformed">...) }` — 不檢查 `elements.length`。
- **Spec 依據**：`openspec/specs/graph-data-integration/spec.md`〈Boundary Normalize 函式〉：『略過不合法項目並收集警告於 errors』；scenario「不合法資料不中斷渲染」：缺 id 的 node 被略過、**其餘合法資料正常映射**。`useGraphData.ts:69-71` 也確實把 partial elements 跟 error 一起回傳 — 然後被 panel 丟掉。
- **後果**：500 節點中 1 筆缺 id → 整面 Alert，可視化全滅。
- **修法**：`elements.length > 0` 時渲染圖 + 非阻斷式警告（角落 badge / Alert 縮小為 inline）；只有 elements 為空時才整面 Alert。注意 hook-level scenario『payload 形狀錯誤 → {elements: [], error}』的整體失敗情境仍應整面顯示。

### V9 — 未知字串 edgeType 被隱藏（spec 要求 fallback 渲染）+ orphan cascade 連坐

- **位置**：`src/features/element-filter/computeVisibility.ts:61-64`
- **程式碼**：`if (typeof edgeType !== 'string' || edgeTypeSet.has(edgeType as EdgeType))` — 只有**非字串**才放行；未知字串型別被隱藏。對照 `nodeIsVisible`（:17-19）未知 kind 預設可見 — 不對稱。
- **宇宙封閉**：`KsgPanel.types.ts:22/28` `ALL_EDGE_TYPES = Object.keys(EDGE_STYLE_BY_TYPE)`；editor MultiSelect 只列已知型別 → 使用者無法重新開啟未知型別。
- **Spec 依據**：`panel-rendering/spec.md:56-59`「未知邊類型走 fallback：以 fallback 灰色實線渲染」；`pod-parent-mode/spec.md:47-50` 同。
- **連坐**：hideOrphans（:122-141）把只剩未知邊連接的端點節點也 cascade 隱藏 → 上游新增 edge type 時資料無聲消失（正是 spec 防範的情境）。
- **修法**：edge 的 membership 測試加未知-放行分支（鏡像 unknown-kind 邏輯）：`!KNOWN_EDGE_TYPES.has(edgeType) || edgeTypeSet.has(edgeType)`。補 unknown-edge-type 測試案例（現有測試只蓋 unknown kind）。

---

## MEDIUM-HIGH / MEDIUM

### S3 — cue handler 從畫布重建 collapsed 集合，巢狀摺疊 id 遺失

- **位置**：`src/features/graph-canvas/hooks/useExpandCollapse.ts:74-75`
- **程式碼**：`const next = new Set(cy.nodes(COLLAPSED_NODE_CLASS).map((n) => n.id())); onCollapsedChange(next);` — 從頭重建，非與前值 union。
- **機制**：extension collapse 祖先時把後代（含已 collapse 的）**移出圖**（V12/V18 實證確認 collapsedChildren 是被 remove 的 collection）；`cy.nodes(selector)` 只比對在圖中的元素 → 巢狀 collapsed id 從回報集合消失。
- **後果**：storage class 預設 collapsed 在 cluster 內 → 點 cluster 的 cue collapse → React collapsedIds 遺失 storageclass id → 下個 diff cycle expandAll + 只 re-collapse 回報集 → 之後展開 cluster 時 PVC 全攤開、legend 摺疊狀態錯亂。
- **修法**：handleCue 改成增量合併：以 event 的 target id 對 `collapsedIdsRef.current` 做 add（aftercollapse）/delete（afterexpand），而非從畫布重建。注意 afterexpand 展開祖先時，巢狀 collapsed 後代會回到圖中且仍帶 class — 增量法天然正確。

### V18 — extension 殘留 key 使摺疊過的 parent 永遠進 toUpdate

- **位置**：`src/features/graph-canvas/sync/diffElements.ts:17-25`（definedKeys 只濾 undefined + key 數比對）；extension 殘留：`expandCollapseUtilities.js:37`（expand 後 `collapsedChildren = null` 不刪）、`:316`（`size-before-collapse` 永不移除）
- **實證**：collapse→expand 後 jsons() 帶 `collapsedChildren:null` + `size-before-collapse` → 對 fresh normalize 輸出 diff → toUpdate=[ctrl]；套用 useCytoscape 的 patch（PRESERVED_DATA_KEYS 擋掉刪除）後**下一輪仍是 toUpdate** — 永遠修不平。
- **後果**：預設 collapse-all 模式下每個 refresh 對每個摺疊過的 parent 跑無意義 removeData/data/style pass；toUpdate 喪失變更訊號意義。
- **修法**：diffElements 加 extension-bookkeeping ignore-list（`collapsedChildren`、`size-before-collapse`、`position-before-collapse`、`x-before-fisheye`/`y-before-fisheye`、`expandcollapseRenderedStartX/Y/CueSize`、`originalEnds`），definedKeys 同時把 `null` 的 `collapsedChildren` 視為 absent；與 useCytoscape 的 PRESERVED_DATA_KEYS 共用同一個常數來源。

### V4 — mode 切換 rebuild 後選取圈遺失

- **位置**：`src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx:188-195`（deps `[cyRef, selectedId, isReady]`）+ `useCytoscape.ts:143-146`（modeChanged 分支 `existing.remove(); cy.add(elements)`）
- **實證**：headless：select → remove-all → re-add 相同 id：`a.selected=false`、`:selected` 空、事件只有 `select:a / remove:a`（**remove 不發 unselect**）。src/ 無任何 select/unselect/add 監聽可補救；useSelectionFocus（deps 含 elements）只重套 FADED_CLASS。
- **後果**：選取 pod → 切 node⇄controller → 藍圈消失、detail panel 仍開、dimming 仍在 — 視覺狀態三方不一致。
- **修法**：選取同步 effect deps 加 `elements`（或 useCytoscape rebuild/re-add 後重套 `selectSingle(cy, selectedId)`）。

### V17 — detail panel 持續描述被 collapse 掉的節點

- **位置**：`src/panels/KsgPanel/KsgPanel.tsx:186-189`（computeVisibility 不含 collapsedIds）+ `:80-82`（自述不變量：『detail panel 永不描述不在畫布上的節點』）
- **機制**：extension 的 collapseNode 會 unselect 子節點，但 src/ 無人監聽 unselect → selectedNodeId 不變；節點仍在 elements/visibleNodeIds → resolveSelectedNode 照樣回傳。
- **注意**：baseline spec（panel-rendering:185）刻意把 collapse 隱藏的子節點留在 visibleNodeIds（orphan-cascade 用）——所以**不要**改 computeVisibility；違反的是 KsgPanel 註解層級的不變量。
- **修法**（擇一）：(a) resolveSelectedNode 額外收 collapsedIds，選取節點的任何祖先在 collapsedIds 中即回 null（會關 panel）；(b) GraphCanvas 監聽 `expandcollapse.aftercollapse`，若選取節點被摺進去則 onSelect(null)。(a) 較純函式、好測。

### V11 — EmptyState 取代 GraphCanvas（spec 要求 overlay 保留 instance）

- **位置**：`src/panels/KsgPanel/KsgPanel.tsx:384-385`（emptyMessage 推導）+ `:415-417`（ternary 替換）
- **Spec 依據**：`panel-rendering/spec.md:235`「全部 node kind 被過濾顯示 EmptyState」：『Panel 覆蓋顯示 EmptyState…**canvas 本身保留（不重建 instance）**』。
- **後果**：全部取消勾選再勾回 → instance 重建 + 隨機重排。
- **修法**：EmptyState 改為絕對定位 overlay 疊在 GraphCanvas 上（GraphCanvas 持續 mount）。注意 `elements.length === 0`（真的沒資料）的情境用 overlay 也成立，但首載無資料時不需先建 canvas — 可分流。

### V8 — 無 message 的 DataQueryError 被吞掉

- **位置**：`src/panels/KsgPanel/KsgPanel.tsx:139`
- **程式碼**：`const seriesError = data.errors?.[0]?.message;` — 唯一錯誤來源；無 `data.error` fallback、無 status/statusText fallback、不檢查 `LoadingState.Error`。`DataQueryError.message` 是 optional（@grafana/data types）。
- **後果**：`errors:[{refId:'A', status:500}]` → panel 當作查詢成功，渲染 'No graph data' 或舊資料。
- **修法**：`const e = data.errors?.[0]; const seriesError = e ? (e.message ?? e.statusText ?? `Query failed (status ${e.status ?? 'unknown'})`) : undefined;` 並考慮 `data.state === LoadingState.Error` 為兜底。

### V21 — hover 把 cytoscape 即時 data 物件存進 React state

- **位置**：`src/features/hover-tooltip/hooks/useHoverElement.ts:74-78`
- **程式碼**：`const data = target.data() as Record<string, unknown>;` 直接放進 state，無 clone。
- **實證**：`.data()` 回傳 live `_private.data` 同一 reference；diff-patch 的 `removeData`/`data()`（useCytoscape:190-192）就地改寫；extension 的 `edge.move()` rewire **不發 remove 事件**（實測 0 個）→ 既有的 `cy.on('remove')` guard（:112）防不到。
- **後果**：hover 中遇 refresh/collapse → tooltip re-render 顯示被改寫的欄位（錯誤端點、tombstone undefined）。
- **修法**：存入 state 前淺拷貝 + nested 欄位拷貝（`structuredClone(target.data())` 不行 — 可能含 collection；用自寫 plain-clone 排除非 plain 值）。

---

## LOW / 潛伏（仍應修，優先序後）

### S2 — iconSvgForKind 的 `in` 走原型鏈

- **位置**：`src/shared/constants/iconSvgByKind.ts:82`
- **程式碼**：`if (kind !== undefined && kind in ICON_SVG_BY_KIND)` — `in` 會命中 `toString`/`constructor`/`valueOf` 等繼承鍵；`ICON_SVG_BY_KIND[kind as NodeKind]` 取回 function、通過 `!== undefined` 檢查、以 string 之名回傳。
- **後果**：後端送 `type:"toString"`（未知 kind 本應走 fallback）→ `tintSvgToDataUri` 對 function 呼叫字串方法 throw → getStylesheet 的 background-image mapper 在 style 求值中炸 + NodeLegend 的 IconGlyph render 炸 → panel 整個掛掉。觸發極罕見但結果是 crash。
- **修法**：`Object.hasOwn(ICON_SVG_BY_KIND, kind)` 取代 `in`（一行）。

### V3 — ContainerTable 的 prototype-ful map 查表穿透 guard

- **位置**：`src/features/node-detail/components/ContainerTable/ContainerTable.tsx:72,79`；map 建於 `useNodeDetailUrls.ts:64`（`const flat: Record<string, string> = {}`）
- **機制**：container 名 `constructor`（RFC-1123 合法，實測 regex 通過）查到 `Object.prototype.constructor`（function）→ `url !== undefined` 通過 → 啟用態 LinkButton（React 18 會丟棄 function href，呈現為可點但壞掉的按鈕）。
- **修法**：`useNodeDetailUrls.ts:64` 改 `Object.create(null)` 或 `Map`；或讀取端加 `typeof url === 'string'`。建議改建表端（根治）。

### V7 — 單 pod 內重複 alert id → 重複 React key

- **位置**：`src/features/node-detail/components/AlertTable/AlertTable.tsx:67-69`（`rowId` 有 id 時直接回 id，無 index 後綴）+ `normalize.ts:96-122`（parseAlerts 不做 pod 內去重；controller 聚合那條路有 `controllerAlertIds` Set、pod 自身的 alerts 不動 :375）
- **後果**：選取 pod 時 AlertTable 出現重複 row id → React duplicate-key 警告 + react-table byId 狀態碰撞。
- **修法**：rowId 一律帶 index：`return `${alert.id ?? `${alert.name}-${alert.timeRecords.join(',')}`}-${String(index)}`;` 或 normalize 在 parseAlerts 內做 id 去重。

### V23 — 無 parent 新節點落 (0,0) 不觸發 relayout

- **位置**：`src/features/graph-canvas/sync/seedAddedNodePositions.ts:75-78`（parentless 直接 return、不計 unanchored）；consumer `useCytoscape.ts:162-166` + `:221-223` 只在 `unanchored > 0` 時 `onStructuralRelayout()`；layout token 不因資料 refresh bump（useLayoutRunToken:37-39）
- **注意**：現行測試 `seedAddedNodePositions.test.ts:56,59` 把這行為**釘住了**（`expect(unanchored).toBe(0)`）— 修復需同步改測試與函式 doc（:36-37 的契約本來就說 unanchorable newcomers 該觸發 relayout，doc 與實作矛盾）。
- **觸發**：refresh 新增 top-level `external`/`others` 節點（normalize:300 僅在後端給 parent 時寫入；空 cluster 的合成 controller 也 parentless）→ 疊在原點直到 mode 切換。
- **修法**：parentless 新節點計入 unanchored（或以 viewport 中心 / 鄰居平均位置 seed）。

### S4 — cy.stop() 停不了 fcose 動畫

- **位置**：`src/features/graph-canvas/hooks/useGraphLayout.ts:56`
- **機制**：`cy.stop()` 只停 core（viewport）動畫。animated fcose run 的逐節點動畫不受影響；上一輪 layout 也未保留 handle 可呼叫 `layout.stop()`。mount 序列（layout 1 動畫中 → 預設 collapse → onMountCollapseApplied → token bump → layout 2）造成兩輪動畫互相拉扯 — 與已記錄的 collapse-during-fcose-animation fold-jump 問題相鄰。**未實測**（headless 動畫驗證困難），列 PLAUSIBLE。
- **修法**：保留 `layoutRef.current = cy.layout(options)`，下次 run 前 `layoutRef.current?.stop()`；可一併 `cy.nodes().stop()`。

### V19 — owner kind 未驗證即發 detail 查詢

- **位置**：`src/panels/KsgPanel/KsgPanel.tsx:103-108` — guard 只檢查 pod 自身 kind；owner 分支 `kind: d.owner.kind.toLowerCase()` 不對 `DETAIL_URL_KINDS` 驗證。normalize 的 parseOwner（:172-184）接受任意字串。
- **後果**：靜態 pod（owner=Node）或 operator CRD（owner=Rollout）右鍵 → config_changes/code_changes 帶 out-of-contract kind（spec 釘的是 pod + 5 種 workload controller）。影響有界：一次查詢、後端可能 404。
- **修法**：owner 分支加 `DETAIL_URL_KINDS.has(ownerKindLower)`，不通過時 fallback 為 standalone-pod identity。

### V22 — useExpandCollapse cleanup 不 teardown extension（潛伏）

- **位置**：`src/features/graph-canvas/hooks/useExpandCollapse.ts:78-81`
- **機制**：cleanup 只 `cy.off(CUE_EVENTS) + apiRef=null`。extension 原始碼證實第二次 `cy.expandCollapse(options)` 是全量 re-init：再 append 一個 cue canvas、再綁一整套內部 listener，且 scratch eventFields 被覆寫 → 舊組永遠解不掉（去重 guard 在上游被註解掉）。**現況不觸發**：目前唯一 consumer 的所有 deps 在 cy 存活期間皆穩定。另有小漏：cy.destroy 不移除 container 內 append 的 `.expand-collapse-canvas`（StrictMode remount 會殘留）。
- **修法**：effect 內加 once-guard（`cy.scratch`）防 re-init；cleanup 時移除 cue canvas DOM。

### V6 — normalize 重複 id 靜默通過

- **位置**：`src/features/graph-data/normalize.ts:287`（`nodeIds.add` 從不先 `.has()` 檢查；edge id 也無去重）
- **實證**：cytoscape **陣列** add 對重複 id 靜默 first-wins 去重、不 throw（只有單物件 cy.add 會 throw，本 codebase 不用）→ 無 crash。殘餘影響：第二筆被靜默丟棄且無 errors[] 記錄；兩筆 data 不同時 diff 每輪交替 toUpdate（抖動）。
- **修法**：`if (nodeIds.has(d.id)) { errors.push(`nodes[${i}] duplicate id "${d.id}"`); continue; }`，edge 同理。

---

## SPEC 漂移（改 spec，不改 code）

### V14 — EdgeLegend 雙向列 vs baseline spec

- **現況**：commit 19cb626 後 `EdgeLegend.tsx:50-61` 渲染合併雙向 `pod ↔ pod/service` 列（刻意 shipped 的功能）。
- **矛盾**：`openspec/specs/panel-rendering/spec.md` **三處**仍寫舊行為 — :39『既不獨立列、也不合併為 pod ↔ svc 列』、:118『一律省略…由 pod → pod 列代表』、:134 scenario『MUST NOT…無合併的 pod ↔ svc 列』。active change 無 delta 覆蓋。
- **修法**：更新 baseline spec 三處措辭為合併雙向列行為（依 CLAUDE.md『spec 為 source of truth、行為分歧時兩邊同步』）。

### V13 — status 預設值的 spec 殘句

- **現況**：`normalize.ts:270` data-driven status（無效/缺值 → 不寫 status 欄），2026-06-08 改版後的刻意行為；NodeDetailPanel 對 undefined status 不顯示 badge。
- **矛盾**：`panel-rendering/spec.md:278`『仍攜帶 status（預設 normal）供 detail 面板使用』+ :284-285 scenario — 是改版前殘句，且與**同 spec :401**（『normalize 只在後端實際給 status 時才寫該欄』）自相矛盾。
- **修法**：刪/改 :278 與 :284-285 的預設-normal 措辭，與 :401 對齊。（若產品上想要 detail panel 顯示預設 normal badge，則反向改 NodeDetailPanel render fallback — 二擇一，預設建議改 spec。）

---

## PERF / CLEANUP（全數已驗證）

### V24 — useGraphData memo 鍵在 series identity

- **位置**：`src/features/graph-data/hooks/useGraphData.ts:63-74`（deps `[data.series]`）
- **問題**：Grafana 每次查詢回應都是新 DataFrame 陣列 → byte-identical payload 也重跑 normalizeGraph、回傳全新物件 → 下游 10+ 個 memo（applyPodParentMode clone、computeVisibility×2、derive*、switchConstraints）+ useCytoscape diff effect 全部失效，每個 refresh tick 重算。
- **修法**：以 ref 比對原始 payload 後短路回傳前次結果物件。**注意**：extractJsonFromFrames 有兩條來源 — `field.values[0]`（可能是 string 或物件）與 `frame.meta.custom.data`（已解析物件）；只比對 string 會漏掉 meta 路徑（會造成 stale graph 正確性回歸）。安全作法：比對「抽取後的 payload」的 stringify。

### V26 — computeVisibility 相同輸入算兩次

- **位置**：`KsgPanel.tsx:186-189` 與 `useElementFilter.ts:15-18` — 輸入是逐 reference 相同的 (elements, visibleKinds, visibleEdgeTypes)（KsgPanel:420-424 原樣下傳、GraphCanvas:101 原樣轉交）。
- **修法**：KsgPanel 算一次，把 VisibilitySets 物件以 prop 下傳；useElementFilter 改收 sets。GraphCanvas 的 visibleKinds/visibleEdgeTypes props 僅 :101 一處使用，可一併移除。

### V27 —『React Compiler memoizes』註解為假

- **位置**：`KsgPanel.tsx:78-79`、`:191-195`
- **證據**：package.json/lockfile/.config 全無 react-compiler；build 走 swc-loader（Babel plugin 無處可掛）。`resolveSelectedNode` 對 elements O(n) 掃描，選取期間每 render 裸跑。
- **修法**：包 `useMemo(() => resolveSelectedNode(elements, selectedNodeId, visibleNodeIds), [...])` — wrapper 本身無 loop/early-return，不觸發 `react-hooks/preserve-manual-memoization`。刪除兩處錯誤註解。

### V28 — deriveStorageClassContainers 與 deriveNodeContainers 逐行重複

- **位置**：`deriveStorageClassContainers.ts:27+` vs `deriveNodeContainers.ts:24+` — parentIds 掃描、buildClusterColorIndex、first-seen 顏色去重、childless skip 全部 character-identical，僅 predicate 不同；註解自承 parity。parentIds 掃描在 `deriveLegendKinds.ts:21-32` 第三次出現（該處多 gate child id，共用需留意）。
- **修法**：抽 `deriveContainersBy(elements, fallbackColor, predicate)` 核心；node 版 wrapper 補 title/collapseNoun。六個 `{name, color}` 同構 interface（ClusterLegendEntry 等）一併收斂為 SwatchLegendEntry 別名。

### V29 — DETAIL_URL_KINDS 手維護平行清單

- **位置**：`detailUrlKinds.ts:7-14` — 與 CATEGORY_BY_KIND 的 Workloads 類別（含 pod，今日完全重合）平行；Set 無 compiler 窮舉檢查，新 workload kind 會無聲漏掉。
- **修法**：由 `CATEGORY_BY_KIND`（category==='Workloads'）推導，或在 single-source kind map 上加欄位（後者避免把 legend 分組概念偶合進 URL gating — categoryByKind.ts:5-6 自述只管 legend 分組）。spec 是封閉枚舉 — 改的話同步把 spec 措辭改為『Workloads 類別』。

### V30 — switch 邊 taxi routing 硬編碼

- **位置**：`getStylesheet.ts:257-263` — `edge[edgeType='switch-to-switch'], edge[edgeType='node-to-switch']` 硬編 taxi；`drawnEdgeTypesForMode.ts:20` 另有 SWITCH_EDGES 清單 — fabric-edge 成員資格散在 2-3 處，違反 CLAUDE.md『新 edge type 只改 map』。
- **修法**：EdgeStyle 加 `routing?: 'taxi' | 'bezier'` 欄位，selector 由 map 推導（getStylesheet 已有 resolveEdgeStyle mapper 模式可循）。SWITCH_EDGES（drawn-set-per-mode）是另一關注點，完整單源化需再加 mode/drawn 欄位 — 可分兩步。

### V31 — COLOR_BY_EDGE_TYPE + DrawnEdgeType 死碼

- **位置**：`colorByEdgeType.ts:71`、`types.ts:48` — 零生產消費者（完整清單：僅 colorByEdgeType.test、getStylesheet.test、EdgeLegend.test 引用）。
- **修法**：刪 map + type；getStylesheet.test 改迭代 EDGE_STYLE_BY_TYPE；**EdgeLegend.test.tsx:39 須改用 `drawnEdgeTypesForMode('node')`**（raw EDGE_STYLE_BY_TYPE keys 含 node 模式不畫的 pod-runs-on-node）。

---

## 已駁回（勿再回報）

| ID | 位置 | 候選主張 | 駁回理由 |
|----|------|----------|----------|
| V5 | useNodeDetailUrls.ts:41 | requestKeyFor 以空格 join 造成 cache key 別名 | hex dump 證實分隔符是**內嵌 NUL 位元組**（`join('\x00')`，:39 註解明載），K8s 名稱/URL 不可能含 NUL — 設計正確。Read 工具把 NUL 顯示成類空格字元造成誤判 |
| V20 | KsgPanel.tsx:330 | deriveLegendKinds 不吃 visibleKinds，legend 列出被過濾的 kind | spec `panel-rendering:242-245` **明定** legend 不受 filter 影響（讓使用者知道隱藏了什麼）— 是規格行為 |

## 既知 / 暫緩（使用者已決策，動工前先確認）

- **V25 — useCytoscape.ts:149 每次 refresh 的 expandAll → jsons() → diff → re-collapse 整輪**：2026-06-10 已實作 pristine-snapshot skip-guard 並驗證 `moved=0`，**使用者決定 rollback**。本次審查確認機制仍在且無 guard；上榜的 V12（aliasing）、V18（殘留 key）與它同根。修 Group B 時整體方案需與使用者對齊（in-place clone vs snapshot guard vs 兩者）。
- 摺疊/展開**動畫**：extension 只支援 fisheye 視口平移或全圖 relayout，無法 in-place 動畫 — 已記錄為 deferred。

## 修復順序建議

1. **V1（selector）** — 一行修復、最大收益、已實測安全替代。先行單獨出 PR。
2. **Group C（KsgPanel render gates：V2/V10/V11/V8）** — 同一段程式碼、互不干擾、含兩個 spec 對齊。
3. **Group A（diff-patch apply：V15/V16）** — 與 V1 同檔，建議接續處理；V16 優先評估「合成邊 id 帶 target」的小修。
4. **V9（unknown edge fallback）+ 測試補洞** — 獨立純函式修改。
5. **Group D（collapse 一致性：S3/V17/V22）** — 都在 expand-collapse 周邊。
6. **S1（NaN constraint）** — 先寫 headless 重現測試，確認後加過濾。
7. **Group B（aliasing 家族：V12/V18/V21）** — **動工前與使用者確認方向**（與 rollback 的 V25 修復重疊）。
8. **Group E + V7/V19/V23/V6/S4** — 小修打包。
9. **SPEC（V14/V13）** — 純文件，隨手修。
10. **PERF/CLEANUP（V24/V26/V27/V28/V29/V30/V31）** — 獨立 change，建議走 OpenSpec 流程。

> 驗證備註：V1/V4/V12/V15/V16/V17/V18/V21/V3/V6 附 headless cytoscape 實證；S1 的 cose-base NaN 為函式庫原始碼追查（未實測）；S4 為 PLAUSIBLE。最後兩個 sweep verifier 因 session 限額中斷，S1–S4 由主線直接讀碼補驗。
