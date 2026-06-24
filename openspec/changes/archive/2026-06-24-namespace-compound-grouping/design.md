## Context

目前 compound 階層只到 `cluster > {node|controller} > pod`,namespace 僅是節點 `data.namespace` 欄位,在畫面上無視覺分群。當一個 cluster(尤其 controller 模式)塞入多 namespace workload 時,使用者無法一眼看出哪些 controller / service / pvc / pod 屬於同一 namespace。本變更把 namespace 提升為**虛擬 compound 父節點**並以高對比顏色標示。

**落點僅限 `controller` 模式**(已定案):controller / service / pvc 皆為 namespaced 資源,在 controller 模式下都直屬 cluster,可乾淨收進 cluster 層的 namespace 盒。`node` 模式以實體拓樸為主軸——K8s node 為 cluster-scoped(跨 namespace 承載 pod),且 service / pvc 不綁 node,強加 namespace 層會語意錯置且無處擺放,故 **node 模式完全不繪製 namespace**(維持 `cluster > node > pod` 與既有 service / pvc / storageclass 掛點)。

既有架構提供可直接沿用的先例,本設計全程比照:

1. `normalizeGraph`(`src/features/graph-data/normalize.ts`)為 mode-agnostic 純 anti-corruption,合成 controller 節點巢狀於 cluster 容器(parent = `clusterIdByName.get(cluster)`,**重用容器既有 id**),並原樣穿透後端的 storageclass 盒與其 pvc 巢狀(`cluster > storageclass > pvc`)。
2. `applyPodParentMode(elements, mode)`(`src/features/pod-parent-mode/applyPodParentMode.ts`)為模式相依的純函式視圖轉換,於 `normalizeGraph` 之後、`wrapSwitchFabric` 之前套用;`KsgPanel` 組合順序為 `wrapSwitchFabric(applyPodParentMode(baseElements, podParentMode))`。每個回傳元素皆 fresh-clone(`cloneElement`),不就地修改輸入。
3. `wrapSwitchFabric`(`src/features/graph-data/wrapSwitchFabric.ts`)為「注入虛擬 compound 容器 + re-parent」的純 graph-data pass 範本(注入 `network` 容器、把 parent-less switch re-parent 進去、不就地修改輸入)。

顏色先例:`colorForCluster`(`src/shared/constants/clusterPalette.ts`)以 djb2-風格穩定 hash → `CLUSTER_PALETTE[hash % len]` 確定性取色;normalize 把色寫入 `data.clusterColor`,`getStylesheet` 以 `data(clusterColor)` selector 套用,legend swatch 讀回同欄。namespace 顏色完全比照此模式(獨立調色盤 `NAMESPACE_PALETTE`、獨立 data 欄 `namespaceColor`)。

## Goals / Non-Goals

**Goals:**

- **controller 模式**自 `data.namespace` 合成虛擬 namespace compound 父節點,把 namespaced 資源收進 cluster 層的 namespace 盒:
  - `cluster → namespace → controller → pod`
  - `cluster → namespace → service`
  - `cluster → namespace → storageclass → pvc`(namespace 外、storageclass 內);無 storageclass 的 pvc → `cluster → namespace → pvc`
- namespace 盒以名稱**確定性 hash → 高對比 colorblind-safe 調色盤**上色;同名 namespace 跨 refresh / 跨 cluster 顏色穩定;對主題背景與內部資源皆高對比。
- namespace 盒參與既有 collapse / `reconcileCollapse` 與 legend(controller 模式新增 namespace swatch section),**不預設摺疊**。
- 缺 `data.namespace` 的 controller / service / pvc fallback 跳過 namespace 層(掛回原 parent),不消失、不報錯。
- 全程純函式、確定性、immutable。

**Non-Goals:**

- **`node` 模式不繪製 namespace**(無 namespace 盒、無 namespace 色,維持既有拓樸)。
- **不**在 `normalizeGraph` 做 namespace 分群 / re-parent(模式相依,屬 post-normalize pass)。**前置例外**:normalize 的 `synthesizeControllers` MUST 在合成 controller 時寫入其 `data.namespace`(mode-agnostic 的 leaf 事實——controller 本由 normalize 合成——為 namespace 分群的最小前置;見 graph-data-integration 規格)。
- **不**改動 `controller-owns-pod` / `pod-runs-on-node` 合成與繪製、`drawnEdgeTypesForMode`、switch-tier-layout 對 K8s node 的 pin、模式切換**恰一次** relayout 機制。
- **不**引入新佈局引擎或新相依;沿用 fcose / dagre。
- **不**新增後端契約欄位:namespace compound 為純前端合成。

