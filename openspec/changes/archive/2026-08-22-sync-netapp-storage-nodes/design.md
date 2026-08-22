# Design — sync-netapp-storage-nodes

## Context

See `proposal.md` — Why. The panel mechanics this change lands in:

- **`normalizeGraph`** (`src/features/graph-data/normalize.ts`) is the anti-corruption boundary: `resolveNodeIdentity` maps upstream `data.type` to either a kind-less decorative group (`cluster` / `namespace` / `application`), a kind-less-but-enriched `controller`, or a leaf carrying `kind`. Every optional upstream field is parsed through a guard and written with `exactOptionalPropertyTypes` semantics (omit, never `undefined`).
- **Single-source maps** (`src/shared/constants/`): `types.ts` (`NodeKind` / `EdgeType` closed unions plus the runtime-honest `GraphNodeKind` / `GraphEdgeType` string aliases), `categoryByKind.ts`, `iconSvgByKind.ts`, `colorByEdgeType.ts` (`EDGE_STYLE_BY_TYPE` / `EDGE_ENDPOINTS_BY_TYPE` / `EDGE_IS_TRAFFIC_BY_TYPE`, all exhaustive `Record<EdgeType, …>`), `drawnEdgeTypesForMode.ts`. Adding or removing a kind/edge type is a compile-checked edit of these maps; everything else derives.
- **`getStylesheet(theme, …)`** is a pure factory. It already uses `data(...)` mappings and function-valued style props, so a data-driven visual needs no new mechanism — only a flattened numeric field to key on.
- **`buildNodeAttributes`** is the single source for promoted tooltip rows, shared by the floating hover tooltip and the pinned selection card.
- **`applyPodParentMode`** re-shapes the backend hierarchy for `node` (infra) mode by dropping the `namespace` / `application` / `controller` group tiers and re-homing their non-pod members under the nearest `isCluster` ancestor.

The delta specs under `specs/` are the behaviour contract; this document covers how to implement them.

## Goals / Non-Goals

**Goals:**

- Land the new storage model as a compile-checked edit of the single-source maps, so no consumer can silently miss a kind or edge type.
- Make the usage visual **data-driven, not kind-driven**, so PVC and aggregate share one rule and a future usage-bearing kind joins for free.
- Keep the three-valued discipline the RED work established (absent ≠ 0 ≠ present-but-zero) for `health` and `usage`.
- Remove the StorageClass path completely — no dead branches, no compat shims.

**Non-Goals:**

- No dual-model support for the pre-change backend (decided: hard switch).
- No new legend section for ONTAP; `storage-cluster` is an accent box only.
- No mapping of NetApp `health` onto the K8s `status` scale. Status still owns the node **border**. Usage liquid reuses `STATUS_COLOR` as Grafana-style capacity thresholds (interior fill channel, translucent).
- No E2E coverage in CI (repo policy: E2E is developer-triggered).

## Decisions

### D1 — `netapp-node` is a real node that is also a compound parent

The backend hands us `netapp-aggr.parent = "netapp/<oc>/<node>"` — a **real node id**. Cytoscape allows any node to be a `parent`, so this needs no new mechanism; what it needs is for the panel's _categories_ to stop assuming "compound parent ⇒ kind-less decorative group OR k8s `node` container".

Three places encode that assumption and each gets `netapp-node` added, not a new branch:

1. `resolveNodeIdentity` — falls through to the leaf branch (`{ kind }`), which is already correct: it is a kind-ful selectable node. **No change needed** beyond not treating it as a group.
2. `getStylesheet`'s `node:parent { background-image: none }` rule — already keyed on `:parent`, so an expanded `netapp-node` loses its icon exactly like `node` / `controller`. **No change needed.**
3. `deriveLegendKinds` — already keyed on "is someone's parent and not collapsed", so it drops an expanded `netapp-node` from the Node Kinds legend automatically. **No change needed.**

_This is the payoff of the existing data-driven rules_: the one genuinely new thing is the **projection-side guarantee** that an emitted `netapp-aggr` always ships with its parent — which the backend enforces (its `Project` pulls the owning controller in). The panel therefore does not need dangling-parent defences beyond what it already has.

