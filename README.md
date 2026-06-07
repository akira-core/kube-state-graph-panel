# kube-state-graph-panel

Grafana panel plugin that visualizes Kubernetes resource topology (Pods, Services, Deployments, Ingresses, etc.) and their relationships as an interactive cytoscape.js graph. Data is sourced from the upstream [kube-state-graph](https://github.com/Marz32onE/kube-state-graph) backend via an Infinity datasource.

## Prerequisites

- Node 22+
- Docker (with Compose v2)
- No real Kubernetes cluster needed — the demo is fully self-contained. The `v0.0.14` backend derives the graph from PromQL over a seeded VictoriaMetrics (the `ksg-seeder` service pushes a synthetic fixture), all brought up by `docker compose`.

## Quick Start

```bash
npm install
npm run dev                              # webpack watch, outputs to dist/

# Pick a run mode (one Grafana; both dashboards are always provisioned):
docker compose up -d                     # grafana only → backend-free Showcase (/d/ksg-switch-demo)
docker compose --profile backend up -d   # + VictoriaMetrics + seeder + kube-state-graph
                                         #   → KSG Demo (/d/ksg-demo) goes live too (== `npm run server`)
# Open http://localhost:3000 (default Grafana login)
```

Both dashboards are provisioned from `provisioning/dashboards/` and are independent: `KSG Showcase`
(`/d/ksg-switch-demo`) runs off an Infinity **inline** target (no backend), while `KSG Demo`
(`/d/ksg-demo`) drives the real backend via the provisioned Infinity datasource. Without the
`backend` profile, `KSG Demo` shows an (expected) datasource error — open `KSG Showcase` instead.

### Variable filtering

The demo dashboard exposes four template variables that filter the graph **at the backend** (`/v1/graph` scope query params): `cluster`, `namespace`, `name` (resource), and `edge_type`. They are chained — `namespace` is scoped by the selected `cluster`, and `name` by both. Multi-value selections expand to repeated query params (e.g. `cluster=prod&cluster=dr`) via Grafana's `${var:customqueryparam:<name>:}` interpolation; `All` expands to every actual value (no filter). `cluster` values are sourced from the backend discovery endpoint `GET /v1/clusters` (returns `{ "clusters": [{"name":"dr"}, {"name":"prod"}] }`); `edge_type` is a fixed Custom variable with the 3 drawn edge types. The `v0.0.14` backend already implements scope params and discovery endpoints — no image change is required. Panel-side `node kind` / `edge type` visibility filters (panel options) are independent and stack on top of the backend filter.

## Architecture Overview

Feature-first layout under `src/`:

- `src/panels/KsgPanel/` — Grafana panel entry, orchestrator, options editor
- `src/features/graph-canvas/` — cytoscape.js wrapper (hooks + styles + diff/patch sync)
- `src/features/graph-data/` — Infinity datasource integration + normalize boundary
- `src/features/legend/` — node/edge legend
- `src/features/theme/` — Grafana theme → cytoscape stylesheet adapter
- `src/features/hover-tooltip/` — right-corner hover tooltip
- `src/features/element-filter/` — node-kind / edge-type visibility filter
- `src/features/node-detail/` — bottom node-detail panel (click to open)
- `src/shared/` — cross-feature primitives, constants, types

Decisions captured in `openspec/changes/scaffold-ksg-panel/design.md`.

## Linting & Testing

```bash
npm run lint           # eslint --max-warnings=0
npm run typecheck      # tsc --noEmit
npm run test:ci        # jest (non-watch)
npm run test           # jest --watch (default during dev)
npm run e2e            # playwright (requires grafana + plugin running)
npm run format         # prettier --write
```

Git hooks are version-controlled under `.githooks/` and enabled automatically by the `prepare` npm script (which points `core.hooksPath` at `.githooks/`): `pre-commit` runs `lint-staged`, `pre-push` runs `lint` + `typecheck` + `test:ci`.

## Troubleshooting

- **Unsigned plugin warning in Grafana**: ensure `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=marz32one-ksg-panel` is set (already in `docker-compose.yaml`).
- **Port 3000 / 8080 collision**: stop other services or override `GF_SERVER_HTTP_PORT` / backend port mapping.
- **Backend returns errors / empty graph**: check `docker compose logs kube-state-graph` and `docker compose logs victoriametrics`; the `ksg-seeder` service must be running and pushing fixtures for the topology to appear.
- **Panel shows "No data"**: backend returned an empty payload — confirm the dashboard time range covers the seeded window and that `ksg-seeder` is up (`docker compose ps`).

## Specs & Change Log

This repo uses OpenSpec for change management. The active scaffold change lives at `openspec/changes/scaffold-ksg-panel/`. Run `openspec status` for progress.
