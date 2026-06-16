## 0. 前置:normalize 合成 controller 寫入 `data.namespace`(TDD)

- [x] 0.1 (RED)擴充 `normalize.test.ts`:含帶 `labels.namespace:'shop'` 且帶 owner 的 pod 之 payload → 合成的 controller 節點 `data.namespace` 為 `'shop'`;owned pod 皆無 namespace → 合成 controller **不**帶 `data.namespace`(不寫 `undefined`);不同 namespace 同名 owner → 兩 controller 各帶其 namespace(既有 `(cluster, namespace, ownerKind, ownerName)` 去重不變);斷言不影響既有 controller `worstStatus` / alerts / application / containers 聚合與 `controller-owns-pod` 邊
- [x] 0.2 (GREEN)`src/features/graph-data/normalize.ts` 的 `synthesizeControllers` 於 `controllerNodes.push` 的 `data` 補寫 `...(o.namespace !== '' ? { namespace: o.namespace } : {})`(對齊 leaf node `...(isString(namespace) ? { namespace } : {})` 慣例與 `exactOptionalPropertyTypes`);`PendingOwned.namespace` 已備好,無需改其他 stage;更新 `synthesizeControllers` 檔頭註解列入 namespace
- [x] 0.3 確認此為 namespace-grouping controller 分支的**前置**:缺此,合成 controller 永不帶 `data.namespace`,`applyNamespaceGrouping` 對真實合成 controller 會走 fallback 不分群(單測若以手刻 controller 餵入會假性通過,但 KsgPanel 整合與 demo 不成立)——見 graph-data-integration 規格「合成 controller 節點攜帶 namespace」

## 1. 型別:cytoscape `data` 宣告 namespace 盒欄位(declaration merging)

- [x] 1.1 (GREEN)`src/shared/types/cytoscape.d.ts` 於 `NodeDataDefinition` 以 declaration merging 新增三個 optional 欄位(比照 `isCluster` / `cluster` / `clusterColor`):`isNamespace?: boolean`(true 只在 panel 合成的 namespace 盒)、`namespace?: string`(既有欄,確認其註解涵蓋「namespace 盒以此攜帶名稱」)、`namespaceColor?: string`(於 `applyNamespaceGrouping` 算好寫入,使 stylesheet 維持純工廠);註解須載明:三欄為純前端、controller 模式專屬;namespace 盒 `selectable: false`、無 `status` / `alerts` / `worstStatus`
- [x] 1.2 確認既有 `namespace?: string` 宣告不需改型別、僅補語意註解;`storageclass` sub-box 重用既有 `isStorageClass` 旗標(無需新欄)

## 2. 顏色:`NAMESPACE_PALETTE` 常數 + `colorForNamespace`(穩定 hash)

- [x] 2.1 (RED)新增 `src/shared/constants/namespacePalette.test.ts`(straight Jest):`colorForNamespace(name)` 對同名同 refresh / 跨呼叫回傳同一 hex(確定性)、結果恆為 `NAMESPACE_PALETTE` 成員;斷言 `NAMESPACE_PALETTE` MUST NOT 含 status 三色(`#73BF69` / `#F2CC0C` / `#E02F44`);斷言 `NAMESPACE_PALETTE` 與 `CLUSTER_PALETTE` **無交集 hex**(色相拉開的可機驗下限);空字串輸入回傳穩定且為 palette 成員(不丟錯)
- [x] 2.2 (GREEN)新增 `src/shared/constants/namespacePalette.ts`(共置 `clusterPalette.ts` 旁):匯出 `NAMESPACE_PALETTE`(固定有序 `as const`,8–12 色高對比 colorblind-safe 分類色盤;具體 hex 由 5.x 定稿,RED 階段先以暫定值通過結構斷言)+ 純函式 `colorForNamespace(name: string): string`(沿用 `colorForCluster` 的穩定字串 hash → `PALETTE[hash % len]`,以 `?? PALETTE[0]` 保底);檔頭註解須載明:單一來源(`applyNamespaceGrouping` 寫 `data.namespaceColor`、`getStylesheet` 讀回、`NamespaceLegend` swatch 讀回)、避開 status 三色、與 cluster 冷色弧拉開、同名跨 refresh / cluster 穩定
- [x] 2.3 (GREEN)若參考 Grafana 分類色盤取色,MUST 先把該色盤**凍結為 `NAMESPACE_PALETTE` 固定有序常數**再以本檔穩定 hash 取 index;MUST NOT 在 runtime 依出現順序或 Grafana 內部排序動態取色(確定性責任不外包)

