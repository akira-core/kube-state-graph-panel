## ADDED Requirements

### Requirement: Dashboard 按鈕的節點適用範圍

Panel SHALL 僅對 **node-detail 面板會開啟的節點**請求 `/dashboard` 並渲染 Dashboard 按鈕——即 **leaf 節點**、**k8s-node**(`kind: node`)compound 容器、與 **controller** compound 容器(`resolveSelectedNode` ≠ `null` 的集合)。**cluster / namespace / storageclass** compound MUST NOT 觸發任何 `/dashboard` 查詢、亦 MUST NOT 渲染 Dashboard 按鈕。適用範圍的守門以參數組裝在不適用節點回傳「無參數」(`undefined`)實作——使停用的節點不發查詢——並與 `resolveSelectedNode` 的排除集合(`isCluster` / `isStorageClass` / `isNamespace`)共用同一判定,不另立平行清單以免漂移。

#### Scenario: leaf / k8s-node / controller 為適用節點

- **WHEN** node-detail 面板對一個 leaf 節點、k8s-node compound、或 controller compound 開啟
- **THEN** 系統為該節點發出一次 `/dashboard` 查詢(於下「預取」需求所述時機),並在可用時渲染 Dashboard 按鈕

#### Scenario: cluster / namespace / storageclass 不適用

- **WHEN** 被選取的節點為 `cluster` / `namespace` / `storageclass` compound
- **THEN** 系統 MUST NOT 發出 `/dashboard` 查詢,Dashboard 按鈕 MUST NOT 渲染(這些節點本就不開啟 detail 面板)

### Requirement: Dashboard URL 預取、端點解析與可用性判定

當 node-detail 面板**開啟**(**左鍵 alerts view 或右鍵 detail view 皆然**)時,Panel SHALL **eager-prefetch** 一次 `GET <base>/dashboard`,**每個被開啟節點最多一次**(at-most-once per opened node;同值 data refresh MUST NOT 重發),經 Grafana runtime(`@grafana/runtime` `getBackendSrv()`)發往同一 graph API backend——MUST NOT 自 `src/**` 直接以 `fetch` / `axios` / `XMLHttpRequest` 連線外部 backend。此預取與右鍵專屬的 `config_changes` / `code_changes`(application-detail / image-detail)查詢**互相獨立**:Dashboard 預取的觸發條件為**面板開啟**而非右鍵,故左鍵 alerts view 亦會發出。

端點 base path MUST 沿用既有的 `resolveDetailEndpoint` 解析(panel option 非空時覆寫,否則自查詢請求推導為 graph query 的 sibling proxy path),其後串接固定路段 `/dashboard`。base 解析為空字串時,hook MUST 閒置:不發任何查詢、按鈕不渲染。

in-flight 查詢 MUST 於切換節點 / 關閉面板(unmount)時中止,且 MUST NOT 於中止或 unmount 後 setState。

可用性 MUST 嚴格以 **HTTP 200 + 非空 `url`** 判定:回傳 `{ "url": string }` 且 `url` 非空 → **available**(渲染按鈕);非 200、`url` 為空、回應格式錯誤(非物件 / 無 `url`)、或網路錯誤 → **unavailable**(按鈕**不渲染**,且 MUST NOT 對使用者顯示任何錯誤訊息)。可用性語意與 `config_changes` / `code_changes` 一致。

#### Scenario: 面板開啟即預取(左鍵與右鍵皆然)

- **WHEN** 使用者左鍵(alerts view)或右鍵(detail view)開啟某適用節點的 detail 面板
- **THEN** 系統發出一次 `GET <base>/dashboard`,參數為該節點組裝出的 param map(見「請求參數組裝」需求)

#### Scenario: 200 + 非空 url 視為可用

- **WHEN** `/dashboard` 回傳 HTTP 200 且 body 為 `{ "url": "https://…" }`(`url` 非空)
- **THEN** 該查詢狀態為 available,Dashboard 按鈕渲染

#### Scenario: 非 200 / 空 url / 格式錯誤視為不可用且不報錯

- **WHEN** `/dashboard` 回非 200、或回 `{ "url": "" }`、或回應非物件 / 無 `url` 欄、或網路失敗
- **THEN** 該查詢狀態為 unavailable,Dashboard 按鈕 MUST NOT 渲染,且 MUST NOT 顯示任何錯誤訊息或殘留 spinner

#### Scenario: base 解析為空時不發查詢

- **WHEN** `resolveDetailEndpoint` 回傳空字串(option 空且無 target 可解析出 base)
- **THEN** 系統 MUST NOT 發出 `/dashboard` 查詢,Dashboard 按鈕不渲染

#### Scenario: 換節點中止前一查詢並重新預取

- **WHEN** 面板開啟某節點(`/dashboard` 查詢進行中)時使用者改開另一個適用節點
- **THEN** 前一個 in-flight 查詢被中止(不 setState),系統為新節點發出新的一次 `/dashboard` 查詢

### Requirement: Dashboard 請求參數組裝

`/dashboard` 查詢的 query 參數 MUST 由被開啟節點的 `data` 屬性以純函式組裝(可單測),規則如下:

- **排除集合**:`labels` 與所有 panel 內部 rendering-only / 結構欄位 MUST NOT 送出——accent 顏色(`clusterColor` / `namespaceColor`)、`parent`、`worstStatus`、`is*` compound 旗標(`isCluster` / `isController` / `isStorageClass` / `isNamespace`),以及 panel 合成的 `id`(controller 的 `id` 為 `ctrl/…` 合成值,非後端屬性;節點身分以 kind + name 表示)。
- **僅送 scalar**:非 scalar 值(陣列 / 物件,如 `alerts` / `containers` / `owner` / `ipAddress`)MUST NOT 作為 query 參數送出。
- **欄名對應**:節點顯示名存於 `data.label`(normalize 自上游 `name` 對應而來、未保留 `name`),組裝時 MUST 以 `name` 為參數名送出該值;`kind` 原樣送出。
- **Leaf 節點**:送出其(經上述排除後的)scalar 屬性。
- **Compound 節點(僅 k8s-node / controller)**:送出該容器**自身**的 scalar 屬性,**外加**在其**所有直接子節點**(`data.parent === 容器 id`)上**值皆相同**的屬性;值在子節點間**相異**的屬性 MUST **略過**;與自身屬性**衝突時自身值優先**(own-wins);子節點屬性同樣套用上述排除集合與 scalar-only 規則;容器無直接子節點時僅送自身屬性。
- **`cluster` 參數**:雖然 `cluster` 對 eligible 節點**非** first-class data 欄(`labels` 又在排除集合中),Panel SHALL 仍解析並送出 `cluster`:**權威來源**為該節點**最近的 `isCluster` 祖先**(沿 `data.parent` 上溯,穿過 namespace box 等中間 compound)之 `data.cluster`——這是唯一能涵蓋**合成 controller** 的來源(controller 既無 `data.cluster` 亦無 `labels`)。找不到 `isCluster` 祖先時 MUST **退回**該節點自身的 `labels.cluster`;兩者皆無時 MUST **省略** `cluster`(如無所屬 cluster 的頂層 external 節點)。祖先解析 MUST **優先於** labels 退回(祖先為權威),且 MUST **不覆寫**節點自身已帶的 `cluster`(own-wins)。

#### Scenario: leaf 參數排除 labels 與 rendering 欄、label 以 name 送出

- **WHEN** 對一個帶 `kind` / `label` / `namespace` / `labels` / `parent` 的 pod leaf 組裝參數
- **THEN** 送出 `kind` 與 `name`(值為 `data.label`)、以及 `namespace`;MUST NOT 送出 `labels`、`parent`、或任何 `is*` / `*Color` / `worstStatus` / `id` 欄

#### Scenario: compound 合併子節點一致屬性、略過相異屬性

- **WHEN** 對一個 controller compound 組裝參數,其所有子 pod 的某屬性(如 `namespace`)值皆相同、另一屬性(如 `name`)值各異
- **THEN** 該一致屬性併入參數(若自身未帶該欄),相異屬性略過;自身已帶的欄以自身值為準(own-wins)

#### Scenario: 非 scalar 與合成 id 不送出

- **WHEN** 被組裝的節點帶 `alerts` / `containers` / `owner` / `ipAddress` 等非 scalar 欄,且(若為 controller)帶合成 `id`
- **THEN** 這些欄 MUST NOT 出現在 `/dashboard` 的 query 參數中

#### Scenario: cluster 自最近 isCluster 祖先解析(含 controller 經 namespace box 上溯)

- **WHEN** 某 eligible 節點(leaf / controller / k8s-node)巢狀於某 `isCluster` compound 之下(可能經 namespace box 等中間 compound)
- **THEN** `/dashboard` 參數含 `cluster`,值為該最近 `isCluster` 祖先的 `data.cluster`

#### Scenario: cluster 退回 labels.cluster、皆無則省略

- **WHEN** 節點無任何 `isCluster` 祖先但自身帶 `labels.cluster`
- **THEN** `cluster` 取自 `labels.cluster`
- **WHEN** 節點既無 `isCluster` 祖先亦無 `labels.cluster`(如頂層 external)
- **THEN** `cluster` 參數 MUST 省略

### Requirement: Dashboard 按鈕呈現

當某節點的 `/dashboard` 查詢為 **available**(200 + 非空 `url`)時,Panel SHALL 於 node-detail 面板 **header 的節點名稱旁**渲染一顆 Dashboard 按鈕,且在 **`alerts`(左鍵)與 `detail`(右鍵)兩個 view 皆顯示**(header 為兩 view 共用,故單一放置即滿足)。按鈕 MUST 以新分頁開啟該 `url`(`target="_blank"`、`rel="noopener noreferrer"`)。查詢為 **loading** 或 **unavailable** 時 MUST 不渲染任何按鈕(無 spinner、無錯誤、無 placeholder),避免閃爍。按鈕 MUST 以 `@grafana/ui` 元件 + emotion `useStyles2` 實作,並共置於 `node-detail` feature、經其 `index.ts` barrel 匯出。

#### Scenario: 可用時於名稱旁顯示按鈕(兩 view)

- **WHEN** 某適用節點的 `/dashboard` 查詢回傳 200 + 非空 `url`,且面板以 `alerts` 或 `detail` view 開啟
- **THEN** header 於節點名稱旁渲染 Dashboard 按鈕,點擊以新分頁(`noopener,noreferrer`)開啟該 `url`

#### Scenario: loading / 不可用時不渲染按鈕

- **WHEN** `/dashboard` 查詢進行中(loading)、或為 unavailable
- **THEN** header MUST 不渲染 Dashboard 按鈕,且不顯示 spinner 或錯誤訊息
