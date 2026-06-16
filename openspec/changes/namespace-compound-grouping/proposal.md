## Why

目前 compound 階層只到 `cluster > {node|controller} > pod`,namespace 僅是節點 `data.namespace` 欄位,在畫面上沒有視覺分群。當一個 cluster(尤其 controller 模式)塞入多個 namespace 的 workload 時,使用者無法一眼看出哪些 controller / service / pvc / pod 屬於同一 namespace。本變更把 namespace 提升為**虛擬 compound 父節點**並以高對比顏色標示,讓 namespace 邊界在 cluster 內清晰可辨。

namespace 分群**僅作用於 `controller` 模式**:controller / service / pvc 皆為 namespaced 資源,在 controller 模式下都直屬 cluster,可乾淨地收進 cluster 層的 namespace 盒。`node` 模式維持以實體拓樸(K8s node)為主軸——node 為 cluster-scoped(跨 namespace 承載 pod),且 service / pvc 不綁 node,強行加 namespace 層會語意錯置且無處擺放,故 **node 模式不繪製 namespace**。

## What Changes

- **新增虛擬 namespace compound 節點(controller 模式專屬)**:自 `data.namespace` **合成**虛擬 compound 父節點(panel 端合成,後端不輸出),**僅在 `controller` 模式**插入階層並繪製。namespace 為純分群容器,**無** status / alerts(比照 cluster / storageclass 分組盒),`selectable: false`(不開 detail 面板)。
- **Controller 模式階層**:
  - `cluster → namespace → controller → pod`
  - `cluster → namespace → service`
  - `cluster → namespace → storageclass → pvc`(pvc 走 storageclass:namespace 外、storageclass 內);**無 storageclass 的 pvc** → `cluster → namespace → pvc`
  - namespace 盒 parent = cluster;每個 `(cluster, namespace)` 一個盒。
- **storageclass 在 controller 模式依 namespace 拆盒**:後端輸出的 `cluster → storageclass → pvc`(一個 storageclass 盒可能含跨 namespace 的 pvc)在 controller 模式下,由 panel 依各 pvc 的 namespace 拆成 per-`(namespace, storageclass)` 的 storageclass sub-box,巢狀為 `cluster → namespace → storageclass → pvc`(同一 storageclass 若被多 namespace 使用,會在各該 namespace 下各出現一個 storageclass 盒)。**`node` 模式維持後端原樣**(`cluster → storageclass → pvc`,不拆)。
- **Node 模式不變**:`cluster → node → pod`,service / pvc / storageclass 維持既有掛點;**無 namespace 盒、無 namespace 色**。
- **高對比顏色編碼**:每個 namespace 盒依 namespace 名稱**確定性 hash → 高對比 colorblind-safe 調色盤**(`PALETTE[hash(ns) % len]`)上色(背景淡 tint + 較濃邊框);同名 namespace 跨 data refresh、跨 cluster 顏色一致;調色盤避開 status 三色並與 cluster 冷色弧拉開色相。
- **collapse / legend 整合**:namespace 盒比照其他容器可摺疊(參與既有 `collapsedIds` / `reconcileCollapse`),**不預設摺疊**(controller 仍維持其既有預設摺疊,於是畫面呈現「依 namespace 色帶分群的收合 controller」);legend 新增 namespace 顏色 section(controller 模式;沿用既有 fold 慣例 + collapse-all)。
- **缺 namespace 的 fallback**:無 `data.namespace` 的 controller / service / pvc MUST 跳過 namespace 層(維持原 parent),不消失、不報錯(沿用 forward-compat 容忍)。
- **前置(normalize)**:合成 controller 節點目前**不帶** `data.namespace`(`synthesizeControllers` 未寫入,雖 `PendingOwned.namespace` 已備好)。controller 模式的 namespace 分群依賴 controller 的 `data.namespace`,故 normalize MUST 在合成 controller 時寫入其 namespace(取自 owned pod、經 `PendingOwned.namespace`);此為 mode-agnostic 的 leaf 事實(controller 本由 normalize 合成),不破壞 normalize 的 mode-agnostic 性。
- **不變**:`normalizeGraph` 維持純 anti-corruption 與 mode-agnostic(僅多寫 controller 的 `data.namespace` leaf 欄,**不**做 namespace 分群 / re-parent);`controller-owns-pod` / `pod-runs-on-node` 既有合成與繪製;switch-tier-layout 在 controller 模式對 K8s node 的 pin(namespace 盒含 controller/service/pvc、不含 node,`pod-runs-on-node` drawn edge 仍可跨 compound 邊界連到 switch fabric 中的 node);模式切換**恰一次**重新佈局的機制。