_Alternative considered:_ re-express `netapp-node > netapp-aggr` as a `netapp-node-owns-aggr` edge and flatten the nesting — rejected: the backend already made the containment decision, and re-deriving hierarchy client-side is exactly the synthesis this repo retired in D6.

### D2 — `storage-cluster` is a fourth decorative group, not a special case

`resolveNodeIdentity` gains one branch returning `{ isStorageCluster, storageCluster, storageClusterColor }`, mirroring `isCluster` byte-for-byte (non-selectable, kind-less, accent from a fixed per-kind colour). The stylesheet, folder-icon rule, and label-prefix mapper each gain `node[?isStorageCluster]` alongside the existing three selectors.

It is **not** merged into `isCluster` despite the identical shape: `isCluster` drives `ClusterLegend` and the K8s cluster swatch palette, and an ONTAP cluster is not a K8s cluster. Sharing the flag would put ONTAP names in the Clusters legend — the same category error the backend avoided by withholding the `cluster` label.

### D3 — `usageRatio` is flattened at normalize; the visual keys on it, never on kind

Cytoscape selectors cannot read nested `data` (`data.usage.usedBytes`) and cannot compute a ratio inside a selector. So normalize derives `usageRatio = usedBytes / capacityBytes` (clamped `[0,1]`, omitted when either operand is missing or capacity is 0) as a **top-level numeric field**, and the stylesheet uses a single `node[usageRatio]` rule.

Keying the rule on the field rather than on `kind` is the load-bearing part: PVC and aggregate get identical treatment from one rule, and the rule needs no edit when the backend adds `usage` to another kind. It also makes "no data" structurally distinct from "0%" — an absent `usageRatio` matches no selector at all.

**Rendering mechanism (revised):** do **not** paint usage on the node box. Cytoscape `background-fill: 'linear-gradient'` fills the 40px round-rectangle, so the liquid sits outside the cylinder silhouette and, at high ratios, matches the icon stroke luminance and erases `netapp-aggr`'s two internal layer lines.

Instead, bake a **bottom-up liquid into the kind SVG** (`background-image`) and leave the node body as the solid theme `background.secondary`:

1. A fill shape inside that kind's **outer cylinder** (an inset rect in the vertical walls of the `pvc` / `netapp-aggr` silhouette — cytoscape's SVG rasteriser drops `clip-path="url(#…)"` and nested `<svg>` windows; any future non-cylinder kind with `usageRatio` falls back to a viewBox rect). Height is `usageRatio` of the cylinder, growing from the bottom.
2. Fill colour is `STATUS_COLOR` on Grafana thresholds, baked as **`rgba(..., 0.4)`** (cytoscape ignores SVG `fill-opacity`):
   - `ratio < 0.8` → `normal` `#73BF69`
   - `ratio >= 0.8` → `warning` `#F2CC0C`
   - `ratio >= 0.9` → `critical` `#E02F44`
