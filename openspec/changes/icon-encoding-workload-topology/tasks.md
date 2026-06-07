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

## 1. Icon 資產與授權

- [ ] 1.1 從 Argo CD (`ui/src/assets/images/resources/`) vendoring 所需 kind 的單色 resource SVG(pod/node/pvc/service/deployment/statefulset/daemonset/job/cronjob + 通用 fallback;**無 replicaset**),sanitize(去 `<script>`/外部 ref),統一 `viewBox="0 0 24 24"`,缺的自畫
- [ ] 1.2 將每個 SVG 的單色 fill 改為 `currentColor` sentinel,放入 `src/`(供 raw text 匯入)
- [ ] 1.3 新增 `docs/THIRD_PARTY.md`,記載「Argo CD resource icons, Apache-2.0」attribution

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
