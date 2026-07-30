# ingress-visibility-toggle Specification

## Purpose
TBD - created by archiving change ingress-gateway-toggle. Update Purpose after archive.
## Requirements
### Requirement: Ingress gateway 節點集合辨識

Panel SHALL 以節點 `data.labels` 中的 `role: "ingress-gateway"`(常數 `INGRESS_LABEL_KEY` / `INGRESS_LABEL_VALUE`,單一來源於 `src/shared/constants/ingressGateway.ts`)辨識 ingress gateway 節點,**不限 kind**。集合的推導 MUST 為單一函式 `collectIngressNodeIds`(`src/shared/graph/`),且其**全部**消費者(element-filter 的隱藏、normalize 的虛線標記)MUST 取用**同一份**推導結果——兩者若各自推導出不同集合,會出現「toggle 藏得掉、但從不畫虛線」這類使用者在畫面上看得見的矛盾。

推導依序為三層:

1. **LABELLED(宣告)** — 任何帶該 label 的節點(不限 kind)。此層為**權威**:操作者標了 label 即為宣告,MUST NOT 因任何其他條件而被排除。
2. **NESTED(巢狀)** — 每個 labelled 節點沿 `data.parent` 的**全部子孫**(遞迴)。因 label 不限 kind,它可能落在 compound(controller / application / K8s node 群組)上;該群組所命名的 gateway 在語意上涵蓋其內部一切。
3. **SELECTED(推論)** — 由第 1、2 層節點沿 `service-selects-pod` edge(source ∈ 前兩層)所指向的 target pods,即使該 pod 自身**不帶** label。**單層推導,MUST NOT 做傳遞閉包**:此層加入的 pod MUST NOT 再作為展開起點。

第 3 層為**推論**而非宣告,故 MUST 讓步於「共用選取」豁免:**若某 target pod 同時被一個不屬前兩層的 service 以 `service-selects-pod` select(常見於一個 pod 被多個 Service 選中的拓撲),該 pod MUST 被排除於集合之外**——它仍為其他非 ingress 流量服務,MUST NOT 因為另一個 ingress service 也選取它而被連帶隱藏或畫虛線。此豁免 MUST NOT 套用於第 1、2 層:一個**自身帶 label**(或巢狀於 labelled 群組內)的 pod,即使另有不相干 service 選取它,仍 MUST 留在集合內。

#### Scenario: 帶 label 的 service 與其 select 的無 label pod 皆入集合

- **WHEN** `igwSvc` 帶 `labels.role = "ingress-gateway"`,且存在 edge `igwSvc →(service-selects-pod) igwPod`,`igwPod` 無該 label
- **THEN** `igwSvc` 與 `igwPod` 皆屬 ingress 集合

#### Scenario: 帶 label 的非 service 節點單獨入集合

- **WHEN** 某 pod 帶 `labels.role = "ingress-gateway"` 且無任何 `service-selects-pod` 出邊
- **THEN** 該 pod 屬 ingress 集合(僅自身)

#### Scenario: 無 label 的 service 不受影響

- **WHEN** `otherSvc` 不帶該 label,且存在 `otherSvc →(service-selects-pod) somePod`
- **THEN** `otherSvc` 與 `somePod` 皆不屬 ingress 集合

#### Scenario: 被不帶 label 的 service 共用選取的 pod 排除於集合外(推論層讓步)

- **WHEN** `igwSvc` 帶 label 且存在 `igwSvc →(service-selects-pod) sharedPod`,同時 `appSvc` 不帶 label 但也存在 `appSvc →(service-selects-pod) sharedPod`
- **THEN** `sharedPod` MUST NOT 屬 ingress 集合(`appSvc` 依然對它有效流量);`igwSvc` 仍屬集合

#### Scenario: 自身帶 label 的 pod 不受共用選取豁免影響(宣告層權威)

