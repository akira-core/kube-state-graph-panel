> **實作進度（2026-06-04）**：已完成並經 demo 實機驗證 —
> (a) icon 編碼層(常數/tint/stylesheet/legend/filter);
> (b) **canvas icon 渲染修正**：依 cytoscape 官方 docs,SVG 加 `<?xml?>` header + 用 `encodeURIComponent`(非 base64),icon 才會畫在 canvas 上(缺 header 時 legend `<img>` 顯示但 canvas 空白);icon 以 `text.primary` 上色、`background-fit:none`+60% inset;
> (c) **移除 `others`**(後端已自契約移除);
> (d) **v0.0.18 `switch` 支援**：NodeKind `switch` + EdgeType `switch-to-switch`/`node-to-switch`(兩模式皆畫)、icon、legend、endpoints;
> (e) **cluster palette 改全冷色**,避開 status 綠/黃/紅;
> (f) **動態 legend**：NodeLegend/EdgeLegend 只列出圖中出現的 kind/edge(比照 ClusterLegend)。
> typecheck + 179 測試 + lint(零警告) + build 全綠。
> **未做**(刻意延後)：status 邊框資料驅動(2.5,仍 pod/node/pvc)、Argo CD icon vendoring(group 1 — 本次用自繪原創 line-art,故無第三方 attribution)。
>
> **本次擴充(2026-06-06)——修正後端合約並補新需求**:後端只在 pod 發 typed `data.owner`、不發 controller 節點/邊 → normalize 自 owner 合成 controller 節點與 `controller-owns-pod` 邊(group 9);layout 切換鈕移至 legend 最上方分段控制 + controller 模式預設聚合摺疊(group 8);controller 模式 K8s node 併入 switch fabric 分層、`node-to-switch` 比照 `switch-to-switch`(group 10 + 2.7 + 4.5)。controller 拓樸(group 5 / 6 / 7.2 / 7.4 / 8 / 9 / 10)為本次主要實作目標。
>
> **已實作(2026-06-06,branch `feat/dynamic-layout`,commits `30104f8..bc7dea8`)**:group 2.1 / 2.4 / 2.6 / 2.7 / 2.8、4.5、5、6、7.2 / 7.4、8、9、10、12.1–12.4 / 12.6 全部完成(TDD、subagent 實作 + 雙階段審查,typecheck / lint / test:ci(268) / build 全綠,`openspec validate --strict` 通過)。**未做**:group 1(icon vendoring,刻意延後)、2.5(status 邊框資料驅動,非本 feature 範圍)、demo 手動驗證(10.3 / 11.x / 12.5)。
>
> **本次精修(2026-06-07,branch `feat/dynamic-layout`)**:依使用者回饋,拓樸雙模式預設由 `node` 改為 `controller`(初次載入即全摺疊聚合);`node` 模式改為**過濾掉**合成 controller 節點與 `controller-owns-pod` 邊(乾淨 `cluster > node > pod`、不顯示 controller),`controller-owns-pod` 自此 synthesis-internal、兩模式皆不繪製(`drawnEdgeTypesForMode('node')` 移除之);預設摺疊改於初次載入觸發、ref 守衛使 data refresh 不重摺,並修正 `useExpandCollapse` 在 expand-collapse API 初始化後才套用摺疊的競態。修掉一個 `node` 模式 workload 全消失的 bug:cytoscape alias `data` 物件、expand-collapse 摺疊時就地改寫邊端點污染 `baseElements` —— `applyPodParentMode` 兩模式皆改回傳獨立淺拷貝物件(見 D13)。icon:pod 改 k8s 七邊形、statefulset 改堆疊磁碟(自繪 inline SVG)。typecheck / lint / test:ci(274) / build 全綠、`openspec validate --strict` 通過、no-backend demo(`/d/ksg-switch-demo`)實機驗證三模式切換正確。spec / design 同步:pod-parent-mode + graph-data-integration + design.md(D6 / D8 / D9 / D10 / D11 + 新增 D13)。

## 1. Icon 資產

