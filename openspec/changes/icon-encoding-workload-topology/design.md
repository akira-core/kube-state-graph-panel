## Context

節點身分（`kind`）目前以 per-kind Cytoscape 形狀編碼（`SHAPE_BY_KIND`：pod=ellipse、service=hexagon、node=round-rectangle、pvc=pentagon、others=diamond、external=star）。人眼可靠區分的幾何形狀上限約 8 種，6 種已用罄，要加入 Kubernetes workload kind（Deployment/StatefulSet/DaemonSet/Job/CronJob）已無形狀預算。

本變更把 kind 身分移到 per-kind **icon**（近乎無限的編碼通道），並補上 workload 控制器的拓樸，使新節點能有意義地連到其 pod。設計已透過 brainstorming 與一輪平行研究（官方 K8s icon 授權/格式、cytoscape icon render、資源分類學、產業前案、Grafana plugin 限制）定案。

約束：panel-only（只渲染後端 cytoscape JSON，`kind = data.type`，`parent` 由後端決定 nesting）；TS strict（`noUncheckedIndexedAccess`/`exactOptionalPropertyTypes`）；單一來源 map 哲學；cytoscape 整合慣例（single source = cy instance、split init/update effect、diff-patch、module-level extension registration、stylesheet 純工廠）；零警告 lint。

## Goals / Non-Goals

**Goals:**

- 以 icon 取代形狀承載 kind 身分，使編碼可擴充到 workload 與未來更多 kind。
- icon 單色、隨 Grafana light/dark 主題上色，與面板視覺融合；改動面集中在 stylesheet 工廠。
- 狀態續用邊框色、叢集續用 compound——三個訊息分通道不打架。
- 新增 workload kind 與 `node ⇄ controller` 雙模式拓樸，沿用既有 `applyPodParentMode` 機制。
- 對後端尚未發送的 kind/edge 一律優雅 fallback、預設可見、永不報錯。

**Non-Goals:**

- ingress/pv/configmap/secret/rbac 的節點與邊（等後端與需求）。StorageClass 已納入——但僅作為 compound GROUP 容器（`cluster > storageclass > pvc` 巢狀,見 D14）,非 leaf kind、非邊。
- 低 zoom 的 icon→純形狀 level-of-detail 切換。
- 狀態角標（badge）——先只用邊框色。
- 後端程式碼（本 repo 為 panel-only）。後端契約僅提供 pod 上的 `data.owner` metadata；controller 節點與 `controller-owns-pod` 邊由 panel 自 owner 合成（D9），非後端產生。standalone workload `data.type` 節點若後端日後直接發送亦可渲染。
- 官方 K8s 彩色徽章（見 Decision 2）。

## Decisions

### D1. 退役 shape-per-kind，icon 承載身分；leaf 統一容器

所有 leaf 節點改用單一 `round-rectangle` 容器，kind 由 `background-image` 的 icon 表示。`ICON_SVG_BY_KIND` 取代 `SHAPE_BY_KIND` 成為 kind 的單一來源 map。

- **理由**：形狀通道已用罄；icon 近乎無限且辨識度高（產業慣例 icon=身分）。icon 本身是非顏色的形狀編碼，a11y 仍不依賴顏色。
- **Alternatives**：(a) 形狀=超大類、icon=kind（保留冗餘 a11y）——但增加複雜度，且使用者明確選擇統一容器；(b) 純文字 type 標籤——大圖缺乏視覺節奏。

### D2. 單色可染 icon:**原創自繪**(採 k8s / Argo CD 視覺語彙),非 vendoring、非官方彩色徽章

icon 為單色 line-art、帶 `currentColor` sentinel,隨主題注入色,全部**自繪原創**。`ICON_SVG_BY_KIND` 是唯一資料源。

