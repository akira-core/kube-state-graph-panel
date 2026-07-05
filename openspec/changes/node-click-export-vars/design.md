# node-click-export-vars — Design

## Context

現有 `selected-pod-export`(`src/features/variable-export/`)在左鍵選取時把 pod 名寫入 `selectedPodVariable`,但被兩個限制卡住新使用情境(點 node → ClickHouse log panel 過濾):

1. **Status gating**:僅 `status ∈ {warning, critical}` 的 pod 匯出;normal pod 一律清除(`selectedPodExportValue.ts:34`)。
2. **輸入太窄**:`SelectedPodExportInput` 只有 `kind/status/label` — 無法解析 cluster(pod 節點不帶 `cluster` 欄位,要走 `data.parent` 祖先鏈到 `isCluster` 容器),也無法收集 controller 的子 pod。

相關既有機制:

- 寫入路徑:`writeDashboardVariable(name, values)` — 唯一 `@grafana/runtime` 觸點,支援多值陣列(重複 `var-x=a&var-x=b`)、`$__empty` 清除哨兵、順序無關等值跳過、`replace: true`。`useVariableExport`(全量 pod 清單)已用它寫多值。
- Cluster 解析:`assembleDashboardParams.ts` 的 `resolveCluster`(private)— 走 `data.parent` 鏈找最近 `isCluster` 祖先的 `data.cluster`,fallback 節點自身 `labels.cluster`。
- Controller 子 pod:controller mode(預設)下 pod 直接以 `data.parent === controllerId` 巢狀在 controller compound 內;**node mode 會整層 DROP controller/namespace/application group**(`applyPodParentMode.ts:58-59,89-91`)— node mode 下 controller 節點不存在、不可能被點擊。
- Panel 接線:`KsgPanel.tsx:378` `useSelectedPodExport(selectedNode, true, selectedPodVariable, …)`;`selectedNodeId` state 由 GraphCanvas `onSelect` 驅動(背景/cluster 背板點擊 → null)。

## Goals / Non-Goals

**Goals:**

- 左鍵點擊任一 pod:寫入 pod 名(`selectedPodVariable`)+ cluster 名(`clusterVariable`,新 option)。
- 左鍵點擊 controller compound(`isController`):寫入其**全部直接子 pod** 名(多值)+ cluster 名。
- 點擊其他節點 / 取消選取:兩變數清除。
- 消費端(ClickHouse log panel)用法簡單:`$cluster_sel` 單值、`$selected_pod` 單/多值,可直接進 `WHERE cluster = '$cluster_sel' AND pod IN ($selected_pod)` 類查詢。

**Non-Goals:**

- 不新增右鍵/其他手勢路徑(維持既有單一 selection 路徑)。
- 不做 owner-label 反查(node mode 下無 controller 可點,不需要跨 mode 的 pod 歸屬推導)。
- 不自動建立 dashboard 變數(Grafana 公開 API 無此能力,維持既有假設:變數已存在)。
- `podListVariable`(全量清單)不動。

## Decisions

### D1: 演進 `selected-pod-export`,不開平行 capability

新需求與既有 selected-pod export 是同一個互動(左鍵選取 → 變數寫入)。若另開新 capability + 新變數,dashboard 會有兩個語意重疊的 pod-click 變數,「easy to use」直接破功。故修改既有 capability:移除 status gating、加 controller fan-out、加 cluster 變數。

**行為變更**:原「僅 warning/critical pod 匯出」語意移除。原本依賴 alert-gated 行為的 dashboard(demo 的 `selected_pod`)改為「點了就匯出」— 這正是本次需求。

### D2: 純函式改為 `elements + selectedNodeId` 驅動(取代 `NodeDetailData` 切片)

現行 `selectedPodExportValue(node, isLeftClick)` 的輸入不足以解析 cluster 與子 pod。新純函式:

```ts
// src/features/variable-export/nodeClickExportValues.ts
export interface NodeClickExportValues {
  podNames: string[];   // [] = clear
  clusterName: string[]; // [cluster] 或 [] = clear(沿用陣列介面餵 writeDashboardVariable)
}
export function nodeClickExportValues(
  elements: readonly cytoscape.ElementDefinition[],
  selectedNodeId: string | null
): NodeClickExportValues
```

規則:

- `selectedNodeId === null` 或找不到節點 → 兩者 `[]`。
- `kind === 'pod'` → `podNames = [label]`。
- `isController === true` → `podNames` = 直接子節點(`data.parent === id && kind === 'pod'`)的 `label`,**去重 + 字典序**(穩定 fingerprint、順序無關)。子 pod 為 0 → `[]`(清除)。
- 其他節點(service/node/pvc/storageclass/namespace/application/cluster)→ 兩者 `[]`。
- `clusterName`:pod/controller 命中時走祖先鏈解析(見 D4);解析失敗 → `[]`。