- **WHEN** `labelledPod` **自身**帶 `labels.role = "ingress-gateway"`,且存在 `appSvc →(service-selects-pod) labelledPod`(`appSvc` 不帶 label)
- **THEN** `labelledPod` MUST 屬 ingress 集合——豁免只作用於推論層,明確標註的節點不因他人選取而退出

#### Scenario: labelled compound 的整棵子樹入集合

- **WHEN** 一個 `controller` 群組帶該 label,其下巢狀 `igwPod`,`igwPod` 之下再巢狀 `sidecar`
- **THEN** 該 controller、`igwPod` 與 `sidecar` 皆屬 ingress 集合(沿 `parent` 遞迴,與 `service-selects-pod` 的單層規則為不同軸向)

#### Scenario: 巢狀於 labelled compound 內的 service 可作為展開起點

- **WHEN** 一個帶 label 的群組內巢狀 `nestedSvc`,且存在 `nestedSvc →(service-selects-pod) backendPod`
- **THEN** `backendPod` 屬 ingress 集合——群組內的 service 與直接帶 label 的 service 同等對待

### Requirement: showIngress 可見性語意

`computeVisibility` SHALL 接受第 4 個**可選**參數 `showIngress`(預設 `true`)。`showIngress === false` 時,ingress 集合內的節點 MUST 不進入 `visibleNodeIds`;相連 edge 的隱藏與清空後 compound 的移除 MUST 交由既有 edge pass 與 orphan 級聯處理(不新增級聯邏輯)。`showIngress === true` 或參數省略時,行為 MUST 與加入本參數前完全一致。

`computeVisibility` SHALL 另接受第 5 個**可選**參數 `ingressNodeIds`(預先算好的 ingress 集合);省略時自行以 `elements` 推導。此參數為**正確性**所需而非僅為效能:panel MUST 以 **view transform 之前**的 `baseElements` 推導該集合並傳入。理由是 label 可能落在 `controller` / `application` 群組上,而 `applyPodParentMode` 於 `node` 模式會**剝除**正是這些群組——若改由已轉換的 `elements` 自行推導,使用者在切換 pod-parent 模式的當下集合會變成空:已被隱藏的路徑無聲重現、legend 的 toggle 一併消失(見下「Toggle 渲染閘控」),而 `options.showIngress` 仍為 `false`,使用者既看不見也無法還原。節點 id 不因 view transform 改變,故自 `baseElements` 推導的集合對 `elements` 的查找仍然有效。

由於 label 辨識**不限 kind**,一個帶 label 的節點可能自身是 compound。其**全部子孫**(沿 `data.parent` 遞迴)MUST 一併自 `visibleNodeIds` 移除——不只是該 compound 本身。這與 orphan 級聯是兩件事:orphan 級聯只在子孫「因失去連線」才隱藏,而此處子孫即使仍有其他可見連線,也 MUST 因祖先被 ingress 隱藏而一併排除(cytoscape 的渲染本就以祖先鏈的 AND 決定最終可見性,`visibleNodeIds` 之資料層集合 MUST 與其一致,否則 detail 面板 / 釘選 tooltip / orphan 判定會誤判一個畫面上已消失的節點為「可見」)。

此子孫展開 MUST 在 `computeVisibility` 內**針對當前 view 的 `elements` 再做一次**,而非僅依賴傳入集合既有的展開結果:兩者的巢狀關係**不同**——傳入集合來自後端階層(pod 掛在其 controller 下),`elements` 則是當前視圖(`node` 模式下 pod 已改掛其 K8s node)。唯有以當前視圖再展開一次,「labelled 容器隱藏其在畫面上所含之物」才成立。

#### Scenario: 關閉時經 ingress 的路徑徹底消失、直連路徑完整保留