- **理由**:官方 `kubernetes/community` icon 經抓原始檔證實是固定 `#326ce5` 藍 + 白多色徽章、**無單色版、無法隨主題重新上色**,與「融入 light/dark」目標衝突。
- **(2026-06-07 修正,原訂 vendoring Argo CD 已否決)**:實抓 Argo CD `ui/src/assets/images/resources/*.svg` 後發現它們**並非乾淨單色 line-art**——是**填色剪影**(與本面板 outline 風格衝突)、**多色**(`#8fa4b1` + `#fff` 高光,無法乾淨 `currentColor` 染色)、且 `cronjob.svg` **參照不存在的 `clip-path url(#b)`(壞檔)**、非方形 viewBox。故**不 vendoring**,改為**自繪**對應 glyph(沿用其可辨識的視覺語彙):workload controller —— `deployment` = 滾動更新環形箭頭(Argo deploy motif)、`statefulset` = 有序分層方框(ordinal 點)、`daemonset` = 每節點方框 + 基線、`job` = 方格 + 勾、`cronjob` = 時鐘。其餘 kind(pod 七邊形、node 螢幕、pvc/storageclass 圓柱、service hub-spoke、switch 機架、external 雲)亦全自繪。
- **Trade-off**:無第三方相依、無 attribution(原 `docs/THIRD_PARTY.md` 不需要)、風格一致(全 outline);代價是辨識度依賴自繪品質、需自行維護。

### D3. 上色集中在 `getStylesheet`，純函式 `tintSvgToDataUri`

`tintSvgToDataUri(rawSvg, hex)`：替換 `currentColor` sentinel → 最小化編碼（`#`→`%23`、跳脫 `<>%"`）→ 輸出 UTF-8 `data:image/svg+xml,...`（**非 base64**，省約 20%）。以模組層 `Map<`(kind|hex)`>` memoize。`getStylesheet(theme, …)` 以既有的 `function(ele)` mapper（shape 已是此寫法）回傳 per-kind `background-image`，並設 `background-fit:contain`、`background-clip:none`、`background-image-containment:inside`、寬高約 60%。

- **理由**：tint 依主題，`getStylesheet` 已收 theme 且在主題切換時重建+`cy.style()` 重套——單一上色點、零 per-node mutation。`currentColor`/`fill` **不會**穿透 `background-image` 內的 SVG，必須在編碼前注入。未編碼的 `#` 會被當 URI fragment 而靜默失效。
- **Alternatives**：在 `normalizeGraph` 寫 `data.iconUri`——但 normalize 不該知道主題，且會把樣式放進 element data（cytoscape issue 2031 反模式）。

### D4. compound 容器 icon 置左上；cluster 框不放 icon

當 node/controller 為 compound parent（內含子節點）時，icon 縮小置左上貼 label（中央留給子節點），避免被子節點蓋住；`isCluster` 容器不放 resource icon。leaf/collapsed 狀態 icon 置中。

- **理由**：cytoscape 預設 `background-image` 置中，會落在 compound 子節點之後。`background-image` 節點無法可靠 revert 成純 `background-color`（issue 2124）——「無 icon」以透明/空白 image 表示而非移除屬性。

### D5. 狀態邊框擴成資料驅動

`STATUS_BORDER_KINDS` 從 `['pod','node','pvc']` 改為「任何後端有回報 `data.status` 的 kind」；無 status → 中性邊框。`STATUS_COLOR`（綠/黃/紅）不變。

- **理由**：workload 也有健康（如可用副本數）；硬編碼 kind 清單會擋住擴充。

### D6. 拓樸雙模式 `node ⇄ controller`（取代 `node ⇄ service`）

`PodParentMode`：`'node' | 'service'` → `'node' | 'controller'`。`applyPodParentMode` 一般化——「另一 parent 的來源邊」從 `service-selects-pod` 換成 `controller-owns-pod`。

- `node` 模式：`cluster > node > pod`；**過濾掉合成的 controller 節點（`data.isController`）與其 `controller-owns-pod` 邊**，是乾淨的純基礎設施視圖、不顯示任何 controller；`pod-runs-on-node` 為巢狀不畫。`controller-owns-pod` 為合成內部關係、永不繪製（node 模式過濾、controller 模式為巢狀）。
- `controller` 模式（預設）：對每個被 `controller-owns-pod` 指向的 pod，re-parent 到其 owning controller（多 owner 取字典序最小）、移除 `controller-owns-pod` 邊（改以巢狀表示）、合成 `pod-runs-on-node` 邊連回原 node。
- **Service 兩模式皆 edge**（不再當 compound parent）——`service-selects-pod` 與 `pod-calls-service` 永遠是 drawn edge。
- **ReplicaSet 收掉**：後端已將 `Deployment → ReplicaSet → Pod` 收斂,`controller-owns-pod` 直接連 pod → 頂層 controller（Deployment）。ReplicaSet **不是** panel 的 NodeKind、不出現於圖中、無對應 icon。
- **controller 節點與 `controller-owns-pod` 邊由 panel 合成**（自 pod `data.owner`，見 D9）——後端不發 controller 節點/邊；本模式所依賴的「來源邊」即合成而來，`applyPodParentMode` 不需知道其來源。
- **理由**：完美套用既有 service-mode re-parent + 合成邊機制，只換來源邊型別；對使用者「誰管誰」心智模型最直接。
- **Alternatives**：(a) 只用 edge、不做巢狀模式——少了控制器分群視角；(b) 完整展開 Deployment>ReplicaSet>Pod——巢狀過深、噪音高。

