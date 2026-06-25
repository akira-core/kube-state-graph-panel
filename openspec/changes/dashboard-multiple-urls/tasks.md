## 1. Parser (TDD)

- [x] 1.1 RED: `parseDashboardLinks.test.ts` — legacy `{ url }`, `{ urls }`, empty array, missing labels, invalid entries filtered
- [x] 1.2 GREEN: `parseDashboardLinks.ts` + export `DashboardLink`

## 2. Hook

- [x] 2.1 Update `DashboardLookup` to `{ status: 'ready'; urls: DashboardLink[] }`
- [x] 2.2 Wire `parseDashboardLinks` in `useNodeDashboardUrl`; update hook tests

## 3. DashboardButton

- [x] 3.1 Single URL: keep `LinkButton`
- [x] 3.2 Multiple URLs: `Button` + `Menu` + `ClickOutsideWrapper`
- [x] 3.3 Update `DashboardButton.test.tsx`, `NodeDetailPanel.test.tsx`, `KsgPanel.test.tsx`

## 4. Spec delta

- [x] 4.1 `openspec/changes/dashboard-multiple-urls/specs/node-dashboard-url/spec.md`
- [x] 4.2 `openspec/changes/dashboard-multiple-urls/specs/panel-rendering/spec.md`

## 5. Verify

- [x] 5.1 `npm run typecheck && npm run lint && npm run test:ci`
