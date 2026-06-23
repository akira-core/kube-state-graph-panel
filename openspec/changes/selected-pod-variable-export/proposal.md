## Why

Operators triaging an unhealthy pod want the surrounding context — logs, traces, raw
metrics — without retyping the pod name into another panel. The panel already knows which
pod the operator clicked and whether it is unhealthy. Surfacing that selection as a
dashboard variable lets a sibling panel (ES logs, a PromQL detail panel, …) re-query for
exactly that pod, with zero manual entry. This mirrors the existing
`pod-list-variable-export` plumbing, narrowed to a single, intentionally-selected,
non-normal pod.

## What Changes

- **New panel option `selectedPodVariable`** (string, default `''`, mirrors
  `podListVariable`): the name of an EXISTING dashboard variable to write the selected
  pod's name into. Empty ⇒ the feature is fully disabled (no `locationService` calls).
- **Left-click export, status-gated:** when the operator **left-clicks** a node that is a
  **pod** with a **non-normal** status (`warning` or `critical`), the panel writes that
  pod's name (`data.label`) into the configured variable via the existing
  `var-<name>` URL sync. A consuming panel referencing `$selected_pod` then re-queries.
- **Left-click only:** the export fires on the alerts-view selection (left-click). A
  **right-click** (detail view) does NOT export — it drives the Change Report / Dashboard
  flow, a separate concern.
- **Clear semantics:** on deselect (background tap / close), selecting a **normal** pod,
  selecting a **non-pod**, or a right-click, the variable is **cleared** (written as the
  existing `$__empty` sentinel) so the consuming panel never shows a stale pod.
- **Status absence = normal:** a node whose backend sent no `status` is treated as normal
  (no export) — consistent with the data-driven status model.
- **Reuse the single write path:** the export goes through the existing
  `src/features/variable-export/writeDashboardVariable.ts` (the feature's sole
  `@grafana/runtime` touchpoint — already dedups equal writes, uses `replace: true`, and
  owns the `$__empty` sentinel). A new sibling hook drives it from the selection+status
  signal (distinct from `useVariableExport`, which is driven by the elements list).

## Capabilities

### New Capabilities

- `selected-pod-export`: a new `selectedPodVariable` panel option; on left-click of a
  non-normal pod, write its name to that variable; clear it (`$__empty`) on
  deselect / normal pod / non-pod / right-click; status-absent treated as normal; reuses
  `writeDashboardVariable` (dedup + sentinel + `replace:true`); disabled when the option
  is empty; the target variable must pre-exist and must NOT be referenced by the panel's
  own graph query (no self-filter loop).

### Modified Capabilities

- `panel-rendering`: the left-click node-selection path now additionally exports a
  non-normal pod's name into the `selectedPodVariable` (when configured), alongside its
  existing detail-panel-open behaviour.

## Impact

- **Code:**
  - `src/features/variable-export/` — new `useSelectedPodExport` hook (+ a small pure
    helper deciding the value to write from the selection/status); `index.ts` barrel.
  - `src/panels/KsgPanel/KsgPanel.types.ts` — add `selectedPodVariable: string` to
    `KsgPanelOptions` + `defaultOptions`.
  - `src/panels/KsgPanel/KsgPanel.editor.tsx` (or the options builder) — expose the new
    text option.
  - `src/panels/KsgPanel/KsgPanel.tsx` — call the new hook off the resolved selection +
    the left-click signal (`detailRequest === null`).
- **Tests:** hook unit (status gate, left-click-only, clear paths, disabled-when-empty,
  dedup via the existing write guard), KsgPanel integration (left-click a non-normal pod
  writes `var-<name>`; right-click / normal / non-pod / deselect clears).
- **Specs:** new `selected-pod-export` spec; `panel-rendering` delta.
- **Docs / dashboard:** document that the target variable should be a **textbox** (or
  custom + `allowCustomValue`) variable — a query/options variable revalidates against its
  option set and would drop the externally-written value — and that the KSG graph query
  must not reference it.
