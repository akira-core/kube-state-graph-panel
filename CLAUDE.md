# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Grafana 12.x panel plugin (`marz32one-ksg-panel`) that visualizes Kubernetes resource topology with cytoscape.js. Data is sourced from the upstream [kube-state-graph](https://github.com/Marz32onE/kube-state-graph) Go backend via Grafana Infinity datasource — this repo is **panel-only** (no embedded backend code).

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
npm run server       # docker compose up --build
```

Run a single Jest test file:

```bash
npx jest src/features/element-filter/computeVisibility.test.ts
npx jest -t 'edge auto-hides'   # by test name
```

Git hooks (Husky): `pre-commit` runs `lint-staged` (eslint --fix + prettier --write on staged files); `pre-push` runs `lint && typecheck && test:ci`.

CI: single GitHub Actions job (`.github/workflows/ci.yml`) runs typecheck → lint → test:ci → build → optional sign → plugin-validator → artifact upload. **No E2E in CI** (developer-triggered locally).

## Local demo

Plugin source mounts into Grafana via `dist/` bind mount; hot-reload works without container restart.

```bash
npm install
npm run dev                                      # keep running (webpack watch)
KUBECONFIG_PATH=$HOME/.kube/config docker compose up -d
# Grafana → http://localhost:3000 (anonymous auth enabled in dev)
```

The provisioned `KSG Demo` dashboard auto-loads with one panel. Backend is `marz32one/kube-state-graph` image from Docker Hub; if no kubeconfig is reachable the panel renders the EmptyState (which is also a valid demo of the mount path).

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
│   ├── hover-tooltip/                 # right-corner tooltip via mouseover events
│   └── element-filter/                # node-kind / edge-type visibility filter
└── shared/                            # constants, types, cross-feature primitives
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
Infinity datasource HTTP response
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