## 3. 純函式 `applyNamespaceGrouping(elements, mode)`:node no-op(TDD)

- [x] 3.1 (RED)新增 `src/features/graph-data/applyNamespaceGrouping.test.ts` —— node 模式:`mode === 'node'` 對任一含 cluster / controller / service / pvc / storageclass 的 elements → 回傳**與輸入語意等價的新陣列**(referential 上為新陣列,無 namespace 盒、無任何 `isNamespace` 節點、無 `namespaceColor` 寫入、所有 controller / service / pvc 維持原 `parent`、storageclass 盒不被拆 / 不被移除)
- [x] 3.2 (GREEN)新增 `src/features/graph-data/applyNamespaceGrouping.ts`,簽章 `applyNamespaceGrouping(elements: cytoscape.ElementDefinition[], mode: PodParentMode): cytoscape.ElementDefinition[]`;`mode === 'node'` 分支即時回傳 `[...elements]`(no-op、語意等價新陣列);檔頭註解須載明落點(`applyPodParentMode` 之後、`wrapSwitchFabric` 之前)、node no-op / controller 合成、純函式 immutable 慣例(比照 `applyPodParentMode` 的 `cloneElement` 註解:cytoscape 別名 `data` 物件,故每個被改 parent 的元素 MUST fresh-clone)

## 4. `applyNamespaceGrouping` controller 模式:合成 namespace 盒 + re-parent controller / service(TDD)

- [x] 4.1 (RED)擴充測試 —— controller / service 就位:某 cluster 容器下有帶 `data.namespace:'shop'` 的合成 controller(`isController:true`)與帶 `data.namespace:'shop'` 的 service(`kind:'service'`),兩者原 parent 皆為該 cluster 容器 → 合成**一個** `(cluster,'shop')` namespace 盒(`isNamespace:true`、`namespace:'shop'`、`namespaceColor === colorForNamespace('shop')`、`selectable:false`、**無** `status`/`alerts`/`worstStatus`、`parent` = 該 cluster 容器既有 id);controller 與 service 的 `data.parent` 改指此盒;controller 旗下 pod 的 parent 不變(仍巢狀於 controller)
- [x] 4.2 (RED)擴充測試 —— 自身 id vs parent 的區分:namespace 盒「自身 id」由 `(cluster 容器實際 id, namespace)` opaque key 確定性合成(同輸入同 id),且 MUST NOT 等於任何 cluster 容器 id;namespace 盒 `parent` **重用既有 cluster 容器實際 id**(取自資源的 cluster 祖先),MUST NOT 自造 cluster 容器 id
- [x] 4.3 (RED)擴充測試 —— 同名跨 cluster 各一盒:cluster `prod` 與 cluster `dr` 各有一個 `namespace:'shop'` 的 controller → 合成**兩個**不同 namespace 盒(以 `(clusterContainerId, namespace)` key 區分),各 `parent` 指向其 cluster 容器既有 id,不誤併;兩盒 `namespaceColor` 同為 `colorForNamespace('shop')`
- [x] 4.4 (GREEN)實作 controller 分支骨架:擷取每個 namespaced 資源(controller / service)的 cluster 祖先(原 `parent` 或沿 `parent` 鏈上溯至 `isCluster` 容器)**在改寫 `data.parent` 之前**於 fresh-clone 完成;以 `namespaceBoxIdFor(clusterContainerId, namespace)` 確定性合成自身 id(opaque key,比照 `controllerIdFor` 的 `/`-joined 構造);per `(clusterContainerId, namespace)` 去重建盒(`isNamespace:true` + `namespace` + `namespaceColor:colorForNamespace(ns)` + `selectable:false`,**不**寫 status/alerts/worstStatus);把 controller / service fresh-clone 後 `data.parent` 改指 namespace 盒;以穩定排序(cluster 容器 id、再 namespace 名)插入新盒

