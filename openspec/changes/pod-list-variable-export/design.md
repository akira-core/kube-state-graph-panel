# Design: pod-list-variable-export

## Context

Panel 已有完整的資料管線:`useGraphData → normalizeGraph → ElementDefinition[]`(`KsgPanel` 持有 normalize 後的 `elements`,pod 節點帶 `data.kind === 'pod'` 與顯示名稱)。Dashboard 變數側,2026-06-12 的查證(memory `panel-writes-variables`,雙反方驗證通過)確立:

- Panel **可以**用 `locationService.partial({ 'var-<name>': string[] }, true)` 寫既有變數的值;陣列序列化為重複參數 `var-x=a&var-x=b`,Grafana 12 scenes 經 URL sync 套回變數並讓相依 panel re-query。
- Panel **不能**建立變數或注入下拉選項(`getTemplateSrv` 唯讀)——目標變數必須已存在於 dashboard。
- Prior art(Volkov Labs business-variable、Bright Tree Panel)的共同守則:`replace=true` 防 history spam、寫前與 URL 現值比對防迴圈、空值哨兵 `'$__empty'`。

消費端場景:ES logs panel 以 `kubernetes.pod_name:${pod_list:lucene}` 之類的查詢引用,Grafana 的格式修飾符(`:lucene`、`:pipe`、`:json`…)負責把多值串成各 datasource 需要的字串——這就是「用 Grafana 格式」的部分;panel 只負責供應標準多值。

## Goals / Non-Goals

**Goals:**

- Panel 每次拿到新 graph 資料,自動把**全部** pod 名稱(非選取)寫入 option 指定的變數。
- 預設停用、零行為變化;啟用後寫入具防護(等值跳過、replace、空清單哨兵)。
- `@grafana/runtime` touchpoint 隔離在單一模組,可被 `jest.mock` 完整測試。

**Non-Goals:**

- 不建立變數、不注入變數選項(API 不存在)。
- 不做「點選 pod → 寫入變數」的互動式選取(未來可在同一 feature 上加)。
- 不在 demo 內架 Elasticsearch;demo 只驗證變數值被寫入。
- 不過濾/轉換名稱格式(lucene escape 等交給消費端的格式修飾符)。

## Decisions

### D1: 觸發時機 = elements 變更的 effect,輸入為全部 pod

`KsgPanel` 以 `useMemo` 從 normalize 直接輸出的 `baseElements`(**未經** `applyPodParentMode`/`wrapSwitchFabric` 視圖變換)導出排序去重後的 pod 名稱清單,`useEffect([podNames, varName])` 觸發寫入。不掛在 `useGraphData` 內(保持 normalize 邊界純粹),也不掛在 cytoscape 事件(資料層行為,與畫布無關)。名稱取 `data.label`(normalize 已把上游 `data.name` 映射為 `label`,缺值 fallback 為 id),空字串再 fallback `data.id`。collapse/visibility/pod-parent mode 狀態**不**影響輸出——「圖裡有哪些 pod」是資料層事實,使用者摺疊容器或切換檢視模式不代表 ES logs 要少查那個 pod。

**錯誤與初載入閘門**:panel 處於「非成功載入」的四種狀態時 MUST 不寫入——查詢錯誤 `seriesError`、初次載入中 `isLoading && baseElements.length === 0`、整包 normalize 失敗 `normalizeError && baseElements.length === 0`,以及 **frames 無可辨識 payload**(`useGraphData` 新增的 `hasPayload === false`:空 series、隱藏/未執行查詢、字串皆不可解析——adversarial review 發現的第四態,Done-with-no-payload 與「合法空 graph」在原三條件下不可區分)。查詢失敗或沒拿到資料都不等於「沒有 pod」,把這些狀態寫成 `$__empty` 會讓 ES panel 查空。hook 收 `enabled` 參數,由 `KsgPanel` 以上述條件計算。真正的空 graph(`hasPayload === true`、零 pod)才寫哨兵。

### D2: 模組切分(feature-first + touchpoint 隔離)

```
src/features/variable-export/
├── extractPodNames.ts        # 純函式:ElementDefinition[] → string[](kind==='pod',去重,排序)
├── writeDashboardVariable.ts # 唯一 @grafana/runtime touchpoint:讀現值、比對、partial 寫入
├── useVariableExport.ts      # hook:把上面兩者接到 React 生命週期
└── index.ts                  # barrel
```

