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
   - **後續補充(code review)**:另加**第 5 個**可選參數 `ingressNodeIds`(預先算好的集合)。這不是效能微調而是**正確性**所需:panel 必須以 view transform **之前**的 `baseElements` 推導集合再傳入,否則 `node` 模式下 `applyPodParentMode` 剝除 controller / application 群組時,自 `elements` 自行推導會得到空集合 —— 已隱藏的路徑無聲重現、legend toggle 一併消失,而 `showIngress` 仍是 `false`。位置參數在此仍成立(兩個都有預設值,既有呼叫端不動);若再增第 6 個就該改 options object。
2. **Ingress id 集合推導為共用純函式 `collectIngressNodeIds(elements)`**,置於 `src/shared/graph/collectIngressNodeIds.ts`(exported,附自身單元測試)。原案為 `computeVisibility` 的 module-private helper,但決策 7 的虛線需要同一個集合,兩個 feature(`element-filter` 與 `graph-data`)共用一份推導才不會漂移 —— 故提升為 `shared/graph`。`showIngress === false` 時 node pass 跳過集合內 id;其餘交給既有 pass。
   - **後續修正(code review):推導由兩層擴為三層**。原案只有 (a) label 命中、(b) `service-selects-pod` 單層展開;實作時發現 (a) 若命中 compound(label 不限 kind,可落在 controller / application 群組上),其子孫完全沒被納入 —— `markIngressEdges` 因此對群組內 pod 的流量 edge **不畫虛線**,但 `computeVisibility` 卻(經自身的子孫展開)把它們**藏得掉**,正是「共用一份推導」要防的漂移。現為:(1) **LABELLED** 命中節點(權威);(2) **NESTED** 沿 `data.parent` 遞迴的全部子孫;(3) **SELECTED** 由前兩層的 service 沿 `service-selects-pod` 單層展開(不做傳遞閉包)。第 (2) 層置於 (3) 之前,使群組內的 service 也能作為展開起點。
   - **子孫展開在兩處各做一次,且這是刻意的**:`collectIngressNodeIds` 依它收到的 elements(panel 傳 `baseElements` → 後端階層)展開,`computeVisibility` 再依當前 `elements`(view 階層)展開一次。兩者巢狀關係**不同**(後端把 pod 掛在 controller 下,`node` 模式把 pod 掛在 K8s node 下),唯有各展開一次,「labelled 容器隱藏它在畫面上所含之物」才成立。共用索引建構收在 `src/shared/graph/childrenByParent.ts`(`buildChildrenByParent` / `collectDescendantIds`),`hideOrphans` 也改用同一份索引。
3. **Legend UI 為獨立 `IngressToggle` 元件,不塞進 `NodeLegend`**。NodeLegend row 嚴格以 kind 為 key(icon 來自 `ICON_SVG_BY_KIND`、分組走 `categoryForKind`、切換受 `isFilterableKind` 保護並寫入 `visibleKinds` 陣列)— 合成 label-based row 會破壞全部三個契約。Legend 區為 sibling section 疊放(`& > div + div` 自動分隔線),`LayoutModeControl` 為現成先例;新 section 放在 `<NodeLegend />` 之後(同屬節點可見性控制)。
   - **後續補充(code review)**:(a) 該區段 **presence-gated** —— 集合為空時不渲染,與其餘 legend 區段「無內容則 `return null`」一致。後端無 generic labels contract,`/d/ksg-demo` 永遠不含該 label,無條件渲染等於給使用者一顆按了畫面毫無變化、卻仍把 `showIngress:false` 寫進 dashboard JSON 的死按鈕。(b) 區段內**附一條虛線 `EdgeGlyph` 樣本**:`EdgeLegend` 刻意省略服務型別列且樣本一律實線,畫布上的虛線原本在 legend 中無任何對應說明。顏色/dash 取自與 stylesheet 同源的 `INGRESS_DASH_COLOR` / `INGRESS_DASH_PATTERN`;顏色**不可**用 fallback 灰 —— 唯一可能虛線的是「流量」型別(共用同一橘),灰恰是保證永不虛線的未知型別之色。(c) 因插入既有 `MUST` 順序列舉之中,補 `panel-rendering` MODIFIED delta(見 proposal.md)。
4. **持久化為 panel option `showIngress`**,比照 `visibleKinds`(dashboard-authoring 決策,非 transient view state 如 `podParentMode`):`?? defaultOptions` 向後相容讀取 + editor `addBooleanSwitch`。
5. **Label 常數置於 `src/shared/constants/ingressGateway.ts`**(`INGRESS_LABEL_KEY = 'role'`、`INGRESS_LABEL_VALUE = 'ingress-gateway'`),經 constants barrel 匯出,predicate 與測試共用(single-source-map 慣例)。
6. **Demo surface 只用 showcase inline fixture**(`ksg-switch-demo.json`),不動 backend seeder。後端對 generic pod/service labels 無 contract(`dev/victoriametrics/topology.prom` 檔頭 10–14 行載明 `kube_pod_labels` 的 app/version/role 是硬限制),seeder 端無法讓 `role=ingress-gateway` 流進 `ksg-demo`;而 inline fixture 的 labels 是手寫 JSON,已有 `role:"edge"`/`role:"primary"` 前例。若也在 seeder 加同構拓撲,`ksg-demo` 會多一條「關不掉」的 ingress 路徑,反而誤導。雙路徑掛在既有節點上:直連 `pod/gateway → service/mongo-svc`(`e-svc-0`)本已存在,只新增 ingress 分支(`prod/app/ingress` app + controller + `service/ingress-svc` 帶 label + `pod/ingress-0` 不帶 label——後者驗證 select-expansion 而非 label 命中)。