## 5. `applyNamespaceGrouping` controller 模式:storageclass 依 namespace 拆盒 + pvc re-parent(TDD)

- [x] 5.1 (RED)擴充測試 —— 跨 namespace 拆盒:某 cluster 下後端 `gp2` storageclass 盒(`isStorageClass:true`)含 namespace `a` 的 pvc 與 namespace `b` 的 pvc → 合成兩個 storageclass sub-box(`(a-box,'gp2')` 與 `(b-box,'gp2')`,皆 `kind:'storageclass'`、`isStorageClass:true`、`label:'gp2'`、**無** status/alerts/worstStatus、`parent` 各指其 namespace 盒);`a` 的 pvc re-parent 至前者、`b` 的 pvc re-parent 至後者,形成 `cluster→a→gp2→pvc` 與 `cluster→b→gp2→pvc`;sub-box 自身 id 以 `(namespaceBoxId, storageclassName)` opaque key 確定性合成
- [x] 5.2 (RED)擴充測試 —— 原後端 storageclass 盒於拆盒後移除:該 `gp2` 後端原盒(已無子)MUST 自 elements 移除,不留空容器(以過濾而非 mutate)
- [x] 5.3 (RED)擴充測試 —— 無 storageclass 的 pvc 直掛 namespace:帶 `data.namespace:'shop'` 但原 parent 為 cluster 容器(無後端 storageclass 盒)的 pvc → re-parent 至 `(cluster,'shop')` 盒(`cluster→namespace→pvc`),不合成 storageclass sub-box
- [x] 5.4 (GREEN)實作 storageclass 拆盒:對每個帶 `data.namespace` 且原 parent 為後端 storageclass 盒的 pvc,確保 per-`(namespaceBoxId, storageclassName)` sub-box 存在(去重、`kind:'storageclass'`/`isStorageClass:true`/`label` = 原 sc 名/`parent` = 該 namespace 盒/無 status·alerts·worstStatus)並 fresh-clone re-parent pvc 至之;對帶 namespace 但無 storageclass 的 pvc 直接 re-parent 至 namespace 盒;**移除**所有被拆空的原後端 storageclass 盒(以 filter);sub-box 以穩定排序(namespace 名、再 storageclass 名)插入;同一 storageclass 跨多 namespace 各出現一盒(可接受重複)
- [x] 5.5 (GREEN)依 D8 + colorblind / 雙主題評估**定稿 `NAMESPACE_PALETTE` 具體 hex 清單**(回填 2.2 暫定值),確認過 2.1 結構斷言(避開 status 三色、與 `CLUSTER_PALETTE` 無交集)

## 6. `applyNamespaceGrouping` controller 模式:fallback 與 immutable 守衛(TDD)

- [x] 6.1 (RED)擴充測試 —— 缺 namespace fallback:controller / service / pvc 缺 `data.namespace`(或空字串)→ 跳過 namespace 層、維持原 parent,不建盒、不消失、不報錯
- [x] 6.2 (RED)擴充測試 —— 無 cluster 祖先跳過:top-level(原 parent 非 `isCluster` 容器、或沿鏈上溯找不到 cluster 祖先)的 controller / service / pvc → 跳過 namespace 層、維持原 parent(比照 `applyPodParentMode` 對非 K8s node parent 的守衛)
- [x] 6.3 (RED)擴充測試 —— 不就地修改輸入:以同一組 elements 連續呼叫 `applyNamespaceGrouping(elements,'controller')` 與 `applyNamespaceGrouping(elements,'node')` → 輸入陣列與其節點 / 邊物件 MUST NOT 被修改(referential 上產生新物件),兩次呼叫結果互不污染
- [x] 6.4 (GREEN)補上 fallback 與守衛:`data.namespace` 缺 / 空、或無 `isCluster` 祖先者一律跳過(維持原 parent);全函式 fresh-clone(被改 parent 的元素淺拷貝 `data`、新盒 / sub-box 為新物件、移除原 sc 盒以 filter);確保對相同輸入位元組級確定(穩定排序 + 確定性 id + 確定性顏色)

## 7. KsgPanel 組合鏈插入 `applyNamespaceGrouping`