- **WHEN** elements 含路徑 `p →(pod-calls-service) igwSvc →(service-selects-pod) igwPod →(pod-calls-service) bsvc →(service-selects-pod) bpod` 及直連 `p →(pod-calls-service) bsvc`,`igwSvc` 帶 ingress label,呼叫 `computeVisibility(elements, ALL_KINDS, ALL_EDGE_TYPES, false)`
- **THEN** `visibleNodeIds` 恰為 `{p, bsvc, bpod}`,`visibleEdgeIds` 恰為直連兩條(`p → bsvc`、`bsvc → bpod`)

#### Scenario: 參數省略時零行為變化

- **WHEN** 同上 elements,呼叫 `computeVisibility(elements, ALL_KINDS, ALL_EDGE_TYPES)`(省略第 4 參數)
- **THEN** 全部節點與 edge 可見,與既有行為一致

#### Scenario: 清空的 compound 隨 orphan 級聯消失

- **WHEN** 某 `cluster > node` compound 內僅含一個 ingress pod,`showIngress === false`
- **THEN** 該 pod、其 K8s node 容器與 cluster 容器皆不在 `visibleNodeIds`

#### Scenario: 帶 label 的 compound 的子孫一併隱藏

- **WHEN** 一個 K8s `node` compound 帶 `labels.role = "ingress-gateway"`,其下巢狀一個未帶 label 的 pod(該 pod 亦非任何 `service-selects-pod` 展開的 target),`showIngress === false`
- **THEN** 該 `node` compound 與其巢狀 pod 皆不在 `visibleNodeIds`——即使該 pod 自身不帶 label 且未經 service-selects-pod 展開

#### Scenario: 切換 pod-parent 模式不動搖已隱藏的 ingress 路徑

- **WHEN** label 落在 `controller` 群組上、`showIngress === false`,使用者自 `controller` 模式切換至 `node` 模式(`applyPodParentMode` 剝除該 controller 群組並將其 pod 改掛 K8s node)
- **THEN** 該群組原本的 pod MUST 仍不在 `visibleNodeIds`,且 legend 的 `IngressToggle` MUST 仍渲染——集合取自 `baseElements`,不隨 view transform 蒸發

### Requirement: Ingress 流量路徑虛線

`normalizeGraph` SHALL 在 edge 上設 `data.ingressPath = true`,當且僅當 **兩個條件同時成立**:(a) 該 edge 任一端點屬 ingress 節點集合(**與 `showIngress` 隱藏所用者為同一份 `collectIngressNodeIds` 推導,含其巢狀子孫層**——因此 labelled compound 內的 pod 其流量 edge 同樣 MUST 畫虛線;若兩者集合不一致,會出現「toggle 藏得掉、卻從不畫虛線」的可見矛盾),且 (b) 該 edge 的 type 屬「流量」類型(`EDGE_IS_TRAFFIC_BY_TYPE`,單一來源於 `src/shared/constants/colorByEdgeType.ts`:`pod-calls-pod` / `pod-calls-service` / `service-selects-pod` 為 `true`,其餘為 `false`)。未收錄於該 map 的後端 edge type MUST 視為非流量(不標記)—— 虛線是「此流量繞經 gateway」的斷言,未知類型無法斷言;此處刻意不套用 filter 的 unknown-visible 慣例,因為不畫虛線不會讓任何元素消失。不符條件的 edge MUST **不帶** `ingressPath` key(不是 `false`)。

`isTrafficEdgeType` 的查表 MUST 以**自有屬性**判定(`Object.hasOwn`),MUST NOT 直接索引後回退 `?? false`。`data.type` 為未經允許清單過濾、由 normalize 原樣複製的後端字串,若直接索引,名為 `constructor` / `toString` / `valueOf` 等 `Object.prototype` 成員的 type 會解析到**繼承來的函式**(truthy 且永不為 `undefined`),使「未知類型視為非流量」的保證失效並畫出虛線。

Stylesheet SHALL 以 `edge[?ingressPath]` 選擇器將這些 edge 畫成虛線,宣告順序在基礎 `edge` 與 taxi 規則之後以覆寫 `line-style`;顏色、箭頭、routing MUST 保持與該 edge type 原本一致(虛線是唯一差異)。dash/gap 數值 MUST 以單一常數(`INGRESS_DASH_PATTERN`)提供給 canvas 規則與 legend 圖例共用,使兩者不致漂移。

