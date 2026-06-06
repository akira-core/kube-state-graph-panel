> **實作進度（2026-06-04）**：已完成並經 demo 實機驗證 —
> (a) icon 編碼層(常數/tint/stylesheet/legend/filter);
> (b) **canvas icon 渲染修正**：依 cytoscape 官方 docs,SVG 加 `<?xml?>` header + 用 `encodeURIComponent`(非 base64),icon 才會畫在 canvas 上(缺 header 時 legend `<img>` 顯示但 canvas 空白);icon 以 `text.primary` 上色、`background-fit:none`+60% inset;
> (c) **移除 `others`**(後端已自契約移除);
> (d) **v0.0.18 `switch` 支援**：NodeKind `switch` + EdgeType `switch-to-switch`/`node-to-switch`(兩模式皆畫)、icon、legend、endpoints;
> (e) **cluster palette 改全冷色**,避開 status 綠/黃/紅;
> (f) **動態 legend**：NodeLegend/EdgeLegend 只列出圖中出現的 kind/edge(比照 ClusterLegend)。
> typecheck + 179 測試 + lint(零警告) + build 全綠。
> **未做**(刻意延後)：controller 拓樸關係(group 5、6、2.4、2.6、8.1、7.2 的 controller-owns-pod 部分)、status 邊框資料驅動(2.5,仍 pod/node/pvc)、Argo CD icon vendoring(group 1 — 本次用自繪原創 line-art,故無第三方 attribution)。

## 1. Icon 資產與授權

- [ ] 1.1 從 Argo CD (`ui/src/assets/images/resources/`) vendoring 所需 kind 的單色 resource SVG(pod/node/pvc/service/deployment/statefulset/daemonset/job/cronjob + 通用 fallback;**無 replicaset**),sanitize(去 `<script>`/外部 ref),統一 `viewBox="0 0 24 24"`,缺的自畫
- [ ] 1.2 將每個 SVG 的單色 fill 改為 `currentColor` sentinel,放入 `src/`(供 raw text 匯入)
- [ ] 1.3 新增 `docs/THIRD_PARTY.md`,記載「Argo CD resource icons, Apache-2.0」attribution

## 2. 常數與型別(單一來源 map)

- [ ] 2.1 `src/shared/constants/types.ts`:`NodeKind` 新增 `deployment`/`statefulset`/`daemonset`/`job`/`cronjob`(**不含 replicaset**);`EdgeType` 新增 `controller-owns-pod`;`PodParentMode` 改為 `'node' | 'controller'`;`DrawnEdgeType` 視需要調整
- [x] 2.2 新增 `src/shared/constants/iconSvgByKind.ts`:匯出 `ICON_SVG_BY_KIND`(kind→raw SVG)與 `FALLBACK_ICON_SVG`,成為 kind 身分唯一資料源
- [x] 2.3 新增 `src/shared/constants/categoryByKind.ts`:panel-owned `kind → 超大類`(Workloads/Networking/Storage/Cluster/Other)查表,供 legend 分組
- [ ] 2.4 `colorByEdgeType.ts`:加入 `controller-owns-pod` 顏色/線型;`EDGE_ENDPOINTS_BY_TYPE` 加入 `controller-owns-pod`(`controller → pod`)
- [ ] 2.5 `colorByStatus.ts`:`STATUS_BORDER_KINDS` 改為資料驅動判定(任何有 `data.status` 的 kind),或由 stylesheet 選擇器以「有 status」為條件
- [ ] 2.6 `drawnEdgeTypesForMode.ts`:以 `EDGE_STYLE_BY_TYPE` master 涵蓋 6 種 EdgeType;`node` 回傳含 `controller-owns-pod`、`controller` 回傳含 `pod-runs-on-node`,兩者皆含 service 相關邊;`ALL_EDGE_TYPES` = 6 種

## 3. Icon 主題上色(TDD)

- [x] 3.1 撰寫 `tintSvgToDataUri.test.ts`:`currentColor` 替換、`#`→`%23`、非 base64、`(kind,hex)` memoize 穩定性(RED)
- [x] 3.2 實作純函式 `src/shared/icon/tintSvgToDataUri.ts`(GREEN);模組層 `Map` memoize

