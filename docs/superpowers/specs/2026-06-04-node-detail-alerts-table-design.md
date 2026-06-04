# Node Detail Panel — Alerts Table

**Date:** 2026-06-04
**Status:** Approved (design)
**Topic:** Add a per-node alerts table to `NodeDetailPanel`, with a clickable time cell that rewinds the dashboard time range to the alert time.

## Problem

The `NodeDetailPanel` (the interactive overlay shown when a graph node is tapped) currently renders a header (label + kind/status badges + close button) and two empty placeholder sections ("Alert Name" / "Alert Content"). It carries no alert information. We want to show, per selected node, a table of that node's alerts with columns **Pod · Service · Alert · Severity · Time**, where clicking the time cell rewinds the dashboard time range to a fixed window around that alert.

The node data model has no alert/severity/time fields today (`NodeStatus` is only `'normal' | 'warning' | 'critical'`), so this change adds a small, forward-compatible alert payload to the ingest path and surfaces it in the panel.

## Decisions (locked during brainstorming)

| Decision | Choice |
| --- | --- |
| Alert data source | New optional `alerts` field on the upstream `/v1/graph` node JSON, carried through `normalizeGraph` onto node data (absent → no rows). Demo/tests use sample fixtures. |
| Time-rewind semantics | Fixed ± window around the alert time. |
| Window size | Hard-coded **±5 minutes** (300 s half-window). |
| Table rendering | `@grafana/ui` `InteractiveTable`. |
| Severity scale | Reuse `NodeStatus` (`normal`/`warning`/`critical`), colored via the existing `STATUS_COLOR` map — no new color map. |
| Component boundary | A separate `AlertTable` component (isolates `InteractiveTable`, independently testable), composed into `NodeDetailPanel`. |

## Architecture

### Data model

New shared types in `src/shared/constants/types.ts`:

```ts
export type AlertSeverity = NodeStatus; // 'normal' | 'warning' | 'critical'

export interface NodeAlert {
  pod?: string;
  service?: string;
  name: string;       // alert name
  severity: AlertSeverity;
  time: number;       // Unix epoch SECONDS (matches backend start/end convention)
  id?: string;        // optional stable row id; synthesized if absent
}
```

`time` is in **Unix seconds**, consistent with the backend's `start`/`end` convention documented in `CLAUDE.md`. Conversion to milliseconds (×1000) happens only at the rendering/click boundary.

### Ingest path (anti-corruption layer)

The upstream graph node JSON gains an optional `alerts?: NodeAlert[]`. The path carries it through, defaulting to absent/empty so a node without alerts behaves exactly as today:

1. **`src/features/graph-data/normalize.ts`** — when a raw node has an `alerts` array, map it onto the cytoscape node `data.alerts`. Absent → field omitted. This is a pass-through projection (the normalizer is the anti-corruption boundary); malformed entries are dropped, consistent with the existing partial-parse philosophy (`{ elements, errors }`).
2. **`src/shared/types/cytoscape.d.ts`** — augment `NodeDataDefinition` with `alerts?: NodeAlert[]` (declaration merging, per the cytoscape integration rules).
3. **`src/panels/KsgPanel/KsgPanel.tsx` → `resolveSelectedNode`** — lift `alerts` from the resolved element's `data` onto the returned `NodeDetailData` (spread-when-present, matching the existing `kind`/`status` pattern).
4. **`NodeDetailPanel.types.ts` → `NodeDetailData`** — add `alerts?: NodeAlert[]`.

### UI — `AlertTable` component

New co-located component `src/features/node-detail/components/AlertTable/` (`AlertTable.tsx` + `AlertTable.types.ts` + `AlertTable.test.tsx` + `index.ts`), re-exported from the feature barrel.

- Renders `@grafana/ui` `InteractiveTable` with columns **Pod · Service · Alert · Severity · Time**.
- **Pod / Service** cells: render the string, or `—` when absent.
- **Severity** cell: a colored badge reusing the panel's status-badge style with `STATUS_COLOR[severity]` as the background — visually consistent with the header status badge.
- **Time** cell: a clickable button (keyboard-accessible) whose label is `dateTimeFormat(alert.time * 1000, { timeZone })`; `onClick` calls `props.onAlertTimeClick(alert.time)` (passing **seconds**).
- `getRowId` = `alert.id ?? \`${alert.name}-${alert.time}-${index}\`` (stable row identity for `InteractiveTable`).
- Empty `alerts` → an inline "No alerts" message instead of an empty table.

