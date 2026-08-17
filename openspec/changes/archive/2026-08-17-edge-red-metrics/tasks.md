## 1. Type declaration

- [x] 1.1 Add `EdgeMetrics` (`rate: number`, `errorRate?: number`, `p90ServerMs?: number`) and `EdgeDataDefinition.metrics?: EdgeMetrics` to `src/shared/types/cytoscape.d.ts`, with a comment recording the three-valued semantics (absent `metrics` / absent `errorRate` / `errorRate: 0`) and the units (req/s, ratio `[0,1]`, milliseconds)
- [x] 1.2 Confirm `npm run typecheck` passes with the new declaration and no `any` / cast escapes

## 2. Normalize boundary (TDD — tests before implementation)

- [x] 2.1 Write failing tests in `src/features/graph-data/normalize.test.ts` for the happy path: `metrics: { rate, error_rate, p90_server_ms }` → `data.metrics: { rate, errorRate, p90ServerMs }`, values unconverted and unrounded
- [x] 2.2 Write failing tests for omission: edge with no `metrics` key produces no `metrics` key; `metrics: { rate: 3 }` produces no `errorRate` / `p90ServerMs` keys; `errorRate: 0` is preserved as `0`
- [x] 2.3 Write failing tests for per-field degradation: non-number / non-finite `error_rate` or `p90_server_ms` drops only that field; missing / non-finite / non-number `rate` and a non-object `metrics` drop the whole object — and in every case the edge element still exists with its `edgeType` and `labels` intact
- [x] 2.4 Write a failing test that `3.86e-7` / `6.7e-8` survive strictly equal (not collapsed to `0`), and a failing test that none of the degradation paths append to `normalizeGraph`'s `errors` array
- [x] 2.5 Implement `parseEdgeMetrics` as a pure helper in `src/features/graph-data/normalize.ts` and wire it into `parseEdges` alongside the existing `labels` / `relation` handling, spreading `metrics` conditionally so an absent value never writes the key
- [x] 2.6 Run `npx jest src/features/graph-data/normalize.test.ts` — all new tests green, all pre-existing tests still green

## 3. Value formatter (TDD — tests before implementation)

- [x] 3.1 Write failing tests for the shared significant-digit formatter: 3 significant digits max, trailing zeros stripped (`5` not `5.00`, `3.2` not `3.20`), and — the load-bearing case — a non-zero input that would round to `0` emits exponent notation instead
- [x] 3.2 Write failing tests for the three unit wrappers: `rate` → `5 req/s`; `errorRate` → ratio×100 with `%` (`0.2` → `20%`, `0` → `0%`, `6.7e-8` → non-zero exponent form); `p90` → `45 ms` below 1000, `2.5 s` at/above 1000
- [x] 3.3 Implement the formatter as a pure module co-located under `src/features/hover-tooltip/`, no `@grafana/data` value-formatter dependency (design D4). NOT re-exported from the feature barrel: the barrel is the feature's cross-feature public surface and nothing outside `hover-tooltip` consumes the formatter
- [x] 3.4 Run the formatter test file — all green

## 4. Hover tooltip rows (TDD — tests before implementation)

- [x] 4.1 Write failing tests in `HoverTooltip.test.tsx`: hovering an edge with full metrics renders `rate` / `errorRate` / `p90` rows in that order, positioned after the `edgeType` row and before the `labels` divider
- [x] 4.2 Write failing tests for the omission cases: edge without `metrics` renders exactly today's rows and no placeholder; `metrics` without `errorRate` renders no `errorRate` row (explicitly asserting no `0%` appears); `metrics` without `p90ServerMs` renders no `p90` row
- [x] 4.3 Write a failing test that RED values never appear inside the `labels` section
- [x] 4.4 Extend the edge branch of `buildContent` in `HoverTooltip.tsx` to append the RED rows via the formatter, keeping `attrs` construction pure and conditional
- [x] 4.5 Run `npx jest src/features/hover-tooltip` — all new tests green, all pre-existing tooltip tests (node path, pinned path, edge path) still green

## 5. Demo fixture

- [x] 5.1 Refactor `dev/victoriametrics/seed.sh` so each demo edge's label set is written once and reused across all three metric families, making label-set divergence structurally impossible (design D6)
- [x] 5.2 Emit `traces_service_graph_request_failed_total` per edge with a per-tick value that increments strictly slower than the corresponding `_total`, so `error_rate` lands in `(0,1)`
- [x] 5.3 Emit `traces_service_graph_request_server_seconds_bucket` per edge with a cumulative `le` ladder of at least two boundaries ending in `le="+Inf"`, values monotonic non-decreasing along `le` and incrementing per tick
- [x] 5.4 Update the seeder's header comment to document why all three families must share a label set and why the counters must keep increasing
- [x] 5.5 Verify no series carries an `edge_relation="link"` label (it would exclude the edge from RED measurement)

## 6. Documentation

- [x] 6.1 Add the edge `metrics` contract (fields, units, three-valued semantics, which edge types can carry it) to `CONTEXT.md` alongside the existing edge-type wire contract
- [x] 6.2 Note in `CLAUDE.md`'s local-demo section that the RED demo requires a backend image built from the `add-service-graph-red-metrics` branch, overridable via `KSG_BACKEND_TAG`

## 7. Verification

- [x] 7.1 Run `npm run lint` and `npm run typecheck` — both clean, zero warnings
- [x] 7.2 Run `npm run test:ci` — full suite green (89 suites / 988 tests)
- [x] 7.3 Run `npm run build` — production build succeeds (only the pre-existing bundle-size warnings)
- [x] 7.4 Browser-verify against the local demo: `npm run build` + `docker compose --profile backend up -d`, then hover a `pod-calls-service` edge (RED rows present), the cross-cluster `pod-calls-pod` edge (RED rows present), and the `external` edge plus a `pod-mounts-pvc` edge (no RED rows, no placeholder)
- [x] 7.5 Backend availability: rather than deferring, a local image was built from the sibling repo's `add-service-graph-red-metrics` branch (`docker build -f deploy/docker/server.Dockerfile -t marz32one/kube-state-graph:red-local .`) and the stack run with `KSG_BACKEND_TAG=red-local`, so the RED-present path was verified for real. Verified end to end: backend emits `{rate, error_rate, p90_server_ms}` on exactly the 3 trace-derived pod/service edges of 24 total; normalize lands `{rate, errorRate, p90ServerMs}` in cytoscape; the tooltip renders `rate: 9.99 req/s` / `errorRate: 15%` / `p90: 420 ms` between the `edgeType` row and the LABELS divider; the `external`-targeted `pod-calls-pod` edge and the storage/topology edges show no RED rows and no placeholder. Seeded fixture measured back exactly: error rates 0.02 / 0.07 / 0.15 and p90 36.7 / 100 / 420 ms
- [x] 7.6 Run `/opsx:verify` and reconcile any spec/implementation divergence before archiving. (There is no `openspec verify` CLI subcommand — verification is the skill. `openspec validate edge-red-metrics --strict` passes.) Divergence found and reconciled: PR #37 (`dd4144f`), which landed after these artifacts were written, renamed the duration row key `p90` → `duration(p90)` and tints a measured non-zero `errorRate` value in the theme's error colour. The panel-rendering delta and design D5 now describe that shipped behavior, including a scenario for the error-colour rule and for `0%` staying neutral.
