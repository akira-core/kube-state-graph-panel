## Context

節點身分（`kind`）目前以 per-kind Cytoscape 形狀編碼（`SHAPE_BY_KIND`：pod=ellipse、service=hexagon、node=round-rectangle、pvc=pentagon、others=diamond、external=star）。人眼可靠區分的幾何形狀上限約 8 種，6 種已用罄，要加入 Kubernetes workload kind（Deployment/StatefulSet/DaemonSet/Job/CronJob）已無形狀預算。

本變更把 kind 身分移到 per-kind **icon**（近乎無限的編碼通道），並補上 workload 控制器的拓樸，使新節點能有意義地連到其 pod。設計已透過 brainstorming 與一輪平行研究（官方 K8s icon 授權/格式、cytoscape icon render、資源分類學、產業前案、Grafana plugin 限制）定案。

約束：panel-only（只渲染後端 cytoscape JSON，`kind = data.type`，`parent` 由後端決定 nesting）；TS strict（`noUncheckedIndexedAccess`/`exactOptionalPropertyTypes`）；單一來源 map 哲學；cytoscape 整合慣例（single source = cy instance、split init/update effect、diff-patch、module-level extension registration、stylesheet 純工廠）；零警告 lint。

## Goals / Non-Goals

**Goals:**

- 以 icon 取代形狀承載 kind 身分，使編碼可擴充到 workload 與未來更多 kind。
- icon 單色、隨 Grafana light/dark 主題上色，與面板視覺融合；改動面集中在 stylesheet 工廠。
- 狀態續用邊框色、叢集續用 compound——三個訊息分通道不打架。
- 新增 workload kind 與 `node ⇄ controller` 雙模式拓樸，沿用既有 `applyPodParentMode` 機制。
- 對後端尚未發送的 kind/edge 一律優雅 fallback、預設可見、永不報錯。

**Non-Goals:**

- ingress/pv/storageclass/configmap/secret/rbac 的節點與邊（等後端與需求）。
- 低 zoom 的 icon→純形狀 level-of-detail 切換。
- 狀態角標（badge）——先只用邊框色。
- 後端程式碼（本 repo 為 panel-only）；workload 節點與 `controller-owns-pod` 邊的產生是後端契約。
- 官方 K8s 彩色徽章（見 Decision 2）。

## Decisions

### D1. 退役 shape-per-kind，icon 承載身分；leaf 統一容器

所有 leaf 節點改用單一 `round-rectangle` 容器，kind 由 `background-image` 的 icon 表示。`ICON_SVG_BY_KIND` 取代 `SHAPE_BY_KIND` 成為 kind 的單一來源 map。

- **理由**：形狀通道已用罄；icon 近乎無限且辨識度高（產業慣例 icon=身分）。icon 本身是非顏色的形狀編碼，a11y 仍不依賴顏色。
- **Alternatives**：(a) 形狀=超大類、icon=kind（保留冗餘 a11y）——但增加複雜度，且使用者明確選擇統一容器；(b) 純文字 type 標籤——大圖缺乏視覺節奏。

### D2. 單色可染 icon（Argo CD 集），非官方彩色徽章

icon 為單色 line-art、帶 `currentColor` sentinel，隨主題注入色。資產 vendoring 自 Argo CD 的 monochrome resource SVG（Apache-2.0 相容），缺的自畫；attribution 寫 `docs/THIRD_PARTY.md`。

- **理由**：官方 `kubernetes/community` icon 經抓原始檔證實是固定 `#326ce5` 藍 + 白多色徽章、**無單色版、無法隨主題重新上色**，與「融入 light/dark」目標衝突。Material Design Icons 雖可 `currentColor` 上色但無 per-resource K8s icon。Argo CD 是唯一可染的 per-resource K8s icon 慣例。
- **Trade-off**：辨識度略低於官方藍徽章；需自行維護這套 SVG 與上游同步。

### D3. 上色集中在 `getStylesheet`，純函式 `tintSvgToDataUri`

`tintSvgToDataUri(rawSvg, hex)`：替換 `currentColor` sentinel → 最小化編碼（`#`→`%23`、跳脫 `<>%"`）→ 輸出 UTF-8 `data:image/svg+xml,...`（**非 base64**，省約 20%）。以模組層 `Map<`(kind|hex)`>` memoize。`getStylesheet(theme, …)` 以既有的 `function(ele)` mapper（shape 已是此寫法）回傳 per-kind `background-image`，並設 `background-fit:contain`、`background-clip:none`、`background-image-containment:inside`、寬高約 60%。

- **理由**：tint 依主題，`getStylesheet` 已收 theme 且在主題切換時重建+`cy.style()` 重套——單一上色點、零 per-node mutation。`currentColor`/`fill` **不會**穿透 `background-image` 內的 SVG，必須在編碼前注入。未編碼的 `#` 會被當 URI fragment 而靜默失效。
- **Alternatives**：在 `normalizeGraph` 寫 `data.iconUri`——但 normalize 不該知道主題，且會把樣式放進 element data（cytoscape issue 2031 反模式）。

### D4. compound 容器 icon 置左上；cluster 框不放 icon

當 node/controller 為 compound parent（內含子節點）時，icon 縮小置左上貼 label（中央留給子節點），避免被子節點蓋住；`isCluster` 容器不放 resource icon。leaf/collapsed 狀態 icon 置中。

- **理由**：cytoscape 預設 `background-image` 置中，會落在 compound 子節點之後。`background-image` 節點無法可靠 revert 成純 `background-color`（issue 2124）——「無 icon」以透明/空白 image 表示而非移除屬性。

### D5. 狀態邊框擴成資料驅動

