# dev-environment delta — render-from-fixture-only

## ADDED Requirements

### Requirement: The typed fixture is the single source of the panel's demo data

`src/shared/fixtures/showcaseGraph.ts` SHALL export `SHOWCASE_GRAPH`, annotated with the
`WireGraph` type from `src/shared/types/wire.ts`, as **the** graph the local demo, the
Playwright showcase spec, and the fixture coverage suite all read. The repository SHALL
contain no service, script, or dashboard that obtains graph data from a running
kube-state-graph server, a Prometheus-compatible store, or a Kubernetes cluster.

The `WireGraph` annotation is the mechanism, not decoration: because `normalizeGraph`
accepts `unknown` and validates at runtime, a field the panel learns to read would otherwise
be invisible to every compile-time check. Typing the fixture makes teaching normalize a new
field and forgetting the demo a `npm run typecheck` failure instead of a blank spot nobody
re-reads.

The fixture SHALL carry the complete response envelope the backend sends — `apiVersion`,
`clusters`, and `elements` — not `elements` alone, so the demo exercises the same body shape
a deployment would receive. `clusters` SHALL list Kubernetes cluster names only; an ONTAP
cluster name MUST NOT appear in it.

The fixture MAY carry fields no backend release emits — `status`, `alerts`, `time_records`,
and the `switch` / `network` kinds with their `switch-to-switch` / `node-to-switch` edges are
the panel's own extension surface. Where it does, the fixture and the wire types MUST record
that provenance in a comment, so a reader cannot mistake a panel-only field for part of the
backend contract and "correct" the backend to match.

#### Scenario: No backend anywhere in the repository

- **WHEN** inspecting `docker compose config --services`, `provisioning/datasources/`, and every file under `dev/` and `tests/`
- **THEN** the only Compose service is `grafana`, the provisioned Infinity datasource carries no `url`, and no file addresses a kube-state-graph, VictoriaMetrics, or Kubernetes endpoint

#### Scenario: A wire field added to normalize without fixture coverage fails typecheck

- **WHEN** a new field is added to `WireGraph` as required, and `SHOWCASE_GRAPH` is not updated
- **THEN** `npm run typecheck` fails

### Requirement: The demo dashboard is generated from the fixture, and drift fails the build

`provisioning/dashboards/ksg-switch-demo.json` SHALL contain exactly one Infinity target with
`source: "inline"`, whose `data` string is **generated** from `SHOWCASE_GRAPH` by
`dev/buildFixtureDashboard.mjs` and never hand-edited.

- `npm run fixture:build` SHALL rewrite that target and leave the rest of the dashboard
  byte-identical.
- `npm run fixture:check` SHALL exit non-zero when the committed dashboard does not match
  what the fixture would produce, naming `npm run fixture:build` as the remedy.
- The check SHALL run in CI and in the `pre-push` hook.

The generator SHALL fail loudly rather than write a partial file when the dashboard does not
contain exactly one inline target: a dashboard whose shape moved must stop the build, not
silently publish a demo carrying stale data.

Grafana provisioning reads dashboard JSON from disk, so the payload has to physically live
in the committed file; the drift gate is what keeps a generated artefact from forking away
from its source on the first hand-edit.

#### Scenario: Regenerating a committed dashboard is a no-op

- **WHEN** `npm run fixture:build` runs against a tree where the fixture and dashboard agree
- **THEN** the dashboard file is unchanged and `npm run fixture:check` exits 0

#### Scenario: A fixture edit that was never compiled in fails CI

- **WHEN** `SHOWCASE_GRAPH` is edited and the dashboard is left untouched
- **THEN** `npm run fixture:check` exits non-zero and prints the `npm run fixture:build` remedy

### Requirement: The fixture covers every kind and edge type the panel can draw

`src/shared/fixtures/showcaseGraph.test.ts` SHALL assert that `normalizeGraph(SHOWCASE_GRAPH)`
produces:

- an empty `errors` array — the partial-parse channel exists for a real backend having a bad
  day, so anything landing there is this repository's own mistake;
- no edge whose `source` or `target` is absent from the fixture's own nodes, and no node
  whose `parent` is;
- at least one element for **every** key of `ICON_SVG_BY_KIND` and **every** key of
  `EDGE_STYLE_BY_TYPE`.

Coverage SHALL be asserted against those two canonical maps rather than the panel's
filterable subset, so the virtual `network` wrapper counts. Anchoring there makes "add a kind
to the map" and "show it in the demo" one enforced task.