- [x] 1.1 全套單色 outline glyph 自繪於 `ICON_SVG_BY_KIND`。**不 vendoring Argo CD**(實抓後為填色剪影 + 多色 + cronjob 壞 clip-path,與 outline 風格衝突;見 D2)→ 無第三方檔、無需 attribution。
- [x] 1.2 依使用者回饋重繪 workload controller glyph(k8s/Argo 視覺語彙):deployment=滾動更新環形箭頭、statefulset=有序分層方框、daemonset=每節點方框+基線、job=方格+勾、cronjob=時鐘;Playwright 實機驗證。

## 2. 常數與型別(單一來源 map)

- [x] 2.1 `src/shared/constants/types.ts`:`NodeKind` 新增 `deployment`/`statefulset`/`daemonset`/`job`/`cronjob`(**不含 replicaset**);`EdgeType` 新增 `controller-owns-pod`;`PodParentMode` 改為 `'node' | 'controller'`;`DrawnEdgeType` 視需要調整
- [x] 2.2 新增 `src/shared/constants/iconSvgByKind.ts`:匯出 `ICON_SVG_BY_KIND`(kind→raw SVG)與 `FALLBACK_ICON_SVG`,成為 kind 身分唯一資料源
- [x] 2.3 新增 `src/shared/constants/categoryByKind.ts`:panel-owned `kind → 超大類`(Workloads/Networking/Storage/Cluster/Other)查表,供 legend 分組
- [x] 2.4 `colorByEdgeType.ts`:加入 `controller-owns-pod` 顏色/線型;`EDGE_ENDPOINTS_BY_TYPE` 加入 `controller-owns-pod`(`controller → pod`)
- [ ] 2.5 `colorByStatus.ts`:`STATUS_BORDER_KINDS` 改為資料驅動判定(任何有 `data.status` 的 kind),或由 stylesheet 選擇器以「有 status」為條件
- [x] 2.6 `drawnEdgeTypesForMode.ts`:以 `EDGE_STYLE_BY_TYPE` master 涵蓋 8 種 EdgeType;`node` 不含 `controller-owns-pod`(synthesis-internal,兩模式皆不繪製)、`controller` 回傳含 `pod-runs-on-node`,兩者皆含 service 相關邊**與常駐的 `switch-to-switch` / `node-to-switch`(`...SWITCH_EDGES`)**;`ALL_EDGE_TYPES` = 8 種
- [x] 2.7 `colorByEdgeType.ts`:`EDGE_STYLE_BY_TYPE['node-to-switch']` 改用與 `switch-to-switch` 相同的 infra 色(移除獨立靛色 `#6366f1`),使兩者顏色/線型一致
- [x] 2.8 改寫過時 doc-comments(service-mode 語意):`colorByEdgeType.ts`(`pod-runs-on-node 僅 service 模式`、`node→switch 獨立靛色直連 uplink`)、`drawnEdgeTypesForMode.ts` header、`types.ts` 的 `PodParentMode`(`'service'` 說明)→ 改為 controller 模式語意與 `node-to-switch` 共用 infra 色 + taxi

## 3. Icon 主題上色(TDD)

- [x] 3.1 撰寫 `tintSvgToDataUri.test.ts`:`currentColor` 替換、`#`→`%23`、非 base64、`(kind,hex)` memoize 穩定性(RED)
- [x] 3.2 實作純函式 `src/shared/icon/tintSvgToDataUri.ts`(GREEN);模組層 `Map` memoize

## 4. Stylesheet icon 渲染

