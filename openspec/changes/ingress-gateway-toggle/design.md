# Design: ingress-gateway-toggle

## Context

`computeVisibility(elements, visibleKinds, visibleEdgeTypes)` 是可見性的唯一計算點(`KsgPanel.tsx` 僅一個 production call site),內含三段:node pass(kind 過濾)→ edge pass(兩端點皆可見且 edgeType 允許)→ `hideOrphans` 固定點級聯(無可見 edge 且無可見 child 的節點連同其 edge 移除,遞迴清空 compound)。Legend 的眼睛切換經 `handleToggleKind` 寫入持久化 panel option `visibleKinds`。

Ingress 節點目前無現成標記:`kind` 一律為 `service`/`pod` 等,但後端資料保證 ingress gateway 相關節點帶 label `role: "ingress-gateway"`,且 `normalize.ts` 原封保留 `labels`、view-transform pipeline(`applyPodParentMode` 等)以 `{ ...data }` 複製帶過,`cytoscape.d.ts` 已宣告 `labels?: Record<string, string>` — 資料層零修改。

`service-selects-pod` edge 方向為 service → pod(source = service, target = pod)。

## Goals / Non-Goals

**Goals:**

- 一鍵讓「經 ingress 的路徑」徹底消失:隱藏 ingress service 時,其 select 的 pods 一併隱藏,否則會殘留 `ingressPod → backendSvc` 段(orphan 級聯不會移除仍有可見 edge 的節點)。
- 沿用既有機制:edge 自動隱藏與 compound 清空交給 edge pass + `hideOrphans`,不新增級聯邏輯。
- 預設 `true`(全顯示)下零行為變化、零既有測試改動。

**Non-Goals:**

- 不做 ingress 路徑的「摺疊改連」(把 `pod → ingressSvc → … → backendSvc` 改繪成一條合成 edge)— 直連 edge 本來就存在,隱藏即可。
- 不辨識多種 ingress 實作(label key/value 為固定常數,不做 panel option 化的 pattern 設定)。
- 不改後端、不改 demo seeder fixture。

## Decisions

1. **`computeVisibility` 第 4 個可選位置參數 `showIngress = true`**,而非 options object。僅 1 個 production call site、15 個既有測試呼叫;預設值讓全部既有呼叫不動。options object 是對單一 boolean 的過度設計。
2. **Ingress id 集合推導為 module-private 純函式 `collectIngressHiddenIds(elements)`**,與 `hideOrphans` 同慣例(private、經 public API 測試)。兩個 pass:(a) `labels[INGRESS_LABEL_KEY] === INGRESS_LABEL_VALUE` 的節點(不限 kind);(b) `service-selects-pod` 且 source ∈ 集合 → 加入 target(單層,不做傳遞閉包)。`showIngress === false` 時 node pass 跳過集合內 id;其餘交給既有 pass。
3. **Legend UI 為獨立 `IngressToggle` 元件,不塞進 `NodeLegend`**。NodeLegend row 嚴格以 kind 為 key(icon 來自 `ICON_SVG_BY_KIND`、分組走 `categoryForKind`、切換受 `isFilterableKind` 保護並寫入 `visibleKinds` 陣列)— 合成 label-based row 會破壞全部三個契約。Legend 區為 sibling section 疊放(`& > div + div` 自動分隔線),`LayoutModeControl` 為現成先例;新 section 放在 `<NodeLegend />` 之後(同屬節點可見性控制)。
4. **持久化為 panel option `showIngress`**,比照 `visibleKinds`(dashboard-authoring 決策,非 transient view state 如 `podParentMode`):`?? defaultOptions` 向後相容讀取 + editor `addBooleanSwitch`。
5. **Label 常數置於 `src/shared/constants/ingressGateway.ts`**(`INGRESS_LABEL_KEY = 'role'`、`INGRESS_LABEL_VALUE = 'ingress-gateway'`),經 constants barrel 匯出,predicate 與測試共用(single-source-map 慣例)。
6. **Demo surface 只用 showcase inline fixture**(`ksg-switch-demo.json`),不動 backend seeder。後端對 generic pod/service labels 無 contract(`dev/victoriametrics/topology.prom` 檔頭 10–14 行載明 `kube_pod_labels` 的 app/version/role 是硬限制),seeder 端無法讓 `role=ingress-gateway` 流進 `ksg-demo`;而 inline fixture 的 labels 是手寫 JSON,已有 `role:"edge"`/`role:"primary"` 前例。若也在 seeder 加同構拓撲,`ksg-demo` 會多一條「關不掉」的 ingress 路徑,反而誤導。雙路徑掛在既有節點上:直連 `pod/gateway → service/mongo-svc`(`e-svc-0`)本已存在,只新增 ingress 分支(`prod/app/ingress` app + controller + `service/ingress-svc` 帶 label + `pod/ingress-0` 不帶 label——後者驗證 select-expansion 而非 label 命中)。

## Risks / Trade-offs

- [被 select 的 pod 同時服務其他 service 時會一併被隱藏] → 接受:ingress gateway pod 依定義專屬 ingress;若未來出現共用情境再改為只隱藏「僅剩 ingress edge」的 pod。
- [backend seeder(`ksg-demo`)無法帶 `role=ingress-gateway` label——後端無 generic labels contract] → 隱藏語意以 `computeVisibility` 單元測試完整覆蓋;端到端目測改由 showcase inline fixture(`ksg-switch-demo`)的 ingress 雙路徑承擔(決策 6),`ksg-demo` 僅驗證 toggle UI 與 option 持久化。
- [label key/value 寫死] → 是刻意的最小修改;若後端命名改變,單一常數檔一處修改。
