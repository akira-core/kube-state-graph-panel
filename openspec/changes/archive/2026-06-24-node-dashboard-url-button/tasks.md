## 1. Endpoint path + types

- [x] 1.1 Add `DETAIL_DASHBOARD_PATH = '/dashboard'` to `src/features/node-detail/detailPaths.ts` (sibling of the existing config/code-change segments; keep the existing literal-path test guard pattern in mind for the hook test).
- [x] 1.2 Define the `DashboardLookup` discriminated union (`{ status: 'loading' } | { status: 'ready'; url: string } | { status: 'unavailable' }`) and the request param map type (`Record<string, string>`) — co-locate in the hook file (1.4) and export via the feature barrel; do NOT reuse `DetailLookup` (no diff-timestamp / result-type extras). _(param-map type **AMENDED in §10** → `Record<string, string | string[]>` for repeated `ipaddress`.)_

## 2. Param assembly (pure helper, TDD)

- [x] 2.1 RED: write `src/features/node-detail/assembleDashboardParams.test.ts` covering — leaf params exclude `labels` + rendering/structural fields (`parent` / `worstStatus` / `is*` / `clusterColor` / `namespaceColor` / `id`) and rename `label`→`name`, keep `kind`/`namespace`; non-scalar values (`alerts`/`containers`/`owner`/`ipAddress`) dropped; compound merges a child-identical attribute (shared `namespace`), skips a child-differing one (`name`), own-wins on conflict; childless compound → own attrs only; ineligible node (cluster/namespace/storageclass) and missing id → `undefined`.
- [x] 2.2 GREEN: implement `assembleDashboardParams(elements, nodeId): Record<string, string> | undefined` — denylist (`id`, `parent`, `worstStatus`, `isCluster`, `isController`, `isStorageClass`, `isNamespace`, `clusterColor`, `namespaceColor`, `labels`, **`status`** [design Q1: non-identity + volatile]), scalar-only (drops arrays/objects → covers `ipAddress` [design Q2] / `alerts` / `containers` / `owner`), `label`→`name` rename, compound own-wins child-identical merge over direct children (`data.parent === nodeId`). **No `time` param** [design Q3]. Returns `undefined` for missing/ineligible nodes. _(**AMENDED in §10**: Q2/Q3 reversed — `ipAddress` now sent as repeated `ipaddress=` (D9), `from_time`/`to_time` added from a `timeRange` arg (D10), signature gains `timeRange?`.)_
- [x] 2.3 Extract the cluster/namespace/storageclass eligibility predicate as a shared guard so `assembleDashboardParams` and `resolveSelectedNode` (KsgPanel) cannot drift; refactor `resolveSelectedNode` to use it (behaviour-preserving — existing `resolveSelectedNode` tests stay green).
- [x] 2.4 Add the `cluster` param via ancestor resolution (`resolveCluster`): walk `data.parent` to the nearest `isCluster` compound and emit its `data.cluster`; fallback to the node's own `labels.cluster`; omit when neither; ancestor wins, own `cluster` key not overwritten. Tests: direct-parent cluster, nested (cluster > namespace > controller) walk, labels fallback, ancestor-over-labels precedence, none → omitted. Updated the KsgPanel live test (`/proxy/dashboard` now carries `cluster=demo`).

## 3. Prefetch hook (TDD)

- [x] 3.1 RED: write `src/features/node-detail/hooks/useNodeDashboardUrl.test.ts` (renderHook + `getBackendSrv().get` mock) covering — fires one GET `<base>/dashboard` with the param map when params+base present; `200` + non-empty `url` → `ready`; non-200 / empty url / malformed body / network error → `unavailable`; empty base or `undefined` params → idle (no request); a params change aborts the prior in-flight request and refetches; no setState after abort/unmount; same-value re-render does NOT refire (at-most-once per open).
- [x] 3.2 GREEN: implement `useNodeDashboardUrl(params, endpoint): DashboardLookup` — single request mirroring `useNodeDetailUrls`'s machinery (effect keyed on a request-key string built from base+serialized params, live args via ref, AbortController in a ref'd Set aborted on key change + unmount, `showErrorAlert: false`). Parse `{ url }` (non-empty → ready) like `parseApplicationUrl`. Issue via `getBackendSrv()` — never a direct external fetch.