- [x] 4.1 `getStylesheet.ts`:leaf 節點統一 `round-rectangle`;以 `function(ele)` mapper 依 `kind` 查 `ICON_SVG_BY_KIND` + 主題色產生 `background-image` data-URI;設 `background-fit:contain`、`background-clip:none`、寬高 ~60%
- [x] 4.2 compound 容器:`node`/`controller` 為 parent 時 icon 置左上(縮小),`isCluster` 不放 icon;未知 kind 走 fallback icon
- [x] 4.3 移除 `SHAPE_BY_KIND` 的身分角色(stylesheet 不再以形狀區分 kind);更新 `getStylesheet.test.ts` snapshot
- [x] 4.4 `normalizeGraph.ts`:確認維持純 anti-corruption,不涉 icon/主題(必要時僅傳遞既有欄位)
- [x] 4.5 `getStylesheet.ts`:`node-to-switch` 加入 `taxi` 正交路由選擇器(與 `switch-to-switch` 同),修正其目前被刻意排除的 code/spec drift(baseline switch-tier-layout 已要求);更新 snapshot

## 5. 拓樸雙模式(TDD)

- [x] 5.1 改寫 `drawnEdgeTypesForMode.test.ts`:node/controller 兩模式邊集合(RED→GREEN 對應 2.6)
- [x] 5.2 改寫 `applyPodParentMode.test.ts`:node 模式過濾掉合成 controller 節點與 `controller-owns-pod` 邊、controller 單一/多 owner re-parent + 合成 `pod-runs-on-node` + 移除 `controller-owns-pod`、無 owner 不動、service 邊兩模式保留、跨 cluster `pod-calls-pod` 不受影響、不就地修改(RED)
- [x] 5.3 改寫 `applyPodParentMode.ts`:來源邊改 `controller-owns-pod`,邏輯一般化(GREEN)

## 6. Cytoscape 模式切換重建

- [x] 6.1 `useCytoscape.ts` / `useLayoutRunToken`:`podParentMode` 變動偵測沿用整批重建 + bump layout token(把 `'service'` 路徑改為 `'controller'`)
- [x] 6.2 更新 `useCytoscape.test.tsx`:controller 模式切換 → 重建 + 重新佈局 + collapse 經 `reconcileCollapse` 保留

## 7. Legend 與 Filter

- [x] 7.1 Node legend 改用主題上色 icon glyph(新增 `IconGlyph` 取代 `ShapeGlyph` 的身分角色),依 `categoryByKind` 分組;顏色不編碼大類;更新測試
- [x] 7.2 `EdgeLegend`:依 `drawnEdgeTypesForMode(mode)` 列邊(含 `controller-owns-pod`),維持 `<from> → <to>` 箭頭格式、無 nesting 文字;**移除 `mode` / `onToggleMode`(切換鈕移至 legend 最上方,見 group 8)**;更新測試
- [x] 7.3 `computeVisibility` / `useElementFilter`:`ALL_KINDS` 與預設 `visibleKinds` 改由 `ICON_SVG_BY_KIND` keys 衍生;unknown kind 仍預設可見;orphan 級聯涵蓋 controller 容器;更新 `computeVisibility.test.ts`
- [x] 7.4 `NodeContainerLegend` / `deriveNodeContainers`:容器來源隨 `podParentMode` 切換(`node`→K8s node 容器、`controller`→controller 容器),cluster 色上色,「全部摺疊」作用於當前模式容器集合,當前模式無容器時 `return null`;更新測試

## 8. Layout 切換控制(legend 最上方分段)與 controller 模式預設聚合

- [x] 8.1 新增 legend **最上方**的 layout 分段控制(`RadioButtonGroup`,`Node` / `Controller`,標籤 `Layout`);`KsgPanel` 以 local state 持有 `podParentMode`(預設 `'controller'`),分段控制即時切換;`applyPodParentMode` 串接改 `'node' | 'controller'`
- [x] 8.2 `EdgeLegend` 移除 `mode` / `onToggleMode` props(切換鈕移至上方),只負責列邊;更新測試(對應 7.2)
- [x] 8.3 controller 模式預設聚合:初次載入(controller 為預設)以及每次切入 `controller` 模式時 `KsgPanel` 將所有 controller 容器 id 併入 `collapsedIds`(每次進入皆全摺疊,ref 守衛使 data refresh 不重摺);切回 `node` 由 `reconcileCollapse` 淘汰;不影響 cluster / node 的 collapse 選擇;測試覆蓋切入/再切入/不影響他容器
- [x] 8.4 `visibleKinds` / `visibleEdgeTypes` MultiSelect 預設值涵蓋新 kind 與新 edge type

