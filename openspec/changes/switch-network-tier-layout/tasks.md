<!--
Approach pivot (2026-06-05): the first cut (structural BFS tier + soft fcose
alignmentConstraint/relativePlacementConstraint, committed in 095f412) did not
visibly stack into layers. These tasks REPLACE that implementation with a
label-supplied `level` read + hard `fixedNodeConstraint` pinning. Tasks below
are the pivot's remaining work and are unchecked accordingly.
-->

## 1. switch-topology feature: level read (TDD)

- [x] 1.1 Update `src/features/switch-topology/types.ts`: replace `SwitchTierResult` / `SwitchAlignmentConstraint` / `SwitchRelativePlacement` with `SwitchFixedNode` (`{ nodeId: string; position: { x: number; y: number } }`) and `SwitchConstraints` (`{ fixedNodeConstraint?: SwitchFixedNode[] }`)
- [x] 1.2 Remove the now-unused `tier?: number` from `src/shared/types/cytoscape.d.ts` (`labels.level` is read via the existing `labels?: Record<string, string>`)
- [x] 1.3 Write `readSwitchLevels.test.ts` (RED): `kind:'switch'` with `labels.level="2"` → 2; level 0 kept; missing / blank / non-numeric / negative `labels.level` → excluded; non-switch node with `labels.level` → ignored; no switches → empty map; deterministic for identical input
- [x] 1.4 Implement `readSwitchLevels(elements): Map<string, number>` to pass 1.3 — pure function, native cytoscape types, `noUncheckedIndexedAccess`-safe; deleted the old `computeSwitchTiers.ts` + its test

## 2. fixed-position constraint builder (TDD)

- [x] 2.1 Write `buildSwitchConstraints.test.ts` (RED): one `fixedNodeConstraint` entry per levelled switch; same level → shared `y`, distinct `x` centred on 0 (`a`→-90, `b`→90); level `k` row above level `k+1` row (smaller `y`); ids sorted within a level (deterministic positions); empty map → `null`; single levelled switch → one entry at `(0,0)` (not null)
- [x] 2.2 Implement `buildSwitchConstraints(levelById): SwitchConstraints | null` — group by level, sort ids, assign `y = level * TIER_GAP`, `x = (i - (n-1)/2) * COL_GAP`; module constants `TIER_GAP` / `COL_GAP` (= 180)
- [x] 2.3 Update barrel `src/features/switch-topology/index.ts` (named exports only): export `readSwitchLevels`, `buildSwitchConstraints`, and the new types; dropped the removed exports

## 3. Layout integration (useGraphLayout)

- [x] 3.1 Confirmed the existing `{ ...baseOptions, ...constraints }` spread carries `fixedNodeConstraint` into the fcose options without a logic change; kept the `name === 'fcose'` gate, the ref-at-run-time application (design D8), and the unchanged `dagre` branch (no source edit needed)
- [x] 3.2 Updated `useGraphLayout.test.ts`: `fixedNodeConstraint` appears in fcose options when provided; absent in `dagre` mode; `undefined`/`null` constraints → behaves exactly as today; a constraints-only change does not trigger an extra layout run

## 4. GraphCanvas wiring

- [x] 4.1 In `GraphCanvas`, changed the memo to `switchConstraints = useMemo(() => buildSwitchConstraints(readSwitchLevels(elements)), [elements])` and updated the import; threaded into `useGraphLayout` unchanged
- [x] 4.2 Trigger semantics unchanged: layout re-runs on structural triggers (`name` / `runToken`) and picks up the latest constraints then; a pure data/elements refresh does not re-run (positions preserved) — asserted by the `useGraphLayout` "does not rerun when only switchConstraints change" test (design D8)

## 5. Switch-edge orthogonal routing (getStylesheet)

- [x] 5.1 No change — `taxi` routing for `edge[edgeType='node-to-switch']` / `edge[edgeType='switch-to-switch']` from the first cut is retained as-is; existing `getStylesheet.test.ts` switch-edge assertions stay green

## 6. Verification

- [x] 6.1 `npm run typecheck` clean repo-wide; `npm run lint` clean (EXIT 0)
- [x] 6.2 `npm run test:ci` green — 223/223 across 33 suites (rewritten `readSwitchLevels` 7 + `buildSwitchConstraints` 6 suites + adjusted layout suite; getStylesheet + the rest unchanged; net −1 vs prior 224 as the BFS-derivation cases were dropped)
- [x] 6.3 `npm run build` succeeds (only the project's pre-existing bundle-size webpack performance warnings)
- [ ] 6.4 Manual demo verification (PENDING — not yet run): seed a fixture with `kind:'switch'` nodes carrying `labels.level` (e.g. two switches `level:0`, one `level:1`, one `level:2`) and confirm on the running demo that the level-0 switches share the top row, level-1 sits below, level-2 at the bottom (clean stacked layers, no overlap), switch edges route orthogonally (`taxi`), and the k8s node compounds keep normal fcose placement. Confirm a switch-free graph is byte-for-byte unchanged.