### D7. 模式切換以整批重建套用新階層

沿用既有決策：`useCytoscape` 偵測 `podParentMode` 變動時以 `cy.elements().remove()` + `cy.add(elements)` 整批重建套用新巢狀（動態 `data('parent')`/`move()` 在 batch + expand-collapse 下不可靠），並 bump layout run token 重跑一次 layout；visibility-only 變更不重跑。

### D8. Legend 改 icon glyph、依超大類分組；顏色不編碼大類

node legend 以主題上色的 icon glyph（取代 `ShapeGlyph`）呈現，依 panel-owned 的 `apiGroup+kind → 超大類` 查表分組（Workloads / Networking / Storage / Cluster / Other）。**顏色不編碼大類（顏色=狀態）**。edge legend **不**列 `controller-owns-pod`（它合成內部、永不繪製），`service-selects-pod` 兩模式常駐。模式切換 UI 文案 node⇄service 改 node⇄controller。`computeVisibility` 的 `ALL_KINDS` 由單一 map 自動衍生新 kind。

- **理由**：6 大類 ≪ kind 數，legend 才掃得動；分類表 panel-owned 且確定（不信任後端非標準 categories）。

### D9. 後端以 pod `data.owner` 提供控制器;normalize 合成 controller 節點與 owns 邊(修正 D6 後端假設)

實際後端最新契約:**僅在 pod 上**帶 typed `data.owner = { kind, name }`(最新 commit 自 `labels.owner_kind` / `labels.owner_name` 移至此 typed 欄位;`Deployment → ReplicaSet → Pod` 已於後端收斂,`owner.kind` 即頂層 controller;無 controller 時整個 `owner` 省略)。後端**不**輸出 controller 節點,也**不**輸出 `controller-owns-pod` 邊。因此 panel 於 `normalizeGraph`(anti-corruption,純函式)**自 owner 合成**:

- 每個 unique `(cluster, namespace, ownerKind, ownerName)` 合成**一個** controller 節點:`kind` = `ownerKind` 小寫、`parent` = 該 pod 所屬 cluster 容器之**既有 id**(由 pod 的 `labels.cluster` 對應回 `isCluster` 容器,重用其 id,**不**自行以 `cluster/<cluster>` 字串模板硬湊;無 cluster 時 controller 為 top-level、無 parent)、`label` = `ownerName`;非已知 workload kind(裸 ReplicaSet)走 fallback icon、預設可見。
- 每個有 owner 的 pod 合成一條 `controller-owns-pod`(controller → pod)邊。
- 缺 `data.owner` 時退讀 legacy `labels.owner_kind` / `labels.owner_name`。

- **理由**:normalize 是把「後端隱含的 controller」物化成節點/邊的正確邊界——如此既有已 spec 的 `applyPodParentMode('controller')` re-parent 機制**零改動**沿用(它只認 `controller-owns-pod` 邊、不關心來源)。合成的 controller 節點與 owns 邊僅供 `controller` 模式 re-parent 使用;`node` 模式把它們過濾掉(乾淨基礎設施視圖),故 owns 邊永不繪製。
- **Alternatives**:(a) 在 `applyPodParentMode` 直接讀 owner、不造邊——但 `node` 模式就畫不出 `controller-owns-pod` 邊,且 legend / filter 都得另知 owner;(b) 要求後端發 controller 節點/邊——後端設計選擇以 owner 欄位表達,且本 repo 為 panel-only 不改後端。

### D10. layout 切換控制移至 legend 最上方,改分段式 `Node | Controller`

把原本在 `EdgeLegend` header 的 `IconButton` 切換鈕,改為 legend **最上方**的分段控制(`RadioButtonGroup`,選項 `Node` / `Controller`,標籤 `Layout`,**預設 `Controller`**);`EdgeLegend` 去掉 `mode` / `onToggleMode`、只列邊。`PodParentMode` 語意不變(`'node' | 'controller'`)、預設 `'controller'`。