## 4. DashboardButton component (TDD, co-located)

- [x] 4.1 RED: write `DashboardButton.test.tsx` — renders an `@grafana/ui` link/button with `href=url`, `target="_blank"`, `rel="noopener noreferrer"` when `status: 'ready'`; renders `null` (no spinner/error) when `loading` or `unavailable`.
- [x] 4.2 GREEN: implement `src/features/node-detail/components/DashboardButton/` (`DashboardButton.tsx` + `.types.ts` + `.test.tsx` + `index.ts` barrel), `@grafana/ui` + `useStyles2`, external-link icon + tooltip.

## 5. NodeDetailPanel header wiring (TDD)

- [x] 5.1 RED: extend `NodeDetailPanel.test.tsx` — `dashboard: { status: 'ready', url }` renders the button beside the title in BOTH `view='alerts'` and `view='detail'`; omitted/`loading`/`unavailable` → no button; existing header (title/kind/status/close) assertions still pass.
- [x] 5.2 GREEN: add optional `dashboard?: DashboardLookup` to `NodeDetailPanel.types.ts`; render `<DashboardButton>` in the header immediately after the title span (header renders in both views → satisfies both-views requirement). Pure presentational — no fetching in the component.

## 6. KsgPanel integration (TDD)

- [x] 6.1 RED: extend `KsgPanel.test.tsx` (or a focused unit) — `assembleDashboardParams` is memoized on `(elements, selectedNodeId)`; the dashboard lookup is threaded into `<NodeDetailPanel dashboard=…>`; `resolveSelectedNode` output unchanged (no regression).
- [x] 6.2 GREEN: in `KsgPanel.tsx` memoize `assembleDashboardParams(elements, selectedNodeId)` on `(elements, selectedNodeId)`, call `useNodeDashboardUrl(dashboardParams, detailEndpoint)`, pass the result as the new `dashboard` prop. The prefetch is driven by panel OPEN (selectedNodeId), independent of the right-click `detailRequest` flow — verify it fires for left-click (alerts) opens too.
- [x] 6.3 Confirm D2 (no graph-canvas change): assert the k8s-node container and controllers already open the panel via the existing `tap`/`cxttap` + `selectable()` path (only `isCluster` is `selectable:false`); add/keep a test guarding that k8s-node + controller selections resolve a non-null detail node. No edit to `GraphCanvas.tsx`.

## 7. Barrel + exports

- [x] 7.1 Export `useNodeDashboardUrl`, `DashboardLookup`, `assembleDashboardParams`, `DashboardButton`, and `DETAIL_DASHBOARD_PATH` (as needed) from `src/features/node-detail/index.ts`; ensure no cross-feature internal imports (KsgPanel imports via the barrel only).

## 8. Quality gates

- [x] 8.1 `npm run typecheck` clean.
- [x] 8.2 `npm run lint` zero warnings.
- [x] 8.3 `npm run test:ci` green (full suite).
- [x] 8.4 `npm run build` succeeds.

## 9. Demo verification

