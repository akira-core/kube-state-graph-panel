# node-icon-encoding Specification

## Purpose

TBD - created by archiving change icon-encoding-workload-topology. Update Purpose after archive.
## Requirements
### Requirement: 節點身分以 icon 編碼

系統 SHALL 以 per-kind **icon** 承載節點身分(`kind`),取代既有的 per-kind 形狀編碼。所有 leaf 節點 MUST 以統一的 `round-rectangle` 容器渲染,kind 由節點的 `background-image`(icon)區分。`src/shared/constants/iconSvgByKind.ts` 匯出的 `ICON_SVG_BY_KIND` MUST 為 kind→icon 的唯一資料源,供 `getStylesheet` 與 legend 共用(取代 `SHAPE_BY_KIND` 的身分角色)。`NodeKind` 列舉 MUST 為 `pod`/`node`/`pvc`/`service`/`external` 加上 workload kind `deployment`/`statefulset`/`daemonset`/`job`/`cronjob`、物理網路 kind `switch`(後端 v0.0.18),後端合成的**容器型** kind `storageclass`(`cluster > storageclass > pvc` 群組,渲染與處理完全比照 K8s `node` 容器——見 panel-rendering 規格),以及包裹 switch fabric 的虛擬**容器型** kind `network`(`network > switch` 群組;wifi glyph 僅於收合時繪製,展開時與其他容器同樣 icon-less;收合時於 Node-kinds 圖例取代 `switch`,標籤顯示 `physical network`——見 panel-rendering / switch-tier-layout 規格)。`others` MUST NOT 存在(後端已將其自契約移除,external 吸收該 fallback)。ReplicaSet **不是** panel 的 NodeKind——後端將 `Deployment → ReplicaSet → Pod` 收斂,pod 直接歸其頂層 controller,故 ReplicaSet 不出現於圖中、不需 icon。

#### Scenario: 已知 kind 對應到正確 icon

- **WHEN** 節點 data 帶有 `kind: 'deployment'`(或其他已定義 kind)
- **THEN** 該節點以統一 `round-rectangle` 容器渲染,中央以 `ICON_SVG_BY_KIND['deployment']` 對應的 icon 作為 `background-image`,且對應與 `iconSvgByKind.ts` 一致

#### Scenario: leaf 節點形狀不再編碼 kind

- **WHEN** 兩個不同 kind(如 `pod` 與 `service`)的 leaf 節點同時渲染
- **THEN** 兩者容器形狀皆為 `round-rectangle`(形狀不再區分 kind),僅由 icon 區分身分

### Requirement: icon 隨 Grafana 主題單色上色

系統 SHALL 提供純函式 `tintSvgToDataUri(rawSvg, hex)`,將 line-art SVG 的 `currentColor` sentinel 替換為傳入的主題色 `hex`,再以 `encodeURIComponent` 編碼為 `data:image/svg+xml,...` 字串(**非 base64**——cytoscape style 文件明示 SVG data-URI 用 encodeURIComponent、勿用 base64)。每個 icon SVG MUST 帶有 XML header(`<?xml version="1.0" encoding="UTF-8"?>`)與明確 `width`/`height`;缺 XML header 時 cytoscape 在 canvas 上 rasterise 為空白(同一 URI 作為 `<img>` 卻正常,故 legend 顯示而 canvas 空白)。上色 MUST 集中於純工廠 `getStylesheet(theme, …)`:以 `function(ele)` mapper 依 `ele.data('kind')` 查 `ICON_SVG_BY_KIND` 並以主題色產生 `background-image` data-URI;`background-fit` MUST 為 `contain`、`background-clip` 為 `none`,icon 寬高 MUST 內縮(約 60%)使容器邊框/狀態色仍可見。產生的 data-URI MUST 以 `(kind, hex)` 為鍵 memoize(避免 per-node 唯一 URI 破壞 cytoscape 影像快取)。`normalizeGraph` MUST NOT 涉及 icon 或主題(維持純 anti-corruption)。

#### Scenario: 主題切換時 icon 重新上色且不重建 instance

- **WHEN** 使用者於 Grafana 切換 dark ↔ light theme
- **THEN** `getStylesheet` 以新主題色重算每個 kind 的 icon data-URI 並 `cy.style(stylesheet).update()`;`cyRef.current` 引用不變;icon 顏色隨主題改變

#### Scenario: tintSvgToDataUri 正確編碼

- **WHEN** 以含 `currentColor` 的 SVG 與某主題 hex(如 `#c3cbd9`)呼叫 `tintSvgToDataUri`
- **THEN** 回傳字串中 `currentColor` 已被該 hex 取代,且所有 `#` 編碼為 `%23`,字串以 `data:image/svg+xml,` 起始(非 `;base64,`)

#### Scenario: 相同 (kind, hex) 回傳穩定 memoized 結果

- **WHEN** 同一 `(kind, hex)` 多次經由 stylesheet 取得 icon data-URI
- **THEN** 回傳同一字串(referential 穩定),不重複編碼

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

### Requirement: 未知 kind 走 fallback icon 且預設可見

當節點 `data.kind` 不在 `ICON_SVG_BY_KIND` keys 中時,系統 MUST 以通用 fallback icon 渲染,且該節點 MUST 預設可見(延續既有 unknown-kind 可見哲學),不拋出例外,使上游/後端新增資源類型時不會無聲消失。

#### Scenario: 未知 kind 顯示 fallback icon

- **WHEN** 上游回傳節點 `data.kind` 不在 `ICON_SVG_BY_KIND` 中(例:`ingress`)
- **THEN** 該節點以統一容器 + 通用 fallback icon 渲染,預設可見,console 不報錯

### Requirement: icon 上色純函式可單測

`tintSvgToDataUri` MUST 為純函式並具備單元測試覆蓋;含 icon 的 stylesheet MUST 以 snapshot 測試。測試 MUST 為 headless,不斷言像素級渲染。

#### Scenario: 純函式與 stylesheet 測試覆蓋

- **WHEN** CI 跑 `npm run test`
- **THEN** `tintSvgToDataUri` 測試覆蓋 `currentColor` 替換、`#`→`%23` 編碼、非 base64、`(kind,hex)` memoize 穩定性;`getStylesheet` snapshot 涵蓋帶 icon `background-image` 的節點樣式,皆通過

