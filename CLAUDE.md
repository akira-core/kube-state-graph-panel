# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Write in **Traditional Chinese (繁體中文)**: conversational replies to the user, plan files, and PR descriptions (the body — the title keeps the English conventional-commit form so it reads consistently in the commit list).

Keep in **English** everything that becomes part of the codebase's own record: code and code comments, test names, commit messages, OpenSpec artifacts (`openspec/**` — `proposal.md`, `design.md`, `specs/**/spec.md`, `tasks.md`), and all user-facing UI strings (legend labels, tooltips, option names). Technical terms inside Chinese prose stay in English rather than being translated.

The split is by audience, not by file type: a PR description argues a change to reviewers here and now, so it goes in the reviewers' language; a commit message or a spec is read later by whoever touches the code, so it matches the code.

**Domain vocabulary lives in `CONTEXT.md`** (node kind, edge type, container, collapse, selection, hit, locate, …) — use those exact terms in code, specs, and tests.

## Project

Grafana 12.x panel plugin (`marz32one-ksg-panel`) that visualizes Kubernetes resource topology with cytoscape.js. In a deployment its data comes from the upstream [kube-state-graph](https://github.com/Marz32onE/kube-state-graph) Go backend via Grafana Infinity datasource. This repo is **panel-only**: it embeds no backend code and its demo runs entirely on a typed fixture (see Local demo).

Stack: React 18, TypeScript 5.9 (strict), Webpack, `@grafana/*` 12.4, cytoscape 3.33 + fcose + dagre, Jest, Playwright via `@grafana/plugin-e2e`.

## Commands

```bash
npm run dev          # webpack --watch → dist/ (used during local development)
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint --cache --max-warnings=0 .
npm run lint:fix     # eslint --fix + prettier --write
npm run format       # prettier --write
npm run test         # jest --watch --onlyChanged (default during dev)
npm run test:ci      # jest --passWithNoTests --maxWorkers 4
npm run e2e          # playwright (requires Grafana running)
npm run fixture:build  # compile src/shared/fixtures/showcaseGraph.ts into the demo dashboard
npm run fixture:check  # fail if the committed dashboard is stale (CI + pre-push)
```

Run a single Jest test file:

```bash
npx jest src/features/element-filter/computeVisibility.test.ts
npx jest -t 'edge auto-hides'   # by test name
```

Git hooks: version-controlled scripts under `.githooks/`. `pre-commit` runs `lint-staged` (eslint --fix + prettier --write on staged files); `pre-push` runs `lint && typecheck && fixture:check && test:ci`. They are enabled automatically — the `prepare` npm script points `core.hooksPath` at `.githooks/` on `npm install` — or manually via `npm run init-hooks`. Bypass ad hoc with `git commit/push --no-verify`.

CI: single GitHub Actions job (`.github/workflows/ci.yml`) runs typecheck → lint → fixture:check → test:ci → build → optional sign → plugin-validator → artifact upload. **No E2E in CI** (developer-triggered locally).

## Local demo

**There is no backend in this repository, and no way to run one from it.** The demo graph is a
typed fixture compiled into the provisioned dashboard. `docker compose up -d` starts exactly one
service — Grafana, with `dist/` bind-mounted so a rebuild hot-reloads without a container restart.

```bash
npm install
npm run build                # or `npm run dev` to keep webpack watching
docker compose up -d         # → http://localhost:3000/d/ksg-switch-demo (anonymous auth in dev)
```

### The fixture pipeline

```
src/shared/fixtures/showcaseGraph.ts   ← THE source. Typed `WireGraph` (src/shared/types/wire.ts).
        │  npm run fixture:build  (dev/buildFixtureDashboard.mjs)
        ▼
provisioning/dashboards/ksg-switch-demo.json   ← generated: one Infinity `source: "inline"` target
```

The dashboard's `data` string is **generated output — never hand-edit it.** `npm run fixture:check`
fails when the two have drifted, and runs in CI and `pre-push`. The generator is plain `.mjs`
importing the `.ts` fixture through Node's native type stripping, so there is no build step or
extra dependency between source and demo.

Two things keep the fixture from falling behind the contract it represents:

- **`WireGraph` typing.** Teaching `normalizeGraph` a new field means adding it to `WireGraph`; a
  fixture that does not carry it fails `npm run typecheck`. This is the whole reason the fixture is
  TypeScript rather than JSON — `normalizeGraph` takes `unknown`, so nothing else is compile-checked.
- **`showcaseGraph.test.ts`.** Zero parse errors, no dangling edge endpoint or `parent` reference,
  and an element for **every** key of `ICON_SVG_BY_KIND` and `EDGE_STYLE_BY_TYPE`. Adding a kind to
  either canonical map without fixture coverage fails the build.

### What the fixture covers

Two clusters with one stateful pattern each, plus the physical network fabric and the NetApp storage
chain (full wire contract enumerated in `CONTEXT.md`):

- **`prod`** — a MongoDB 3-replica StatefulSet behind a **headless** Service, per-replica PVCs, the
  `gateway` client, a `platform` app carrying the DaemonSet / Job / CronJob controllers, and the
  physical NetApp storage those PVCs land on (`storage-cluster > netapp-node > netapp-aggr`).
- **`dr`** — a NATS 3-replica workload behind a **ClusterIP** Service with `service-selects-pod`
  fan-out, plus the `consumer` client. One cross-cluster `pod-calls-pod` links the two.

Deliberate contrasts, each there to be looked at rather than merely parsed: all three `ready_status`
values; a claim that joined an aggregate beside one that resolved a PV and matched no Harvest series
(no storage edge, no `svm`); a QoS-capped storage edge beside an uncapped one; a measured error rate
beside a measured-clean `0` beside an unmeasured edge; a legitimately tiny `3.86e-7` rate that must
not round to "no traffic"; and **both** `labels.role` ingress shapes side by side.

### Two provenances in one fixture

Most fields are the real kube-state-graph wire contract. But `status`, `alerts`, `time_records`, and
the `switch` / `network` kinds with their `switch-to-switch` / `node-to-switch` edges appear
**nowhere** in the backend — not in its specs, `pkg/`, `internal/`, or docs. They are the panel's own
extension surface, and no backend release will supply them. The fixture header and the wire types
both say so; do not read them as a wire sample, and do not "correct" the backend spec to match.

### The two ingress roles are not symmetric

The backend marks two shapes with one `labels.role` key, and rendering them the same way erases a
real dependency:

| | `ingress-gateway` | `ingress-lb` |
| --- | --- | --- |
| What it is | the routed chain's entry hop (Istio) | the non-Istio LB fallback destination |
| Behind it | gateway pods, then a synthesized hop to the backend service | nothing |
| The caller also has | a **direct** edge to the backend service | nothing else |
| Ingress toggle | hides it | **must never hide it** |
| Stroke | dashed (it is a detour) | solid (it is the dependency) |

`collectIngressNodeIds` matches `ingress-gateway` **exactly** — not a prefix — and
`INGRESS_LB_LABEL_VALUE` records why. Hiding an `ingress-lb` node would leave its caller drawn with
no dependencies at all.

## Architecture

### Layout philosophy

**Feature-first**, not type-first. Each feature folder is self-contained with its own `components/` + `hooks/` + (optional) `styles/` + pure-function helpers + `index.ts` barrel. Cross-feature imports must go through the barrel; never reach into another feature's internal files.

```
src/
├── module.ts                          # PanelPlugin entry (only file allowed to default-export)
├── panels/KsgPanel/                   # orchestrator + options editor
├── features/
│   ├── graph-canvas/                  # cytoscape wrapper (hooks + diff-patch + styles)
│   ├── graph-data/                    # PanelData → ElementDefinition[] normalize boundary
│   ├── legend/
│   ├── theme/                         # Grafana theme → stylesheet adapter
│   ├── hover-tooltip/                 # tooltip floating beside the hovered element via mouseover events
│   └── element-filter/                # node-kind / edge-type visibility filter
└── shared/                            # constants, types, cross-feature primitives
    ├── types/wire.ts                  # the backend's GET /v1/graph shape — normalize's INPUT side
    └── fixtures/showcaseGraph.ts      # THE demo graph, compiled into the provisioned dashboard
```

### Cytoscape integration rules (load-bearing)

These are not optional conventions — violating them breaks StrictMode, hot reload, or layout stability. Full rationale in `openspec/changes/scaffold-ksg-panel/design.md` § "Cytoscape.js × React × TypeScript 整合慣例".

1. **Single source of truth = the cytoscape instance.** React only mounts/unmounts and pushes imperative updates. Never put the cy instance in React state.
2. **Split init and update effects.** `useCytoscape` has one empty-deps effect that builds the instance with `layout: { name: 'preset' }` (so cytoscape does NOT auto-run a layout); separate effects diff-and-patch elements and swap stylesheet. **`useGraphLayout` is the single source of layout execution** — passing a non-preset layout to the constructor would cause a double-layout pass on mount.
3. **Diff-and-patch element sync.** Never `cy.elements().remove()` then `cy.add()`. See `features/graph-canvas/sync/diffElements.ts` — it returns `{ toAdd, toRemove, toUpdate }` from `cy.elements().jsons()` vs incoming `ElementDefinition[]`.
4. **Extension registration at module top level only.** `features/graph-canvas/registerExtensions.ts` (imported by `module.ts`) calls `cytoscape.use(fcose)` / `cytoscape.use(dagre)` once. Never call inside a hook/component — it warns on re-register under React 18 StrictMode and hot reload.
5. **Cleanup must `cy.removeAllListeners()` + `cy.destroy()` + set `cyRef.current = null`.** StrictMode double-mount safety.
6. **Custom node/edge `data` fields go in `src/shared/types/cytoscape.d.ts`** via declaration merging on `NodeDataDefinition` / `EdgeDataDefinition`. Use cytoscape's native types (`cytoscape.Core`, `cytoscape.NodeSingular`, `cytoscape.EventObject`); never `any`.
7. **Stylesheet is a pure factory** `getStylesheet(theme, shapeMap, colorMap)` — no inline `cy.style().selector(...)` chains.

### Single-source maps

`src/shared/constants/{shapeByKind,colorByEdgeType}.ts` are **the** maps used by `getStylesheet`, the legend feature, and the filter's `ALL_KINDS` / `ALL_EDGE_TYPES`. To add a new kind/edge type, edit only the map — everything else derives from it. Unknown kinds default to `FALLBACK_SHAPE` and are **visible by default** in `computeVisibility` so upstream additions don't silently disappear.

### Data flow

```
Infinity datasource response  (inline fixture locally; a real backend in a deployment —
                               indistinguishable to the panel)
  → PanelData.series[].fields[0].values[0]  (JSON string or object)
  → useGraphData → extractJsonFromFrames → normalizeGraph
  → cytoscape.ElementDefinition[]  ── KsgPanel
                                       ↓
                                    GraphCanvas
                                       ↓
                            useCytoscape (init+diff+style)
                            useGraphLayout (fcose/dagre)
                            useGraphResize (ResizeObserver + debounce)
                            useElementFilter (visibility, NO layout rerun)
                            HoverTooltip (cy.on mouseover, useSyncExternalStore)
```

`normalizeGraph` is the anti-corruption layer. It always returns `{ elements, errors }` — partial parsing is supported; the rendering layer decides what to do with `errors`.

### Component conventions

- **Function components only**, named export. `import-x/no-default-export` is an error in `src/**`. The only exception is `module.ts` (Grafana requires `export const plugin = new PanelPlugin(...)` — note this is a _named_ export `plugin`, not default; tasks.md predates that final decision).
- **Co-location**: each component lives in its own folder with `<Name>.tsx` + `<Name>.types.ts` + `<Name>.test.tsx` + `index.ts` (barrel only re-exports the public name).
- **Styles**: `@grafana/ui`'s `useStyles2(getStyles)` with `@emotion/css`. No styled-components, no CSS Modules.
- **State**: local `useState` + custom hooks. No Redux/Zustand. `useEffect` only for real external side-effects; derived state goes through `useMemo`.

### Testing

- Pure functions (`diffElements`, `normalizeGraph`, `computeVisibility`, `getStylesheet`): straight Jest.
- Hooks involving cytoscape: use **headless mode** (`cytoscape({ headless: true, styleEnabled: true })`) and `renderHook` from `@testing-library/react`. For layout-touching tests, stub `cy.layout` with `jest.spyOn(cy, 'layout').mockReturnValue({ run: jest.fn() })` — fcose/dagre extensions are not registered in the jest env.
- Component tests: `@testing-library/react`. `jest-setup.js` already polyfills `ResizeObserver` and `HTMLCanvasElement.getContext` for cytoscape under jsdom.

## OpenSpec workflow

All non-trivial changes start with an OpenSpec change under `openspec/changes/<name>/` containing `proposal.md`, `design.md`, `specs/<capability>/spec.md`, and `tasks.md`. The active scaffold change is `scaffold-ksg-panel`. Slash commands available in `.cursor/commands/`: `opsx:new`, `opsx:propose`, `opsx:ff`, `opsx:continue`, `opsx:apply`, `opsx:verify`, `opsx:archive`, `opsx:explore`. Use `openspec status --change <name> --json` and `openspec instructions apply --change <name> --json` to inspect state from scripts.

Specs become the source of truth — when behavior diverges from a Requirement scenario, update both the code and the spec (or revise the spec via a new change).

## TypeScript strictness

`tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `isolatedModules`. Index access is `T | undefined` — destructure with care or use `??` fallbacks.

`.config/**` is scaffold-managed by `@grafana/create-plugin` and ignored by both eslint and (effectively) by us — do not edit those files; upgrade by re-running the scaffold update command.
