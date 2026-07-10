## REMOVED Requirements

本 capability 整體退役:後端(kube-state-graph `787573b`,design **D6**)已成為拓撲階層的唯一真實來源,直接於 `/v1/graph` cytoscape payload 發出 `namespace` / `application` / `controller` compound group 節點與完整 `data.parent` 父鏈(design **D1** / **D4**),panel 不再以前端合成階層。因此刪除 `applyNamespaceGrouping`(連同 controller 模式的 storageclass 拆盒)與所有 namespace 合成。仍保留的行為改由他處承接:後端餵入的 namespace accent 著色(以 `isNamespace` flag 辨識並套 `namespaceColor`)與 `NamespaceLegend` 的 group 辨識 / 著色遷移至 **graph-data-integration**,legend 渲染遷移至 **panel-rendering**;`storageclass` 不再被 namespace 裝盒——它已是 `kind:'storageclass'` 葉節點(見 **graph-data-integration**,design **D3**)。

### Requirement: Namespace compound 合成(controller 模式專屬)

**Reason:** 後端 D6 直接發出 `namespace` compound group 節點與 `data.parent` 父鏈(design D1/D4),panel 端 `applyNamespaceGrouping` 合成與 re-parent 邏輯整支刪除;namespace group 辨識改於 graph-data-integration 以 `isNamespace` flag 承接。

### Requirement: PVC 依 namespace 巢狀於 storageclass(controller 模式拆盒)

**Reason:** `storageclass` 不再是裝 PVC 的 compound 盒,而是後端發出的 `kind:'storageclass'` 葉節點,PVC 以 `pvc-to-storageclass` 邊連向它(design D3/D6);controller 模式的 storageclass sub-box 拆盒邏輯隨 `applyNamespaceGrouping` 一併刪除。

### Requirement: Namespace 高對比顏色編碼

**Reason:** namespace accent 著色(`namespaceColor`)與 `node[?isNamespace]` stylesheet selector 保留(現為 per-kind 固定色,見 panel-rendering「裝飾性 compound 群組使用 per-kind 固定色彩與 kind 前綴標籤」),但 `namespaceColor` 不再由 `applyNamespaceGrouping` 合成時寫入,而改由 normalize 辨識後端 `namespace` group 時套用(design D4);此著色行為遷移至 graph-data-integration 規格。

### Requirement: Namespace collapse 與 legend(controller 模式)

**Reason:** namespace 盒由後端發出後仍以一般 `:parent` 容器參與既有 collapse,無需本 capability 描述;`NamespaceLegend` section 改由後端 `isNamespace` 節點餵入(design D9),其 legend 渲染遷移至 panel-rendering 規格。
