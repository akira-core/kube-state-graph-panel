# node-icon-encoding delta — sync-netapp-storage-nodes

## MODIFIED Requirements

### Requirement: 節點身分以 icon 編碼

系統 SHALL 以 per-kind **icon** 承載節點身分(`kind`),取代既有的 per-kind 形狀編碼。所有 leaf 節點 MUST 以統一的 `round-rectangle` 容器渲染,kind 由節點的 `background-image`(icon)區分。`src/shared/constants/iconSvgByKind.ts` 匯出的 `ICON_SVG_BY_KIND` MUST 為 kind→icon 的唯一資料源,供 `getStylesheet` 與 legend 共用(取代 `SHAPE_BY_KIND` 的身分角色)。`NodeKind` 列舉 MUST 為 `pod`/`node`/`pvc`/`service`/`external` 加上 workload kind `deployment`/`statefulset`/`daemonset`/`job`/`cronjob`、物理網路 kind `switch`(後端 v0.0.18)、**實體儲存 kind `netapp-aggr`(ONTAP aggregate,leaf)與 `netapp-node`(ONTAP controller,**真實**的 compound 容器——見下方 compound icon 需求)**,以及包裹 switch fabric 的虛擬**容器型** kind `network`(`network > switch` 群組;wifi glyph 僅於收合時繪製,展開時與其他容器同樣 icon-less;收合時於 Node-kinds 圖例取代 `switch`,標籤顯示 `physical network`——見 panel-rendering / switch-tier-layout 規格)。`storageclass` MUST NOT 存在(後端已將其自契約移除,實體儲存鏈取代之)。`others` MUST NOT 存在(後端已將其自契約移除,external 吸收該 fallback)。ReplicaSet **不是** panel 的 NodeKind——後端將 `Deployment → ReplicaSet → Pod` 收斂,pod 直接歸其頂層 controller,故 ReplicaSet 不出現於圖中、不需 icon。

`netapp-aggr` 與 `netapp-node` MUST 各有其專屬 icon,且兩者 MUST 在視覺上可區分(aggregate 為儲存池、controller 為機箱/控制器語彙),以免同屬 `Storage` category 的兩層在圖例與畫布上混淆。

#### Scenario: 已知 kind 對應到正確 icon

- **WHEN** 節點 data 帶有 `kind: 'deployment'`(或其他已定義 kind)
- **THEN** 該節點以統一 `round-rectangle` 容器渲染,中央以 `ICON_SVG_BY_KIND['deployment']` 對應的 icon 作為 `background-image`,且對應與 `iconSvgByKind.ts` 一致

#### Scenario: leaf 節點形狀不再編碼 kind

- **WHEN** 兩個不同 kind(如 `pod` 與 `service`)的 leaf 節點同時渲染
- **THEN** 兩者容器形狀皆為 `round-rectangle`(形狀不再區分 kind),僅由 icon 區分身分

#### Scenario: NetApp 兩 kind 各有可區分的 icon

- **WHEN** 同一張圖中同時渲染 `kind: 'netapp-aggr'` 與 `kind: 'netapp-node'` 節點
- **THEN** `ICON_SVG_BY_KIND` 為兩者提供不同的 icon,且 `storageclass` 不再是 `ICON_SVG_BY_KIND` 的 key

### Requirement: compound 容器的 icon(展開無 icon、收合 / leaf 顯示置中 icon)

當 `node` / `controller` / `netapp-node` 節點身為**展開的** compound parent(其下有可見子節點,`:parent`)時,系統 MUST **不**渲染 resource icon(`node:parent` 設 `background-image: 'none'`),僅以 label + 容器框呈現,避免 icon 鋪在子節點之後;同類節點於 **collapsed** 狀態(非 `:parent`)時,中央顯示其 kind icon(由 base `node` 選擇器依 `data.kind` 解析)。其中 `controller` 為後端 D6 直接送出的 compound 群組,但仍攜帶真實 `kind`(由 enrichment 自子 pod `owner.kind` 推得),故其行為比照舊版 panel 合成的 controller:**收合時顯示其 Workloads glyph、展開時為框**。

`netapp-node` 同屬此類且為**後端契約直接指定**的真實-節點 compound parent(儲存鏈 `storage-cluster > netapp-node > netapp-aggr`):它攜帶真實 `kind`、可選取、有 icon,同時又 box 住其 `netapp-aggr` 子節點,故 MUST 完全比照 `node` / `controller` 的展開/收合 icon 行為(展開為框、收合顯示其 kind icon)。`netapp-aggr` 為其下的 leaf,icon 恆以 leaf 身分繪製。

`storageclass` 已自 `NodeKind` 移除,故其展開/收合與 leaf glyph 行為一併消失,不再有任何對應規則。

凡**無 `kind`** 的裝飾性 compound 群組 MUST NOT 於任何狀態(展開或收合)渲染 resource icon——除既有 `cluster` 容器(`isCluster`)外,後端 D6 送出的 `namespace`(`isNamespace`)、`application`(`isApplication`)與 `storage-cluster`(`isStorageCluster`)群組同屬此類:它們是 kind-less 的 accent-only 群組框。對應 stylesheet 選擇器(`node[?isCluster]` / `node[?isNamespace]` / `node[?isApplication]` / `node[?isStorageCluster]`)MUST 強制 `background-image: 'none'`,僅以 label + accent 容器框呈現。

#### Scenario: 展開的容器不放 icon

- **WHEN** 某 `node` / `controller` / `netapp-node` 容器內含可見子節點(展開,為 `:parent`)
- **THEN** 該容器 `background-image` 為 `none`,中央區域留給子節點,僅顯示 label 與容器框

#### Scenario: 收合的 node / controller 顯示置中 kind icon

- **WHEN** `node`、`controller` 或 `netapp-node` 容器被收合(非 `:parent`)
- **THEN** 中央顯示其 `kind` icon(收合的 K8s node 顯示 node icon、收合的 controller 顯示其 Workloads glyph、收合的 `netapp-node` 顯示其 controller icon)

#### Scenario: storageclass leaf 恆顯示磁碟 glyph

- **WHEN** 檢視 `ICON_SVG_BY_KIND` 與 stylesheet 的 kind 解析
- **THEN** 不存在 `storageclass` kind(該 kind 已自契約與列舉移除),本情境所述的舊 leaf glyph 行為一併不存在;其位置由 `netapp-aggr` leaf 的 icon 取代

#### Scenario: 無 kind 的裝飾群組不放 resource icon

- **WHEN** 渲染 `isCluster` / `isNamespace` / `isApplication` / `isStorageCluster` 的 compound 容器(展開或收合)
- **THEN** 該容器不帶任何 resource icon(`background-image: 'none'`),僅作為群組框與 accent 色
