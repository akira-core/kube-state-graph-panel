# alert-variable-exports — Design

## Context

現況(`src/features/variable-export/`):

- `extractPodNames.ts`:自 normalize 輸出(baseElements,**未經** pod-parent-mode 視圖變換)收集**所有** `kind === 'pod'` 節點的 `label`,去重 + 字典序。
- `useVariableExport(elements, variableName, enabled)`:資料驅動,內部呼叫 `extractPodNames`,經 `writeDashboardVariable` 寫入(`$__empty` 哨兵、等值跳過、history replace)。`KsgPanel.tsx:266` 接線。
- Alert 資料:`data.alerts?: NodeAlert[]`(`NodeAlert { pod?, service?, name, severity, timeRecords }`)。normalize 的 `enrichControllers` 會把子 pod alerts **聚合**到 controller 節點上;node/pvc/service 也可自帶 alerts。
- Demo 資料現實:`ksg-switch-demo`(inline showcase)有帶 alert 的 pod(`mongo-2`、`mesh-gateway-0`)+ node(`worker-1`)+ pvc(`data-mongo-2`);`ksg-demo`(backend)的 seed **無 alert 契約**(`topology.prom` 標明 hard backend limit)→ backend demo 的 alert 變數恆為空。兩個 dashboard 的 panel options 都設了 `podListVariable`。

## Goals / Non-Goals

**Goals:**

- `podListVariable` → `alertPodListVariable`:只匯出 `data.alerts` 非空的 pod 名稱(去重 + 字典序)。
- 新 option `alertNameListVariable`:匯出全圖所有 `alerts[].name`(跨**所有節點種類**收集,去重 + 字典序),供 VictoriaMetrics 以 alertname 查詢。
- 兩者維持資料驅動 + 既有寫入防護;視圖狀態(collapse / filter / pod-parent mode)不影響輸出。

**Non-Goals:**

- 不保留 `podListVariable` 舊 key 的回讀相容(硬 BREAKING,使用者明確要求更名;倉內兩個 provisioned dashboard 同步更新)。
- 不做 severity 過濾(任何 severity 的 alert 都算「有 alert」);日後需要再加 option。
- 不改點擊驅動匯出(`selected-pod-export`)。
- 不擴充 backend seed 產生 alerts(topology.prom 載明無契約,非本 repo 能解)。

## Decisions

### D1: 硬更名,無舊 key fallback

`KsgPanelOptions.podListVariable` 直接改名 `alertPodListVariable`,不讀舊 key。理由:使用者明確要求更名;語意同時改變(全量 → alert-gated),沿用舊 key 反而讓舊 dashboard 「悄悄改行為」— 顯式停用(舊 key 被忽略、匯出不啟動)比默默改語意安全。倉內 `ksg-demo.json`、`ksg-switch-demo.json` 同步改。editor description 註明遷移。

### D2: 兩個獨立純函式,alert 名稱收集不限 pod

- `extractAlertPodNames.ts`(取代 `extractPodNames.ts`,舊檔刪除):`kind === 'pod' && alerts 非空` → `label`,去重 + 字典序。輸入維持 baseElements(normalize 直接輸出)。
- `extractAlertNames.ts`(新):走訪**所有** node 元素的 `alerts[].name`,去重 + 字典序。不限 pod — showcase 實證 node/pvc 也帶 alerts,VictoriaMetrics 查 alertname 不分來源種類。controller 聚合子 pod alerts 造成的重複由 Set 去重吸收。
- 兩者皆不看 severity、不看視圖狀態。

### D3: `useVariableExport` 泛化為 `useListVariableExport(values, variableName, enabled)`

現行 hook 把 extractor 寫死在內部,無法承接第二種清單。改為通用簽名:

```ts
useListVariableExport(values: readonly string[], variableName: string, enabled: boolean): void
```

- 內部 trim-gating(變數名空字串 = 停用)+ value fingerprint effect(同 `useNodeClickExport` 的 join-space 模式;Prometheus alertname 與 pod 名皆無空白字元,fingerprint 無碰撞)。
- **`enabled` 參數保留** — 它承載的是既有 spec「錯誤與初載入狀態不寫入」需求的資料狀態閘(`hasPayload && seriesError === undefined && !isFatalNormalizeError`,`KsgPanel.tsx:265`)。這是 panel 資料狀態,hook 無從自知;若砍掉,查詢錯誤時空 values 會被誤寫成 `$__empty` 哨兵,直接違反該需求。兩個新變數沿用同一個 `variableExportEnabled` 閘。
- KsgPanel 以 `useMemo` 計算兩份清單後各呼叫一次:

```ts
const alertPodNames = useMemo(() => extractAlertPodNames(baseElements), [baseElements]);
const alertNames = useMemo(() => extractAlertNames(baseElements), [baseElements]);
useListVariableExport(alertPodNames, alertPodListVariable, variableExportEnabled);
useListVariableExport(alertNames, alertNameListVariable, variableExportEnabled);
```

替代方案(被否決):保留 `useVariableExport(elements, name, enabled)` 再複製一個 alert-name 版 — 兩份幾乎相同的 hook 樣板;extractor 當參數傳入則 hook 對函式識別穩定性有隱含要求,不如讓呼叫端 memo 好懂。

### D4: Demo 更新以 showcase 為主場

- `ksg-switch-demo.json`(有 alert 資料):option 改 `alertPodListVariable`,變數更名 `alert_pod_list`;新增 `alert_names` 變數 + `alertNameListVariable` option。預期值:`alert_pod_list = [mesh-gateway-0, mongo-2]`、`alert_names` = 12 個去重名稱(pod/node/pvc 合計)。
- `ksg-demo.json`(backend,無 alert):option/變數同步更名 + 新增,但 text panel 註明「backend seed 無 alert 資料,此二變數在本 demo 恆為 `$__empty`」— 誠實呈現而非造假資料。
- 兩 dashboard 變數皆 custom + multi + allowCustomValue(沿用 node-click-export-vars 建立的型別要求)。

### D5: Spec delta 結構

`pod-list-variable-export` capability:

- REMOVED:「Panel option 指定目標變數(預設停用)」(option 名寫死在需求文)與「Pod 名稱擷取(資料層、全量)」(「全量」語意廢止)— 附 Reason/Migration。
- ADDED:option 需求(雙 option、獨立 gating)、alert-pod 擷取需求、alert-name 擷取需求。
- 寫入路徑需求(多值、哨兵、等值跳過)若原 spec 為獨立 requirement 則 MODIFIED 涵蓋兩變數;否則併入 ADDED。

## Risks / Trade-offs

- [BREAKING 靜默停用] 使用者既有 dashboard 用舊 key → 升級後匯出直接停用且無警告。Mitigation:editor description + proposal 載明;倉內 demo 全改,升級即範例。
- [backend demo 無法展示] `ksg-demo` 的 alert 變數恆空。Mitigation:D4 text panel 說明;showcase dashboard 為展示主場。
- [alert 名稱來源含非 pod 節點] 若使用者只想要 pod 的 alertname,node/pvc alerts 會混入。取捨:VictoriaMetrics alertname 查詢本就全域;要窄化可後續加 option,先簡。

## Migration Plan

單 repo、panel-only。實作 + 測試 + 兩個 demo dashboard 一次進;rollback = revert commit。使用者側遷移:panel options 重填變數名(舊 `podListVariable` 值不搬移)。

## Open Questions

(無)
