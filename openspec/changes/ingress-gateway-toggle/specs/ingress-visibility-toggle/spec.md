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

### Requirement: Legend Ingress toggle 與 panel option 持久化

Panel SHALL 提供持久化 option `showIngress: boolean`(預設 `true`),於 options editor 以 boolean switch 呈現;讀取 MUST 以 `options.showIngress ?? defaultOptions.showIngress` 向後相容舊 dashboard。左側 legend SHALL 於 node-kinds 圖例(`NodeLegend`)之後渲染獨立的 `IngressToggle` 區塊:文字 "Ingress gateway" + eye(顯示中)/ eye-slash(隱藏中)IconButton;點擊 MUST 經 `onOptionsChange` 寫入 `showIngress` 的反值且 MUST NOT 動到其他 option。`IngressToggle` MUST 為受控元件(狀態由 panel 持有),不塞入 `NodeLegend` 的 kind-based row。

#### Scenario: 點擊 toggle 持久化寫入反值

- **WHEN** `showIngress` 為 `true`,使用者點擊 legend 的 Ingress toggle
- **THEN** `onOptionsChange` 被呼叫一次,收到 `{ ...options, showIngress: false }`,其他 option 不變

#### Scenario: 圖示反映目前狀態

- **WHEN** `showIngress` 為 `false`
- **THEN** toggle 顯示 eye-slash 圖示(hidden 語彙),`true` 時顯示 eye