倣 `node-detail/resolveDetailEndpoint.ts` 先例:runtime 相依集中一檔,測試以 `jest.mock('@grafana/runtime')` 注入 `locationService` stub。

### D3: 寫入防護條款

1. **等值跳過**:寫前 `locationService.getSearch().getAll('var-<name>')` 取現值,與目標清單做**順序無關**比對(Set 等值),相同即不呼叫 `partial`。防 re-render 迴圈、防無意義的 URL 更新。
2. **replace=true**:沿用全部 prior art;dashboard 30s auto-refresh 下,push 模式會把瀏覽器上一頁塞滿。
3. **空清單哨兵**:pod 數為 0 時寫 `['$__empty']`(Volkov 慣例)。替代方案「刪除 var- key(partial 傳 null)」被否決:刪 key 只是解除 URL 釘選,變數殘留上一次的 pod 清單,ES panel 會查到已消失的 pod。
4. **停用條件**:option 為空字串(trim 後)→ hook 完全不動作,unmount 不清理(寫入的值留給 dashboard,屬使用者狀態)。

### D4: Panel option `podListVariable`(text input,預設 `''`)

變數名由使用者指定而非寫死 `pod_list`:dashboard 變數命名是使用者領域。預設空字串 = 停用,確保既有 dashboard(含 showcase)零影響。不做「變數是否存在」的執行期檢查——寫一個不存在的 `var-x` param 是無害 no-op(Grafana 忽略不認識的 var- key),換取不依賴 `getTemplateSrv` 的簡單性。

### D5: Demo 驗證路徑

`ksg-demo.json` 加 `pod_list` **custom multi** 變數(佔位選項 `$__empty`——不能用一般字串如 `none`:scenes 對 `current: {}` 的 multi custom 變數預設選第一個選項,首次寫入前消費端會拿佔位字串去查一個叫該名字的 pod;`$__empty` 哨兵則保證查無即正確語義),panel options 設 `podListVariable: "pod_list"`。選 custom 型別的理由:textbox 只能單值;query 變數需要多餘的查詢。已知 scenes 限制:custom 變數的 revalidation 可能把不在選項清單的值丟回預設——但 (a) 初次 URL sync 有 `skipNextValidation`,(b) 變數被重設時 scenes 會把重設值同步回 URL,下一次 graph refresh 我們的等值比對會偵測到差異並重寫。自我修復,殘留視窗 ≤ 一個 refresh 週期。

### D6: 無自濾迴圈(與 `name` 變數的差異)

`pod_list` **不得**出現在本 panel 自己的查詢 URL(這是它與既有 `name` 變數的本質差異)。寫入只會觸發掛了 `${pod_list}` 的其他 panel re-query。spec 以 scenario 固定此約束(demo dashboard 的 panel target URL 不含 pod_list)。

## Risks / Trade-offs

- [scenes revalidation 丟值(query/custom 變數選項重載時)] → D5 的自我修復迴路;文件註明建議變數型別;每次 graph refresh 都會重新比對重寫。
- [URL 過長(數百 pod × 重複參數)] → 一般 HTTP/proxy 上限 ~2-8KB;demo 規模(個位數 pod)無虞。spec 不設硬上限,風險記錄於此;真實叢集若超長,屬消費端架構問題(應改用 backend 過濾而非變數窮舉)。
- [Grafana data-link var- 寫入在 11.3–11.5 有「URL 變了 panel 不刷新」regression(#108426/#114826)] → 該 regression 在 data-link 導航路徑,非 `locationService.partial`;demo 以 Grafana 12.4 實測驗收。
- [每次 refresh 都比對 URL] → 成本是一次 `getSearch()` 解析,O(pods) Set 比對;可忽略。

## Migration Plan

純前端新增,option 預設停用 → 無部署/回滾風險。回滾 = 移除 option 設定即停止寫入(URL 殘值可手動改變數清掉)。

## Open Questions

(無——機制已於 2026-06-12 經 8-agent 查證,僅剩 demo 實測驗收,列入 tasks。)
