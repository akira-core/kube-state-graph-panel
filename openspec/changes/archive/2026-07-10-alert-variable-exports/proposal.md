# alert-variable-exports

## Why

`podListVariable` 目前匯出**全圖所有** pod 名稱,對「用變數驅動 log / VictoriaMetrics 查詢」的實際情境雜訊太多——使用者只關心**有 alert 的 pod**。同時 alert 名稱本身也是查詢維度(VictoriaMetrics 以 alertname 查詢),但 panel 沒有任何 alert 名稱的匯出。

## What Changes

- **BREAKING** `podListVariable` 更名為 `alertPodListVariable`,語意由「全部 pod」改為「**帶有 alert 的 pod**」(`data.alerts` 非空的 `kind === 'pod'` 節點),去重 + 字典序不變。既有 dashboard 用舊 option key(`podListVariable`)者升級後匯出停用,需改用新 key。
- **新 panel option `alertNameListVariable`**(text input,預設空字串 = 停用):匯出全圖**所有 alert 名稱**(`NodeAlert.name`,跨所有節點的 `data.alerts` 收集,去重 + 字典序),供 VictoriaMetrics 以 alertname 查詢。controller 聚合子 pod alerts 造成的重複由去重吸收。
- 兩者仍為**資料驅動**(graph 資料載入/refresh 觸發,非點擊),沿用 `writeDashboardVariable` 單一寫入路徑(`$__empty` 哨兵、等值跳過、history replace)。
- Demo dashboard 同步:`pod_list` 變數與 panel option 改為 alert-gated 語意,新增 `alert_names` 變數示範。

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `pod-list-variable-export`: (1) option `podListVariable` → `alertPodListVariable`,擷取規則由「所有 pod」改為「`alerts` 非空的 pod」;(2) 新增 `alertNameListVariable` option 與 alert 名稱擷取需求(所有節點 `alerts[].name`,去重排序);(3) 兩變數獨立 gating。
- `selected-pod-export`: 僅交叉引用更新 — option 需求文中「與 `podListVariable`(全量 pod 清單匯出)各自獨立」改指新的 alert 清單匯出選項(`alertPodListVariable` / `alertNameListVariable`);行為不變。

## Impact

- `src/features/variable-export/`:`extractPodNames.ts` 改寫(alert gating)或改名(如 `extractAlertPodNames.ts`);新增 alert 名稱擷取純函式;`useVariableExport.ts` 擴充或新增 hook 承接第二變數;barrel 更新;對應測試。
- `src/panels/KsgPanel/`:`KsgPanel.types.ts` option 更名 + 新 option;`KsgPanel.editor.tsx` 文案更新;`KsgPanel.tsx` 接線(L264-266 一帶)。
- `provisioning/dashboards/ksg-demo.json`:變數與 option 更新。
- 消費端變數型別:兩者皆多值 → custom + multi + allowCustomValue(沿用既有文件要求)。
- `selected-pod-export`(點擊驅動匯出)不受影響。