`AlertTableProps`:

```ts
export interface AlertTableProps {
  alerts: NodeAlert[];
  onAlertTimeClick: (timeSec: number) => void;
  timeZone?: string;
}
```

### `NodeDetailPanel` changes

- Replace the two empty placeholder sections ("Alert Name" / "Alert Content") with a single **Alerts** section containing `<AlertTable>`.
- Header (title, kind/status badges, close button) is unchanged.
- New props on `NodeDetailPanelProps`: `onAlertTimeClick: (timeSec: number) => void` and `timeZone?: string`. The panel forwards `node.alerts ?? []`, `onAlertTimeClick`, and `timeZone` to `AlertTable`.

### Callback wiring (`KsgPanel`)

`KsgPanel` currently destructures only `{ options, data }`. It already has access to the standard `PanelProps` callbacks.

- Destructure `onChangeTimeRange` and `timeZone` from `props`.
- Define the rewind handler (±5 min, hard-coded 300 s, milliseconds for `AbsoluteTimeRange`):

```ts
const handleAlertTimeClick = useCallback(
  (timeSec: number) => {
    onChangeTimeRange({ from: (timeSec - 300) * 1000, to: (timeSec + 300) * 1000 });
  },
  [onChangeTimeRange]
);
```

- Pass `onAlertTimeClick={handleAlertTimeClick}` and `timeZone={timeZone}` to `<NodeDetailPanel>`.

`onChangeTimeRange` expects an `AbsoluteTimeRange` (`{ from, to }` in epoch **milliseconds**), so the handler multiplies the seconds-based alert time by 1000.

## Data flow

```
/v1/graph JSON  node.alerts?: NodeAlert[]
  → normalizeGraph        (carry → cytoscape data.alerts)
  → resolveSelectedNode   (lift → NodeDetailData.alerts)
  → NodeDetailPanel        (forward → AlertTable)
  → AlertTable             (rows; Time cell click → onAlertTimeClick(sec))
  → KsgPanel.handleAlertTimeClick
  → props.onChangeTimeRange({ from: (sec-300)*1000, to: (sec+300)*1000 })
```

## Error handling

- Node without `alerts`, or with an empty array → "No alerts" message; no table, no errors.
- Malformed alert entries (missing `name`/`severity`/`time`, wrong types) are dropped during normalization, consistent with the partial-parse contract. They do not break the rest of the graph.
- Unknown severity values fall back to the neutral/`normal` color so an upstream addition never throws.

## Testing

- **`AlertTable.test.tsx`** — rows render with the five columns; pod/service absent → `—`; severity badge gets the expected `STATUS_COLOR`; clicking a time cell calls `onAlertTimeClick` with the correct **seconds**; empty `alerts` → "No alerts".
- **`NodeDetailPanel.test.tsx`** — update for the changed sections; asserts the Alerts section + table render and that `onAlertTimeClick`/`timeZone` are forwarded.
- **`KsgPanel.test.tsx`** — `resolveSelectedNode` carries `alerts`; `handleAlertTimeClick` calls `onChangeTimeRange` with `{ from: (sec-300)*1000, to: (sec+300)*1000 }`.
- **`normalize.test.ts`** — a raw node with `alerts` carries through to `data.alerts`; malformed entries dropped; absent `alerts` → field omitted.

Pure functions via straight Jest; components via `@testing-library/react` (jsdom). `InteractiveTable` renders under jsdom without extra polyfills.

## Out of scope (YAGNI)

- No new panel option for window size (hard-coded ±5 min).
- No second data frame / Grafana-alerting integration (alerts ride on the existing graph JSON).
- No severity sorting/filtering beyond what `InteractiveTable` provides for free.
- No backend changes in this repo (panel-only); the upstream `alerts` field is consumed if present.