- [x] 9.1 `npm run build` + `docker compose --profile backend up -d`; opened `/d/ksg-demo` and drove a Playwright (cached chromium) session that stubbed the proxied `/dashboard` response with `{ url }`. VERIFIED: left-click `nats-svc` (service leaf) → alerts view + Dashboard button beside the name (`href` set, `target=_blank`, `rel=noopener noreferrer`); right-click `consumer` (deployment controller) → detail view + Dashboard button. `/dashboard` fired once per open (2 hits) with the assembled params — leaf `kind=service&name=nats-svc&namespace=dr`; controller `kind=deployment&name=consumer&namespace=dr&application=consumer`. No console errors from the feature (the only errors are the demo backend's expected `404`s for config/code_changes + one unrelated live-websocket `ERR_CONNECTION_REFUSED`).
- [x] 9.2 Outcome recorded above. Backend-param-vocab (design Q4): NOT confirmable on the demo (backend `404`s `/dashboard`); the panel sends `kind` + `name` (+ `namespace`, + scalar `application` when present) — FOLLOW-UP: confirm the real backend keys on these names. Native context-menu suppression not re-exercised live (cxttap emitted programmatically) — it is unchanged graph-canvas code (D2) covered by existing tests.

## 10. Extension — ancestor `controller`, repeated `ipaddress`, `from_time`/`to_time` (TDD)

> Extends the shipped feature per design D8/D9/D10. Reverses the originally-leaned Open Questions Q2 (ipAddress) and Q3 (time). Amends tasks 1.2 / 2.1 / 2.2 / 3.1 / 3.2.

- [x] 10.1 Widen `DashboardParams` from `Record<string, string>` to `Record<string, string | string[]>` (the hook + barrel type — barrel re-exports the type, no edit needed there). `DashboardLookup` unchanged.
- [x] 10.2 RED: extended `assembleDashboardParams.test.ts` — (a) `ipaddress` carries the `string[]` verbatim, empty/absent → omitted; (b) `controller` from nearest `isController` ancestor, fallback `owner.name`, omitted when neither, ancestor-over-owner precedence, controller-compound-itself omits; (c) `from_time`/`to_time` from a passed `timeRange` (Unix-seconds strings), omitted when absent, never on the ineligible branch. Updated the prior "drops … ipAddress" leaf test to the new behaviour (ipaddress emitted + controller from owner).
- [x] 10.3 GREEN: `assembleDashboardParams` — (a) `paramsFromData` special-cases `ipAddress` → `ipaddress` (skips empty / non-string arrays); compound merge compares array values by identity → never merges per-pod IPs (no crash); (b) added `resolveController` mirroring `resolveCluster` (walk to nearest `isController`, emit `data.label`; fallback `selfData.owner.name`; omit when neither; ancestor wins; own-wins); (c) added `timeRange?: TimeRange` and emit `from_time`/`to_time` as Unix-seconds strings on the eligible branch.
- [x] 10.4 RED/GREEN: `serializeParams` folds a `string[]` via `Array.isArray(v) ? v.join(',') : …` into the sorted request-key so equal-value arrays don't refire; `getBackendSrv().get` receives the `string[]` verbatim (repeated params). Hook tests added: string[] passthrough; `from_time`/`to_time` change → 2 calls; equal-value array re-render → 1 call.
- [x] 10.5 KsgPanel: `assembleDashboardParams(elements, selectedNodeId, data.timeRange)` with `data.timeRange` in the `useMemo` deps. KsgPanel integration test now asserts the proxied `/dashboard` carries `controller: 'mongo'` (ancestor walk) + `from_time`/`to_time` (`expect.any(String)` — `stubTimeRange` is non-deterministic).
- [x] 10.6 Quality gates: `npm run typecheck` clean; `npm run lint` → "No issues found"; `npm run test:ci` → 68 suites / 638 tests passed; `npm run build` succeeds (only the pre-existing bundle-size warnings).
- [x] 10.7 Demo re-verify: covered by the KsgPanel integration test (drives a left-click OPEN through the real component tree and asserts the proxied `/dashboard` call carries `kind`/`name`/`namespace`/`application`/`cluster` **plus the new `controller` + `from_time`/`to_time`**); `ipaddress` repeated-param emission + the time-range-change refetch are pinned by the `assembleDashboardParams` / `useNodeDashboardUrl` unit tests. A live Playwright drive adds only DOM-level confidence and still requires stubbing (`/dashboard` `404`s on the demo backend); deferred as optional. Backend-param-vocab (design Q4 — `controller`/`ipaddress`/`from_time`/`to_time`/`name`) remains an un-verifiable-on-demo FOLLOW-UP.