- **理由**:拓樸切換是全圖層級操作,置於 legend 頂端比塞在 edge 區更顯眼、語意更清楚。UI 以 "Layout" 指 compound 群組拓樸,與 fcose / dagre 的佈局演算法(panel option)是不同概念。
- **Alternatives**:維持 `IconButton`(較小但不顯眼);下拉選單(待未來要加第三種拓樸如 namespace 分群再考慮)。

### D11. controller 模式預設聚合(每次進入全摺疊 controller 容器)

controller 為**預設模式**,故全摺疊在**初始載入**(controller 首次出現於圖中)即觸發,而非只在 `node → controller` 切換時;之後的 data refresh **不**重摺疊(使用者已展開的 controller 維持展開)。`KsgPanel` 把圖中所有 controller 容器 id 併入 `collapsedIds`,使預設聚合;使用者自行展開個別 controller。切回 `node` 模式時 controller 不再是容器,其 id 由既有 `reconcileCollapse`(desired ∩ present)自然淘汰;再進 `controller` 重新全摺疊(不保留上次展開)。僅作用於 controller 容器,不動 `cluster` / K8s `node` 的 collapse 選擇。

- **理由**:controller 模式的價值是「以控制器聚合大量 pod」;預設展開會把畫面塞爆。符合使用者「先聚合、需要再展開」的要求。沿用既有 `collapsedIds` + expand-collapse + `reconcileCollapse`,無新機制。
- **實作**:`KsgPanel` 以 ref-guard 的 effect,在 controller 模式下「圖中首次出現 controller」時 `setCollapsedIds(prev → ∪ 所有 controller 容器 id)`(讀 `elements` 為 dep 以接住非同步首次載入);ref guard 確保每次進入(含初始載入與 re-entry)只摺疊一次、後續 refresh 不重摺,離開 controller 模式時重置 ref 以便 re-entry 重摺。`useExpandCollapse` 在初始化 expand-collapse API 後**立即套用既存的 desired collapse**,修正「mount 時 API 尚未存在、diff-patch 以 null api 略過該摺疊」的競態。controller 容器集合與 canvas 同源(`deriveNodeContainers` 於 controller 模式回傳 controller 容器)。

### D12. controller 模式 K8s node 併入 switch fabric 分層;`node-to-switch` 比照 `switch-to-switch`

`controller` 模式下 K8s `node` 變 leaf(pod 已移到 controller),依垂直序 `pod → node → switch → switch`,把「連到 fabric(為某 `node-to-switch` 邊 source)」的 K8s `node` 釘到 switch fabric **最上方一層**(`min(switchLevel) − 1`),x 比照 switch 置中展開成一排。沿用 `buildSwitchConstraints`(對 `levelById` 泛型、不分 kind):在 `controller` 模式且有 levelled switch 時,把這些 node id 以 `level = min − 1` 併入 `levelById`。`GraphCanvas` 既有的 `buildSwitchConstraints(readSwitchLevels(elements))` 改為 **mode-aware**(`GraphCanvas` 已持有 `podParentMode` prop)。`node` 模式或無 fabric 時 K8s `node` 不釘層(延續「零影響」)。同時把 `node-to-switch` 拉回 baseline `switch-tier-layout` 規格要求的**正交 `taxi` 路由**(`getStylesheet` 目前刻意排除了它——code/spec drift),並讓它**共用 `switch-to-switch` 的 infra 色**(`colorByEdgeType`),使 K8s node 的上行連線讀起來即 fabric 的一部分。

- **理由**:controller 模式 node 變 leaf 才能可靠 pin(compound parent 的位置由子節點決定、無法可靠 pin)。使用者要 workload 在上、實體網路在下的清楚分層;`node-to-switch` 與 `switch-to-switch` 同處理為使用者明確要求,且 baseline spec 本就要求其正交路由(僅 code drift)。
- **Alternatives**:per-node 貼其連接 switch 的上一層(較貼實際佈線,但 node 會散落多層,與「同一排」畫面不符——使用者已選 fabric 最上方單排)。
- **取捨**:switch level 的方向由後端 `labels.level` 決定;node 一律置於 `min − 1`(整個 fabric 正上方),若後端把 leaf 編在較大 level,個別 `node-to-switch` uplink 會跨越 fabric 列——可接受(taxi 路由整齊),日後可再調 level 推導。

