# ingress-visibility-toggle delta — render-from-fixture-only

## MODIFIED Requirements

### Requirement: Ingress gateway 節點集合辨識

Panel SHALL 以節點 `data.labels` 中的 `role: "ingress-gateway"`(常數 `INGRESS_LABEL_KEY` /
`INGRESS_LABEL_VALUE`,單一來源於 `src/shared/constants/ingressGateway.ts`)辨識 ingress
gateway 節點,**不限 kind**。集合的推導 MUST 為單一函式 `collectIngressNodeIds`
(`src/shared/graph/`),且其**全部**消費者(element-filter 的隱藏、normalize 的虛線標記)MUST
取用**同一份**推導結果——兩者若各自推導出不同集合,會出現「toggle 藏得掉、但從不畫虛線」這類
使用者在畫面上看得見的矛盾。

比對 MUST 為對 `ingress-gateway` **單一值的精確相等**,MUST NOT 為前綴比對、大小寫寬鬆比對,
或任何「看起來像 ingress」的判斷。後端以**同一個 `role` key** 標記**兩種** ingress 形狀,而
兩者並不對稱:

| | `ingress-gateway` | `ingress-lb` |
| --- | --- | --- |
| 是什麼 | 已路由 chain 的入口 hop(Istio) | 非 Istio 的 LB fallback 目的地 |
| 其後方 | gateway pods,再一跳合成邊至 backend service | 無——沒有被路由的 backend |
| 呼叫方另有 | 一條**直連** backend service 的邊 | 沒有其他邊 |

因此 `ingress-lb` 節點 MUST NOT 進入本集合(常數 `INGRESS_LB_LABEL_VALUE` 記錄此決定及其
理由)。藏掉一個 `ingress-gateway` 節點移除的是一條**繞路**,直連邊保住了依賴關係;藏掉一個
`ingress-lb` 節點移除的卻是呼叫方**唯一**的依賴邊——該 pod 會被畫成完全沒有依賴。虛線標記有
相同的不對稱性:虛線斷言「這段流量繞過了一條直連路徑」,對 chain 為真,對 fallback 為假。

一個帶 `ingress-lb` 的 service 亦 MUST NOT 作為第 3 層(SELECTED)推導的展開起點——其
`service-selects-pod` 所指向的 ingress controller pods 同樣不進入集合。

推導依序為三層:

1. **LABELLED(宣告)** — 任何帶 `role: "ingress-gateway"` 的節點(不限 kind)。此層為**權威**:
   操作者標了 label 即為宣告,MUST NOT 因任何其他條件而被排除。
2. **NESTED(巢狀)** — 每個 labelled 節點沿 `data.parent` 的**全部子孫**(遞迴)。因 label 不限
   kind,它可能落在 compound(controller / application / K8s node 群組)上;該群組所命名的
   gateway 在語意上涵蓋其內部一切。
3. **SELECTED(推論)** — 由第 1、2 層節點沿 `service-selects-pod` edge(source ∈ 前兩層)所指向
   的 target pods,即使該 pod 自身**不帶** label。**單層推導,MUST NOT 做傳遞閉包**:此層加入的
   pod MUST NOT 再作為展開起點。

第 3 層為**推論**而非宣告,故 MUST 讓步於「共用選取」豁免:**若某 target pod 同時被一個不屬前兩
層的 service 以 `service-selects-pod` select(常見於一個 pod 被多個 Service 選中的拓撲),該 pod
MUST 被排除於集合之外**——它仍為其他非 ingress 流量服務,MUST NOT 因為另一個 ingress service
也選取它而被連帶隱藏或畫虛線。此豁免 MUST NOT 套用於第 1、2 層:一個**自身帶 label**(或巢狀於
labelled 群組內)的 pod,即使另有不相干 service 選取它,仍 MUST 留在集合內。

#### Scenario: 帶 label 的 service 與其 select 的無 label pod 皆入集合

- **WHEN** `igwSvc` 帶 `labels.role = "ingress-gateway"`,且存在 edge `igwSvc →(service-selects-pod) igwPod`,`igwPod` 無該 label
- **THEN** `igwSvc` 與 `igwPod` 皆屬 ingress 集合

#### Scenario: 帶 label 的非 service 節點單獨入集合

- **WHEN** 某 pod 帶 `labels.role = "ingress-gateway"` 且無任何 `service-selects-pod` 出邊
- **THEN** 該 pod 屬 ingress 集合(僅自身)

#### Scenario: 無 label 的 service 不受影響

- **WHEN** `otherSvc` 不帶該 label,且存在 `otherSvc →(service-selects-pod) somePod`
- **THEN** `otherSvc` 與 `somePod` 皆不屬 ingress 集合

#### Scenario: `ingress-lb` 節點永不入集合

- **WHEN** `nginxSvc` 帶 `labels.role = "ingress-lb"`,且 `caller` pod 僅有一條 `caller →(pod-calls-service) nginxSvc` 邊
- **THEN** `nginxSvc` 不屬 ingress 集合;`showIngress: false` 時它仍可見,該邊仍為實線,`caller` 的唯一依賴不被抹除

#### Scenario: `ingress-lb` 不作為推論層的展開起點

- **WHEN** `nginxSvc` 帶 `labels.role = "ingress-lb"`,且存在 `nginxSvc →(service-selects-pod) nginxPod`
- **THEN** `nginxSvc` 與 `nginxPod` 皆不屬 ingress 集合

#### Scenario: 兩種形狀並存時彼此不混淆

- **WHEN** 同一張圖同時含帶 `ingress-gateway` 的 `igwSvc`(select `igwPod`)與帶 `ingress-lb` 的 `nginxSvc`(select `nginxPod`)
- **THEN** 集合恰為 `{igwSvc, igwPod}`

#### Scenario: 未知 role 值不入集合

- **WHEN** 某 service 帶 `labels.role = "ingress-gateway-canary"`
- **THEN** 該節點不屬 ingress 集合——比對為單一值的精確相等,未來新增的第三種 role MUST 明確加入才生效

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
