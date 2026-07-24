# Proposal: ingress-gateway-toggle

## Why

Pod 經由 ingress gateway 呼叫 service 時,圖上會同時出現兩條路徑:`pod → ingressSvc → ingressPod → backendSvc → backendPod`(經 ingress)與 `pod → backendSvc → backendPod`(直連)。兩條路並存讓拓撲雜訊倍增;使用者需要一個開關,關閉時讓「經 ingress 的路徑」**徹底消失**、只留直連路徑。

## What Changes

- 左側 legend 新增一個 **Ingress gateway 顯示/隱藏 toggle**(eye / eye-slash,與現有 node-kind 眼睛切換同語彙)。
- 新增持久化 panel option `showIngress: boolean`(預設 `true`),於 options editor 以 boolean switch 呈現,並支援舊 dashboard 缺欄位時的向後相容讀取(`?? defaultOptions`)。
- `computeVisibility` 增加第 4 個可選參數 `showIngress = true`:關閉時隱藏
  1. 所有帶 label `role: "ingress-gateway"` 的節點(不限 kind),以及
  2. 這些 ingress **service** 沿 `service-selects-pod` edge 所 select 的 pods(即使 pod 自身無該 label)。
- 相連 edge 的自動隱藏與空 compound 的清除交由既有 edge pass + orphan 級聯處理,不新增級聯邏輯。
- 新增共用常數 `INGRESS_LABEL_KEY` / `INGRESS_LABEL_VALUE`(single-source-map 慣例)。

無 **BREAKING** 變更:預設值 `true` 下行為與現狀完全一致;既有 `computeVisibility` 呼叫端不需修改。

## Capabilities

### New Capabilities

- `ingress-visibility-toggle`: ingress gateway 節點(以 `role=ingress-gateway` label 辨識)及其 select 的 pods 的顯示/隱藏切換 — legend toggle、panel option 持久化、可見性計算語意。

### Modified Capabilities

(無 — 既有 `panel-rendering` 的 kind/edge 過濾與 legend 需求不變,本切換為純新增的獨立 legend 區塊與獨立過濾條件。)

## Impact

- `src/features/element-filter/computeVisibility.ts`(+tests)— 新 predicate 與可選參數。
- `src/features/legend/components/IngressToggle/`(新元件,四檔共置)+ legend barrel。
- `src/panels/KsgPanel/KsgPanel.types.ts` / `KsgPanel.editor.tsx` / `KsgPanel.tsx`(+tests)— 新 option、editor switch、接線。
- `src/shared/constants/ingressGateway.ts`(新常數檔)+ constants barrel。
- 資料層零修改:`normalize.ts` 已保留 `labels`,`cytoscape.d.ts` 已宣告 `labels?: Record<string, string>`。
- 後端 / demo fixture 不需改動(demo seeder 目前無帶此 label 的節點,隱藏行為以單元測試驗證)。
