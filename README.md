# kube-state-graph-panel

Grafana panel plugin that visualizes Kubernetes resource topology (Pods, Services, Deployments, Ingresses, etc.) and their relationships as an interactive cytoscape.js graph. Data is sourced from the upstream [kube-state-graph](https://github.com/Marz32onE/kube-state-graph) backend via an Infinity datasource.

## Prerequisites

- Node 22+
- Docker (with Compose v2)
- A reachable Kubernetes cluster (for backend to read real data). Set `KUBECONFIG_PATH` env var if your kubeconfig isn't at `./dev/kubeconfig`.

## Quick Start

```bash
npm install
npm run dev               # webpack watch, outputs to dist/
docker compose up -d      # starts grafana + kube-state-graph backend
# Open http://localhost:3000 (default Grafana login)
```

The `KSG Demo` dashboard is auto-provisioned and opens with one configured `Kube State Graph` panel.

## Architecture Overview

Feature-first layout under `src/`:

- `src/panels/KsgPanel/` — Grafana panel entry, orchestrator, options editor
- `src/features/graph-canvas/` — cytoscape.js wrapper (hooks + styles + diff/patch sync)
- `src/features/graph-data/` — Infinity datasource integration + normalize boundary
- `src/features/legend/` — node/edge legend
- `src/features/theme/` — Grafana theme → cytoscape stylesheet adapter
- `src/features/hover-tooltip/` — hover tooltip (planned)
- `src/features/element-filter/` — node-kind / edge-type filter (planned)
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

`husky` installs git hooks: `pre-commit` runs `lint-staged`, `pre-push` runs `lint` + `typecheck` + `test:ci`.

## Troubleshooting

- **Unsigned plugin warning in Grafana**: ensure `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=marz32one-ksg-panel` is set (already in `docker-compose.yaml`).
- **Port 3000 / 8080 collision**: stop other services or override `GF_SERVER_HTTP_PORT` / backend port mapping.
- **Backend cannot reach cluster**: confirm `KUBECONFIG_PATH` points to a valid kubeconfig readable by the backend container. Verify with `docker compose logs kube-state-graph`.
- **Panel shows "No data"**: backend is reachable but returned empty payload — check kubeconfig context selects the right cluster and that workloads exist in observed namespaces.

## Specs & Change Log

This repo uses OpenSpec for change management. The active scaffold change lives at `openspec/changes/scaffold-ksg-panel/`. Run `openspec status` for progress.
