# Tasks — Alert occurrence grouping

## 1. Types

- [x] 1.1 `src/shared/constants/types.ts`: change `NodeAlert.time: number` → `timeRecords: number[]` (Unix sec, ascending). Update the doc-comment: `timeRecords` = all occurrences; last-seen = `max`, count = `length` (derived, not stored).
- [x] 1.2 Grep for other readers of `alert.time` — only the normalize legacy fallback (`entry.time`); two typed test fixtures (`NodeDetailPanel.test.tsx`, `KsgPanel.test.tsx` resolveSelectedNode case) migrated to `timeRecords`. KsgPanel rewind-click payload kept as legacy scalar `time` (now exercises the `parseAlerts` fallback).

## 2. Normalize (TDD)

- [x] 2.1 `normalize.test.ts` RED: `time_records` → ascending `timeRecords`; legacy scalar `time` → `[time]`; prefer records over scalar; fall back to scalar when records all-invalid; drop alert when no valid occurrence time; filter non-finite/negative records; missing `name`/`severity` dropped; `cluster`/`storageclass` carry no `alerts`.
- [x] 2.2 `parseAlerts` GREEN: `parseTimeRecords` reads `entry.time_records` (keep finite ≥0 via `isValidEpochSeconds`, sort ascending); falls back to legacy scalar `entry.time` → `[time]`; drops alert when no valid occurrence time. Keeps `pod`/`service`/`id` optional passthrough.

## 3. AlertTable (TDD)

- [x] 3.1 `AlertTable.test.tsx`: replaced the `Time`-column assertions with `Count` + `Last seen`; Count badge value = `timeRecords.length` (`data-testid="alert-count"`); Count `@grafana/ui` `Tooltip` enumerates the formatted occurrence times (`data-testid="alert-occurrences"`); `Last seen` header present; clicking Last seen calls `onAlertTimeClick(max(timeRecords))`; `rowId` stable; kept empty-state / severity-colour / missing pod-service cases (updated to new columns).
- [x] 3.2 `AlertTable.tsx`: added **Count** column (badge + `Tooltip` listing formatted occurrences) and **Last seen** column (relabelled header, formats `max(timeRecords)` via `lastSeen`, click → `onAlertTimeClick(max)`); `rowId` uses `timeRecords.join(',')`; `AlertTableProps` unchanged; `severityColor` / badge logic unchanged.

## 4. Spec sync (this change)

- [x] 4.1 `panel-rendering` `Node Detail 面板` delta (Count + Last seen columns, occurrence tooltip, last-seen rewind, SEVERITY_COLOR correction).
- [x] 4.2 `graph-data-integration` ADDED alert-`time_records` normalisation requirement.

## 5. Verify

- [x] 5.1 `npm run typecheck` passes (tsc --noEmit, exit 0).
- [x] 5.2 `npm run lint` (0 warnings) passes (exit 0).
- [x] 5.3 `npm run test:ci` green (44 suites / 307 tests).
- [x] 5.4 `openspec validate alert-occurrence-grouping --strict` passes.
- [x] 5.4b `npm run build` succeeds (only pre-existing bundle-size warnings).
- [ ] 5.5 Demo manual: a flapping alert shows as one row with the right Count + Last seen; hovering Count lists every occurrence; clicking Last seen rewinds the dashboard to the most recent occurrence.