### D13. `applyPodParentMode` 兩模式皆回傳完全獨立的 element 物件(data 淺拷貝)

`applyPodParentMode` 在 `node` 與 `controller` **兩種模式**都回傳全新的 element 物件(每個 element 的 `data` 經 `cloneElement` 淺拷貝),而非只拷貝被改動的那些。

- **理由**:cytoscape **別名(alias)**了交給 `cy.add` 的 `data` 物件(不深拷貝),而 expand-collapse 擴充在摺疊某個 controller 時會**就地 mutate** 其入射邊的 `data.source` / `data.target` 以改道。若直接以參考傳遞 normalized 的 `baseElements`,該就地 mutation 會污染共用的 `baseElements`——導致切回 `node` 模式時出現 `controller → pvc` 邊(controller 被過濾掉 → 整個 workload 孤立、消失)。淺拷貝每個 element 的 `data` 即可讓 normalized 輸入跨模式切換維持原狀(此為實際發現並修復的 bug)。
- **取捨**:每次模式套用多配置一輪淺拷貝物件;基數小(單圖 element 數),代價可忽略,換得 `baseElements` 不可變的正確性保證。

### D14. StorageClass 為 compound 容器,**完全比照 K8s node 容器**(真 `NodeKind` + collapse-aware 圖例)

後端(latest)以 `kube_persistentvolumeclaim_info` 的 `storageclass` label 解析出每個 PVC 的 StorageClass,合成 `type: "storageclass"` 群組節點(id `<cluster>/storageclass/<sc>`、`parent` = 該 cluster 容器),把每個有解析到 SC 的 PVC re-parent 進去,巢狀為 `cluster > storageclass > pvc`。panel 端把它當成與 K8s `node` 容器**完全對等**——是一個**真的 `NodeKind`**,同時帶 `isStorageClass` 旗標標示其「自成一區的分組容器」身分(經數輪使用者回饋收斂:展開要像容器、收合要有圖案、且 Node-kinds 圖例在收合時要顯示 storageclass 取代 pvc):

- `types.ts` `NodeKind` 加入 `'storageclass'`;`ICON_SVG_BY_KIND` 加入其 glyph(三層磁碟堆疊,distinct from pvc 單柱);`categoryByKind` → `Storage`。因 `ALL_KINDS` = `ICON_SVG_BY_KIND` keys,它**自動**進預設可見集(無 filter 退化)。
- `normalizeGraph` `resolveNodeIdentity`:`type === 'storageclass'` → `{ kind: 'storageclass', isStorageClass: true }`(有 kind、**無** status / alerts——分組盒無健康)。
- `getStylesheet`:**不**需要任何 storageclass 專屬選擇器。它走 base `node`(由 kind 解析 icon)+ `node:parent`(展開為容器時 `background-image:'none'`、取父 cluster accent)——與 K8s `node` 容器同一條路徑:**展開無 icon、收合/leaf 顯示其 kind icon**。
- `isStorageClass` 旗標僅用於三處非樣式行為:(a)`deriveStorageClassContainers` → 獨立「Storage classes」swatch 區段(**mode-independent**,node/controller 皆在,有 collapse-all);(b)`resolveSelectedNode` 排除(純分組盒、無 detail);(c)`HoverTooltip` 合成 context(見下)。
- **collapse-aware Node-kinds 圖例(`deriveLegendKinds`,本次新增、取代舊 `presentKinds` + `showNodeKindIcon`)**:Node-kinds 圖例只列「目前以 glyph 呈現於畫布」的 kind——drawn leaf + **收合的**容器計入;**展開的**容器(Clusters / Nodes|Controllers / Storage classes 各自 swatch 區段)與「被收合祖先隱藏」的子節點不計入。故收合某 storageclass → 其 PVC 被聚合隱藏(pvc 退出)、收合的 SC 顯示其 glyph(storageclass 進入)= **storageclass 取代 pvc**;node⇄pod、controller⇄pod 同理一致。`cluster`(無 kind)永不入此圖例。
- **hover context**:storageclass 無 backend labels,`useHoverElement` 於 hover 當下自 cy 讀 parent/children 合成 `cluster` + 群組 PVC 清單(排序),`HoverTooltip` 顯示(長清單 `wrap` 換行);`kind: storageclass` 因已有 kind 而自然顯示。

