## Context

The panel already exports the full pod list to a dashboard variable
(`pod-list-variable-export`): `useVariableExport(elements, podListVariable, enabled)` →
`writeDashboardVariable(name, names)`, where `writeDashboardVariable` is the feature's
sole `@grafana/runtime` touchpoint and already handles order-insensitive dedup, the
`$__empty` sentinel, and `replace: true`.

This change adds a second, narrower export: the single pod the operator left-clicks, but
only when it is unhealthy. The driving signal is different — a user **selection** plus the
node's **status**, not the elements list — so it warrants its own hook rather than
overloading `useVariableExport`.

Relevant existing wiring in `KsgPanel.tsx`:

- `selectedNodeId` (left- or right-click) → `selectedNode` (resolved `NodeDetailData`,
  carries `kind` + `status`).
- `detailRequest` is `null` for a left-click and set for a right-click → the precise
  "this was a left-click" signal.
- The pod-list export is already gated on a load-success predicate
  (`hasPayload && !seriesError && !isFatalNormalizeError`).

## Goals / Non-Goals

**Goals:**

- A new `selectedPodVariable` panel option (default `''`, disabled when empty).
- Left-click a non-normal (`warning`/`critical`) pod → write its `label` to the variable.
- Clear the variable (`$__empty`) on deselect / normal pod / non-pod / right-click.
- Reuse `writeDashboardVariable` verbatim (one runtime touchpoint, dedup, sentinel).

**Non-Goals:**

- No new write mechanism (URL `var-` sync only).
- No multi-pod selection (single value).
- No change to `pod-list-variable-export`.
- No creation of the target variable (panels cannot) — author-provided.
- Not driven by right-click (that path owns the Change Report / Dashboard flow).

## Decisions

### D1 — Single-value write, reusing `writeDashboardVariable`

The export writes `[podLabel]` (or `[]` to clear) through the existing
`writeDashboardVariable(name, values)`. The array form serialises to a single
`var-<name>=<pod>` param; `[]` becomes the `$__empty` sentinel — both already implemented.
No new `@grafana/runtime` code; the feature keeps its single runtime touchpoint.

_Alternative considered:_ a bespoke single-string writer. Rejected — duplicates the dedup
/ sentinel / `replace:true` logic that already exists and is tested.

### D2 — A pure decision helper + a thin hook

`selectedPodExportValue(selectedNode, isLeftClick): string[]` (pure, unit-tested) returns
`[label]` iff `isLeftClick && node.kind === 'pod' && (status === 'warning' || status ===
'critical')`, else `[]`. `useSelectedPodExport(selectedNode, isLeftClick, variableName,
enabled)` computes that value and calls `writeDashboardVariable` in an effect keyed on the
resolved value + name. Keeping the predicate pure isolates the status/kind/left-click
gate from the effect for straightforward testing.

### D3 — Left-click signal = `detailRequest === null`

`KsgPanel` already distinguishes the two click paths: a left-click leaves `detailRequest`
null (alerts view); a right-click sets it (detail view). The hook receives
`isLeftClick = detailRequest === null` so a right-click (even on a non-normal pod) does
NOT export and in fact **clears** (its value is `[]`), keeping the variable owned solely by
the deliberate left-click gesture.

### D4 — Status-absent = normal (no export)

The gate checks `status ∈ {warning, critical}` explicitly. A node with no `status`
(backend sent none → `normalize` omits it) fails the gate → no export → cleared. This
matches the data-driven status model (absence ≠ a fabricated normal, but for _export_ it
behaves like normal: nothing to surface).

### D5 — Clear on every non-qualifying state

Whenever the current selection does not qualify (deselect → `selectedNode === null`,
normal pod, non-pod, right-click), the computed value is `[]` → `writeDashboardVariable`
writes `$__empty`, clearing any previously-exported pod. The built-in equal-value skip
prevents redundant writes (e.g. staying deselected across refreshes writes the sentinel at
most once). This avoids a consuming panel showing a stale pod after the operator moves on.

### D6 — Enablement gate

`enabled = selectedPodVariable.trim() !== ''`. Unlike the pod-list export, this one is
**not** gated on load-success: it is driven by a user selection, which can only exist once
the graph has rendered, and clearing on deselect must work regardless of the current load
phase. An empty option short-circuits the hook entirely (no `locationService` calls).

## Risks / Trade-offs

- **Self-filter loop** if the dashboard author references the variable in the KSG graph
  query. → Documented constraint (mirrors `pod-list-variable-export`); the variable is for
  _consuming_ panels only. `writeDashboardVariable` also dedups + `replace:true`, so even
  an accidental same-value write neither loops nor pollutes history.
- **Query-type variable drops the value.** A Grafana `query`/options variable revalidates
  the URL value against its option set and discards anything not in it. → Document that the
  author must use a **textbox** (or custom + `allowCustomValue`) variable.
- **Stale value across dashboards/tabs.** URL `var-` sync is per-URL; opening the same
  dashboard fresh starts empty. Acceptable — selection is inherently session/URL state.
- **Right-click clears a left-click's value.** Intended (D3): right-click is a different
  intent; if an operator left-clicks a critical pod then right-clicks it, the variable
  clears. Documented; revisit only if users want right-click to preserve it.

## Migration Plan

Additive. New option defaults to `''` ⇒ no behaviour change for existing dashboards.
Rollback = remove the hook + option. To adopt: add a textbox variable (e.g.
`selected_pod`), set `selectedPodVariable` to its name, and reference `$selected_pod` in a
consuming panel's query (never in the KSG graph query).

## Open Questions

- **Q1 — non-normal scope:** currently `warning` ∪ `critical`. If operators only care
  about `critical`, narrow the gate (one-line change). Default: both.
- **Q2 — multi-select future:** if a future selection model allows multiple pods, the
  array write already supports it; the gate would extend to a set. Out of scope now.
