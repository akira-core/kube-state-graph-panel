# Design — Alert occurrence grouping

## Context

`NodeAlert` today is one alert **occurrence**: `{ pod?, service?, name, severity, time, id? }` with `time` a single Unix-seconds value. `parseAlerts` (in `normalize.ts`) projects the upstream `alerts` array, dropping malformed entries. `AlertTable` renders `Pod / Service / Alert / Severity / Time`, where the `Time` cell is a clickable button that calls `onAlertTimeClick(time)` to rewind the dashboard ±5 min.

The backend now groups repeats of the same alert into a single entry carrying `time_records: number[]` — every time that alert fired. The panel should render one row per grouped alert and surface (a) how many times it fired and (b) when it last fired, with the full occurrence list one hover away.

## Goals / Non-Goals

**Goals**
- One table row per backend alert entry (no panel-side dedup).
- Show occurrence **Count** and **Last seen** time; reach the full occurrence list via a tooltip.
- Time-rewind targets the most recent occurrence.
- Tolerate an un-upgraded backend (legacy scalar `time`).

**Non-Goals**
- Panel-side grouping / dedup of identical alerts (backend owns this).
- Per-occurrence rewind, or a dedicated First-seen column.
- Any change to the rewind window (stays ±300 s) or the detail-panel open/close behaviour.

## Decisions

**D1 — `timeRecords: number[]` replaces `time`, count/last derived.**
`NodeAlert.time: number` → `NodeAlert.timeRecords: number[]` (ascending). `count = timeRecords.length`, `lastSeen = max(timeRecords) = timeRecords[timeRecords.length - 1]` (max, given the ascending invariant). Neither is stored — both derive from the one array, so there is a single source of truth and no risk of count/last drifting from the list. The field is named `timeRecords` (not `time`, which reads like a keyword/scalar; not `timeRecord`) to mirror the backend wire key `time_records`.

**D2 — Backend pre-groups; panel renders one row per entry.**
The panel does not define a grouping key or merge rows. Each `alerts[]` entry is one row. This keeps `AlertTable` a pure presentation of `NodeAlert[]` and avoids the panel owning an alert-identity definition that properly belongs to the backend.

**D3 — Normalize is the compatibility boundary.**
`parseAlerts` reads wire `time_records` (finite, ≥0, sorted ascending). If absent/all-invalid, it falls back to the legacy scalar `time` → `[time]`. If nothing valid remains, the alert is dropped (consistent with the existing "drop malformed, never throw" contract). Downstream (`AlertTable`) therefore always receives a clean, non-empty, ascending `timeRecords`.

**D4 — Columns: `Count` + `Last seen`, occurrence list via tooltip.**
Replace `Time` with two columns. **Count** is a small badge (`data-testid="alert-count"`) whose `@grafana/ui` `Tooltip` lists every occurrence formatted in `timeZone`. **Last seen** is the existing clickable rewind button, relabelled, formatting `max(timeRecords)`. A dedicated First-seen column was considered and rejected (YAGNI) — the tooltip already exposes the full list including the earliest.

**D5 — Rewind targets last-seen; `onAlertTimeClick` stays scalar.**
Clicking Last seen calls `onAlertTimeClick(max(timeRecords))`. The prop signature `(timeSec: number) => void` and the upstream `onChangeTimeRange` ±300s path are untouched, so the only change in the rewind chain is *which* scalar AlertTable passes.

**D6 — `rowId` keyed off the record list.**
`rowId` currently embeds `String(alert.time)`. With an array, use `alert.id ?? \`${name}-${timeRecords.join(',')}-${index}\`` (or the max) so react-table keeps stable, non-colliding ids.

**D7 — *(incidental)* Correct the severity wording.**
The baseline `Node Detail 面板` requirement still describes severity colouring via `STATUS_COLOR` / `NodeStatus`, but live code uses `colorBySeverity.ts` (`SEVERITY_COLOR` for `info`/`warning`/`critical`, `FALLBACK_SEVERITY_COLOR` for free-form labels). Because an OpenSpec `MODIFIED` block restates the whole requirement, the restated text is brought in line with shipped code. No code changes; spec-truth alignment only.

## Edge cases

- `time_records: []` or all non-finite/negative, no valid scalar `time` → alert dropped.
- Mixed valid/invalid records (`[ts, -5, NaN, ts2]`) → invalid filtered, remainder sorted.
- Single occurrence → `timeRecords: [t]`, Count = 1, Last seen = `t` (degrades cleanly to today's behaviour).
- Container nodes (`cluster`, `isStorageClass`) never carry alerts — unchanged.
- Empty `alerts` / no valid alerts → "No alerts" empty state — unchanged.

## Testing

- `normalize.test.ts`: `time_records` → ascending `timeRecords`; legacy scalar fallback; drop-empty; filter non-finite/negative; containers carry no alerts.
- `AlertTable.test.tsx`: Count column value = `timeRecords.length`; Count tooltip enumerates formatted occurrences; Last seen header + click calls `onAlertTimeClick(max)`; stable `rowId`; existing empty-state / severity-colour / missing-pod-service cases updated to the new columns.

## Risks / migration

- **Breaking type change.** Any reader of `alert.time` must move to `timeRecords` (grep before merge; expected readers: `AlertTable` + tests only — the rewind callback receives a scalar from AlertTable, not the field).
- **Backend rollout skew.** Handled by the legacy `time` fallback in `parseAlerts`; an old backend keeps working (every alert is single-occurrence).