## Decisions

### D1: namespace 分群為 mode-aware 純函式 `applyNamespaceGrouping(elements, mode)`,組合於 `applyPodParentMode` 之後;node 模式 no-op

新增純函式

```
applyNamespaceGrouping(elements: cytoscape.ElementDefinition[], mode: PodParentMode): cytoscape.ElementDefinition[]
```

於 `KsgPanel` 以 `wrapSwitchFabric(applyNamespaceGrouping(applyPodParentMode(baseElements, podParentMode), podParentMode))` 組合(在 `applyPodParentMode` 之後、`wrapSwitchFabric` 之前)。

- `mode === 'node'`:**no-op**——回傳輸入(以新陣列承載、語意等價),完全不插入 namespace 盒、不上 namespace 色。
- `mode === 'controller'`:合成 namespace 盒、依 namespace 拆 storageclass sub-box、re-parent controller / service / pvc、上色。

`normalizeGraph` MUST 維持 mode-agnostic、完全不碰 namespace 分群。

**為何不放 `normalize`**:normalize 是 mode-agnostic 的 anti-corruption boundary,單一輸出;namespace 僅在 controller 模式存在、且 parent 為模式相依,塞進 normalize 會破壞單一職責。
**為何不併入 `applyPodParentMode`**:後者已負責 controller drop / re-parent / `pod-runs-on-node` 合成,職責飽和;namespace 分群是「在 controller 模式拓樸上再加一層」的獨立關注點,拆為獨立 pass 維持小檔案、高內聚、可單測(比照 `wrapSwitchFabric` 亦為 normalize 之後的獨立 pass)。

考慮過的替代:(A) 放 normalize 帶 mode 參數——破壞 mode-agnostic,駁回。(B) 併入 applyPodParentMode——單檔職責過載,駁回。(C) 採用(選定)。

### D2: namespace 盒 id 與去重 —— `(clusterContainerId, namespace)`;區分「自身 id」與「parent」

namespace 盒對其 key 唯一、確定性。controller 模式下 key = `(clusterContainerId, namespace)`,每個 `(cluster, namespace)` 一個盒。須明確區分兩種 id:

- **(a) namespace 盒「自身 id」**:由 panel **確定性合成**——以「cluster 容器實際 id + namespace 名稱」組成的 opaque key(比照 `controllerIdFor` 的 opaque-key **合成手法**:確定性、不透明 `/`-joined 串接——而非沿用其相同輸入欄位;`controllerIdFor` 以 cluster **名稱**串接,此處以 cluster **容器實際 id** 為料以保跨 cluster 唯一)。namespace 盒是 panel 全新合成的容器(後端不輸出),其自身 id 必然且**應**由 panel 構造;MUST NOT 以「猜測後端 cluster 命名」的字串模板硬湊,而要以**已解析到的實際 cluster 容器 id**為料(該 id 對 panel 不透明,只當唯一鍵串接)。
- **(b) namespace 盒的 `parent`**:MUST **重用既有 cluster 容器的實際 id**(取 controller / service / pvc 的 cluster 祖先實際 id),MUST NOT 自造 cluster 容器 id。

cluster 容器實際 id 已是該 cluster 在圖中的唯一鍵,故 `(clusterContainerId, namespace)` 天然涵蓋「跨 cluster 同名」而不誤併。

考慮過的替代:(A) 以 namespace 名稱構造 id 字串模板——與後端容器 id 脫鉤、可能碰撞,駁回。(B) `(clusterContainerId, namespace)` opaque key(選定)。

### D3: controller 模式 re-parent 規則(controller / service / pvc)與缺 namespace fallback

僅 `mode === 'controller'` 執行。對每類 namespaced 資源,先擷取其 cluster 祖先(原 parent 或沿 parent 鏈上溯至 `isCluster` 容器)作為 namespace 盒的 parent,**再**(於 fresh-clone 上)改寫該資源 `data.parent` 指向 namespace 盒:

- **controller**(`isController === true`,帶 `data.namespace`):原 parent 為 cluster 容器;re-parent 至 `(cluster, namespace)` 盒。pod 維持巢狀於其 controller(`applyPodParentMode` 已處理,不再動)。**前置**:controller 的 `data.namespace` 由 normalize 在 `synthesizeControllers` 寫入(來源為 owned pod 的 namespace,經 `PendingOwned.namespace`)——現行 normalize **尚未**寫入,本變更於 graph-data-integration 規格補上;缺此前置時 controller 會走下方 fallback、永不被分群。
- **service**(`kind === 'service'`,帶 `data.namespace`):原 parent 為 cluster 容器;re-parent 至 `(cluster, namespace)` 盒。
- **pvc**(`kind === 'pvc'`,帶 `data.namespace`):見 D4(storageclass 拆盒)。
- **原 parent 擷取與守衛**:擷取 MUST 在改寫 `data.parent` 之前完成(immutable clone);僅當原 parent / cluster 祖先確為 `isCluster` 容器時才插入 namespace 層。無 cluster 祖先(top-level)者 MUST 跳過(比照 `applyPodParentMode` 對「原 parent 非 K8s node 時不合成 `pod-runs-on-node`」的守衛)。
- **Fallback(缺 namespace)**:`data.namespace` 缺失 / 空字串的 controller / service / pvc MUST 跳過 namespace 層(維持原 parent),不建盒、不消失、不報錯。

考慮過的替代:對缺 namespace 者建一個「(unknown)」盒——製造視覺雜訊、把「無資訊」偽裝成分群,駁回(沿用 normalize「無資訊不偽裝」原則)。

### D4: pvc × storageclass —— controller 模式依 namespace 拆 storageclass sub-box(namespace 外、storageclass 內)

已定案:pvc 走 `cluster → namespace → storageclass → pvc`(namespace 外層、storageclass 內層)。因後端的 storageclass 盒為 cluster-scoped、可能含跨 namespace 的 pvc,controller 模式下 panel MUST 依 pvc 的 namespace **拆盒**:

- 對每個帶 `data.namespace` 且原 parent 為**後端 storageclass 盒**(`isStorageClass === true`)的 pvc:
  - 確保存在 per-`(namespaceBoxId, storageclassName)` 的 **storageclass sub-box**:`kind: 'storageclass'`、`isStorageClass: true`、`label` = 原 storageclass 名;`parent` = 該 `(cluster, namespace)` 盒;id 對 `(namespaceBoxId, storageclassName)` 確定性合成(opaque key)。
  - 把該 pvc re-parent 至此 sub-box。
- 對帶 `data.namespace` 但**無 storageclass**(原 parent 為 cluster 容器)的 pvc:直接 re-parent 至 `(cluster, namespace)` 盒(`cluster → namespace → pvc`)。
- **原後端 storageclass 盒**:在 controller 模式下,其 pvc 全被 re-parent 至 per-namespace sub-box 後即冗餘,MUST 自 elements **移除**(避免空盒殘留)。
- 同一 storageclass 若被多 namespace 使用,會在各該 namespace 下各出現一個 storageclass sub-box(可接受的重複,與「namespace 為外層分群」一致)。
- storageclass sub-box 比照既有 storageclass 盒:**無** status / alerts / worstStatus,`isStorageClass: true`(自成 legend swatch、排除 detail 面板)。
- **sub-box 的 cluster tint(避免拆盒視覺回歸)**:既有 storageclass 盒以所屬 cluster accent 上色,來源為 `getStylesheet` 的 `node:parent` selector 經 `resolveParentClusterColor(ele)` 讀 **immediate parent** 的 `clusterColor`。拆盒後 sub-box 的 immediate parent 是 namespace 盒(帶 `namespaceColor`、無 `clusterColor`),會讀不到而退成 neutral。為保留既有視覺,`resolveParentClusterColor` MUST 改為**沿 parent 鏈上溯**找第一個帶 `clusterColor` 的祖先(sub-box → namespace 盒 → cluster);此變更對既有直屬 cluster 的容器(k8s node / 未拆 storageclass)無影響(第一步即命中),僅讓深一層的 sub-box 續得 cluster tint。namespace 盒自身仍由 `node[?isNamespace]`(D5)以 `namespaceColor` 覆蓋,不受此上溯影響。
- **legend 去重**:storageclass swatch(既有 `StorageClassLegend`)以 storageclass **名稱**去重,故同名 storageclass 跨多 namespace 拆出的多個 sub-box MUST 仍只佔一列 swatch(不因拆盒在 swatch 出現重複列)。

