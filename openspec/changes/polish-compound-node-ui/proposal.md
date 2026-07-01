## Why

The decorative compound groups (`cluster` / `namespace` / `application`) currently get a per-label hash colour (`colorForCluster`/`colorForNamespace`/`colorForApplication`), so two clusters can render in the same cool blue/teal/violet family already used by real edge colours (`pod-to-node` blue `#3b82f6`, `pvc-to-storageclass` violet `#8b5cf6`, fabric cyan `#06b6d4`) — edges crossing a backplate become hard to read against it. Cluster backplates are also fully selectable today (a 2026-06-27 change deliberately made them so, purely to surface the expand-collapse `+/-` cue), which lets a user click a cluster and get a selection ring with no other effect — confusing given it opens no detail panel. Tidying both, plus removing now-stale comments left over from an already-completed right-click-panel removal, is a small, self-contained UI polish pass.

## What Changes

- **BREAKING**: `cluster` compound nodes become non-selectable (`selectable: false`, mirroring the existing `namespace` pattern before the 2026-06-27 change). Tapping a cluster backplate deselects (like a background tap) instead of showing a selection ring.
- Since the expand-collapse `+/-` cue is selection-driven, a cluster's cue can no longer surface. Add a `dbltap` handler scoped to `isCluster` nodes that calls the expand-collapse API directly (`collapse`/`expand`), so double-click becomes the collapse/expand trigger for clusters. `namespace` and `application` groups are unaffected — they stay selectable (namespace still no-ops on select; application still opens its detail panel) and keep the click-driven cue.
- Compound group colour moves from **per-label** (`colorForCluster`/`colorForNamespace`/`colorForApplication` hashing the instance name into a multi-colour palette) to **per-kind** (one fixed colour for all `cluster` nodes, a different fixed colour for all `namespace` nodes, a third for all `application` nodes). The three fixed colours are chosen clear of every existing edge colour and status colour (green/yellow/red) so edges and status borders stay legible crossing any backplate.
- Compound group labels gain a kind prefix: a cluster named `prod` renders as `cluster:prod`, a namespace `checkout` as `namespace:checkout`, an application `mongo` as `application:mongo`. Needed because colour no longer disambiguates individual clusters/namespaces/applications from each other — the label now carries that signal instead.
- Right-click detail panel: **no code change** — already fully removed (`GraphCanvas` binds only `tap`, no `cxttap`; `GraphCanvas.test.tsx` already asserts `cxttap` does nothing and the native context menu is left alone). This change only cleans up stale comments in `normalize.ts` and `node-detail/*` that still describe a "right-click detail panel" that no longer exists.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `panel-rendering`: interaction/selection requirement (cluster no longer selectable, dbltap replaces the cue for clusters only), compound-group colour requirement (per-kind fixed colour instead of per-label hash), compound-group label requirement (kind-prefixed label).

## Impact

- `src/features/graph-data/normalize.ts` — `resolveNodeIdentity`, `parseNodes` (selectable flag, colour source, label prefix); stale right-click comment cleanup.
- `src/shared/constants/clusterPalette.ts` / `namespacePalette.ts` / `applicationPalette.ts` — replace per-label hash palettes with single fixed per-kind colours (or fold into one small constants file).
- `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx` — new `dbltap` handler for cluster collapse/expand; existing `selectable()` tap guard already handles the non-selectable case correctly (no change needed there).
- `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.test.tsx` — currently has stale fixtures asserting `selectable: false` for both cluster AND namespace (contradicts the current `namespace`-stays-selectable behaviour); needs correcting alongside the new cluster-only assertions.
- `src/features/node-detail/*` — stale right-click comment cleanup only.
- Legend (`ClusterLegend`/`NamespaceLegend`/`ApplicationLegend`) needs no code change — swatch colour is read straight from `data.clusterColor`/etc., so it automatically reflects the new fixed per-kind colour.