## Capabilities

### New Capabilities

- `namespace-grouping`: controller 模式下自 `data.namespace` 合成虛擬 namespace compound 父節點、把 namespaced 資源(controller / service / pvc,pvc 經依 namespace 拆出的 storageclass sub-box)收進 namespace 盒、確定性高對比顏色編碼(跨 refresh / cluster 穩定)、collapse 與 legend 整合,以及缺 namespace 的 fallback;`node` 模式為 no-op(不繪製 namespace)。為純函式、確定性、immutable。

### Modified Capabilities

- `graph-data-integration`: `normalizeGraph` 的 `synthesizeControllers` 新增在合成 controller 節點寫入 `data.namespace`(取自 owned pod、經 `PendingOwned.namespace`,空字串則省略)——為 controller 模式 namespace 分群的前置;此欄 MUST NOT 影響既有 controller 去重 key / `worstStatus` / `controller-owns-pod` / application·containers·alerts 聚合。
- `pod-parent-mode`: **`controller` 模式**的 compound 拓樸新增 namespace 層(`cluster > controller > pod` → `cluster > namespace > controller > pod`,並把 service / pvc 收入 namespace 盒);**`node` 模式維持不變**(`cluster > node > pod`,無 namespace)。`applyNamespaceGrouping` 於 `applyPodParentMode` 之後組合,模式切換的整批重建與**恰一次**重新佈局須反映 controller 模式加深後的巢狀(機制不變);相關 scenario 更新以描述含 namespace 層的 controller 模式階層與 node 模式無 namespace。

## Impact

- 新增純函式 `applyNamespaceGrouping(elements, mode)`(`src/features/graph-data/` 或鄰近),於 `KsgPanel` 以 `wrapSwitchFabric(applyNamespaceGrouping(applyPodParentMode(baseElements, mode), mode))` 組合;`mode === 'node'` 時 pass-through(回傳輸入語意等價的新陣列),`mode === 'controller'` 時合成 namespace 盒、依 namespace 拆 storageclass sub-box、re-parent controller / service / pvc、上色。及其單元測試(controller 階層、storageclass 拆盒、缺 namespace fallback、同名跨 cluster 各一盒、node 模式 no-op、純函式不就地修改)。
- 新增 namespace 顏色 helper `colorForNamespace(name)`(穩定 hash → `NAMESPACE_PALETTE`,比照 `clusterPalette.ts`)+ 調色盤常數。
- `getStylesheet`:新增 `node[?isNamespace]` 容器樣式(背景 tint + 邊框取自 `data(namespaceColor)`,比照 `node[?isCluster]`);namespace 盒 data 旗標(`isNamespace` / `namespace` / `namespaceColor`)經 `src/shared/types/cytoscape.d.ts` declaration merging 宣告。
- `legend` feature:新增 `NamespaceLegend`(controller 模式;swatch + collapse-all,沿用 `SwatchLegend` fold 慣例)。
- `KsgPanel`:`useMemo` 組合鏈插入 `applyNamespaceGrouping`;蒐集 namespace swatch entries。
- 與既有 storageclass 渲染 / 正規化的互動:normalize 仍原樣穿透 storageclass(mode-agnostic 不變);controller 模式的 storageclass 拆盒由 `applyNamespaceGrouping` 後置處理(specs 階段確認是否需對 storageclass 相關需求補 delta,抑或全由 `namespace-grouping` 承載)。
- 不變:`normalizeGraph`、`controller-owns-pod` / `pod-runs-on-node` 合成、`drawnEdgeTypesForMode`、`wrapSwitchFabric`、switch-tier-layout、後端契約。
- **資料相依**:service / pvc 的 namespace 分群需後端在 service / pvc 節點提供 `labels.namespace`(normalize 已通用映射 `labels.namespace → data.namespace`);缺值時該節點走 fallback(不分群)。
