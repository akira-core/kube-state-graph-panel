# Tasks — render-from-fixture-only

## 1. The wire types and the fixture

- [x] 1.1 `src/shared/types/wire.ts`: type the `GET /v1/graph` response as it arrives — `WireGraph` / `WireNodeData` / `WireEdgeData` / `WireRedMetrics` / `WireIoMetrics` / `WireUsage` / `WireAlert`, in the backend's snake_case with no renaming. Record on the file that this is the INPUT side of the anti-corruption layer (nothing is enforced at runtime) and that its purpose is a compile-time contract for the fixture. Mark `status` and `alerts` as PANEL-ONLY.
- [x] 1.2 `src/shared/fixtures/showcaseGraph.ts`: lift the showcase dashboard's inline JSON into a `WireGraph`-annotated `SHOWCASE_GRAPH`, adding the full envelope (`apiVersion`, `clusters: ['prod', 'dr']`). Header comment separates the real wire contract from the panel-only fields and states that no backend release will ever supply the latter.
- [x] 1.3 Same fixture: add `ready_status` on all three K8s nodes (`Ready` / `NotReady` / `Unknown`).
- [x] 1.4 Same fixture: add `labels.volumename` + `labels.svm` on the two joined claims, and `volumename` alone on `data-mongo-2` — the claim that resolved a PV, matched no Harvest series, and therefore has no storage edge.
- [x] 1.5 Same fixture: add `read_bytes_per_sec` / `write_bytes_per_sec` to both storage edges, and `max_iops` / `max_bytes_per_sec` to the aggr1 edge only, so the demo shows a capped volume beside an uncapped one.
- [x] 1.6 Same fixture: add the `ingress-lb` half — `service/nginx-lb` (`labels.role = "ingress-lb"`), the `nginx-lb-0` pod it selects, and `pod/reporting` whose ONLY dependency edge is the one into it. Sits beside the existing `ingress-gateway` chain so the two render side by side.
- [x] 1.7 Same fixture: add a DaemonSet, a Job, and a CronJob controller with one pod each under a `platform` application group. These three kinds had icons, legend entries, and colour, and had never appeared in any demo — task 2.3's coverage assertion is what surfaced that.

## 2. Generation and the drift gate

- [x] 2.1 `dev/buildFixtureDashboard.mjs`: read the dashboard, replace the single `source: "inline"` target's `data` with `JSON.stringify(SHOWCASE_GRAPH)`, write it back at 2-space indent. Throw when the inline-target count is not exactly 1. `--check` compares instead of writing and exits non-zero with the remedy. Plain `.mjs` importing the `.ts` fixture through Node's native type stripping (design D3).
- [x] 2.2 `package.json`: add `fixture:build` / `fixture:check`; remove `server`.
- [x] 2.3 `src/shared/fixtures/showcaseGraph.test.ts`: zero parse errors, no dangling edge endpoint or parent reference, and full coverage of `ICON_SVG_BY_KIND` + `EDGE_STYLE_BY_TYPE`. Plus the demo cases worth looking at: three Ready states, joined vs unjoined claim, capped vs uncapped storage edge, measured-error vs measured-zero vs unmeasured, the tiny rate, and both ingress shapes' dash / visibility behaviour.
- [x] 2.4 `.github/workflows/ci.yml` + `.githooks/pre-push`: run `fixture:check` after lint.

## 3. Removing the backend surface

- [x] 3.1 `docker-compose.yaml`: delete `kube-state-graph`, `victoriametrics`, `ksg-seeder` and the `backend` profile; rewrite the header for the single-service topology.
- [x] 3.2 Delete `dev/victoriametrics/` (`seed.sh`, `topology.prom`).
- [x] 3.3 Delete `provisioning/dashboards/ksg-demo.json` and the two e2e specs reading it (`tests/panel.spec.ts`, `tests/variable-filter.spec.ts`).
- [x] 3.4 `provisioning/datasources/kube-state-graph.yaml`: drop `url`; comment why the datasource still has to exist for an inline target.
- [x] 3.5 Delete `dev/nobackend/drive-backend.mjs` and `dev/nobackend/patch-showcase.mjs`; move `drive.mjs` → `dev/drive-showcase.mjs` and `verify3.mjs` → `dev/verify-console.mjs`; remove the now-meaningless `dev/nobackend/` folder.
- [x] 3.6 Repoint `dev/screenshot.mjs`, `dev/verify-ui.mjs`, `dev/hover-screenshot.mjs` at `/d/ksg-switch-demo`.
- [x] 3.7 `tests/showcase.spec.ts`: rewrite the header — it is now the only e2e spec there can be, and what it proves is the fixture → dashboard → Infinity → cytoscape round trip.

## 4. Syncing the remaining wire contract

- [x] 4.1 `cytoscape.d.ts`: add `readyStatus?: string` to `NodeDataDefinition`, recording that it is a third status axis and that absence is NOT `Unknown`.
- [x] 4.2 `normalize.ts`: carry `ready_status` → `readyStatus` under a non-empty-string guard, verbatim, absent when unusable.
- [x] 4.3 `normalize.test.ts`: all three values pass through; absent / empty / non-string all yield no key; an unrecognised value survives; a node with `ready_status` normalizes identically to one without it apart from the field.
- [x] 4.4 `buildNodeAttributes.ts`: promote `role` (any value, under `kind`), `volumename` + `svm` (with `storageclass`), and `ready` (with `health`), each guarded for non-empty string. Export `PROMOTED_LABEL_KEYS` as the one list driving both promotion and the tooltip's raw-label suppression.
- [x] 4.5 `HoverTooltip.tsx`: feed `PROMOTED_LABEL_KEYS` into `NODE_PROMOTED_LABELS` so a promoted key is never also listed below the divider.
- [x] 4.6 `buildNodeAttributes.test.ts`: both role values; ready present and absent; volumename+svm; volumename alone; non-string / empty label values ignored.
- [x] 4.7 `ingressGateway.ts`: add `INGRESS_LB_LABEL_VALUE` with the asymmetry rationale — why hiding or dashing it would erase the caller's only dependency edge.
- [x] 4.8 `collectIngressNodeIds.ts`: record on the LABELLED layer that the match is exact against the one value, and why `ingress-lb` stays out.
- [x] 4.9 `collectIngressNodeIds.test.ts`: `ingress-lb` never collected; it never seeds the one-level expansion; both shapes in one graph stay apart; an unrecognised `ingress-gateway-canary` is not collected either.

## 5. Docs

- [x] 5.1 `README.md`: rewrite Quick Start and the demo section around the single-service Compose file and the fixture; document `fixture:build` / `fixture:check` and how to change the demo data; drop every backend / profile / image-tag reference.
- [x] 5.2 `CLAUDE.md`: rewrite the Local demo section; replace the seeder/backend commentary with the fixture pipeline; drop `npm run server` from the command list and add the fixture scripts; note that `alerts` / `switch` / `network` are panel-only.
- [x] 5.3 `CONTEXT.md`: record the fixture in the vocabulary, and the two `role` values with their differing visibility semantics.

## 6. Verification

- [x] 6.1 `npm run lint && npm run typecheck && npm run fixture:check && npm run test:ci && npm run build` all clean.
- [x] 6.2 `docker compose config --services` prints exactly `grafana`, with and without `--profile backend`.
- [x] 6.3 `openspec validate render-from-fixture-only --strict`.
