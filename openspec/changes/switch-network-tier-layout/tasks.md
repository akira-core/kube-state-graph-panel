## 1. switch-topology feature: tier derivation (TDD)

- [x] 1.1 Create `src/features/switch-topology/` folder and a `types.ts` defining `SwitchTierResult` (`{ tierById: Map<string, number>; maxTier: number }`)
- [x] 1.2 Add optional backend tier override field to `src/shared/types/cytoscape.d.ts` via declaration merging on `NodeDataDefinition` (e.g. `tier?: number`) for the hybrid source
- [x] 1.3 Write `computeSwitchTiers.test.ts` (RED): access switch → tier 0; `switch-to-switch` BFS distance → tier n; isolated switch → tier 0; cyclic `switch-to-switch` terminates with stable tiers; backend tier value overrides derived; no `switch` nodes → empty mapping
- [x] 1.4 Implement `computeSwitchTiers(elements)` to pass 1.3 — pure function, native cytoscape types, `noUncheckedIndexedAccess`-safe

## 2. fcose constraint builder (TDD)

- [x] 2.1 Write `buildSwitchConstraints.test.ts` (RED): one `alignmentConstraint.horizontal` group per tier with ≥2 members; `relativePlacementConstraint` orders tier `k` above tier `k+1`; only `switch` node ids referenced; a single tier of ≥2 switches aligns into one row with no relative placement; fewer than two switches (incl. empty) → `null`
- [x] 2.2 Implement `buildSwitchConstraints(tiers)` returning `{ alignmentConstraint, relativePlacementConstraint } | null`
- [x] 2.3 Add barrel `src/features/switch-topology/index.ts` (named exports only, no default export)

## 3. Layout integration (useGraphLayout)

- [x] 3.1 Define a typed fcose options shape (including `alignmentConstraint` / `relativePlacementConstraint`) so the merge type-checks without `any` — typed `SwitchConstraints` spread into the fcose options via the existing `as unknown as cytoscape.LayoutOptions` idiom (no `any`)
- [x] 3.2 Extend `useGraphLayout` to accept optional `switchConstraints`; merge into the `fcose` options only when `name === 'fcose'`; apply at layout-run time via a ref (NOT in the effect deps) so a change in constraints does not by itself re-run the layout — preserving the panel's no-relayout-on-data-refresh behaviour (see design D7); leave the `dagre` branch unchanged
- [x] 3.3 Extend `useGraphLayout.test.ts`: constraints appear in fcose options when provided; absent in `dagre` mode; `undefined`/`null` constraints → behaves exactly as today; a constraints-only change does not trigger an extra layout run

## 4. GraphCanvas wiring

- [x] 4.1 In `GraphCanvas`, compute `switchConstraints = useMemo(() => buildSwitchConstraints(computeSwitchTiers(elements)), [elements])` and thread it into `useGraphLayout`
- [x] 4.2 Confirm trigger semantics: layout re-runs on structural triggers (`name` / `runToken`) and picks up the latest constraints then; a pure data/elements refresh does not re-run (positions preserved) — asserted by the new `useGraphLayout` "does not rerun when only switchConstraints change" test (design D7)

## 5. Switch-edge orthogonal routing (getStylesheet)

- [x] 5.1 Add `curve-style: 'taxi'` (with `taxi-direction: 'vertical'`) selectors for `edge[edgeType='node-to-switch']` and `edge[edgeType='switch-to-switch']`; preserve their existing colour and solid/dashed line-style; all other edges keep `bezier`
- [x] 5.2 Extend `getStylesheet.test.ts`: switch-edge selectors resolve to `taxi`; a non-switch edge stays `bezier`; switch-edge colour/line-style unchanged

## 6. Verification

- [x] 6.1 `npm run typecheck` clean repo-wide; cold-cache full-repo ESLint clean (EXIT 0). Also fixed a PRE-EXISTING, unrelated lint error surfaced cold — `src/features/graph-data/hooks/useGraphData.ts:35` `no-unsafe-assignment` on `frame.meta?.custom?.data` (@grafana/data types `meta.custom` as `Record<string, any>`) — pinned to `unknown` at the boundary (incidental CI fix at the user's request; outside this change's spec scope).
- [x] 6.2 `npm run test:ci` green — 224/224 tests across 33 suites (prior 179 + new `computeSwitchTiers` / `buildSwitchConstraints` / extended layout & stylesheet tests)
- [x] 6.3 `npm run build` succeeds (only the project's pre-existing bundle-size webpack performance warnings)
- [x] 6.4 Manual demo verification (Playwright screenshots against the running `docker compose` demo, fresh `dist/` from `npm run build`). (a) Zero-impact-when-absent: `/d/ksg-demo/ksg-demo` renders the existing two-cluster graph correctly with no panel error banner and no JS exceptions (only an unrelated Grafana live-socket `ERR_CONNECTION_REFUSED`). (b) Tier + taxi: built a temporary scratch dashboard feeding the panel an Infinity inline-JSON switch fixture (access-1/access-2 → dist → core) — the panel showed the two access switches aligned on one row, `dist` below, `core` at the bottom (3 stacked tiers), switch edges routed orthogonally (`taxi`) with clean right-angle channels merging into `dist`, while the k8s node compounds kept normal fcose placement. Scratch dashboard deleted afterward; Grafana left as found.