## 9. Controller 節點與 controller-owns-pod 邊合成(normalize, TDD)

- [x] 9.1 撰寫 `normalize.test.ts` 合成案例(RED):pod `data.owner` → 唯一 controller 節點(去重 `(cluster,namespace,kind,name)`)、`kind` 小寫、`parent` = cluster 容器、`label` = ownerName;每 pod 一條 `controller-owns-pod` 邊;多 pod 共用一節點;不同 namespace 同名不混用;無 owner 不合成;legacy `labels.owner_kind` / `owner_name` fallback;純函式 / 確定性 / 不就地修改
- [x] 9.2 實作 `normalize.ts` 合成邏輯(GREEN);裸 ReplicaSet 等未知 kind 走 fallback icon、預設可見、不報錯
- [x] 9.3 確認下游 `applyPodParentMode` / legend / filter 無需改動即可消費合成的 controller 節點與 owns 邊(以既有測試 + 合成 fixture 驗證)

## 10. controller 模式 K8s node 併入 switch fabric 分層

- [x] 10.1 `switch-topology`:在 `controller` 模式且有 levelled switch 時,將「為某 `node-to-switch` 邊 source」的 K8s `node` 以 `level = min(switchLevel) − 1` 併入 `levelById`,沿用 `buildSwitchConstraints` pin 成 fabric 正上方一排(x 比照 switch);`node` 模式或無 fabric 不釘 K8s node。測試(RED→GREEN):controller 模式 node 釘 `min−1`、node 模式不釘、無 `node-to-switch` 邊不釘、無 fabric null、僅 fcose
- [x] 10.2 `GraphCanvas.tsx`:把 `buildSwitchConstraints(readSwitchLevels(elements))` 改為 mode-aware(吃 `podParentMode`);更新測試
- [ ] 10.3 本機 demo 驗證 `pod → node → switch → switch` 垂直分層與 `node-to-switch` 正交 uplink

## 11. Demo 與後端契約

- [ ] 11.1 確認 demo seeder 的 pod 帶 `data.owner`(後端 seed 已具);controller 與 owns 邊由 panel 合成即可可視驗證
- [ ] 11.2 補帶 `labels.level` 的 switch fabric fixture,以驗證 controller 模式 K8s node 分層與 `node-to-switch` 路由
- [x] 11.3 確認 panel 對後端未送的 standalone workload `data.type` 節點 / 任何未知 kind / edge 優雅 fallback、不報錯

## 12. 驗證

- [x] 12.1 `npm run typecheck` 通過
- [x] 12.2 `npm run lint`(零警告)通過
- [x] 12.3 `npm run test:ci` 全綠
- [x] 12.4 `npm run build` 成功;確認 vendored SVG 在 sign 前 bundle 完成、plugin-validator 不拒
- [ ] 12.5 本機 demo 手動驗證:icon 隨 light/dark 主題上色、node⇄controller 切換巢狀正確、controller 模式預設聚合摺疊、controller-owns-pod / pod-runs-on-node 依模式繪製、K8s node fabric 分層 + `node-to-switch` 與 `switch-to-switch` 視覺一致、legend(含最上方 layout 分段控制與 NodeContainerLegend 容器來源)正確
- [x] 12.6 `openspec validate icon-encoding-workload-topology --strict` 通過

## 13. StorageClass compound 容器 + demo(2026-06-07 擴充)

> 後端(latest / v0.0.21,commit `e092ce6`)以 `kube_persistentvolumeclaim_info` 的 `storageclass` label 合成 `type:"storageclass"` 群組節點、巢狀 `cluster > storageclass > pvc`。panel 比照 cluster 以**旗標**處理(無 `kind`、永不畫 icon),新增獨立「Storage classes」legend 區段。見 D14。本次併入本 change(storageclass 由原「out of scope」改為「in scope — 僅 compound GROUP 容器」)。