`node` 模式:storageclass 維持後端原樣(`cluster → storageclass → pvc`),`applyNamespaceGrouping` 不碰。

**為何拆盒而非整盒 re-parent**:一個後端 storageclass 盒可能含跨 namespace 的 pvc,整盒只能有一個 parent,無法同時歸多個 namespace;依 namespace 拆 sub-box 是唯一能同時滿足「namespace 外、storageclass 內」與 cytoscape 單一 parent 約束的作法。
**為何移除原後端 storageclass 盒**:拆盒後原盒無子,留著是空容器雜訊;移除使階層乾淨。

考慮過的替代:(A) 不拆、pvc 只上 namespace 色仍掛原 storageclass 盒——違背已定案「namespace 外、storageclass 內」,駁回。(B) namespace 取代 storageclass 盒——丟失 storageclass 分群,駁回。(C) 拆 per-namespace sub-box(選定)。

### D5: 顏色編碼資料流 —— namespace 盒帶 data 旗標 + 顏色 helper,`getStylesheet` 以 selector 套用

- namespace 盒帶 `data`:`isNamespace: true`、`namespace: <名稱>`、`namespaceColor: <hex>`(於 `applyNamespaceGrouping` 算好寫入,使 stylesheet 維持純工廠、不在 selector 內 hash)。三欄經 `src/shared/types/cytoscape.d.ts` declaration merging 宣告於 `NodeDataDefinition`(比照 `isCluster` / `cluster` / `clusterColor`)。
- 顏色 helper(共置 `src/shared/constants/`,比照 `clusterPalette.ts`):`colorForNamespace(name: string): string`,以穩定字串 hash(djb2 / FNV-1a)取 `NAMESPACE_PALETTE[hash % len]`。`NAMESPACE_PALETTE` 為 namespace 專屬高對比 colorblind-safe 分類色盤(見 D8)。
- `getStylesheet`:新增 `node[?isNamespace]` selector(比照 `node[?isCluster]`):背景 `background-color: data(namespaceColor)` + 低 `background-opacity`(淡 tint)、`border-color: data(namespaceColor)` + 較濃 `border-opacity`、`background-image: 'none'`、label 取 namespace 名與該色。`node[?isNamespace]` selector MUST NOT 透過 `node:parent` 或收合相關偽類間接套色,須**直接以 `node[?isNamespace]` 命中**(比照 `node[?isCluster]` 不依賴 `:parent`),確保展開 / 收合兩態皆維持 `namespaceColor` 邊框(收合容器會 drop 出 `node:parent`)。declared 次序須讓 `namespaceColor` 蓋過 `node:parent` neutral 但不蓋過 selection ring。
- namespace 盒 MUST NOT 帶 `status` / `alerts` / `worstStatus`;`selectable: false`(decorative、不開 detail panel,比照 cluster)。

**為何把顏色算在 `applyNamespaceGrouping` 而非 stylesheet selector**:比照 `clusterColor`「算好、stylesheet 讀 data」的單一來源原則,避免 per-node 重算與調色邏輯散入 stylesheet。

### D6: collapse 與 legend 整合(不預設摺疊)

- **Collapse**:namespace 盒為一般 `:parent` 容器,自動參與既有 `collapsedIds` / `reconcileCollapse`(desired ∩ present),無需改動 `reconcileCollapse` / `useCollapseGroup` / `useExpandCollapse`。
- **不預設摺疊**(已定案 D9):namespace 盒不加入任何 default-collapse seeding(`collapsedForEntryRef` / `storageClassesFoldedRef` 等);controller 仍維持其既有預設摺疊,故畫面呈現「依 namespace 色帶分群的收合 controller」——namespace 邊界與 controller 聚合兼得。
- **Legend**:controller 模式新增 namespace 色 swatch section。新增 thin wrapper `NamespaceLegend`(比照 `ClusterLegend`),沿用 `SwatchLegend`(fold-by-default + entry count);entries 自 elements 蒐集 `(namespace, namespaceColor)` 去重(比照 `KsgPanel` 蒐集 `clusterEntries`)。**提供** collapse-all 群組 toggle(`useCollapseGroup` over namespace 盒 ids,比照 cluster / node section);因 namespace 不預設摺疊,其初始 `allCollapsed` 恆為 false。node 模式無 namespace 盒,故不渲染此 section。