The suite SHALL additionally pin the demo cases that exist to be looked at rather than
merely parsed: all three `ready_status` values, a claim that joined an aggregate beside one
that did not, a QoS-capped storage edge beside an uncapped one, a measured error rate beside
a measured-clean zero beside an unmeasured edge, a legitimately tiny rate that must not round
to nothing, and both `labels.role` ingress shapes with their differing dash and visibility
behaviour.

#### Scenario: A newly drawable kind with no fixture element fails

- **WHEN** a key is added to `ICON_SVG_BY_KIND` and no fixture node carries that kind
- **THEN** `showcaseGraph.test.ts` fails, naming the uncovered kind

## MODIFIED Requirements

### Requirement: Docker Compose orchestration

`docker-compose.yaml` SHALL orchestrate exactly **one** service: `grafana` (the official
image), with the plugin's `dist/` bind-mounted into its plugin path and the Infinity
datasource plugin auto-installed via `GF_INSTALL_PLUGINS`. There SHALL be no Compose
profiles, no backend service, no metrics store, and no seeder.

A plain `docker compose up -d` SHALL bring the demo fully to life. Because the only dashboard
target is `source: "inline"`, Grafana issues no request on the panel's behalf and there is
nothing to wait for, fail against, or configure a tag for.

#### Scenario: One service, no profiles

- **WHEN** running `docker compose config --services`
- **THEN** the output is exactly `grafana`, and `docker compose --profile backend config --services` prints the same single service

#### Scenario: Healthy after start with no other container

- **WHEN** running `docker compose up -d` and waiting 30 seconds
- **THEN** `docker compose ps` shows `grafana` running and `http://localhost:3000/api/health` returns 200

### Requirement: E2E tests (reduced scope)

E2E tests SHALL use `@grafana/plugin-e2e` and consist of a smoke spec against the **showcase**
dashboard: open the provisioned `ksg-switch-demo.json`, assert `[data-testid="graph-canvas"]`
mounts, and assert the legend controls that depend on the fixture's content are present.

This is the only e2e spec the repository can have, and that is a property of the design
rather than a gap: with no backend, there is no second data path to smoke-test. What the spec
proves that unit tests cannot is the round trip — that the generated payload survives the
dashboard JSON and the Infinity inline target and reaches a mounted cytoscape graph.

Developer-triggered locally (`npm run e2e`); not run in CI.

#### Scenario: Showcase smoke spec passes against a plain `docker compose up`

- **WHEN** a developer runs `npm run e2e` against a Grafana started with no profile
- **THEN** the showcase spec passes with no backend container running

### Requirement: Developer documentation

`README.md` SHALL contain: Prerequisites (Node 22+, Docker), Quick Start
(`npm install` → `npm run build` → `docker compose up -d` → open the showcase dashboard),
Architecture overview, Linting & testing, and Troubleshooting.

Quick Start MUST be completable on a clean checkout with **no** image to pull beyond Grafana
and no credentials, and MUST NOT reference a backend service, a metrics store, a seeder, an
image tag, or a Compose profile. The documentation SHALL state where the demo data comes
from and how to change it (edit the fixture, run `npm run fixture:build`).

Troubleshooting SHALL cover the unsigned-plugin warning, port conflicts, and a stale
generated dashboard.

#### Scenario: Quick Start works offline of any backend

- **WHEN** a new developer follows Quick Start on a clean checkout
- **THEN** the showcase dashboard renders a populated graph, and no step mentions a backend

## REMOVED Requirements

### Requirement: Demo seeder 推送 RED 來源序列

**Reason**: The seeder it governs is deleted. `dev/victoriametrics/seed.sh` pushed
`traces_service_graph_request_total` plus its two RED companions so a real backend would
produce `data.metrics` locally — a requirement whose every clause was about keeping three
PromQL series' label sets byte-identical so the backend's join would land.

None of that survives the removal of the backend stack. The behaviour it existed to make
visible — an edge with a measured error rate, an edge measured clean at exactly `0`, and an
edge with no measurement at all — is now carried directly by `SHOWCASE_GRAPH` and asserted by
`showcaseGraph.test.ts`, without a counter that has to increment or a label set that has to
match.

**Migration**: none. No consumer depended on the seeder; the demo behaviour it produced is
preserved by the fixture requirements above.
