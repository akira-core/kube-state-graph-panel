# kube-state-graph-panel

Grafana panel plugin that visualizes Kubernetes resource topology (Pods, Services, Deployments, Ingresses, etc.) and their relationships as an interactive cytoscape.js graph. In a deployment its data comes from the upstream [kube-state-graph](https://github.com/Marz32onE/kube-state-graph) backend through an Infinity datasource.

**This repository is panel-only and contains no backend.** Its demo runs on a typed fixture — see [Demo data](#demo-data) — so a clean checkout renders a full graph with nothing to pull, seed, or configure.

## Prerequisites

- Node 22+ (the fixture generator uses Node's native TypeScript type stripping)
- Docker (with Compose v2)
- Nothing else. No Kubernetes cluster, no kube-state-graph server, no metrics store — the demo graph is a fixture compiled into the provisioned dashboard.

## Quick Start

```bash
npm install
npm run build            # or `npm run dev` to keep webpack watching dist/
docker compose up -d     # one service: Grafana, with dist/ bind-mounted
# → http://localhost:3000/d/ksg-switch-demo
```

One Compose service, no profiles, no flags. `KSG Showcase` (`/d/ksg-switch-demo`) is the only
provisioned dashboard and it carries its whole graph in an Infinity **inline** target, so it
renders immediately with nothing else running.

## Demo data

The demo graph lives in `src/shared/fixtures/showcaseGraph.ts`, typed as `WireGraph` — the
kube-state-graph `GET /v1/graph` response shape. It is the single source of the panel's fake
data: the unit tests, the Playwright spec, and the dashboard all read the same fixture.

To change what the demo shows:

```bash
# 1. edit src/shared/fixtures/showcaseGraph.ts
npm run fixture:build    # 2. compile it into provisioning/dashboards/ksg-switch-demo.json
npm run fixture:check    # verify the two are in sync (also runs in CI and pre-push)
```

The dashboard's inline `data` string is **generated output** — edit the fixture, never the
dashboard. `fixture:check` fails the build when they drift.

Two guarantees keep the fixture honest:

- **Typecheck.** Teaching `normalizeGraph` a new field means adding it to `WireGraph`, and a
  fixture that does not carry it fails `npm run typecheck`.
- **Coverage.** `showcaseGraph.test.ts` asserts the fixture parses with zero errors and covers
  every kind in `ICON_SVG_BY_KIND` and every edge type in `EDGE_STYLE_BY_TYPE`.

The fixture deliberately mixes two provenances, marked in its header comment: most fields are
the real backend wire contract, while `status`, `alerts`, and the `switch` / `network` kinds
with their fabric edges are the panel's own extension surface that **no backend release
emits**. Don't read the latter as a wire sample.

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
npm run fixture:check  # generated dashboard is in sync with the fixture
npm run format         # prettier --write
```

Git hooks are version-controlled under `.githooks/` and enabled automatically by the `prepare` npm script (which points `core.hooksPath` at `.githooks/`): `pre-commit` runs `lint-staged`, `pre-push` runs `lint` + `typecheck` + `fixture:check` + `test:ci`.

## Troubleshooting

- **Unsigned plugin warning in Grafana**: ensure `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=marz32one-ksg-panel` is set (already in `docker-compose.yaml`).
- **Port 3000 collision**: stop the other service or override `GF_SERVER_HTTP_PORT`.
- **Panel shows "No data"**: the dashboard's inline payload did not parse. Run `npm run fixture:build` — the committed dashboard is generated and may be stale.
- **A fixture edit does not show up**: same cause. `npm run fixture:check` tells you whether the dashboard matches the fixture.
- **"Datasource ksg-default was not found"**: the Infinity plugin did not install. Check `docker compose logs grafana`; it is fetched on first start via `GF_INSTALL_PLUGINS`.

## Specs & Change Log

This repo uses OpenSpec for change management. Capabilities live under `openspec/specs/`, in-flight work under `openspec/changes/`. Run `openspec status` for progress.
