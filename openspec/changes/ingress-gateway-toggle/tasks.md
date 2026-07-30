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

## 6. demo fixture 擴充(showcase inline)

- [x] 6.1 `provisioning/dashboards/ksg-switch-demo.json` inline `data`:新增 `prod/app/ingress`(application)、`prod/ctrl/Deployment/ingress`(controller)、`service/ingress-svc`(帶 `labels.role="ingress-gateway"`)、`pod/ingress-0`(不帶 role label)四節點,與 `e-ing-0`(gateway→ingress-svc)、`e-sel-6`(ingress-svc→ingress-0)、`e-ing-1`(ingress-0→mongo-svc)三 edges;既有節點/edge 與 escaped-JSON 格式不動
- [x] 6.2 backend seeder 不改(設計決策 6:後端無 generic labels contract),於 design/proposal 記錄此限制

## 7. demo 目視驗收

- [x] 7.1 `/d/ksg-switch-demo`:toggle 關閉 → ingress-svc、ingress-0、三條 edge 與清空的 ingress app/controller 容器消失,直連 `gateway → mongo-svc → mongo pods` 保留
- [x] 7.2 toggle 重新開啟 → 雙路徑還原;`npm run test:ci` 維持全綠

## 8. Ingress 流量路徑虛線(設計決策 7)

- [x] 8.1 `src/shared/graph/collectIngressNodeIds.ts`:把集合推導由 `computeVisibility` module-private 提升為 exported 純函式 + 自身單元測試(供 element-filter 與 graph-data 共用);design 決策 2 同步修正
- [x] 8.2 `src/features/graph-data/normalize.ts`:後置 pass `markIngressEdges`,對合格 edge clone 出 `data.ingressPath = true`;`cytoscape.d.ts` 宣告 `ingressPath?: boolean`
- [x] 8.3 `getStylesheet.ts`:`edge[?ingressPath]` 選擇器置於基礎 `edge` + taxi 規則之後,只設 `line-style: 'dashed'` 與 `line-dash-pattern: [8, 8]`(加寬預設 6/3,縮放後仍讀得出);snapshot 更新
- [x] 8.4 `src/shared/constants/colorByEdgeType.ts`:新增 exhaustive `EDGE_IS_TRAFFIC_BY_TYPE: Record<EdgeType, boolean>` 與安全讀取 `isTrafficEdgeType(type)`(未知 type ⇒ 非流量);`colorByEdgeType.test.ts` 補流量集合、key 完整性、未知/undefined 三組斷言
- [x] 8.5 `markIngressEdges` 判準加第二個條件 `isTrafficEdgeType(edgeType)`,排除 ingress pod 自身的 `pod-to-node` / `pod-mounts-pvc`;檔頭註解與 `cytoscape.d.ts` 註解改寫為「流量路徑」語意
- [x] 8.6 `normalize.test.ts` 的 `doublePathRaw` fixture 擴為正反例同處:加 `k8sNode` / `igwPvc` 節點與 `e6`(pod-to-node)、`e7`(pod-mounts-pvc)、`e8`(未知 type `pod-calls-configmap`)三條邊;新增兩個 test 斷言其皆不帶 `ingressPath`
- [x] 8.7 `npm run typecheck && npm run lint && npm run test:ci` 全綠;`/d/ksg-switch-demo` 目視確認 8/8 dash 在縮放後仍讀得出