- [x] 13.1 `cytoscape.d.ts`:`NodeDataDefinition` 加 `isStorageClass?: boolean`
- [x] 13.2 `normalize.ts`:新增 `resolveNodeIdentity` 對 `type === 'storageclass'` 標 `isStorageClass`、不給 `kind` / `status` / `alerts`、`parent` 穿透(TDD:`normalize.test.ts` RED→GREEN)
- [x] 13.3 `getStylesheet.ts`:`node[?isStorageClass]` 強制 `background-image:'none'`(展開+收合),底色 / 邊框 / label 取父 cluster accent;更新 snapshot + 加 headless 行為測試
- [x] 13.4 新增純函式 `deriveStorageClassContainers.ts`(name 去重 + 父 cluster 上色 + 全部 id)(TDD)
- [x] 13.5 新增 `StorageClassLegend` 元件(`SwatchLegend` 包裝,獨立 testId)+ barrel 匯出(TDD)
- [x] 13.6 `KsgPanel.tsx`:串接 derivation + `useCollapseGroup` +「Storage classes」區段(NodeContainerLegend 後、NodeLegend 前);`resolveSelectedNode` 排除 `isStorageClass`;更新 `KsgPanel.test.tsx` + `resolveSelectedNode.test.ts`
- [x] 13.7 Backend demo:`dev/victoriametrics/topology.prom` 加 3 條 `kube_persistentvolumeclaim_info{…storageclass="fast-ssd"}` + 更新檔頭計數;`docker compose up -d --force-recreate kube-state-graph` 重建至新 `latest`(v0.0.21);後端 `/v1/graph` 確認 synthesise `prod/storageclass/fast-ssd`(20 nodes / 13 edges)
- [x] 13.8 Showcase:`ksg-switch-demo.json` 加 `prod/storageclass/fast-ssd` 群組節點 + 3 PVC re-parent(node 腳本:計數斷言 + JSON 驗證)
- [x] 13.9 驗證:typecheck / lint(零警告) / test:ci(287) / build 全綠;Playwright 雙 demo 實機截圖確認 `fast-ssd` 容器巢狀於 prod、PVC 在內、無 icon、「Storage classes」legend 區段出現於兩模式、未漏進 Node kinds
- [x] 13.10 hover context(使用者回饋「currently only names too simple」,選 Option 2 = 維持無 kind):`useHoverElement` 自 cy parent/children 合成 storageclass 的 `kind: storageclass` + cluster + 群組 PVC 清單(排序),`HoverTooltip` 顯示(長清單 `wrap` 換行);不寫回 node data。TDD(useHoverElement.test.tsx + HoverTooltip.test.tsx),test:ci(289) 全綠,Playwright 實機確認 tooltip 顯示 `fast-ssd / kind:storageclass / cluster:prod / PVCs (3):…`
- [x] 13.11 收合 icon(使用者回饋「收合的時候需要有一個圖案」):新增 `STORAGECLASS_ICON_SVG`(三層磁碟堆疊 glyph)+ 收合態選擇器,僅在收合時畫該 glyph(展開仍無 icon)——比照 K8s node 容器。**(13.12 取代:後續確認後改晉升為真 NodeKind,glyph 移入 `ICON_SVG_BY_KIND`、移除專屬選擇器。)**
- [x] 13.12b storageclass glyph 整形(使用者「圓柱體不整齊」):由 3 段不相連圓盤改為單一連續圓柱 + 2 條內部分層弧線(database 形)。glyph-only(`iconSvgByKind.ts`),無 spec/測試影響。
- [x] 13.12c 服務邊改色(使用者「svc to pod edge 跟 status 搞混」):由綠 `#10b981` 改為靛 `#6366f1`(避開 status 綠/黃/紅)。**(13.12d 取代:再統一為 pod-calls-pod 橘。)**
- [x] 13.12d 服務邊統一為 pod-to-pod + 自圖例省略(使用者「pod↔svc 本質仍是 pod-to-pod、只多一層;移掉 pod↔svc legend、edge 色改與 pod-to-pod 相同」):`pod-calls-service` / `service-selects-pod` 改用與 `pod-calls-pod` 相同的橘 `#f97316`;`EdgeLegend` 由「合併為 `pod ↔ svc` 雙向列」改為**完全省略**該對(`SVC_OMITTED_FROM_LEGEND`);順手移除 `EdgeGlyph` 已無人使用的 `bidirectional` prop(原僅供合併列)+ 其測試。改寫 EdgeLegend.test / EdgeGlyph.test;colorByEdgeType.test 改為斷言服務對 == pod-calls-pod 色。panel-rendering spec「邊顏色」requirement + Edge legend scenario(改用 pod-calls-pod 為例 + 新增「服務邊省略」scenario)同步。test:ci(299) / lint / typecheck / build 全綠;Playwright 實機確認服務邊與 pod-calls-pod 同為橘、edge legend 只剩 `pod→pvc` / `pod→pod`(無 svc 列)。
- [x] 13.12 **最終收斂——storageclass 晉升為真 `NodeKind`、Node-kinds 圖例 collapse-aware**(使用者回饋「node kind 需要在 sc 收合的時候顯示 storageclass,可以取代 pvc」)。改動:`types.ts` `NodeKind` += `storageclass`;glyph 移入 `ICON_SVG_BY_KIND`(移除 standalone export 與 getStylesheet 內所有 `node[?isStorageClass]` 選擇器——改走 base `node` + `node:parent`,與 K8s node 容器同路徑);`categoryByKind` += `storageclass: 'Storage'`;`normalize` 改賦 `{kind:'storageclass', isStorageClass}`(仍無 status/alerts)。新增純函式 `deriveLegendKinds(elements, collapsedIds)` 取代 `presentKinds` + `deriveContainers.showNodeKindIcon`:Node-kinds 圖例只列「以 glyph 呈現」者(drawn leaf + 收合容器;展開容器 + 被收合祖先隱藏的子節點不列)→ 收合 SC 時 storageclass 取代 pvc(node⇄pod、controller⇄pod 同理)。順帶套用審查 5 findings:#1 childless-guard(deriveStorageClassContainers 跳過無子 SC)、#3 抽出 `clusterColorIndex.buildClusterColorIndex` 供 deriveContainers + deriveStorageClassContainers 共用、#4 `StorageClassDerivation` 欄位改名 `containerEntries/containerIds` 對齊 sibling、#2(weak/medium fallback)因 storageclass 改走 `node:parent` 而自動與 node 一致、#5 無 drift。TDD:新增 `deriveLegendKinds.test.ts`、改寫 `deriveNodeContainers.test.ts`(移除 showNodeKindIcon)/`deriveStorageClassContainers.test.ts`/`normalize.test.ts`/`getStylesheet.test.ts`(+snapshot);test:ci(296) / lint / typecheck / build 全綠;Playwright 實機確認展開→Node-kinds 顯示 pvc、收合→顯示 storageclass(取代 pvc)且收合盒有磁碟 glyph

