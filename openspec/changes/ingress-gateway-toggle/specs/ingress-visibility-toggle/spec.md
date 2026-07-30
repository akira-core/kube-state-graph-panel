# ingress-visibility-toggle Specification

## ADDED Requirements

### Requirement: Ingress gateway 節點集合辨識

Panel SHALL 以節點 `data.labels` 中的 `role: "ingress-gateway"`(常數 `INGRESS_LABEL_KEY` / `INGRESS_LABEL_VALUE`,單一來源於 `src/shared/constants/ingressGateway.ts`)辨識 ingress gateway 節點,**不限 kind**。集合 MUST 進一步包含:每個帶該 label 的節點沿 `service-selects-pod` edge(source ∈ 集合)所指向的 target pods,即使該 pod 自身**不帶** label — 單層推導,MUST NOT 做傳遞閉包。不帶該 label 的 service 所 select 的 pods MUST NOT 被納入。

#### Scenario: 帶 label 的 service 與其 select 的無 label pod 皆入集合

- **WHEN** `igwSvc` 帶 `labels.role = "ingress-gateway"`,且存在 edge `igwSvc →(service-selects-pod) igwPod`,`igwPod` 無該 label
- **THEN** `igwSvc` 與 `igwPod` 皆屬 ingress 集合

#### Scenario: 帶 label 的非 service 節點單獨入集合

- **WHEN** 某 pod 帶 `labels.role = "ingress-gateway"` 且無任何 `service-selects-pod` 出邊
- **THEN** 該 pod 屬 ingress 集合(僅自身)

#### Scenario: 無 label 的 service 不受影響

- **WHEN** `otherSvc` 不帶該 label,且存在 `otherSvc →(service-selects-pod) somePod`
- **THEN** `otherSvc` 與 `somePod` 皆不屬 ingress 集合

### Requirement: showIngress 可見性語意

`computeVisibility` SHALL 接受第 4 個**可選**參數 `showIngress`(預設 `true`)。`showIngress === false` 時,ingress 集合內的節點 MUST 不進入 `visibleNodeIds`;相連 edge 的隱藏與清空後 compound 的移除 MUST 交由既有 edge pass 與 orphan 級聯處理(不新增級聯邏輯)。`showIngress === true` 或參數省略時,行為 MUST 與加入本參數前完全一致。

#### Scenario: 關閉時經 ingress 的路徑徹底消失、直連路徑完整保留

- **WHEN** elements 含路徑 `p →(pod-calls-service) igwSvc →(service-selects-pod) igwPod →(pod-calls-service) bsvc →(service-selects-pod) bpod` 及直連 `p →(pod-calls-service) bsvc`,`igwSvc` 帶 ingress label,呼叫 `computeVisibility(elements, ALL_KINDS, ALL_EDGE_TYPES, false)`
- **THEN** `visibleNodeIds` 恰為 `{p, bsvc, bpod}`,`visibleEdgeIds` 恰為直連兩條(`p → bsvc`、`bsvc → bpod`)

#### Scenario: 參數省略時零行為變化

- **WHEN** 同上 elements,呼叫 `computeVisibility(elements, ALL_KINDS, ALL_EDGE_TYPES)`(省略第 4 參數)
- **THEN** 全部節點與 edge 可見,與既有行為一致

#### Scenario: 清空的 compound 隨 orphan 級聯消失

- **WHEN** 某 `cluster > node` compound 內僅含一個 ingress pod,`showIngress === false`
- **THEN** 該 pod、其 K8s node 容器與 cluster 容器皆不在 `visibleNodeIds`

### Requirement: Ingress 流量路徑虛線

`normalizeGraph` SHALL 在 edge 上設 `data.ingressPath = true`,當且僅當 **兩個條件同時成立**:(a) 該 edge 任一端點屬 ingress 節點集合,且 (b) 該 edge 的 type 屬「流量」類型(`EDGE_IS_TRAFFIC_BY_TYPE`,單一來源於 `src/shared/constants/colorByEdgeType.ts`:`pod-calls-pod` / `pod-calls-service` / `service-selects-pod` 為 `true`,其餘為 `false`)。未收錄於該 map 的後端 edge type MUST 視為非流量(不標記)—— 虛線是「此流量繞經 gateway」的斷言,未知類型無法斷言;此處刻意不套用 filter 的 unknown-visible 慣例,因為不畫虛線不會讓任何元素消失。不符條件的 edge MUST **不帶** `ingressPath` key(不是 `false`)。

Stylesheet SHALL 以 `edge[?ingressPath]` 選擇器將這些 edge 畫成虛線,宣告順序在基礎 `edge` 與 taxi 規則之後以覆寫 `line-style`;顏色、箭頭、routing MUST 保持與該 edge type 原本一致(虛線是唯一差異)。具體 dash/gap 數值為實作細節,由 `getStylesheet` snapshot 測試釘住,不在本 Requirement 約束。

