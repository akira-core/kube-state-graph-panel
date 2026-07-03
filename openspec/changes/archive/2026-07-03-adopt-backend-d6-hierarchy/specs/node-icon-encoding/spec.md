## MODIFIED Requirements

### Requirement: compound 容器的 icon(展開無 icon、收合 / leaf 顯示置中 icon)

當 `node` / `controller` 節點身為**展開的** compound parent(其下有可見子節點,`:parent`)時,系統 MUST **不**渲染 resource icon(`node:parent` 設 `background-image: 'none'`),僅以 label + 取自父 cluster accent 的容器框呈現,避免 icon 鋪在子節點之後;同類節點於 **collapsed** 狀態(非 `:parent`)時,中央顯示其 kind icon(由 base `node` 選擇器依 `data.kind` 解析)。其中 `controller` 為後端 D6 直接送出的 compound 群組,但仍攜帶真實 `kind`(由 enrichment 自子 pod `owner.kind` 推得),故其行為比照舊版 panel 合成的 controller:**收合時顯示其 Workloads glyph、展開時為框**。

`storageclass` **不再**是 compound 容器:後端 D6 已將其改為 `kind: 'storageclass'` 的 **leaf**(其下無子節點,不再 box PVC),故其磁碟 glyph MUST **恆**以 leaf 身分繪製(由 base `node` 選擇器依 `data.kind` 解析),不再僅於收合時顯示。

凡**無 `kind`** 的裝飾性 compound 群組 MUST NOT 於任何狀態(展開或收合)渲染 resource icon——除既有 `cluster` 容器(`isCluster`)外,後端 D6 送出的 `namespace`(`isNamespace`)與新增的 `application`(`isApplication`)群組同屬此類:它們是 kind-less 的 accent-only 群組框。對應 stylesheet 選擇器(`node[?isCluster]` / `node[?isNamespace]` / `node[?isApplication]`)MUST 強制 `background-image: 'none'`,僅以 label + accent 容器框呈現。

#### Scenario: 展開的容器不放 icon

- **WHEN** 某 `node` / `controller` 容器內含可見子節點(展開,為 `:parent`)
- **THEN** 該容器 `background-image` 為 `none`,中央區域留給子節點,僅顯示 label 與容器框

#### Scenario: 收合的 node / controller 顯示置中 kind icon

- **WHEN** `node` 或 `controller` 容器被收合(非 `:parent`)
- **THEN** 中央顯示其 `kind` icon(收合的 K8s node 顯示 node icon、收合的 controller 顯示其 Workloads glyph)

#### Scenario: storageclass leaf 恆顯示磁碟 glyph

- **WHEN** 渲染後端 D6 送出的 `kind: 'storageclass'` leaf 節點(其下無子節點)
- **THEN** 中央**恆**顯示 storageclass 磁碟 glyph(以 leaf 身分繪製),與其他容器是否收合無關;不存在「展開時不放 icon」的舊 compound 行為

#### Scenario: 無 kind 的裝飾群組不放 resource icon

- **WHEN** 渲染 `isCluster` / `isNamespace` / `isApplication` 的 compound 容器(展開或收合)
- **THEN** 該容器不帶任何 resource icon(`background-image: 'none'`),僅作為群組框與 accent 色
