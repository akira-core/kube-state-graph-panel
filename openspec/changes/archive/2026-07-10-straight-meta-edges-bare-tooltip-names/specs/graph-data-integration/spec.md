## MODIFIED Requirements

### Requirement: Backend 群組節點識別(namespace / application / controller)與著色

`normalizeGraph` SHALL 辨識 backend 直接輸出的三種 compound 群組節點(`data.type` 為 `namespace` / `application` / `controller`),比照既有 `cluster` flag-group 正規化為**裝飾性 compound parent**——除 `controller` 外**不**賦予 `kind`(故對 kind filter 與 icon legend 不可見,並由 `computeVisibility` 略過:無 kind ⇒ 恆可見,僅受 orphan cascade 影響)。其 `data.parent` 一律**原樣穿透**(panel 結構無關,僅指派 accent 顏色)。**可選取性由 panel-rendering「互動與選取狀態」規範**:`namespace` / `application` 群組與 `controller` 皆維持可選取(selection-driven 摺疊 cue 賴此浮現;`namespace` 選取不開啟 detail 面板、`application` 為 detail-eligible 例外),僅 `cluster` 群組為 `selectable: false`——normalize MUST NOT 對 `namespace` / `application` / `controller` 設 `selectable: false`,否則 canvas 的 tap 守門(`single.selectable()`)會丟棄其點擊,摺疊 cue 永不浮現、controller / application 的 detail 面板永不開啟。映射:

- `namespace` → `{ isNamespace, namespace: <label>, namespaceColor }`——**重用**既有 `isNamespace` 旗標、stylesheet selector 與 `NamespaceLegend`;accent 色為 per-kind 固定色(見 panel-rendering「裝飾性 compound 群組使用 per-kind 固定色彩與 kind 前綴標籤」)。
- `application` → `{ isApplication, application: <label>, applicationColor }`——**新增** `isApplication` 旗標、`applicationPalette.ts`、stylesheet selector 與 `ApplicationLegend`;accent 色同為 per-kind 固定色。
- `controller` → `{ isController: true, kind: <子 pod owner.kind 小寫> }`(見「pod / service / pvc `application`、pod `containers` 透傳與 controller 聚合」):controller 攜帶 real `kind` 以保留 detail 面板,既是 compound parent 又有 glyph(收合時畫該 kind icon)。

`namespace` / `application` 群組 `labels:{}`、無 status、無邊,純為 `data.parent` 目標。

對裝飾性群組(`cluster` / `namespace` / `application`),`normalizeGraph` MUST 將 `data.label` 設為上游裸名稱(`data.name`,或缺則 id),**MUST NOT** 寫入 kind 前綴(`Cluster:` / `Namespace:` / `Release Unit:`)。畫布上的前綴標籤由 stylesheet render-only mapper 負責(見 panel-rendering);裸 `data.label` 供 tooltip title 與其他 identity 消費端使用。

#### Scenario: namespace 群組正規化並著色

- **WHEN** 上游節點 `data.type === 'namespace'`、`name === 'shop'`、`parent` 指向其 cluster 容器
- **THEN** normalize 產出 `isNamespace: true`、`namespace: 'shop'`、`label: 'shop'`(裸名,無 `Namespace:` 前綴)、`namespaceColor` 為 per-kind 固定 accent 色,**不**帶 `kind`、**不**設 `selectable: false`(維持可選取,cue-driven——見 panel-rendering「互動與選取狀態」),且 `parent` 原樣穿透

#### Scenario: application 群組正規化並著色

- **WHEN** 上游節點 `data.type === 'application'`、`name === 'checkout'`、`parent` 指向其 namespace 群組
- **THEN** normalize 產出 `isApplication: true`、`application: 'checkout'`、`label: 'checkout'`(裸名,無 `Release Unit:` 前綴)、`applicationColor` 為 per-kind 固定 accent 色,**不**帶 `kind`、**不**設 `selectable: false`(維持可選取;application 為 detail-eligible——見 panel-rendering),且 `parent` 原樣穿透

#### Scenario: cluster 群組正規化為裸 label

- **WHEN** 上游節點 `data.type === 'cluster'`、`name === 'prod'`
- **THEN** normalize 產出 `isCluster: true`、`cluster: 'prod'`、`label: 'prod'`(裸名,無 `Cluster:` 前綴)、`clusterColor` 為 per-kind 固定 accent 色,且 `selectable: false`

#### Scenario: controller 群組標 isController 並由子 pod 取得 kind(維持可選取)

- **WHEN** 上游節點 `data.type === 'controller'`(無 `kind`),其旗下子 pod `owner.kind === 'StatefulSet'`
- **THEN** normalize 產出 `isController: true`、`kind: 'statefulset'`,`parent` 原樣穿透,且 **MUST NOT** 設 `selectable: false`(controller 為 detail-eligible,須維持可選取以開啟 detail 面板)

#### Scenario: 無 kind 的群組對 kind filter / icon legend 不可見

- **WHEN** 對 `namespace` / `application` 群組執行 `computeVisibility` 與 icon legend 推導
- **THEN** 兩者皆因無 `kind` 被 `computeVisibility` 略過(恆可見,僅受 orphan cascade 影響),亦不出現於 icon legend