- [x] 7.1 (GREEN)`src/features/graph-data/index.ts` barrel 匯出 `applyNamespaceGrouping`
- [x] 7.2 (RED)擴充 `KsgPanel.test.tsx`(組合鏈):controller 模式 + 含跨 namespace 資源的 payload → 渲染後 `elements` 含 namespace 盒且階層為 `cluster→namespace→controller→pod` / `cluster→namespace→service` / `cluster→namespace→storageclass→pvc`;node 模式 → 無 namespace 盒
- [x] 7.3 (GREEN)`KsgPanel.tsx` `elements` 的 `useMemo` 改為 `wrapSwitchFabric(applyNamespaceGrouping(applyPodParentMode(baseElements, podParentMode), podParentMode))`,deps 維持 `[baseElements, podParentMode]`;import `applyNamespaceGrouping`(自 `features/graph-data`);更新該 `useMemo` 上方註解描述新插入的 pass(controller 插 namespace 層、node no-op)

## 8. `getStylesheet`:`node[?isNamespace]` selector(TDD)

- [x] 8.1 (RED)擴充 `getStylesheet.test.ts`:stylesheet 含一條 `selector: 'node[?isNamespace]'`(字面、MUST NOT 含 `:parent` 或收合偽類),其 style 以 `background-color: 'data(namespaceColor)'`(低 `background-opacity` 淡 tint)+ `border-color: 'data(namespaceColor)'`(較濃 `border-opacity`)+ `background-image: 'none'` + label `color: 'data(namespaceColor)'`(展開態蓋過 `node:parent` 的 cluster 色);斷言其宣告序在 `node:parent` 之後(蓋過 neutral parent 邊框與 label 色)、在 `node:selected` 之前(不蓋 selection ring);更新對應 `__snapshots__/getStylesheet.test.ts.snap`
- [x] 8.2 (GREEN)`getStylesheet.ts` 在 `node[?isCluster]` selector 之後新增 `node[?isNamespace]` selector(直接命中、不依賴 `node:parent`,確保收合態 drop 出 `:parent` 仍維持 `namespaceColor` 邊框):`shape:'round-rectangle'`、`background-image:'none'`、`background-color:'data(namespaceColor)'` + 低 `background-opacity`、`border-color:'data(namespaceColor)'` + 較濃 `border-opacity`、label/`color:'data(label)'`/`data(namespaceColor)`、`text-valign:'top'` + padding(比照 cluster 但與其視覺可區分);宣告於 `node:parent` 之後、`node:selected` 之前;檔頭 / inline 註解載明「直接命中、收合態仍保色」
- [x] 8.3 (RED→GREEN)`resolveParentClusterColor` 改為沿 parent 鏈**上溯**找第一個帶 `clusterColor` 的祖先(原只讀 immediate parent):使 controller 模式下深一層的 storageclass sub-box(immediate parent = namespace 盒、無 `clusterColor`)仍得所屬 cluster accent tint;對既有直屬 cluster 的容器(k8s node / 未拆 storageclass)無影響(第一步即命中)。擴充 `getStylesheet` 測試:parent 為 namespace 盒、grandparent 為 cluster 的 sub-box 解析到 cluster 的 `clusterColor`

## 9. legend:`NamespaceLegend`(controller 模式;swatch + collapse-all)(TDD)

- [x] 9.1 (RED)新增 `src/features/legend/components/NamespaceLegend/NamespaceLegend.test.tsx`(`@testing-library/react`):給 `namespaces` entries → 渲染 `SwatchLegend`(title `Namespaces`、testId `namespace-legend`、rowTestIdPrefix `namespace-legend-row-`、collapseToggleTestId `namespace-collapse-toggle`、collapseNoun `namespaces`);entries 為空 → 渲染 `null`;`onToggleCollapseAll` 給定時透傳;`allCollapsed` 預設 `false`
- [x] 9.2 (GREEN)新增 `NamespaceLegend.tsx`(thin wrapper over `SwatchLegend`,比照 `ClusterLegend` / `StorageClassLegend`)+ `index.ts` barrel;export `NamespaceLegendEntry`(`{ name; color }`)+ `NamespaceLegendProps`;檔頭註解載明:controller 模式專屬、color 來自 namespace 盒 `data.namespaceColor`(與 on-canvas 一致)、不預設摺疊故 `allCollapsed` 初始恆 `false`
- [x] 9.3 (GREEN)`src/features/legend/index.ts` barrel 新增 `export { NamespaceLegend, type NamespaceLegendEntry }`