## 4. Stylesheet icon 渲染

- [x] 4.1 `getStylesheet.ts`:leaf 節點統一 `round-rectangle`;以 `function(ele)` mapper 依 `kind` 查 `ICON_SVG_BY_KIND` + 主題色產生 `background-image` data-URI;設 `background-fit:contain`、`background-clip:none`、寬高 ~60%
- [x] 4.2 compound 容器:`node`/`controller` 為 parent 時 icon 置左上(縮小),`isCluster` 不放 icon;未知 kind 走 fallback icon
- [x] 4.3 移除 `SHAPE_BY_KIND` 的身分角色(stylesheet 不再以形狀區分 kind);更新 `getStylesheet.test.ts` snapshot
- [x] 4.4 `normalizeGraph.ts`:確認維持純 anti-corruption,不涉 icon/主題(必要時僅傳遞既有欄位)

## 5. 拓樸雙模式(TDD)

- [ ] 5.1 改寫 `drawnEdgeTypesForMode.test.ts`:node/controller 兩模式邊集合(RED→GREEN 對應 2.6)
- [ ] 5.2 改寫 `applyPodParentMode.test.ts`:node passthrough、controller 單一/多 owner re-parent + 合成 `pod-runs-on-node` + 移除 `controller-owns-pod`、無 owner 不動、service 邊兩模式保留、跨 cluster `pod-calls-pod` 不受影響、不就地修改(RED)
- [ ] 5.3 改寫 `applyPodParentMode.ts`:來源邊改 `controller-owns-pod`,邏輯一般化(GREEN)

## 6. Cytoscape 模式切換重建

- [ ] 6.1 `useCytoscape.ts` / `useLayoutRunToken`:`podParentMode` 變動偵測沿用整批重建 + bump layout token(把 `'service'` 路徑改為 `'controller'`)
- [ ] 6.2 更新 `useCytoscape.test.tsx`:controller 模式切換 → 重建 + 重新佈局 + collapse 經 `reconcileCollapse` 保留

## 7. Legend 與 Filter

- [x] 7.1 Node legend 改用主題上色 icon glyph(新增 `IconGlyph` 取代 `ShapeGlyph` 的身分角色),依 `categoryByKind` 分組;顏色不編碼大類;更新測試
- [ ] 7.2 `EdgeLegend`:依 `drawnEdgeTypesForMode(mode)` 列邊(含 `controller-owns-pod`),維持 `<from> → <to>` 箭頭格式、無 nesting 文字;更新測試
- [x] 7.3 `computeVisibility` / `useElementFilter`:`ALL_KINDS` 與預設 `visibleKinds` 改由 `ICON_SVG_BY_KIND` keys 衍生;unknown kind 仍預設可見;orphan 級聯涵蓋 controller 容器;更新 `computeVisibility.test.ts`

## 8. Panel options / 模式切換 UI

- [ ] 8.1 模式切換按鈕文案 `node ⇄ service` 改 `node ⇄ controller`;`podParentMode` local state 預設 `'node'`
- [ ] 8.2 `visibleKinds` / `visibleEdgeTypes` MultiSelect 預設值涵蓋新 kind 與新 edge type

## 9. Demo 與後端契約(gated)

- [ ] 9.1 (若後端契約就緒)demo seeder 補 workload 節點(`data.type`)與 `controller-owns-pod` 邊以可視驗證;否則記錄為待後端發送
- [ ] 9.2 確認 panel 對後端尚未發送的 workload kind / `controller-owns-pod` 邊優雅 fallback、不報錯(以缺資料情境測試或手動驗證)

## 10. 驗證

- [ ] 10.1 `npm run typecheck` 通過
- [ ] 10.2 `npm run lint`(零警告)通過
- [ ] 10.3 `npm run test:ci` 全綠
- [ ] 10.4 `npm run build` 成功;確認 vendored SVG 在 sign 前 bundle 完成、plugin-validator 不拒
- [ ] 10.5 本機 demo 手動驗證:icon 隨 light/dark 主題上色、node⇄controller 切換巢狀正確、controller-owns-pod / pod-runs-on-node 依模式繪製、legend 分組與 edge 列正確
- [ ] 10.6 `openspec validate icon-encoding-workload-topology --strict` 通過
