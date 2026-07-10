# Design: selection-pinned-tooltip

## Context

After `consolidate-left-click-detail`, promoted node attributes live in an always-on **Properties** section inside the bottom `NodeDetailPanel` — duplicating the hover tooltip (same `buildNodeAttributes` source) and forcing a panel open for attribute-only nodes. This change moves attributes into a **pinned-on-selection** tooltip (top-right) and content-gates the bottom panel. Validated by a 3-lens design critique; the decisions below incorporate its corrections.

## Decisions

### D1 — Dual-mode tooltip, NOT a new component (keep `hover-tooltip` feature)

`HoverTooltip` gains an optional `pinned` prop. The feature is **not renamed** and `useHoverElement` is **untouched** — hover stays the primary mode. Rename churn (~8 files + spec + memory) buys nothing; pinning is an additive secondary mode.

- `pinned != null` → render a **pinned card** at canvas top-right; ignore the hovered element (hover suppressed).
- `pinned == null` → existing floating-hover behavior, unchanged.

### D2 — Control-flow order is load-bearing

All hooks (`useHoverElement`, `useState` coords, `useRef`, `useLayoutEffect[hovered]`) stay **before** any early return. The pinned branch is inserted **first**, before `if (hovered === null) return null`:

```
if (pinned != null) { return <pinned card/>; }
if (hovered === null) { return null; }
return <hover card/>;   // `hovered` narrows non-null here
```

The pinned path MUST NOT read `coords` (uses fixed `top`/`right`) and MUST NOT depend on `ready`. Leaving `useLayoutEffect` ungated on `pinned` is correct — `coords` keep tracking the latest hovered, so an un-pin → hover transition shows at fresh coords (no stale-corner flash).

### D3 — Pinned style: reuse `styles.root` className + inline overrides

Reuse `styles.root` (width 280, `overflowY:auto`, border/padding/shadow) and override inline:
`{ left: 'auto', right: 8, top: 8, maxHeight: 'calc(50% - 16px)', pointerEvents: 'auto', zIndex: 1000 }`.

`zIndex: 1000` is **load-bearing** — `styles.root` hardcodes `zIndex: 10`; a `pointerEvents:auto` card at z10 sits **below** cytoscape's transparent expand-collapse input canvas (z999) and has its scroll/clicks swallowed. z1000 matches `NodeDetailPanel` + `legendExpandButton` (all share one root stacking context — `GraphCanvas` root and `canvasArea` are `position:relative` with no z-index). Top-right pinned (`maxHeight calc(50%-16px)`) and bottom `NodeDetailPanel` (`maxHeight 50%`) tile at the vertical midline without overlap.

### D4 — Single named `PinnedTooltip` type

```ts
// hover-tooltip/components/HoverTooltip/HoverTooltip.types.ts
export interface PinnedTooltip {
  label: string;
  attributes: NodeAttribute[];        // from shared/nodeAttributes — no node-detail coupling
  labels?: Record<string, string>;
}
```

`NodeAttribute {key,value,wrap?}` is structurally identical to the local `TooltipRow`, so it drops straight into the existing row render (`row.wrap`). Exported via the hover-tooltip barrel; consumed by `GraphCanvasProps` and the KsgPanel helper. Pinned content = `{ title: pinned.label, attrs: pinned.attributes, labels: toLabelRows(pinned.labels, NODE_PROMOTED_LABELS) }`.

### D5 — Derive `pinned` from the already-gated `selectedNode`

`selectedNode` (`resolveSelectedNode`) already centralizes visible + not-collapsed-ancestor + detail-eligible gating, and is memoized on `elements/selectedNodeId/visibleNodeIds/collapsedIds`. So `pinned` derived from it **self-clears** on deselect / switch / filter / collapse / data-refresh-removal — no separate removal handler. A new pure helper bridges the two features (the orchestrator is the legitimate cross-feature bridge):

```ts
// panels/KsgPanel/buildPinnedTooltip.ts
export function buildPinnedTooltip(node: NodeDetailData | null): PinnedTooltip | null {
  if (node === null) return null;
  return { label: node.label, attributes: node.attributes ?? [],
           ...(node.labels !== undefined ? { labels: node.labels } : {}) };
}
```

`const pinned = useMemo(() => buildPinnedTooltip(selectedNode), [selectedNode]);` → `pinned` threads KsgPanel → GraphCanvas (new `pinned?: PinnedTooltip | null` prop) → `HoverTooltip`. `pinned` is in no `useCytoscape` dep, so **no cy re-init**; `GraphCanvas` is unmemoized, so a fresh object per render is free.

Decorative `cluster`/`namespace`/`application` groups resolve `null` → never pin (hover continues over them). `storageclass` **is** detail-eligible → pins (its provisioner/parameters are the new home for those attrs).

