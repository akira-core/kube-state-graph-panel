# Tasks: ingress-gateway-toggle

## 1. 常數

- [x] 1.1 新增 `src/shared/constants/ingressGateway.ts`:`INGRESS_LABEL_KEY = 'role'`、`INGRESS_LABEL_VALUE = 'ingress-gateway'`,附註明此為後端保證的 ingress-gateway 節點 label
- [x] 1.2 於 `src/shared/constants/index.ts` barrel 加入 `export * from './ingressGateway';`

## 2. computeVisibility predicate

- [x] 2.1 `src/features/element-filter/computeVisibility.ts`:新增 module-private `collectIngressHiddenIds(elements): Set<string>`(pass 1: label 命中節點;pass 2: `service-selects-pod` 且 source ∈ 集合 → 加 target,單層)
- [x] 2.2 `computeVisibility` 加第 4 個可選參數 `showIngress = true`;`false` 時 node pass 跳過集合內 id(`useElementFilter`、barrel、`hideOrphans` 不動)
- [x] 2.3 擴充 `computeVisibility.test.ts` 新 `describe('ingress gateway toggle')`(重用既有 `node()`/`edge()` factory):雙路徑 fixture 關閉後恰餘 `{p, bsvc, bpod}` 與直連兩 edge;參數省略全可見;帶 label 的 pod 單獨隱藏;被 select 無 label 的 pod 隱藏;無 label service 的 pods 不受影響;`cluster > node` compound 隨級聯清空

## 3. IngressToggle legend 元件

- [x] 3.1 新增 `src/features/legend/components/IngressToggle/`(`IngressToggle.tsx` / `.types.ts` / `.test.tsx` / `index.ts`):props `{ visible: boolean; onToggle: () => void }`,文字 "Ingress gateway" + eye/eye-slash IconButton,`useStyles2`,named export
- [x] 3.2 於 `src/features/legend/index.ts` barrel 匯出 `IngressToggle`
- [x] 3.3 元件測試:icon 隨 `visible` 切換、click 觸發 `onToggle`

## 4. Panel option 與接線

- [x] 4.1 `KsgPanel.types.ts`:`KsgPanelOptions` 加 `showIngress: boolean`,`defaultOptions.showIngress = true`
- [x] 4.2 `KsgPanel.editor.tsx`:`addBooleanSwitch({ path: 'showIngress', … })`;`KsgPanel.editor.test.tsx` recorded-builder 斷言同步擴充
- [x] 4.3 `KsgPanel.tsx`:向後相容讀取 `options.showIngress ?? defaultOptions.showIngress`;`computeVisibility(elements, visibleKinds, visibleEdgeTypes, showIngress)` 並補 memo deps;`handleToggleIngress` callback;`<IngressToggle />` 置於 `<NodeLegend />` 之後
- [x] 4.4 `KsgPanel.test.tsx`:仿既有 eye-toggle 測試 — 點擊 toggle 斷言 `onOptionsChange` 收到 `{ ...options, showIngress: false }` 且其他 option 不變

## 5. 驗證

- [x] 5.1 `npm run typecheck && npm run lint && npm run test:ci` 全綠
- [x] 5.2 手動:`npm run dev` + docker compose 起 demo,確認 legend toggle UI 與 option 持久化(demo fixture 無 ingress label 節點,隱藏行為以單元測試為準)
