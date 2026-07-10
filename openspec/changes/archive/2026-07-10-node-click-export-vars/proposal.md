# node-click-export-vars

## Why

使用者要在同一個 dashboard 放一個 ClickHouse log panel,點擊 graph 上的 pod 或 controller 後直接以 dashboard 變數過濾該 pod(群)的 logs。現有 `selected-pod-export` 只在 pod 為 warning/critical 時匯出單一 pod 名,且完全沒有 cluster 名稱與 controller(多 pod)支援 — 對「點了就能看 logs」的使用情境不夠用。

## What Changes

- **pod 左鍵點擊**:匯出該 pod 的 **cluster 名稱** 與 **pod 名稱** 至兩個 dashboard 變數。取消現行「僅 warning/critical 匯出」的 status 限制 — 任何 pod 點擊皆匯出(**行為變更**,原 alert-gated 行為移除)。
- **controller 左鍵點擊**(`isController` compound:deployment/statefulset/daemonset/...):匯出 **cluster 名稱** 與 **該 controller 底下所有 pod 名稱**(多值)至同兩個變數。
- **新 panel option `clusterVariable`**(text input,預設空字串 = 停用),指定 cluster 名稱要寫入的變數;沿用 `selectedPodVariable` 承接 pod 名稱(單值或多值)。
- 點擊其他節點(service/node/pvc/cluster 容器/背景)時,兩變數皆清除(`$__empty` 哨兵),沿用既有 `writeDashboardVariable` 單一寫入路徑與等值跳過防護。
- Demo dashboard 更新:示範變數 + ClickHouse-style log panel 用法(以現有 provisioning 能力為限)。

## Capabilities

### New Capabilities

(無 — 本次為既有 capability 的行為擴充)

### Modified Capabilities

- `selected-pod-export`: (1) 取消 status gating — 任何 pod 左鍵點擊皆匯出其名稱;(2) controller 左鍵點擊匯出其所有子 pod 名稱(多值);(3) 新增 `clusterVariable` option — 匯出被點擊 pod/controller 所屬 cluster 名稱;(4) 非 pod/controller 節點與取消選取時清除兩變數。

## Impact

- `src/features/variable-export/`:`selectedPodExportValue.ts` 重寫(status gate 移除、controller fan-out、cluster 解析)、`useSelectedPodExport.ts` 擴充(雙變數寫入)、對應測試。
- `src/panels/KsgPanel/`:`KsgPanel.types.ts` + `KsgPanel.editor.tsx` 新增 `clusterVariable` option;`KsgPanel.tsx` 傳遞 elements/cluster 解析所需資料。
- cluster 名稱解析重用 `assembleDashboardParams.ts` 的 `resolveCluster` 祖先鏈走訪模式(pod/controller 節點本身不帶 `cluster` 欄位)。
- `provisioning/dashboards/ksg-demo.json`:示範變數與 log panel。
- 既有 `pod-list-variable-export`(全量清單)不受影響。