### D6 — `labels` on `NodeDetailData` via exactOptionalPropertyTypes-safe spread

Add `labels?: Record<string, string>` to `NodeDetailData`. `tsconfig` has `exactOptionalPropertyTypes`, so a flat `labels: d.labels` is a typecheck error. Use a conditional spread in `resolveSelectedNode` (mirroring its existing optional spreads) and in `buildPinnedTooltip`:

```ts
...(d.labels !== undefined ? { labels: d.labels } : {})
```

This also keeps `resolveSelectedNode.test.ts` exact `toEqual` fixtures green (no labels in fixtures → no key added). `NodeDataDefinition.labels` is already declared.

### D7 — Panel ALWAYS renders (header minimum); Application extends to service/pvc

The panel renders for any selected detail-eligible node (`if (node === null) return null` is the **only** early-return). The header (name + kind/status badges + close X + Dashboard button when `dashboard?.status === 'ready'`) is the minimum; body sections are data-gated. A bare node (no app/containers/alerts/dashboard) still renders a header-only panel — its attributes live in the pinned tooltip, and the header keeps a close X + the dashboard entry point. (User-confirmed reversal of the earlier "render null when empty".)

**Application section extends to non-workload leaves in an ArgoCD app.** `showApplication = node.application !== undefined` (drop the `isDetailUrlKind` requirement) — so a `service` / `pvc` carrying `data.application` shows the Application change-report + its `config_changes` (Deployment Changes) link. `showContainers` stays workload-only. To fire `config_changes`, `resolveSelectedNode` gives a non-workload-with-application node a `queryTarget` of its **own** `{kind, name}` (a new `else if` after the workload branch). The shared prefetch also fires `code_changes`, but service/pvc have no containers so its result is unused (Containers never renders) — accepted for a uniform prefetch path. The application name appears in **both** the pinned tooltip (name) and the Application section (config_changes link).

**The ArgoCD `application` group node itself opens its app-detail.** `resolveSelectedNode`'s gate widens from `isDashboardEligible(d)` to `isDashboardEligible(d) || d.isApplication === true` — so the (kind-less) application group resolves. It gets a synthetic `kind: 'application'` (mirrors `buildNodeAttributes`) for the header badge, and a `queryTarget` of `{kind: 'application', name: d.application}` so its `config_changes` fires. `cluster`/`namespace` groups stay excluded (not `isApplication`, not `isDashboardEligible`). This intentionally diverges `resolveSelectedNode`'s scope from `isDashboardEligible` (left unchanged, so the app group still has no `/dashboard` button — it has no per-node dashboard). Selecting the app group now opens the panel **and** pins its tooltip, alongside the existing `+/-` collapse cue (same coexistence as a `storageclass` compound).

### D8 — Dead-code + Properties cleanup

Remove from `NodeDetailPanel.tsx`: the Properties section JSX, `propertyRows`, the `kvRow`/`kvKey`/`kvVal` css blocks **and** their three keys in the `getStyles` return-type interface. Keep `staticBody` (Application uses it), `sectionFixed` (Application), `section`, `sectionFill`, `slot`. Update stale doc comments: `NodeDetailData.attributes` and `resolveSelectedNode`'s "always-on Properties section" comment → "feeds the pinned tooltip (buildNodeAttributes single-source)". Keep the `buildNodeAttributes` import + `attributes: buildNodeAttributes(d)` (attributes now feed the pinned card only).

## Risks / Consequences (intended, user-confirmed)

- **Edge-hover-while-pinned suppressed**: a user can't inspect any edge tooltip while a node is selected (follows from "keep hover until a node is chosen"). Hover resumes on deselect.
- **Panel always renders (header minimum)**: a bare node shows a header-only panel **and** the pinned tooltip — name/kind appear in both. Redundant but user-confirmed (the panel header is the dashboard + close-X entry point).
- **`code_changes` wasted for service/pvc**: the shared prefetch fires it though service/pvc have no containers; result unused (Containers never renders). Minor; accepted for a uniform prefetch path.
- **Minor perf**: `useHoverElement` keeps firing `clonePlain`/`setHovered` while pinned (output ignored). Accepted to honor minimal-churn (optimizing would thread `pinned` into the hook).
- **Pinned card (z1000, top-right) overlaps the right edge of the transient partial-parse warning** (z3) when both show. Non-blocking, rare.

## Pre-existing spec staleness handled here

The live spec asserted `storageclass` is excluded from `resolveSelectedNode` (`469(b)`) and "doesn't open a panel" (`352`/`403`) — already false in code (`assembleDashboardParams.ts:33-35`, `resolveSelectedNode.test.ts:48`). Since this change rewrites the storageclass selection narrative, the delta corrects these. The deeper `464-498` container-vs-leaf inconsistency is **out of scope** (unrelated pre-existing issue, deferred).
