# Tasks — legend-controllers-bottom

## 1. Spec / code order

- [x] 1.1 `KsgPanel.tsx`: move `NodeContainerLegend` JSX after `NamespaceLegend` / `ApplicationLegend` (last in legend `<aside>`)
- [x] 1.2 `KsgPanel.test.tsx`: update legend section order assertion — `Clusters` → `Namespaces` → `Applications` → `Controllers` (controller mode); keep Status-before-swatches checks

## 2. Verification

- [x] 2.1 `npm run typecheck && npm run lint && npm run test:ci`
- [x] 2.2 Manual: controller mode legend shows Controllers at bottom; node mode shows Nodes at bottom after Clusters