## 10. KsgPanel:蒐集 namespace entries + collapse group + 條件渲染(TDD)

- [x] 10.1 (RED)擴充 `KsgPanel.test.tsx`(legend 整合):controller 模式 + 含 namespace 盒 → legend 渲染 `Namespaces(N)` section,swatch 色 = `colorForNamespace(ns)`(以可見文字 / swatch 斷言,比照既有 cluster/storageclass legend 測試慣例);node 模式 → **不**渲染 namespace section
- [x] 10.2 (GREEN)`KsgPanel.tsx` 新增 `namespaceEntries` `useMemo`(自 `elements` 蒐集 `(namespace, namespaceColor)`,以 `isNamespace === true` 過濾 + Map 去重,比照 `clusterEntries`)、`namespaceContainerIds` `useMemo`(以 `d.isNamespace === true && typeof d.id === 'string'` 蒐集 namespace 盒 id,與 `namespaceEntries` **同一過濾來源**/single source,比照 `clusterContainerIds`/`clusterEntries`)、`useCollapseGroup(namespaceContainerIds, …)` 取 `{ allCollapsed, toggle }`
- [x] 10.3 (GREEN)`KsgPanel.tsx` 在 legend 區條件渲染 `<NamespaceLegend …>`(僅 `podParentMode === 'controller'` 且 `namespaceEntries.length > 0`;`SwatchLegend` 對空 entries 已回 `null`,但 node 模式 MUST 不渲染此 section);擺位置於 `ClusterLegend` 之後(cluster→namespace 視覺由外而內);import `NamespaceLegend` + `NamespaceLegendEntry`

## 11. collapse 整合:namespace 盒參與 reconcileCollapse、不加入 default-collapse seeding(TDD)

- [x] 11.1 (GREEN)確認 namespace 盒為一般 `:parent` 容器,自動納入既有 `collapsedIds` / `reconcileCollapse`(desired ∩ present)——**不**改動 `reconcileCollapse` / `useCollapseGroup` / `useExpandCollapse`
- [x] 11.2 (GREEN)確認 namespace 盒 **MUST NOT** 加入任何 default-collapse seeding:不觸及 `collapsedForEntryRef`(controller default-collapse)與 `storageClassesFoldedRef`(storageclass default-fold);controller 既有預設全摺疊行為不受影響(畫面為「依 namespace 色帶分群的收合 controller」)
- [x] 11.3 (RED→GREEN)直接單測 default-collapse seeding 邏輯:斷言 namespace 盒 id **不**被 seed 入初始 `collapsedIds`(不觸 `collapsedForEntryRef` controller default-collapse 與 `storageClassesFoldedRef` storageclass default-fold),controller id 仍被預設摺疊;另以既有 `reconcileCollapse` 單測直接餵 namespace id,驗證切回 node 後其經 desired ∩ present 淘汰(該函式已存在,可直接測)——**不留「若可斷言」逃生口**

## 12. 模式切換:加深巢狀下整批重建 + 恰一次 relayout(驗證)

- [x] 12.1 確認模式切換沿用既有「`cy.elements().remove()` + `cy.add(elements)` 整批重建 → bump layout run token → `useGraphLayout` 恰一次 relayout」機制(D7)——切到 controller 出現 namespace 盒(加深一階)、切回 node `applyNamespaceGrouping` no-op 不產生 namespace 盒;**不**引入動態 `cy.move()` / `data('parent')` re-parent
- [ ] 12.2 確認加深巢狀(`cluster>namespace>controller>pod` / `cluster>namespace>storageclass>pvc`)未觸發 commit `2945553` 的 fcose 退化成 overlap(模式切換目視 / e2e 驗證,於 17.x demo 驗收)

## 13. 規格同步