考慮過的替代:把 namespace 併入 cluster swatch section——語意 / 色盤不同,合併會誤導,駁回。

### D7: 模式切換 —— 沿用既有「整批重建 + bump run token + 恰一次 relayout」

模式切換機制不變:`useCytoscape` 偵測 `podParentMode` 變更 → `cy.elements().remove()` + `cy.add(elements)` 整批重建 → bump layout run token → `useGraphLayout` 重跑 layout 恰一次。切到 controller 模式時 namespace 盒出現(加深巢狀一階),切回 node 模式時 `applyNamespaceGrouping` no-op 不產生 namespace 盒,重建後 `reconcileCollapse(desired, presentParents)` 對已不存在的 namespace id 以 desired ∩ present 自然淘汰。重建/relayout 路徑照常涵蓋。

考慮過的替代:用 `cy.move()` / 動態 `data('parent')` 改巢狀避免重建——pod-parent-mode 規格已載明此在 batch + expand-collapse extension 下不可靠,駁回。

### D8: 高對比 colorblind-safe 分類調色盤 `NAMESPACE_PALETTE`

策展一組約 8–12 色的高對比、colorblind-safe 分類色盤 `NAMESPACE_PALETTE`,theme-aware 套用:背景以低不透明度 tint 與主題背景混和、邊框用該色實心;雙主題(light / dark)皆足夠對比。namespace 名稱以穩定字串 hash 取 index(`PALETTE[hash % len]`),確保同名跨 refresh / cluster 顏色穩定。實作時 SHOULD 參考 Grafana theme 的分類色盤以求主題一致,但若採用,MUST 先把該色盤**凍結為 panel 自有的固定有序常數 `NAMESPACE_PALETTE`** 再以 panel 的穩定 hash 取 index;MUST NOT 在 runtime 依出現順序或 Grafana 內部排序動態取色(否則確定性責任外包、違反穩定性)。

`NAMESPACE_PALETTE` 與 `CLUSTER_PALETTE` 須**視覺可區分**:cluster 已佔冷色弧(blue→indigo→violet→teal)且避開 status 三色(green `#73BF69` / yellow `#F2CC0C` / red `#E02F44`);namespace 調色盤亦 MUST 避開 status 三色,並盡量與 cluster 冷色弧拉開色相(否則巢狀盒上 cluster 邊框與 namespace 邊框難分)。具體 hex 清單於實作定稿(tasks 承載),須過雙主題對比與 colorblind 模擬檢查。

考慮過的替代:(A) 重用 `CLUSTER_PALETTE`——撞色、巢狀盒難分,駁回。(B) 連續色相環——不保證 colorblind-safe,駁回。(C) 策展 8–12 色 + 穩定 hash(選定)。

### D9: 純函式 / 確定性 / immutable

`applyNamespaceGrouping` MUST 比照 `applyPodParentMode` / `wrapSwitchFabric`:

- 不就地修改輸入(每個被改 parent 的元素 fresh-clone,`data` 至少淺拷貝;新合成的 namespace 盒 / storageclass sub-box 為新物件;移除原 storageclass 盒為過濾而非 mutate)。
- 對相同輸入位元組級確定:namespace 盒 / sub-box 以穩定排序插入(namespace 名、再 storageclass 名),顏色由確定性 hash 決定,id 對 key 確定。
- 新增 `applyNamespaceGrouping.test.ts`,涵蓋:controller 模式階層(controller / service / pvc 各就位)、storageclass 依 namespace 拆盒 + 原盒移除、無 storageclass 的 pvc 直掛 namespace、缺 namespace fallback、同名跨 cluster 各一盒、**node 模式 no-op**(輸入語意不變、無 namespace 盒)、顏色確定性與穩定性、namespace 盒不帶 status/alerts、不就地修改輸入。

## Risks / Trade-offs

