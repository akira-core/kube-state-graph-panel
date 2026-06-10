## Why

The detail-panel alert table renders **one row per alert occurrence**. A flapping alert — the same name / severity / pod / service firing repeatedly — floods the table with near-duplicate rows, burying signal and making "when did this last fire, and how often?" impossible to read at a glance. The backend now reports each alert **once** with a `time_records` list of every occurrence time, so the panel can collapse repeats into a single row that surfaces the occurrence **count** and the **last** time it fired.

## What Changes

- **BREAKING** `NodeAlert.time: number` (a single Unix-seconds value) becomes `NodeAlert.timeRecords: number[]` (every occurrence time, ascending). Last-seen = `max(timeRecords)`, count = `timeRecords.length` — both **derived**, neither stored.
- `normalizeGraph` / `parseAlerts` reads the upstream wire field `time_records` (number array): keeps only finite, ≥0 values, sorts ascending. For backends that have not upgraded, it **falls back** to the legacy scalar `time` → `timeRecords: [time]`. An alert with no valid occurrence time after filtering is dropped (unchanged partial-parse contract).
- AlertTable columns change from `Pod / Service / Alert / Severity / Time` to **`Pod / Service / Alert / Severity / Count / Last seen`**:
  - **Count** = `timeRecords.length`, rendered as a small badge, with a `@grafana/ui` `Tooltip` enumerating **every** occurrence time (formatted in `timeZone`) — this is where the full occurrence list ("occur time") lives.
  - **Last seen** = the formatted `max(timeRecords)`, reusing the existing clickable time-rewind affordance; clicking rewinds the dashboard ±5 min around the **most recent** occurrence.
- `onAlertTimeClick` stays scalar (`number`); AlertTable calls it with `max(timeRecords)`. The detail panel's rewind path (`onChangeTimeRange`, ±300s) is unchanged.
- **Grouping is the backend's job.** The panel trusts the backend to emit one entry per unique alert; it does **not** re-dedupe. One backend alert entry → one table row.
- *(incidental)* While restating the `Node Detail 面板` requirement, its severity-colour wording is corrected from the stale `STATUS_COLOR` / `NodeStatus` text to the already-shipped `SEVERITY_COLOR` / free-form-string fallback. This is **not** a behaviour change — it aligns the spec with live code (`colorBySeverity.ts`).

## Capabilities

### Modified Capabilities

- `panel-rendering`: the `Node Detail 面板` alert table swaps the `Time` column for `Count` + `Last seen`, adds a count badge with an occurrence-time tooltip, and rewinds from last-seen; the severity wording is corrected to `SEVERITY_COLOR`.
- `graph-data-integration`: a new requirement specifies alert `time_records` normalisation (`parseAlerts` produces `timeRecords: number[]`, with legacy scalar-`time` compatibility and empty-set dropping).

## Impact

- **Source**: `src/shared/constants/types.ts` (`NodeAlert.time` → `timeRecords: number[]`); `src/features/graph-data/normalize.ts` (`parseAlerts` reads `time_records` + legacy fallback); `src/features/node-detail/components/AlertTable/AlertTable.tsx` (Count + Last seen columns, `@grafana/ui` `Tooltip`, `rowId`, `onAlertTimeClick(max)`). Tests: `AlertTable.test.tsx`, `normalize.test.ts`. `src/shared/types/cytoscape.d.ts`'s `alerts?: NodeAlert[]` follows the type automatically — no edit. (Verify no other reader of `alert.time` exists.)
- **Backend contract (external dependency, not panel code)**: each `alerts[]` entry carries `time_records: number[]` (Unix seconds, one entry per occurrence of that same alert). The panel tolerates an un-upgraded backend that still sends the legacy scalar `time` (treated as a single-occurrence record).
- **Out of scope (YAGNI)**: panel-side re-deduplication (the backend pre-groups — one row per entry); per-occurrence click targets (only Last seen rewinds); a dedicated First-seen column (the full occurrence list is reachable via the Count tooltip).