替代方案(被否決):擴充 `NodeDetailData` 帶 cluster + 子 pod — 把 view-model 塞資料層職責,且 namespace/application 點擊時 `selectedNode` 為 null,語意繞路。`elements + id` 是最直接的 single source。

`selectedPodExportValue.ts` 刪除(被新函式取代);`useSelectedPodExport` 改名 `useNodeClickExport`,簽名:

```ts
useNodeClickExport(
  elements: readonly cytoscape.ElementDefinition[],
  selectedNodeId: string | null,
  podVariable: string,
  clusterVariable: string
): void
```

內部各自 trim + gating(任一為空字串則該變數完全停用、不呼叫 locationService),兩個 `writeDashboardVariable` 呼叫、各自以 value fingerprint 為 effect key(沿用既有 join fingerprint 模式)。

### D3: 子 pod 收集用「當前 view elements 的直接巢狀」,不用 owner 反查

controller mode 下 pod 的 `parent` 就是 controller id(backend D6 hierarchy 原樣);node mode 下 controller 節點被 `applyPodParentMode` 整個丟掉 — 點不到,無此情境。因此以 `KsgPanel.tsx:282` 的 `elements`(post `applyPodParentMode` + `wrapSwitchFabric`)為輸入、`parent === id` 收集即可,與 `assembleDashboardParams` 的 childData 收集模式一致。

Collapse 狀態不影響:expand-collapse 摺疊只動 cy instance,React 端 `elements` prop 不變 — 點擊已摺疊 controller 仍匯出全部子 pod。

### D4: cluster 解析在 variable-export 內部實作(不跨 feature 匯入 node-detail)

`resolveCluster` 是 `assembleDashboardParams.ts` 的 private 函式。跨 feature 重用需經 barrel 匯出,會讓 variable-export 依賴 node-detail — 現有程式已明文選擇避免此耦合(`selectedPodExportValue.ts:3-5` 註解)。在 `nodeClickExportValues` 內部重現同一走訪(byId map → `parent` 鏈 → 最近 `isCluster` 祖先的 `data.cluster`,fallback 自身 `labels.cluster`,hop guard 防環)。~20 行的受控重複,換取 feature 邊界乾淨。

替代方案(被否決):把 resolveCluster 提升到 `src/shared/` — 動到 node-detail 既有測試面,超出本次範圍;若日後第三處需要再提升。

### D5: 沿用 `selectedPodVariable`,新增 `clusterVariable`

- `selectedPodVariable`(既有 option,名稱不變 — 已存在的 dashboard 設定零遷移):承接單值(pod 點擊)或多值(controller 點擊)。editor 描述更新。
- `clusterVariable`(新,`KsgPanelOptions` string,預設 `''` = 停用):cluster 名。
- 兩者獨立 gating:只設其一也可運作。

消費端文件(editor description + spec):多值情境下目標變數必須是 **custom + multi + allowCustomValue**(textbox 僅單值;query/options 型會 revalidate 丟棄外部值)。

### D6: 寫入語意沿用既有防護

- 單一寫入路徑 `writeDashboardVariable`(哨兵/等值跳過/`replace: true`)不動。
- 多值排序 + 去重在純函式端完成 → fingerprint 穩定,data refresh re-render 不重複寫。
- `isLeftClick` 參數隨 `selectedPodExportValue` 刪除一併消失(production 只有一條 selection 路徑,`KsgPanel.tsx:378` 已恆傳 `true`;死參數不再保留)。

## Risks / Trade-offs

- [行為變更] normal pod 點擊從「清除」變「匯出」→ 舊 alert-gated 消費端會多收到值。Mitigation:proposal 標示行為變更;demo dashboard 同步更新示範新語意。
- [消費端變數型別] 使用者用 textbox 變數接多值 → 只吃到第一值或格式錯。Mitigation:editor description + spec 明文要求 custom+multi+allowCustomValue;demo dashboard 直接示範正確設定。
- [受控重複] cluster 走訪邏輯與 node-detail 存在兩份。Mitigation:註解互相指涉;第三處出現時提升至 shared。
- [大 controller] 子 pod 極多時 URL 變長(重複 `var-x=`)。Grafana 對 URL 長度有瀏覽器上限,實務上單 controller pod 數(<100)遠低於風險線。不處理。

## Migration Plan

單 repo、panel-only:實作 + 測試 + demo dashboard 一次進。無資料遷移。Rollback = revert commit。

## Open Questions

(無 — 需求邊界已由使用者陳述固定:pod → cluster+pod 名;controller → cluster+全部 pod 名。)
