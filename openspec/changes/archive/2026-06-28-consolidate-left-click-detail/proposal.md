## Why

目前節點資訊被拆成三處且割裂:**左鍵**只開告警表(`alerts` view)、**右鍵**才開 Application / Containers 的 change-report(`detail` view)、屬性(kind / namespace / ip / application / storageclass params…)只在 ephemeral 的 hover tooltip 一閃即逝。使用者必須先知道「要右鍵」才看得到 app detail,且永遠無法在一個持久面板裡同時看到屬性、應用變更與告警。本變更把全部節點資訊統合進**單一左鍵面板**:預設恆顯一個比照 hover tooltip 的屬性區塊(像現行 storageclass 的 key-value 版型),其餘區塊有資料才現身。同時把 change-report 缺值時語意含糊的破折號「—」改為明確的「n/a」。

## What Changes

- **左鍵點擊節點 → 開啟單一統合 detail 面板**(取代現行 `alerts` / `detail` 雙 view 分流):
  - **預設恆顯「屬性」區塊** — 以 storageclass 式 key-value 列呈現節點 name / kind / status 加上 promoted attributes(`namespace` / `ipAddress` / `owner` / `application` / `provisioner` / storageclass `parameters` 等),**資料來源比照 hover tooltip 的 `buildContent` promoted attrs**。此區塊一律渲染(即使其他區塊皆無資料)。
  - **Application / Containers change-report 區塊**:節點帶 `data.application` / `data.containers`(workload kind)時顯示(沿用既有 eager 預取 `config_changes` / `code_changes`、時間欄、Change Type 欄、anchor 三態);**無資料則整段隱藏**。
  - **Alerts 區塊**:節點帶 `data.alerts` 時顯示告警表;**無告警則整段隱藏**(移除現行「No alerts」空狀態訊息)。
- **BREAKING(互動行為變更)**:**右鍵(`cxttap`)不再開啟 detail 面板、不再 eager 預取 change-report**。change-report 改由左鍵統合面板承載並於開啟時觸發預取。`NodeDetailPanel` 的 `view` prop(`'alerts'` / `'detail'`)隨之移除——面板恆為單一統合版型,各區塊以資料有無條件渲染。
  - compound parent 的 **`+/-` 摺疊 cue 不受影響**:它本就由**左鍵選取**驅動(非右鍵),裝飾群組左鍵仍只顯示選取環 + cue、`resolveSelectedNode` 回 `null` 不開面板。
- **缺值占位 em-dash 「—」 → 「n/a」**:統合面板內所有讀不到資料的欄位(`config_changes` / `code_changes` 的 Current / Previous Change Time、Containers 的 Change Type、屬性區塊缺值欄位等)的破折號占位一律改為 muted「n/a」,語意更明確。

## Capabilities

### New Capabilities

（無）— 本變更為既有 `panel-rendering` 行為的修改,不引入新 capability。

### Modified Capabilities

- `panel-rendering`: 三個 requirement 的 detail-面板行為改寫——
  - **互動與選取狀態**:右鍵(`cxttap`)不再觸發 detail / 預取;左鍵成為統合面板的唯一觸發(摺疊 cue 路徑不變)。
  - **Node Detail 面板**:左鍵開啟單一統合面板;新增恆顯的「屬性」區塊(比照 hover tooltip promoted attrs);移除 `view` 雙分流;告警無資料時整段隱藏(取消「No alerts」訊息)。
  - **Node Detail Application 與 Containers 區塊**:change-report 改由左鍵面板承載並預取;觸發由右鍵改左鍵;缺值時間欄 / Change Type 欄占位 em-dash 改 「n/a」。

## Impact

- **程式碼**:
  - `src/features/node-detail/components/NodeDetailPanel/*` — 移除 `view` 分流、新增屬性區塊、各區塊改條件渲染、移除「No alerts」空狀態。
  - `src/features/node-detail/components/{ChangeTimeCell,ChangeTypeCell}/*`(及屬性區塊缺值占位)— `PLACEHOLDER` 由 「—」 改 「n/a」。
  - `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx` — `cxttap` 不再 `onContextSelect` 開 detail(右鍵 detail 移除)。
  - `src/panels/KsgPanel/KsgPanel.tsx` — 移除 `view`(`detailRequest !== null ? 'detail' : 'alerts'`)邏輯;change-report 預取改由左鍵選取驅動。
  - 屬性區塊資料來源比照 `src/features/hover-tooltip` 的 `buildContent` promoted attrs(視情況抽共用 helper,避免 hover 與 detail 兩套漂移)。
- **測試**:`NodeDetailPanel`、`GraphCanvas`(tap / cxttap)、`KsgPanel`(view 移除)、`ChangeTimeCell` / `ChangeTypeCell` 占位字串測試需更新。
- **API / 後端**:無變更(沿用既有 `config_changes` / `code_changes` 端點與 graph JSON 欄位)。