#### Scenario: 三段流量 hop 虛線、直連路徑實線

- **WHEN** elements 含 `p →(pod-calls-service) igwSvc →(service-selects-pod) igwPod →(pod-calls-service) bsvc →(service-selects-pod) bpod` 及直連 `p →(pod-calls-service) bsvc`,`igwSvc` 帶 ingress label
- **THEN** 前三條 edge 帶 `ingressPath: true`;`bsvc → bpod` 與直連 `p → bsvc` 皆不帶該 key

#### Scenario: ingress pod 的排程與掛載 edge 保持實線

- **WHEN** `igwPod` 另有 `igwPod →(pod-to-node) k8sNode` 與 `igwPod →(pod-mounts-pvc) igwPvc` 兩條 edge
- **THEN** 兩條皆不帶 `ingressPath` —— 端點雖屬 ingress 集合,但表達的是放置與掛載關係,非繞經 gateway 的流量

#### Scenario: 未知 edge type 保持實線

- **WHEN** `igwPod` 有一條 type 不在 `EDGE_IS_TRAFFIC_BY_TYPE` 內的 edge(例如後端新增的 `pod-calls-configmap`)
- **THEN** 該 edge 不帶 `ingressPath`(該 edge 本身仍照 unknown-visible 慣例可見,只是不畫虛線)

#### Scenario: 以 Object.prototype 成員命名的 edge type 保持實線

- **WHEN** 後端送出一條 type 為 `constructor`(或 `toString` / `valueOf`)且端點屬 ingress 集合的 edge
- **THEN** 該 edge 不帶 `ingressPath` —— 查表 MUST NOT 命中原型鏈上的繼承成員

#### Scenario: labelled compound 內巢狀 pod 的流量 edge 一併虛線

- **WHEN** 一個 `controller` 群組帶 ingress label,其下巢狀 `igwPod`,且 `igwPod →(pod-calls-service) bsvc` 與 `igwPod →(pod-to-node) k8sNode` 兩條 edge 存在
- **THEN** `igwPod → bsvc` 帶 `ingressPath: true`(與 `showIngress` 所隱藏者同集合),`igwPod → k8sNode` 不帶(非流量類型)

#### Scenario: 無 ingress label 時零標記

- **WHEN** 無任何節點帶 `labels.role = "ingress-gateway"`
- **THEN** 全部 edge 皆不帶 `ingressPath`,elements 原樣通過(免除 map 走訪)

### Requirement: Legend Ingress toggle 與 panel option 持久化

Panel SHALL 提供持久化 option `showIngress: boolean`(預設 `true`),於 options editor 以 boolean switch 呈現;讀取 MUST 以 `options.showIngress ?? defaultOptions.showIngress` 向後相容舊 dashboard。左側 legend SHALL 於 node-kinds 圖例(`NodeLegend`)之後渲染獨立的 `IngressToggle` 區塊:文字 "Ingress Gateway"(Title Case,與其餘區段標題一致)+ eye(顯示中)/ eye-slash(隱藏中)IconButton;點擊 MUST 經 `onOptionsChange` 寫入 `showIngress` 的反值且 MUST NOT 動到其他 option。`IngressToggle` MUST 為受控元件(狀態由 panel 持有),不塞入 `NodeLegend` 的 kind-based row。

**Toggle 渲染閘控**:`IngressToggle` MUST 僅在圖中確實存在 ingress 集合(集合非空)時渲染,與其餘 legend 區段「無內容則 `return null`」的慣例一致(`NodeLegend` / `ClusterLegend` / `EdgeLegend` / `NodeContainerLegend` 皆然)。後端目前無 generic labels contract,故多數圖(含 `/d/ksg-demo`)不含該 label;若無條件渲染,使用者會看到一顆按了畫面毫無變化、卻仍把 `showIngress: false` 寫進 dashboard JSON 的死按鈕。該閘控所用集合 MUST 與 `computeVisibility` 取用者同源(見「showIngress 可見性語意」的 `baseElements` 要求)。