3. Original strokes (including aggr's two internal ellipses) paint **after** the liquid, full opacity, so the glyph stays the same size and the layer lines stay readable through the wash.
4. Label stays `data(label)`. An absent `usageRatio` still matches no rule — no liquid, not a 0% green sliver.

Status border rules are unchanged: a node can carry a green liquid and a red status border at once (capacity vs k8s status, two channels).

_Alternatives considered:_ (1) node-box linear-gradient, shipped in 4.2 — rejected after visual check, it occludes the glyph. (2) cytoscape pie wedges — rejected: reads as a category share, not a tank. (3) shrinking the icon or appending `%` to the label — rejected: identity and naming stay as they are.

### D4 — Edge `metrics` becomes a discriminated-by-presence union

`EdgeMetrics` in `cytoscape.d.ts` splits into `EdgeRedMetrics { rate: number; errorRate?: number; p90ServerMs?: number }` and `EdgeIoMetrics { readOps?: number; writeOps?: number; readLatencyUs?: number; writeLatencyUs?: number; readBytesPerSec?: number; writeBytesPerSec?: number; maxIops?: number; maxBytesPerSec?: number }`, with `metrics?: EdgeRedMetrics | EdgeIoMetrics`.

`parseEdgeMetrics` gains one decision at the top: **if `rate` is present, parse as RED (existing logic verbatim); otherwise attempt I/O.** That ordering preserves every existing RED scenario byte-for-byte — a present-but-invalid `rate` still discards the whole object — while making a `rate`-less object reach the I/O path instead of being dropped. If both families' keys appear (impossible per contract), RED wins and I/O keys are discarded, so a consumer never receives a mixed object it cannot discriminate.

Consumers discriminate with `'rate' in metrics`. The tooltip renders whichever family is present.

The I/O family's eight fields split across two formatting ladders. `readOps` / `writeOps` / `readLatencyUs` / `writeLatencyUs` / `maxIops` keep the RED ladder (3 significant digits + a fixed unit suffix, `formatOps` / `formatLatencyUs` in `formatEdgeMetrics.ts`). The three bytes-per-second fields are where that ladder degenerates into unreadable exponents at realistic values, so `readBytesPerSec` / `writeBytesPerSec` / `maxBytesPerSec` format through the **existing decimal byte units** in `src/shared/format/measurements.ts` (the ladder behind the node `usage` row) with a `/s` suffix — `5.24 MB/s`. One shared byte ladder means a `700 GB` aggregate, a `5.24 MB/s` edge, and a `262 MB/s` ceiling all read on the same scale; the magnitude-preservation rule (a non-zero value never renders as `0`) is unchanged.

**Ceilings pair with measurements, they do not gate them.** `maxIops` / `maxBytesPerSec` are the QoS policy group's declared limits and reach the wire from a *different* backend join hop than the measurements, so the panel treats them as two more independently-optional fields with the same per-field guard — no cross-field validation, no derived "percent of ceiling", no colouring when a measurement exceeds its ceiling. Two properties make that safe and are worth stating because each is easy to get backwards: the backend guarantees a ceiling never arrives without at least one measurement (so a lone ceiling is not a shape the panel must handle), while the converse is false (a volume in no policy group is measured and uncapped, which is ordinary). Rendering order puts the ceilings last for the same reason: they answer "what is this volume allowed to do", which is the second question, not the first.

_Alternative considered:_ render usage-against-ceiling as a percentage or a bar, mirroring the node `usageRatio` visual — rejected. Capacity utilisation is a level with a real maximum; throughput against a QoS ceiling is a rate that is *supposed* to sit at its limit under load, so the same visual language would read a healthy throttled volume as a problem.

### D5 — Removal is a compile-driven sweep, not a search-and-delete

Deleting `'storageclass'` from the `NodeKind` union and `'pvc-to-storageclass'` from `EdgeType` makes `CATEGORY_BY_KIND`, `ICON_SVG_BY_KIND`, `EDGE_STYLE_BY_TYPE`, `EDGE_ENDPOINTS_BY_TYPE`, `EDGE_IS_TRAFFIC_BY_TYPE`, and `drawnEdgeTypesForMode` fail to typecheck until every entry is gone (they are exhaustive `Record<…>` types). Doing the union edit **first** turns `tsc` into the checklist for the rest — which is why task ordering puts the type edits before the consumers.

The `provisioner` / `parameters` node fields and their `buildNodeAttributes` rows go with them; nothing inherits their meaning (the physical backend is now nodes and edges, not attributes on a policy object).

### D6 — `applyPodParentMode` leaves the NetApp subtree alone, by construction

`node` mode drops exactly the `isNamespace` / `isApplication` / `isController` tiers. `storage-cluster` is none of those, and `netapp-node` / `netapp-aggr` are real nodes, so the whole storage chain passes through untouched with **no code change** — the existing `droppedGroupIds` set is already precise.

The one consequence to state (and test): in `node` mode a PVC re-homes under its K8s cluster while its aggregate stays under `storage-cluster`, so the `pvc-to-netapp-aggr` edge crosses two top-level boxes. That is correct — the storage is genuinely outside the K8s cluster — and the spec pins it so a future "tidy up crossing edges" impulse does not re-parent one side.

### D7 — Icons: two new glyphs, distinct within `Storage`

`netapp-aggr` and `netapp-node` both land in the `Storage` category next to `pvc`, so three `Storage` glyphs must read apart at legend size: `pvc` keeps its existing glyph, `netapp-aggr` takes a **stacked-disks / pool** glyph, `netapp-node` a **controller chassis** glyph. Both follow the existing `icon()` helper (single-path, `currentColor`, theme-tinted at build time by `resolveIconUri`).

### D8 — Test strategy

- **Pure functions** (`normalize`, `applyPodParentMode`, `drawnEdgeTypesForMode`, `buildNodeAttributes`, `getStylesheet`): straight Jest, extending the existing files. New: `usageRatio` derivation table (including capacity 0 and partial usage), metrics-union branch selection, `storage-cluster` identity.
- **Renamed, not deleted:** `project_storageclass`-style tests become their NetApp equivalents so the coverage moves rather than evaporating — `pkg`-side naming aside, the panel files are `applyPodParentMode.test.ts`, `computeVisibility.test.ts`, `deriveLegendKinds.test.ts`, `buildNodeAttributes.test.ts`, `getStylesheet.test.ts`.
- **Fixtures**: the backend golden `with-netapp-storage-cytoscape.json` is the normalize fixture of record (the spec names it), mirroring how `with-storageclass-cytoscape.json` was used before.
- **Demo**: `seed.sh` gains the Harvest + kubelet series across all three backend join hops (`volume_labels`, the `qos_*` workloads, the `qos_policy_fixed_max_throughput_*` policies); verification is visual against `KSG Demo` (no CI E2E per repo policy). The fixture deliberately carries one volume with a QoS policy group and one without, so the ceiling-absent path is exercised on screen and not only in unit tests.

## Risks / Trade-offs

- **Hard cut against an older backend image** → the demo's `KSG_BACKEND_TAG` and any deployed Grafana must move together; called out in the proposal and pinned by a dev-environment spec scenario.
- **Harvest gauge vs. counter confusion in the seeder** (every other seeded series must increment; these must not) → stated explicitly in the dev-environment spec with its own scenario, since a "helpfully" incrementing gauge would show absurd ops/latency in the demo.
- **Seeding the wrong Harvest metric family is a silent, total loss** — the backend takes storage *topology* from `volume_labels` alone and *measurements* from the `qos_*` workloads alone. A fixture that pushes measurement-shaped series under `volume_*` names (the shape this change originally assumed) yields no storage half at all rather than a partial one, because the topology hop found nothing. Mitigated by naming all three hops and their join keys explicitly in the dev-environment spec, with a scenario pinning that measurements alone cannot draw the chain.
- **Cylinder liquid vs. stroke contrast** — an opaque fill (and the old node-box gradient) hides `netapp-aggr` layer lines. Mitigated by baking alpha 0.4 into `rgba(...)` (cytoscape ignores `fill-opacity`) with strokes painted on top; verify at 70 / 85 / 95% on both Grafana themes.
- **Same hues as status** — usage liquid uses `STATUS_COLOR` values. Mitigated by channel: status is the **border**, usage is the **translucent interior**. A selected node still uses the blue outline/underlay, which is not in this palette.
- **`metrics` union widens a public-ish type** — anything doing `metrics.rate` unguarded now breaks at compile time. That is the desired outcome (it was already unsound for non-RED edges); the tooltip is the only in-repo consumer.
- **Three `Storage` glyphs** may crowd the legend category → mitigated by D7's deliberately distinct silhouettes; if it still reads poorly, the fallback is a sub-grouping tweak in `NodeLegend`, not a colour change.

## Migration Plan

1. Land types → maps → normalize → stylesheet/consumers → tests in one PR (the exhaustive-`Record` types make partial landings uncompilable anyway).
2. Bump `KSG_BACKEND_TAG` in `docker-compose.yaml` to an image carrying the backend change, and extend `seed.sh` in the same PR so `npm run server` demonstrates the new half.
3. Update `CONTEXT.md` (node-kind / edge-type vocabulary) and `CLAUDE.md`'s demo-fixture description.
4. Rollback = revert the PR and pin the old backend tag; the panel holds no persisted state.

## Open Questions

None. The two decisions that would have changed scope — old-backend compatibility and how usage is surfaced — were settled before writing these artifacts (hard switch; text row **and** on-node visual, extended to PVC as well as aggregate).
