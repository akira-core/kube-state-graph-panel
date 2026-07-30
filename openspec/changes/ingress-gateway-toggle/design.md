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
2. **Ingress id 集合推導為共用純函式 `collectIngressNodeIds(elements)`**,置於 `src/shared/graph/collectIngressNodeIds.ts`(exported,附自身單元測試)。原案為 `computeVisibility` 的 module-private helper,但決策 7 的虛線需要同一個集合,兩個 feature(`element-filter` 與 `graph-data`)共用一份推導才不會漂移 —— 故提升為 `shared/graph`。兩個 pass:(a) `labels[INGRESS_LABEL_KEY] === INGRESS_LABEL_VALUE` 的節點(不限 kind);(b) `service-selects-pod` 且 source ∈ 集合 → 加入 target(單層,不做傳遞閉包)。`showIngress === false` 時 node pass 跳過集合內 id;其餘交給既有 pass。
3. **Legend UI 為獨立 `IngressToggle` 元件,不塞進 `NodeLegend`**。NodeLegend row 嚴格以 kind 為 key(icon 來自 `ICON_SVG_BY_KIND`、分組走 `categoryForKind`、切換受 `isFilterableKind` 保護並寫入 `visibleKinds` 陣列)— 合成 label-based row 會破壞全部三個契約。Legend 區為 sibling section 疊放(`& > div + div` 自動分隔線),`LayoutModeControl` 為現成先例;新 section 放在 `<NodeLegend />` 之後(同屬節點可見性控制)。
4. **持久化為 panel option `showIngress`**,比照 `visibleKinds`(dashboard-authoring 決策,非 transient view state 如 `podParentMode`):`?? defaultOptions` 向後相容讀取 + editor `addBooleanSwitch`。
5. **Label 常數置於 `src/shared/constants/ingressGateway.ts`**(`INGRESS_LABEL_KEY = 'role'`、`INGRESS_LABEL_VALUE = 'ingress-gateway'`),經 constants barrel 匯出,predicate 與測試共用(single-source-map 慣例)。
6. **Demo surface 只用 showcase inline fixture**(`ksg-switch-demo.json`),不動 backend seeder。後端對 generic pod/service labels 無 contract(`dev/victoriametrics/topology.prom` 檔頭 10–14 行載明 `kube_pod_labels` 的 app/version/role 是硬限制),seeder 端無法讓 `role=ingress-gateway` 流進 `ksg-demo`;而 inline fixture 的 labels 是手寫 JSON,已有 `role:"edge"`/`role:"primary"` 前例。若也在 seeder 加同構拓撲,`ksg-demo` 會多一條「關不掉」的 ingress 路徑,反而誤導。雙路徑掛在既有節點上:直連 `pod/gateway → service/mongo-svc`(`e-svc-0`)本已存在,只新增 ingress 分支(`prod/app/ingress` app + controller + `service/ingress-svc` 帶 label + `pod/ingress-0` 不帶 label——後者驗證 select-expansion 而非 label 命中)。

7. **虛線標記 `data.ingressPath` 限「流量」edge,判準收在資料層。** toggle 開著時要看得出「這條路徑繞了 gateway」,故 `normalizeGraph` 後置 pass `markIngressEdges` 對符合條件的 edge clone 出 `ingressPath: true`,stylesheet 以 `edge[?ingressPath]` 只覆寫 `line-style`(顏色/箭頭/routing 不動,`line-dash-pattern: [8, 8]` 加寬預設 6/3 以在縮放後仍讀得出)。判準為「端點 ∈ ingress 集合 **且** edge type 屬流量」:初版只判端點,導致 ingress pod 的 `pod-to-node`(藍)與 `pod-mounts-pvc`(紫)也被畫成虛線 —— 那是放置與掛載關係,虛線在那裡等於斷言一個不存在的流量繞行。流量集合為 `colorByEdgeType.ts` 內第三個 exhaustive `Record<EdgeType, boolean>`(`EDGE_IS_TRAFFIC_BY_TYPE`)+ 安全讀取 `isTrafficEdgeType`,與 `EDGE_ENDPOINTS_BY_TYPE` 同檔同慣例:新 edge type 缺 key 直接 TS 報錯,不會靜默選邊。
   - 收在**資料層**而非把選擇器縮成 `edge[?ingressPath][edgeType='…']`(比照 `taxiEdgeSelector` 從 map 衍生):flag 名稱就該等於語意,樣式層過濾只是把誤導往下游推;「碰到 ingress 節點」的資訊沒真的丟,`collectIngressNodeIds` 是 exported 純函式,要用隨時重算。
   - 未知 edge type `?? false`(不虛線),**刻意不同於** filter 的 unknown-visible 慣例:後者防的是「後端新增靜默消失」,而少一條裝飾不會讓任何東西消失;裝飾類斷言該保守。
   - `data.ingressPath` 不改名為 `ingressTrafficPath`:名字本來就是照「流量路徑」取的,是判準以前太寬。

## Risks / Trade-offs

- [被 select 的 pod 同時服務其他 service 時會一併被隱藏] → 接受:ingress gateway pod 依定義專屬 ingress;若未來出現共用情境再改為只隱藏「僅剩 ingress edge」的 pod。
- [backend seeder(`ksg-demo`)無法帶 `role=ingress-gateway` label——後端無 generic labels contract] → 隱藏語意以 `computeVisibility` 單元測試完整覆蓋;端到端目測改由 showcase inline fixture(`ksg-switch-demo`)的 ingress 雙路徑承擔(決策 6),`ksg-demo` 僅驗證 toggle UI 與 option 持久化。
- [label key/value 寫死] → 是刻意的最小修改;若後端命名改變,單一常數檔一處修改。
- [虛線判準仍以端點為基礎:ingress pod 任何一條**流量** edge 都會虛線,即使該呼叫與 ingress 無關] → 接受,與隱藏語意的取捨一致(ingress gateway pod 依定義專屬 ingress)。真正的路徑追蹤需要 reachability 分析,遠超本 change 範圍。