- **理由**:使用者歷經「無 icon→hover 要 context→收合要 icon→收合要進 Node-kinds 取代 pvc」逐步收斂,最終等同「storageclass 就是一種像 `node` 的容器型 kind」。直接晉升為真 `NodeKind` 讓 base-node 樣式與 icon 自動沿用(零 storageclass 專屬樣式),`deriveLegendKinds` 的 collapse-aware 規則一次解決 node/controller/storageclass 三者「展開隱藏 kind、收合顯示」的一致行為。`isStorageClass` 旗標保留以表達「它另成一個 swatch 區段、不是普通 leaf」。
- **Trade-off**:`deriveLegendKinds` 取代 `deriveContainers` 的 `showNodeKindIcon`,故 node/pod 在「收合 node」時行為也變一致(pod 退出、node 進入)——比舊行為(pod 殘留)更誠實地反映畫布。storageclass 成為可在 panel options `visibleKinds` 過濾的 kind(與 node 一致)。
- **Alternatives(皆否決)**:(a)無 kind 旗標 + 收合態專屬選擇器畫 icon——無法讓 storageclass 進 Node-kinds 圖例(使用者要它收合時取代 pvc);(b)demo-only 不動 panel——收合盒空白、且會以 fallback glyph 漏進 Other 區。

## Risks / Trade-offs

- [官方 icon 不可染 → 設計衝突] → 改用 Argo CD 單色集（D2），官方彩色徽章列為未採用。
- [後端未發 standalone workload `data.type` 節點] → controller 節點/邊由 panel 自 pod `data.owner` 合成、**無需後端配合**；對任何後端未送的 kind/edge 一律 fallback、不報錯；legend **不**列出資料中未出現的項目（避免畫不出來的條目）。
- [`background-image` 性能/清晰度] → data-URI 同步載入（避免 issue 1511 外部圖延遲）、依 `(kind,hex)` memoize（cytoscape 以 URL 字串快取，per-node 唯一 URI 會破快取）、SVG 用 `viewBox="0 0 24 24"`、`cy.batch()` 批次更新。實際基數小（~6–12 kind × 2 主題）。
- [未編碼 `#` 靜默失效 / `currentColor` 不穿透] → `tintSvgToDataUri` 單元測試斷言 `%23` 與 sentinel 替換。
- [退役形狀為 BREAKING 視覺改變] → 既有使用者的圖外觀改變；以 legend（單一來源）說明新 icon 對應。
- [plugin signing 雜湊 dist 全檔 / validator 拒絕不安全 SVG] → icon 在 sign 前 bundle 完成；vendored SVG 先 sanitize（去 `<script>`/外部 ref）。

## Migration Plan

1. **Panel 端**（本 repo）：新增 icon map/tint/分類表 → 改 `getStylesheet` → 退役 `SHAPE_BY_KIND` 身分角色 → 改 `PodParentMode` 與 `applyPodParentMode` → 新增 `controller-owns-pod` 邊與 legend/filter 串接 → 測試。對未發 kind/edge 的優雅 fallback 確保可先行合併、不依賴後端就緒。
2. **後端契約**（外部，非本 repo）：後端已在 pod 上提供 `data.owner`（最新 commit 自 labels 移至 typed 欄位、RS 已收斂）。controller 拓樸**無需後端變更**——controller 節點與 owns 邊由 panel 合成（D9）。standalone workload `data.type` 節點為選用/未來，缺亦不影響本模式。
3. **Demo seeder**：確認 fixture 的 pod 帶 `data.owner`（後端 seed 已具）；controller 與 owns 邊由 panel 合成即可可視驗證。另補帶 `labels.level` 的 switch fabric，以驗證 `controller` 模式 K8s node 的 fabric 分層與 `node-to-switch` 正交路由。
4. **Rollback**：純前端、無持久化狀態（模式為 local React state）；revert commit 即還原。

## Open Questions

- 控制器拓樸的後端依賴**已釐清**：後端僅在 pod 發 `data.owner`、不發 controller 節點/邊；controller 節點與 owns 邊由 panel 合成（D9），無需後端變更。
- workload kind 的 `data.status` 後端是否回報（決定其是否顯示狀態邊框）？未報則中性邊框，無妨。
- DaemonSet 在 `controller` 模式下 pod 歸 DaemonSet 是否符合預期分群（每 node 一 pod）？預設照 controller 一般化處理。