**虛線圖例**:`IngressToggle` 區塊 MUST 附一條虛線樣本(`EdgeGlyph`)說明畫布上的虛線語意。其顏色與 dash 樣式 MUST 取自與 stylesheet `edge[?ingressPath]` 規則相同的常數(`INGRESS_DASH_COLOR` / `INGRESS_DASH_PATTERN`)——`EdgeLegend` 刻意省略了服務型別的列(由 `pod ↔ pod/service` 單列代表)且其樣本一律實線,故若無此樣本,畫布上的虛線在 legend 中無任何對應說明。顏色 MUST NOT 取 fallback 灰:唯一可能被畫成虛線的是「流量」類型,而它們共用同一橘色,fallback 灰恰是保證永不畫虛線的未知類型之色。

#### Scenario: 點擊 toggle 持久化寫入反值

- **WHEN** `showIngress` 為 `true`,使用者點擊 legend 的 Ingress toggle
- **THEN** `onOptionsChange` 被呼叫一次,收到 `{ ...options, showIngress: false }`,其他 option 不變

#### Scenario: 圖示反映目前狀態

- **WHEN** `showIngress` 為 `false`
- **THEN** toggle 顯示 eye-slash 圖示(hidden 語彙),`true` 時顯示 eye

#### Scenario: 圖中無 ingress 節點時不渲染 toggle

- **WHEN** 圖中無任何節點帶 `labels.role = "ingress-gateway"`(例如後端驅動的 `/d/ksg-demo`)
- **THEN** legend MUST NOT 渲染 `IngressToggle` 區段(無死按鈕)

#### Scenario: 虛線圖例與畫布同源

- **WHEN** `IngressToggle` 渲染
- **THEN** 其虛線樣本的顏色為 `INGRESS_DASH_COLOR`(某個「流量」edge type 實際使用的顏色)、dash 樣式為 `INGRESS_DASH_PATTERN`,與 `edge[?ingressPath]` 於畫布所繪一致

### Requirement: Showcase demo 雙路徑 fixture

Showcase inline fixture(`provisioning/dashboards/ksg-switch-demo.json` 的 `panels[0].targets[0].data`)SHALL 同時包含經 ingress 與直連兩條路徑:`pod/gateway →(pod-calls-service) service/ingress-svc →(service-selects-pod) pod/ingress-0 →(pod-calls-service) service/mongo-svc` 與既有直連 `pod/gateway →(pod-calls-service) service/mongo-svc →(service-selects-pod) mongo pods`。`service/ingress-svc` MUST 帶 `labels.role = "ingress-gateway"`;`pod/ingress-0` MUST NOT 帶該 label(驗證 select-expansion 而非 label 命中)。backend seeder(`dev/victoriametrics/`)MUST NOT 加入此拓撲——後端無 generic labels contract,該路徑在 `ksg-demo` 將無法被 toggle 隱藏。

#### Scenario: 關閉 toggle 後 demo 只剩直連路徑

- **WHEN** 在 `/d/ksg-switch-demo` 將 Ingress gateway toggle 關閉
- **THEN** `service/ingress-svc`、`pod/ingress-0`、其三條相連 edge,以及清空的 `prod/app/ingress` application 與 `prod/ctrl/Deployment/ingress` controller 容器皆自畫面消失;直連路徑 `pod/gateway → service/mongo-svc → mongo pods` 完整保留

#### Scenario: 開啟 toggle 時雙路徑並存

- **WHEN** `showIngress` 為 `true`(預設)
- **THEN** 兩條路徑皆可見,與加入本 fixture 前的其餘節點/edge 完全相同(既有 6 node kinds / 4 edge types 覆蓋不受影響)