- **風險:controller 模式 namespace 盒數量 = 每個 cluster 內 distinct namespace 數,在多 namespace 平台叢集(數十個 namespace)下盒「數量」本身(非盒內密度)對 fcose compound 佈局與可讀性形成壓力。** → 緩解:(1) 缺 namespace 不建盒(D3);(2) controller 仍預設摺疊使盒內密度低,但盒「數」仍可能偏高,屬已知限制;(3) 把「多 namespace cluster 的 fcose 佈局目視驗證」列入驗收——現 demo fixture 僅兩 cluster、各一 stateful pattern,namespace 多樣性不足以暴露此風險,tasks 須註明擴充 demo seeder 覆蓋多 namespace 情境。
- **風險:storageclass 依 namespace 拆盒(D4)使 storageclass 盒在 controller 模式可能倍增(per namespace),且新增「合成 sub-box + 移除原盒 + re-parent pvc」的轉換複雜度。** → 緩解:(1) 純函式 + 完整單測(含跨 namespace 拆盒、無 storageclass pvc、原盒移除);(2) 多數情境一 storageclass 僅服務一 namespace,實際多為 1:1 改名,倍增僅在共用 storageclass 時發生;(3) node 模式完全不拆(維持後端原樣),把複雜度限縮於 controller 模式。
- **風險:加深巢狀(controller 模式 `cluster > namespace > controller > pod` / `cluster > namespace > storageclass > pvc`)對 fcose / dagre compound 佈局穩定度(尤其模式切換後 relayout)的影響。** 本專案先前在模式切換時即吃過佈局劣化的苦(commit `2945553` 修過 fcose 在模式切換退化成 overlap)。→ 緩解:模式切換沿用「整批重建 + 恰一次 relayout」既有機制(D7),不引入動態 re-parent;`reconcileCollapse` 確保 collapse 狀態跨重建一致,避免 collapse-refresh-jump 病灶重演;node 模式不加 namespace 故其佈局完全不受影響。
- **風險:高對比色在亮 / 暗雙主題與 colorblind 觀者對比不足或撞色(與 cluster / status 色)。** → 緩解:(1) 策展 colorblind-safe 色盤並過 deuteranopia / protanopia 模擬(D8);(2) 背景低不透明度 tint、邊框實心該色;(3) 避開 status 三色並與 cluster 冷色弧拉開色相;(4) 雙主題各自目視驗證 namespace / cluster / status 三種邊框可區分。

## Migration Plan

純前端變更,無後端契約改動、無資料遷移。組合順序(`KsgPanel`):

```
baseElements (normalizeGraph, mode-agnostic)
  → applyPodParentMode(baseElements, mode)          // 既有:controller drop/re-parent、pod-runs-on-node 合成
  → applyNamespaceGrouping(…, mode)                 // 新增:controller 模式插 namespace 盒 / 拆 storageclass / re-parent / 上色;node 模式 no-op
  → wrapSwitchFabric(…)                             // 既有:注入 network 容器、re-parent parent-less switch
```

`applyNamespaceGrouping` 置於 `applyPodParentMode` 之後(依賴後者已定案的 controller / pod parent:controller 模式 controller 已掛 cluster、pod 已掛 controller),且在 `wrapSwitchFabric` 之前(namespace 分群不涉 switch fabric)。三者皆純函式。

向後相容:(1) node 模式 namespace pass-through——行為等同未啟用本特性;(2) controller 模式缺 namespace → fallback 跳過;(3) `node[?isNamespace]` selector 對無 namespace 盒的圖惰性;(4) declaration merging 新增的 `isNamespace` / `namespace` / `namespaceColor` 為 optional,既有元素不受影響。

## Open Questions

1. **(待釐清,實作定稿)** `NAMESPACE_PALETTE` 的具體 hex 清單(8–12 色)、是否參考特定 Grafana 分類色盤、hash 函式選用(djb2 vs FNV-1a);須過雙主題對比與 colorblind 模擬。
2. **(待釐清)** controller 模式下,跨 namespace 的 drawn edge(如 `pod-calls-pod` / `pod-calls-service`)穿越 namespace 盒邊界的視覺壓迫是否需 edge bundling / routing 調整?v1 暫不處理,列為後續觀察點。
3. **(待釐清,資料相依)** 後端是否在 `service` / `pvc` 節點穩定提供 `labels.namespace`?若否,該類節點走 fallback(不分群);demo seeder 須確保 service / pvc 帶 namespace 以供驗證。