7. **虛線標記 `data.ingressPath` 限「流量」edge,判準收在資料層。** toggle 開著時要看得出「這條路徑繞了 gateway」,故 `normalizeGraph` 後置 pass `markIngressEdges` 對符合條件的 edge clone 出 `ingressPath: true`,stylesheet 以 `edge[?ingressPath]` 只覆寫 `line-style`(顏色/箭頭/routing 不動,`line-dash-pattern: [8, 8]` 加寬預設 6/3 以在縮放後仍讀得出)。判準為「端點 ∈ ingress 集合 **且** edge type 屬流量」:初版只判端點,導致 ingress pod 的 `pod-to-node`(藍)與 `pod-mounts-pvc`(紫)也被畫成虛線 —— 那是放置與掛載關係,虛線在那裡等於斷言一個不存在的流量繞行。流量集合為 `colorByEdgeType.ts` 內第三個 exhaustive `Record<EdgeType, boolean>`(`EDGE_IS_TRAFFIC_BY_TYPE`)+ 安全讀取 `isTrafficEdgeType`,與 `EDGE_ENDPOINTS_BY_TYPE` 同檔同慣例:新 edge type 缺 key 直接 TS 報錯,不會靜默選邊。
   - 收在**資料層**而非把選擇器縮成 `edge[?ingressPath][edgeType='…']`(比照 `taxiEdgeSelector` 從 map 衍生):flag 名稱就該等於語意,樣式層過濾只是把誤導往下游推;「碰到 ingress 節點」的資訊沒真的丟,`collectIngressNodeIds` 是 exported 純函式,要用隨時重算。
   - 未知 edge type 視為非流量(不虛線),**刻意不同於** filter 的 unknown-visible 慣例:後者防的是「後端新增靜默消失」,而少一條裝飾不會讓任何東西消失;裝飾類斷言該保守。
     - **後續修正(code review)**:查表由 `map[type] ?? false` 改為先 `Object.hasOwn` 再讀。`data.type` 是 normalize 原樣複製、未經允許清單過濾的後端字串,直接索引時名為 `constructor` / `toString` / `valueOf` 的 type 會命中**繼承來的** `Object.prototype` 成員 —— truthy 且永不為 `undefined`,`?? false` 這道保險完全不會觸發,未知型別反而被畫成虛線。同檔的 `resolveEdgeStyle` 早已是 `Object.hasOwn`,`computeVisibility` 的 `KNOWN_EDGE_TYPES` 用 `Set` 本就免疫 —— 此處是唯一漏網的。
   - `data.ingressPath` 不改名為 `ingressTrafficPath`:名字本來就是照「流量路徑」取的,是判準以前太寬。
   - **後續補充(code review)**:dash/gap 由 stylesheet 內的字面量 `[8, 8]` 提為共用常數 `INGRESS_DASH_PATTERN`(連同 `INGRESS_DASH_COLOR`),供 canvas 規則與決策 3 的 legend 樣本共用 —— 圖例若畫成畫布上不存在的節奏或顏色,等於沒解釋。

## Risks / Trade-offs

- ~~[被 select 的 pod 同時服務其他 service 時會一併被隱藏] → 接受:ingress gateway pod 依定義專屬 ingress;若未來出現共用情境再改為只隱藏「僅剩 ingress edge」的 pod。~~
  **已於 code review 修正,不再是接受的取捨。** 一個 pod 被多個 Service 選中是尋常 K8s 拓撲,不必等「未來」:`igwSvc` 與 `appSvc` 同時 select `sharedPod` 時,關掉 toggle 會連 `appSvc → sharedPod` 這條與 gateway 無關的邊一起消失,若那是 `appSvc` 唯一的邊,orphan 級聯還會把 `appSvc` 本身也收掉;`markIngressEdges` 更會把該邊畫成虛線,斷言一個不存在的繞行。現行規則:**推論層(SELECTED)讓步,宣告層(LABELLED / NESTED)不讓步** —— 被非集合內 service 共用選取的 pod 不納入集合;但自身帶 label(或巢狀於 labelled 群組內)的 pod **仍留在集合內**,因為那是操作者的明示宣告,若也讓步,「標了 label 卻毫無作用」反而是更糟的意外。
- [backend seeder(`ksg-demo`)無法帶 `role=ingress-gateway` label——後端無 generic labels contract] → 隱藏語意以 `computeVisibility` 單元測試完整覆蓋;端到端目測改由 showcase inline fixture(`ksg-switch-demo`)的 ingress 雙路徑承擔(決策 6),`ksg-demo` 僅驗證 toggle UI 與 option 持久化。
- [label key/value 寫死] → 是刻意的最小修改;若後端命名改變,單一常數檔一處修改。
- [虛線判準仍以端點為基礎:ingress pod 任何一條**流量** edge 都會虛線,即使該呼叫與 ingress 無關] → 接受,與隱藏語意的取捨一致(ingress gateway pod 依定義專屬 ingress)。真正的路徑追蹤需要 reachability 分析,遠超本 change 範圍。
