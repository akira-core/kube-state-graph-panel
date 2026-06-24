## 1. Panel option

- [x] 1.1 Add `selectedPodVariable: string` to `KsgPanelOptions` (`KsgPanel.types.ts`) with a doc comment mirroring `podListVariable`; add `selectedPodVariable: ''` to `defaultOptions`.
- [x] 1.2 Expose the option in the options editor (`KsgPanel.editor.tsx` / options builder) as a text input, beside `podListVariable`.

## 2. Decision helper (pure, TDD)

- [x] 2.1 RED: `src/features/variable-export/selectedPodExportValue.test.ts` — `selectedPodExportValue(selectedNode, isLeftClick)` returns `[label]` ONLY for left-click + `kind==='pod'` + `status ∈ {warning,critical}`; returns `[]` for normal pod, status-absent pod, non-pod, right-click (`isLeftClick=false`), and `selectedNode===null`.
- [x] 2.2 GREEN: implement `selectedPodExportValue(selectedNode: NodeDetailData | null, isLeftClick: boolean): string[]`.

## 3. Export hook (TDD)

- [x] 3.1 RED: `src/features/variable-export/useSelectedPodExport.test.ts` — when enabled, calls `writeDashboardVariable(name, [label])` for a left-click non-normal pod; calls `writeDashboardVariable(name, [])` (clear) for the non-qualifying cases; makes NO call when the name is empty (disabled); dedups via the existing write guard on unchanged selection across re-renders. Mock `writeDashboardVariable` (or `locationService`) as the existing variable-export tests do.
- [x] 3.2 GREEN: implement `useSelectedPodExport(selectedNode, isLeftClick, variableName, enabled)` — compute `selectedPodExportValue`, and in an effect keyed on `(value, name, enabled)` call `writeDashboardVariable(name, value)` when enabled + name non-empty. Export both from `src/features/variable-export/index.ts`.

## 4. KsgPanel integration (TDD)

- [x] 4.1 RED: extend `KsgPanel.test.tsx` — with `selectedPodVariable` set, a LEFT-click (`onSelect`) of a non-normal pod writes `var-<name>=<pod>`; a left-click of a normal pod / a non-pod / a deselect, and a RIGHT-click (`onContextSelect`) of a non-normal pod, all CLEAR (`$__empty`); with the option empty, no `locationService.partial` for this variable.
- [x] 4.2 GREEN: in `KsgPanel.tsx` call `useSelectedPodExport(selectedNode, detailRequest === null, options.selectedPodVariable ?? defaultOptions.selectedPodVariable, (options.selectedPodVariable ?? '').trim() !== '')`. Reads the existing `selectedNode` memo + `detailRequest`.

## 5. Quality gates

- [x] 5.1 `npm run typecheck` clean.
- [x] 5.2 `npm run lint` zero warnings.
- [x] 5.3 `npm run test:ci` green (full suite).
- [x] 5.4 `npm run build` succeeds.

## 6. Demo / docs verification

- [x] 6.1 Wired `provisioning/dashboards/ksg-demo.json`: added a `selected_pod` **textbox** variable, set the KSG panel option `selectedPodVariable: "selected_pod"`, and added a consumer Text panel rendering `${selected_pod}`. The KSG graph query does NOT reference the variable (no self-filter loop). Pitfall documented in the option help + design.
- [x] 6.2 Live-verified (demo + Playwright, cached chromium). WRITE PATH LIVE: switching to Node mode + left-click / right-click / background-deselect on the (all-normal) demo pods each wrote `var-selected_pod=$__empty` to the URL, and the textbox var + consumer panel rendered it in sync — proving enablement, URL sync, and the clear semantics live. POSITIVE name-write (`var-selected_pod=<pod>` for a non-normal pod) NOT reproducible live: the demo fixture has zero non-normal pods (backend can't seed status) and the graph arrives via a server-side Infinity query (browser response-injection of a status isn't tractable) — that path is covered deterministically by the KsgPanel integration test + the hook/helper unit tests. FINDING: the panel clears the var to `$__empty` on mount (nothing selected), so a deep-linked `var-selected_pod` value is reset on load — spec-consistent (mount = deselected = cleared); the variable is panel-owned.