## 14. Demo 回饋擴充(2026-06-08)——SC 預設收合 + 收合 controller severity tint

> 本機 demo 回饋三項:(1) warning PVC 點開無細節 → demo 資料缺口,補 backing alert;(2) storageclass compound 應預設收合;(3) 收合的 controller 矩形應顯示其子 pod 的最差 alert severity。(1) 純 demo fixture;(2)/(3) 為行為新增,spec 併入本 change(controller / collapse / storageclass 皆屬本 change)。

- [x] 14.1 (#1 demo)`provisioning/dashboards/ksg-switch-demo.json`:`pvc/data-mongo-2`(warning)補 `VolumeNearFull`(severity warning、`time_records` 兩筆)backing alert,使點開顯示實際列;Grafana restart 重新 provision 驗證。
- [x] 14.2 (#2 SC 預設收合,TDD)`KsgPanel.tsx`:新增 ref 守衛、**mode-independent** effect,首次出現 storageclass 時把 `storageClassIds` 併入 `collapsedIds`(一次性,user-expanded 經 data refresh 保持)。改寫 `KsgPanel.test.tsx` storageclass 測試為「預設收合 + 切換鈕改為展開」。
- [x] 14.3 (#3 normalize 彙整,TDD)`normalize.ts`:`PendingOwned` 加 `podWorstRank`(`worstAlertRank(alerts)`,severityRank crit>warn>info、未知→crit);合成前 pre-pass 彙整每 controller 最差 rank,寫入 `data.worstAlertSeverity`(無則省略)。`cytoscape.d.ts` 加 `worstAlertSeverity?: AlertSeverity`。`normalize.test.ts` 新增 4 案例。
- [x] 14.4 (#3 stylesheet,TDD)`getStylesheet.ts`:`collapsedControllerSeveritySelectors`(`node[?isController][worstAlertSeverity="<sev>"].cy-expand-collapse-collapsed-node` × 3),spread 於 base collapsed-node 規則後、statusSelectors 前。`getStylesheet.test.ts` 加結構 + headless 行為測試(收合才上色、展開中性);更新 snapshot。
- [x] 14.5 驗證:typecheck / lint(零警告) / test:ci(313) / build 全綠;`openspec validate icon-encoding-workload-topology --strict` 通過;Grafana restart 後 demo 服務帶新 PVC alert。
- [x] 14.6 本機 demo 手動驗證:warning PVC 點開顯示 `VolumeNearFull` 列;storageclass 預設收合;收合 controller 邊框依最差子 pod severity 上色(critical 紅 / 展開回中性)。
- [x] 14.7 (#4 info 改綠,使用者「收合 controller 傳給邊框的色、以及所有 info 都應是綠色」,TDD)`colorBySeverity.ts`:`SEVERITY_COLOR.info` 由藍 `#5794F2` 改為健康綠 `#73BF69`(刻意與 `STATUS_COLOR.normal` 同值——info 為 benign tier,讀作「無大礙」)。因 `SEVERITY_COLOR` 為單一真相源,alert 表徽章與**收合 controller 邊框**(getStylesheet)同步改綠;warning 黃 / critical 紅不變。`colorBySeverity.test.ts` 加鎖定測試(info === `#73BF69` === `STATUS_COLOR.normal`,RED→GREEN);`getStylesheet` snapshot 更新(info collapsed-controller 選擇器 border `#73BF69`);panel-rendering spec「info 藍」改「info 綠」。test:ci(314)/lint/typecheck/build 全綠;Playwright 實機(node 模式 tap `pod/mongo-2`)確認 alert 表 INFO 徽章 = `rgb(115,191,105)`(綠)、WARNING 黃 / CRITICAL 紅。

## 15. 收合上色改用 child **status**(非 alert)+ 延伸至 k8s node(2026-06-08)

> 使用者回饋:收合的 parent 應由 **child 的 `status` 欄**取最高 severity 上色(後端給所有節點 status、預設 normal);`info` 只在 alert 內、status 量尺只有 normal/warning/critical。因此(a) controller 由 alert-based 改為 status-based(supersede 14.x 的 worstAlertSeverity),(b) 同邏輯延伸到 k8s `node`,範圍 = controller + node(cluster/storageclass 不動)。資料欄 `worstAlertSeverity`(AlertSeverity)→ `worstStatus`(NodeStatus);收合框色由 `SEVERITY_COLOR` → `STATUS_COLOR`。先前 14.7 的 `SEVERITY_COLOR.info=綠` 保留(只服務 alert 表)。

- [x] 15.1 (normalize,TDD)移除 alert-rank 幫手(`SEVERITY_RANK`/`severityRank`/`rankToSeverity`/`worstAlertRank`),新增 `STATUS_RANK`(normal:0/warning:1/critical:2)+ `rankToStatus`。pre-scan raw pods → `childWorstStatusRank`(依 `parent` 彙整子 pod 最差 status rank);k8s node(`type==='node'`)寫 `worstStatus = rankToStatus(max(自身 statusRank, childRank))`,僅 `> normal` 才寫(worst-wins、含自身 status)。controller:`PendingOwned.podWorstRank(alert)`→`podStatusRank(status)`,pre-pass 改彙整子 pod 最差 status。`cytoscape.d.ts` `worstAlertSeverity?:AlertSeverity` → `worstStatus?:NodeStatus`。改寫 normalize.test 4 controller 案例為 status-based(含「warning-無-alert→worstStatus」證明看 status)+ 新增 5 個 k8s node 案例。
- [x] 15.2 (getStylesheet,TDD)`collapsedControllerSeveritySelectors`(SEVERITY_COLOR/`?isController`)→ `collapsedContainerStatusSelectors`(STATUS_COLOR/`node[worstStatus="<s>"].cy-expand-collapse-collapsed-node`);**移到 `statusSelectors` 之後**(收合 k8s node 才能覆寫自身 status 框)。移除 `SEVERITY_COLOR` import。改寫結構斷言(選擇器在 statusSelectors 之後)+ controller/node headless 行為測試 + 更新 snapshot(worstStatus×3 = STATUS_COLOR)。
- [x] 15.3 spec:graph-data-integration 彙整 requirement 由 alert/worstAlertSeverity 改寫為 status/worstStatus + controller&node 通用 + worst-wins;對應 scenario 改 status-based + 加 node 場景。panel-rendering「收合 controller…SEVERITY_COLOR」requirement 改寫為「收合容器(controller / k8s node)…STATUS_COLOR」+ 收合 node 覆寫自身 status 框場景。
- [x] 15.4 驗證:typecheck / lint(零警告)/ test:ci(320)/ build 全綠;`openspec validate --strict` 通過。
- [x] 15.5 本機 demo 手動驗證(Playwright,實機讀 cy 渲染 border-color):**controller 模式**——`mongodb` worstStatus=critical→邊框 `rgb(224,47,68)` 紅、`nats` worstStatus=warning→`rgb(242,204,12)` 黃(原本中性,破綻已修)、`gateway`/`consumer` 無 worstStatus→中性 `rgb(204,204,220)`;**node 模式**——`worker-0`(自身 normal、藏 critical mongo-2)worstStatus=critical,收合後 border 紅;截圖另見 `worker-1`(自身 warning)黃、`worker-2`(藏 warning nats-2)黃,全部收合 node 皆反映所藏最差 status。

## 16. Legend 區段重排 + 標題 Title Case(2026-06-08)

> 使用者回饋:(a) 把 Clusters / Nodes|Controllers / Storage Classes 三個 swatch 區段移到 **Status 之後**(legend 底部),Layout 切換鈕留在頂端;(b) 所有區段標題改 Title Case。

- [x] 16.1 (TDD)`KsgPanel.tsx`:legend JSX 重排為 `LayoutModeControl → NodeLegend → EdgeLegend → StatusLegend → ClusterLegend → NodeContainerLegend → StorageClassLegend`(swatch 三段移到 Status 之後);更新 legendArea 排序註解。`NodeLegend.tsx`「Node kinds」→「Node Kinds」、`EdgeLegend.tsx`「Edge types」→「Edge Types」(其餘標題已 Title Case)。
- [x] 16.2 (TDD)新增測試:`NodeLegend.test`/`EdgeLegend.test` 各加 Title-Case heading 斷言;`KsgPanel.test` 加區段順序斷言(swatch 區段於 Status 之後、Node Kinds<Edge Types<Status)。先 RED(3 fail)後 GREEN。
- [x] 16.3 spec:panel-rendering 圖例 requirement 補「區段垂直順序」與「標題 Title Case」一句;collapse-aware requirement 內引號顯示名同步(`Node kinds`→`Node Kinds`、`Storage classes`→`Storage Classes`)。
- [x] 16.4 驗證:typecheck / lint / test:ci / build 全綠;`openspec validate --strict` 通過;Grafana 實機截圖確認新順序 + Title Case。