- [x] 13.1 `openspec validate namespace-compound-grouping --strict` 通過
- [x] 13.2 確認 `specs/namespace-grouping/spec.md` 三需求(合成 / storageclass 拆盒 / 顏色編碼 / collapse·legend)與實作一致;`specs/pod-parent-mode/spec.md` delta(controller 模式 `cluster>namespace>controller>pod` 含 namespace 層、node 模式無 namespace)與 `applyPodParentMode` 之後組合 `applyNamespaceGrouping` 的描述一致
- [x] 13.3 確認新 / 改檔頭與程式碼註解(`applyNamespaceGrouping` 落點與 node no-op、`namespacePalette` 單一來源與避色、`getStylesheet` 直接命中 selector、`NamespaceLegend` controller 專屬)與更新後規格一致
- [x] 13.4 確認 controller 模式 storageclass 拆盒後,既有 `StorageClassLegend` swatch 仍以 storageclass **名稱**去重(同名跨多 namespace 只一列 swatch,不因拆盒出現重複列)

## 14. 品質閘

- [x] 14.1 `npm run typecheck` 通過(`exactOptionalPropertyTypes` 下 `isNamespace` / `namespace` / `namespaceColor` 以 `...(cond ? {} : {})` 不賦 `undefined`;`noUncheckedIndexedAccess` 下 palette 取值以 `??` 保底)
- [x] 14.2 `npm run lint`(zero-warning)通過
- [x] 14.3 `npm run test:ci` 全綠(含新 `namespacePalette` / `applyNamespaceGrouping` / `NamespaceLegend` 測試 + `getStylesheet` snapshot + `KsgPanel` 組合 / legend / collapse 擴充)
- [x] 14.4 `npm run build` 成功並更新 `dist/`

## 15. demo:seeder 擴充多 namespace 覆蓋

- [ ] 15.1 擴充 `dev/victoriametrics/topology.prom`(+ 必要時 `seed.sh`):至少一 cluster 內含**多個** namespace 的 workload(controller / pod),且 service / pvc 帶 `namespace` label(normalize 已映射 `labels.namespace → data.namespace`),以驗證 controller 模式 namespace 盒涵蓋 controller / service / pvc 三類。**pod MUST 帶 `labels.namespace`**(合成 controller 的 namespace 由其 owned pod 的 `labels.namespace` 經 normalize 帶上——見 §0;否則 controller 走 fallback 不分群)
- [ ] 15.2 擴充 fixture 使**一個共用 storageclass 跨 ≥2 namespace 的 pvc**,以驗證 controller 模式 storageclass 依 namespace 拆 sub-box(`cluster→nsA→sc→pvc` / `cluster→nsB→sc→pvc`)+ 原後端盒移除;另含一無 storageclass 的 namespaced pvc 驗 `cluster→namespace→pvc` 直掛
- [ ] 15.3 維持既有 fixture 對全 6 node kind / 4 edge type 的覆蓋與 service-graph 計數遞增不破壞(seeder 每 tick re-push + 計數 bump 不變)

## 16. demo 目視驗收(controller / node 雙模)

- [ ] 16.1 controller 模式:namespace 色帶 / 階層目視——`cluster→namespace→controller→pod`、`cluster→namespace→service`、`cluster→namespace→storageclass→pvc` 與無 sc 的 `cluster→namespace→pvc` 各就位;同名 namespace 跨 cluster 同色;namespace 盒不預設摺疊、controller 仍預設摺疊;namespace 盒可手動 / 經 `NamespaceLegend` collapse-all 摺疊;收合態仍維持 namespace 邊框色
- [ ] 16.2 node 模式:確認**完全無** namespace 盒、無 namespace 色、無 `NamespaceLegend` section,維持 `cluster→node→pod` 與既有 service / pvc / storageclass 掛點

## 17. 風險驗收(布局 / 配色定稿)

- [ ] 17.1 多 namespace cluster 的 fcose compound 佈局目視:盒「數」偏高情境下無退化成 overlap(對照 commit `2945553` 病灶);模式切換後 relayout 穩定
- [ ] 17.2 雙主題(light / dark)+ colorblind(deuteranopia / protanopia)模擬:確認 namespace 邊框 / cluster 邊框 / status 三色三者可區分,namespace tint 對主題背景與內部資源高對比;據此確認 `NAMESPACE_PALETTE` hex 定稿(回填 5.5)無需再調