`STATUS_BORDER_KINDS` 從 `['pod','node','pvc']` 改為「任何後端有回報 `data.status` 的 kind」；無 status → 中性邊框。`STATUS_COLOR`（綠/黃/紅）不變。

- **理由**：workload 也有健康（如可用副本數）；硬編碼 kind 清單會擋住擴充。

### D6. 拓樸雙模式 `node ⇄ controller`（取代 `node ⇄ service`）

`PodParentMode`：`'node' | 'service'` → `'node' | 'controller'`。`applyPodParentMode` 一般化——「另一 parent 的來源邊」從 `service-selects-pod` 換成 `controller-owns-pod`。

- `node` 模式（預設）：`cluster > node > pod`；畫 `controller-owns-pod`；`pod-runs-on-node` 為巢狀不畫。
- `controller` 模式：對每個被 `controller-owns-pod` 指向的 pod，re-parent 到其 owning controller（多 owner 取字典序最小）、移除 `controller-owns-pod` 邊（改以巢狀表示）、合成 `pod-runs-on-node` 邊連回原 node。
- **Service 兩模式皆 edge**（不再當 compound parent）——`service-selects-pod` 與 `pod-calls-service` 永遠是 drawn edge。
- **ReplicaSet 收掉**：後端已將 `Deployment → ReplicaSet → Pod` 收斂,`controller-owns-pod` 直接連 pod → 頂層 controller（Deployment）。ReplicaSet **不是** panel 的 NodeKind、不出現於圖中、無對應 icon。
- **理由**：完美套用既有 service-mode re-parent + 合成邊機制，只換來源邊型別；對使用者「誰管誰」心智模型最直接。
- **Alternatives**：(a) 只用 edge、不做巢狀模式——少了控制器分群視角；(b) 完整展開 Deployment>ReplicaSet>Pod——巢狀過深、噪音高。

### D7. 模式切換以整批重建套用新階層

沿用既有決策：`useCytoscape` 偵測 `podParentMode` 變動時以 `cy.elements().remove()` + `cy.add(elements)` 整批重建套用新巢狀（動態 `data('parent')`/`move()` 在 batch + expand-collapse 下不可靠），並 bump layout run token 重跑一次 layout；visibility-only 變更不重跑。

### D8. Legend 改 icon glyph、依超大類分組；顏色不編碼大類

node legend 以主題上色的 icon glyph（取代 `ShapeGlyph`）呈現，依 panel-owned 的 `apiGroup+kind → 超大類` 查表分組（Workloads / Networking / Storage / Cluster / Other）。**顏色不編碼大類（顏色=狀態）**。edge legend 加 `controller-owns-pod`，`service-selects-pod` 兩模式常駐。模式切換 UI 文案 node⇄service 改 node⇄controller。`computeVisibility` 的 `ALL_KINDS` 由單一 map 自動衍生新 kind。

- **理由**：6 大類 ≪ kind 數，legend 才掃得動；分類表 panel-owned 且確定（不信任後端非標準 categories）。

## Risks / Trade-offs

- [官方 icon 不可染 → 設計衝突] → 改用 Argo CD 單色集（D2），官方彩色徽章列為未採用。
- [後端未發 `controller-owns-pod` 邊 / workload 節點] → panel 對未發 kind/edge 一律 fallback、不報錯；legend **不**列出後端無法填的項目（避免畫不出來的條目）。需後端契約配合（見 Migration）。
- [`background-image` 性能/清晰度] → data-URI 同步載入（避免 issue 1511 外部圖延遲）、依 `(kind,hex)` memoize（cytoscape 以 URL 字串快取，per-node 唯一 URI 會破快取）、SVG 用 `viewBox="0 0 24 24"`、`cy.batch()` 批次更新。實際基數小（~6–12 kind × 2 主題）。
- [未編碼 `#` 靜默失效 / `currentColor` 不穿透] → `tintSvgToDataUri` 單元測試斷言 `%23` 與 sentinel 替換。
- [退役形狀為 BREAKING 視覺改變] → 既有使用者的圖外觀改變；以 legend（單一來源）說明新 icon 對應。
- [plugin signing 雜湊 dist 全檔 / validator 拒絕不安全 SVG] → icon 在 sign 前 bundle 完成；vendored SVG 先 sanitize（去 `<script>`/外部 ref）。

## Migration Plan

1. **Panel 端**（本 repo）：新增 icon map/tint/分類表 → 改 `getStylesheet` → 退役 `SHAPE_BY_KIND` 身分角色 → 改 `PodParentMode` 與 `applyPodParentMode` → 新增 `controller-owns-pod` 邊與 legend/filter 串接 → 測試。對未發 kind/edge 的優雅 fallback 確保可先行合併、不依賴後端就緒。
2. **後端契約**（外部，非本 repo）：kube-state-graph v0.0.14 需發 workload 節點（`data.type` = `deployment`/`statefulset`/`daemonset`/`job`/`cronjob`）與 `controller-owns-pod` 邊（pod 歸頂層 controller、收掉 RS）。確認 PromQL/kube-state-metrics 能否提供 ownerReference；不能則該模式邊暫不出現（panel 仍正常）。
3. **Demo seeder** 補 workload 節點與 owns 邊以可視驗證（若契約已就緒）。
4. **Rollback**：純前端、無持久化狀態（模式為 local React state）；revert commit 即還原。

## Open Questions

- v0.0.14 後端實際能否發 `controller-owns-pod`（ownerReference 經 KSM/PromQL 是否可得）？此為契約 gate，需後端確認；panel 端不阻塞。
- workload kind 的 `data.status` 後端是否回報（決定其是否顯示狀態邊框）？未報則中性邊框，無妨。
- DaemonSet 在 `controller` 模式下 pod 歸 DaemonSet 是否符合預期分群（每 node 一 pod）？預設照 controller 一般化處理。