#### Scenario: 三段流量 hop 虛線、直連路徑實線

- **WHEN** elements 含 `p →(pod-calls-service) igwSvc →(service-selects-pod) igwPod →(pod-calls-service) bsvc →(service-selects-pod) bpod` 及直連 `p →(pod-calls-service) bsvc`,`igwSvc` 帶 ingress label
- **THEN** 前三條 edge 帶 `ingressPath: true`;`bsvc → bpod` 與直連 `p → bsvc` 皆不帶該 key

#### Scenario: ingress pod 的排程與掛載 edge 保持實線

- **WHEN** `igwPod` 另有 `igwPod →(pod-to-node) k8sNode` 與 `igwPod →(pod-mounts-pvc) igwPvc` 兩條 edge
- **THEN** 兩條皆不帶 `ingressPath` —— 端點雖屬 ingress 集合,但表達的是放置與掛載關係,非繞經 gateway 的流量

#### Scenario: 未知 edge type 保持實線

- **WHEN** `igwPod` 有一條 type 不在 `EDGE_IS_TRAFFIC_BY_TYPE` 內的 edge(例如後端新增的 `pod-calls-configmap`)
- **THEN** 該 edge 不帶 `ingressPath`(該 edge 本身仍照 unknown-visible 慣例可見,只是不畫虛線)

#### Scenario: 無 ingress label 時零標記

- **WHEN** 無任何節點帶 `labels.role = "ingress-gateway"`
- **THEN** 全部 edge 皆不帶 `ingressPath`,elements 原樣通過(免除 map 走訪)

### Requirement: Legend Ingress toggle 與 panel option 持久化

Panel SHALL 提供持久化 option `showIngress: boolean`(預設 `true`),於 options editor 以 boolean switch 呈現;讀取 MUST 以 `options.showIngress ?? defaultOptions.showIngress` 向後相容舊 dashboard。左側 legend SHALL 於 node-kinds 圖例(`NodeLegend`)之後渲染獨立的 `IngressToggle` 區塊:文字 "Ingress gateway" + eye(顯示中)/ eye-slash(隱藏中)IconButton;點擊 MUST 經 `onOptionsChange` 寫入 `showIngress` 的反值且 MUST NOT 動到其他 option。`IngressToggle` MUST 為受控元件(狀態由 panel 持有),不塞入 `NodeLegend` 的 kind-based row。

#### Scenario: 點擊 toggle 持久化寫入反值

- **WHEN** `showIngress` 為 `true`,使用者點擊 legend 的 Ingress toggle
- **THEN** `onOptionsChange` 被呼叫一次,收到 `{ ...options, showIngress: false }`,其他 option 不變

#### Scenario: 圖示反映目前狀態

- **WHEN** `showIngress` 為 `false`
- **THEN** toggle 顯示 eye-slash 圖示(hidden 語彙),`true` 時顯示 eye

### Requirement: Showcase demo 雙路徑 fixture

Showcase inline fixture(`provisioning/dashboards/ksg-switch-demo.json` 的 `panels[0].targets[0].data`)SHALL 同時包含經 ingress 與直連兩條路徑:`pod/gateway →(pod-calls-service) service/ingress-svc →(service-selects-pod) pod/ingress-0 →(pod-calls-service) service/mongo-svc` 與既有直連 `pod/gateway →(pod-calls-service) service/mongo-svc →(service-selects-pod) mongo pods`。`service/ingress-svc` MUST 帶 `labels.role = "ingress-gateway"`;`pod/ingress-0` MUST NOT 帶該 label(驗證 select-expansion 而非 label 命中)。backend seeder(`dev/victoriametrics/`)MUST NOT 加入此拓撲——後端無 generic labels contract,該路徑在 `ksg-demo` 將無法被 toggle 隱藏。

#### Scenario: 關閉 toggle 後 demo 只剩直連路徑

- **WHEN** 在 `/d/ksg-switch-demo` 將 Ingress gateway toggle 關閉
- **THEN** `service/ingress-svc`、`pod/ingress-0`、其三條相連 edge,以及清空的 `prod/app/ingress` application 與 `prod/ctrl/Deployment/ingress` controller 容器皆自畫面消失;直連路徑 `pod/gateway → service/mongo-svc → mongo pods` 完整保留

#### Scenario: 開啟 toggle 時雙路徑並存

- **WHEN** `showIngress` 為 `true`(預設)
- **THEN** 兩條路徑皆可見,與加入本 fixture 前的其餘節點/edge 完全相同(既有 6 node kinds / 4 edge types 覆蓋不受影響)
