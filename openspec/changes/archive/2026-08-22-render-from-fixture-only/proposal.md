## Why

This repository is panel-only, yet half its development surface was a backend it does not
contain. `docker-compose.yaml` carried a `backend` profile with three services — the
`marz32one/kube-state-graph` image, VictoriaMetrics, and a shell-script seeder pushing a
synthetic PromQL fixture — purely so a second provisioned dashboard could drive the panel
over HTTP. Two of the three e2e specs and three dev scripts pointed at that dashboard.

That arrangement had stopped paying for itself, in three independent ways:

1. **It could not render the current wire contract.** The demo needed a backend image
   carrying `replace-storageclass-with-netapp-nodes` and, for RED, one carrying
   `add-service-graph-red-metrics`. Neither is published. `KSG_BACKEND_TAG` still defaulted
   to `:latest`, so `docker compose --profile backend up` rendered the workload half
   normally and the storage half not at all — and the change that introduced that
   requirement had to leave the tag-bump task open indefinitely, waiting on a build.
2. **It was already broken against the next backend.** `push-request-filters-upstream`
   deletes `GET /v1/clusters` and the `name` filter. The backend-driven dashboard used both
   — one as a template-variable query, one as a panel query parameter — so it was scheduled
   to fail on the backend's next release regardless of what the panel did.
3. **It never covered the panel anyway.** A grep of the whole kube-state-graph repository —
   specs, `pkg/`, `internal/`, README, CONTEXT — finds no `alerts`, no `time_records`, no
   `switch`, no `network`, and no `switch-to-switch` / `node-to-switch`. Those are the
   panel's own extension surface, backed by 180+ references in `src/`, and **no backend
   release will ever supply them.** The only thing that can exercise them is a fixture.

Meanwhile the backend has grown fields the panel silently ignores: `ready_status` on a K8s
node (zero references in `src/`), the PVC `svm` / `volumename` labels, and the second
`labels.role` value `ingress-lb` — where getting the distinction wrong is not cosmetic but
erases a real dependency edge from the graph.

So: delete the backend surface, promote the fixture from "the showcase's inline JSON" to
**the** typed source of the panel's data, and use the room that frees to finish syncing the
wire contract.

## What Changes

### Added

- **`src/shared/fixtures/showcaseGraph.ts`** — the single source of the panel's fake data,
  typed as `WireGraph` (new, `src/shared/types/wire.ts`) so a field normalize learns to read
  cannot be forgotten in the fixture without failing `npm run typecheck`. Carries the full
  response envelope (`apiVersion`, `clusters`, `elements`), not just `elements`.
- **`npm run fixture:build` / `npm run fixture:check`** (`dev/buildFixtureDashboard.mjs`) —
  compiles the fixture into the provisioned dashboard's Infinity `inline` target, and fails
  when the two have drifted. Wired into CI and the pre-push hook. The dashboard's `data`
  string becomes generated output, never hand-edited.
- **`showcaseGraph.test.ts`** — the coverage gate: the fixture parses with zero errors, has
  no dangling edge endpoint or parent reference, and covers **every** kind in
  `ICON_SVG_BY_KIND` and **every** type in `EDGE_STYLE_BY_TYPE`. Adding a kind or edge type
  to either canonical map without fixture coverage now fails the build.
- **Node `ready_status`** — Kubernetes' Ready condition on a K8s node, carried through
  normalize as `readyStatus` and promoted as a `ready` attribute row. A third status axis,
  independent of the panel's `status` (alert severity) and `worstStatus`. Absence is NOT
  `Unknown`: the backend reserves that literal for a kubelet that stopped reporting, so a
  monitoring gap must never render as an outage.
- **Promoted `role`, `volumename`, and `svm` label rows** — lifted out of the raw label list
  into attribute rows. `role` because it is the only thing telling the two ingress shapes
  apart; `volumename` / `svm` because they are the keys the NetApp join hinges on and the
  first things an operator checks when a claim fails to reach an aggregate.

### Changed

- **`docker-compose.yaml` is one service.** Grafana, the `dist/` bind mount, the Infinity
  plugin. No profiles.
- **The Infinity datasource carries no `url`.** An inline target still routes through a
  datasource, so the provisioning stays — but it addresses nothing.
- **`collectIngressNodeIds` excludes `ingress-lb` deliberately, not incidentally.** The
  exclusion is now a recorded decision with its rationale, a named constant
  (`INGRESS_LB_LABEL_VALUE`), and tests pinning it — including one asserting the match is
  exact rather than a prefix, so a future third role has to opt in.
- **The dev browser scripts point at the showcase** and `dev/nobackend/` is flattened into
  `dev/` — with no backend anywhere, the folder name had stopped meaning anything.

### Removed — **BREAKING for the local demo only**

- The `kube-state-graph`, `victoriametrics`, and `ksg-seeder` services and the `backend`
  Compose profile; `KSG_BACKEND_TAG` / `VM_TAG` / `CURL_TAG`; `npm run server`.
- `dev/victoriametrics/` (`seed.sh` + `topology.prom`), `dev/nobackend/drive-backend.mjs`,
  and `dev/nobackend/patch-showcase.mjs` (a one-off migration that hand-patched the showcase
  JSON — patching generated output is exactly the drift the generator now prevents).
- `provisioning/dashboards/ksg-demo.json` and the two e2e specs that read it
  (`tests/panel.spec.ts`, `tests/variable-filter.spec.ts`).

No production code path is removed: nothing in `src/` ever knew whether its payload came
from a backend or an inline target.

## Capabilities

### New Capabilities

_None — every requirement lands in an existing capability._

### Modified Capabilities

- `dev-environment`: the Compose topology collapses to one service; the demo-seeder RED
  requirement is withdrawn with the seeder; the fixture becomes the demo's single data
  source with a generated dashboard and a drift gate; the E2E requirement re-anchors on the
  showcase.
- `graph-data-integration`: the datasource strategy and dashboard provisioning are rewritten
  around the inline fixture; `ready_status` joins the typed node attributes normalize reads.
- `panel-rendering`: `role`, `ready`, `volumename`, and `svm` join the promoted attribute
  rows, and promoted label keys are suppressed from the raw label list from one shared list.
- `ingress-visibility-toggle`: the ingress node set is defined against the backend's **two**
  role values, with `ingress-lb` excluded and the reason recorded.

## Impact

- **Modified**: `docker-compose.yaml`, `provisioning/datasources/kube-state-graph.yaml`,
  `provisioning/dashboards/ksg-switch-demo.json` (now generated), `package.json`,
  `.github/workflows/ci.yml`, `.githooks/pre-push`, `tests/showcase.spec.ts`,
  `src/features/graph-data/normalize.ts`, `src/shared/types/cytoscape.d.ts`,
  `src/shared/nodeAttributes/buildNodeAttributes.ts`,
  `src/features/hover-tooltip/components/HoverTooltip/HoverTooltip.tsx`,
  `src/shared/constants/ingressGateway.ts`, `src/shared/graph/collectIngressNodeIds.ts`,
  `README.md`, `CLAUDE.md`, `CONTEXT.md`.
- **Added**: `src/shared/types/wire.ts`, `src/shared/fixtures/showcaseGraph.ts` (+ test),
  `dev/buildFixtureDashboard.mjs`.
- **Dependencies**: none added. The generator runs on Node's native TypeScript type
  stripping, which `engines: node >= 22` already covers.
- **Consumers**: anyone running the local demo drops `--profile backend` and gains a demo
  that works on a clean checkout with no image to pull.
