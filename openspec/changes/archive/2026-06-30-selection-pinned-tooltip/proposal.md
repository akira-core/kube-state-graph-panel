# Proposal: selection-pinned-tooltip

## Why

The consolidated left-click detail panel put node attributes in an always-on **Properties** section at the bottom of the panel. That duplicates what the hover tooltip already shows (same `buildNodeAttributes` source) and forces a bottom panel open for every selected node — even pure `service` / `pvc` / `storageclass` leaves whose only content is those attributes.

The user wants the attributes surfaced **as the tooltip itself, pinned to the canvas top-right** the moment a node is left-clicked, and the bottom panel reserved for genuine change-report / alerts content only.

## What Changes

1. **Drop the Properties section** from `NodeDetailPanel`. Promoted attributes are no longer rendered in the bottom panel.
2. **Dual-mode tooltip.** The existing `HoverTooltip` keeps its floating-on-hover behavior **unchanged** while no node is selected. When a **detail-eligible** node is left-click selected, the tooltip **pins to the canvas top-right** (persistent, scrollable, `pointer-events: auto`), showing that node's full content (title + promoted attrs + raw labels — identical to hover). While pinned, the floating hover tooltip is **suppressed** (nodes and edges).
3. **Panel always renders.** `NodeDetailPanel` renders for any selected detail-eligible node — **header minimum** (name + kind/status badges + the Dashboard button when the backend returns a URL); body sections (Application / Containers / Alerts) are data-gated. A bare node shows a header-only panel **plus** the pinned tooltip.
4. **Application change-report extends to `service` / `pvc` and the ArgoCD `application` group node** that carry `data.application`: their Application section + `config_changes` (Deployment Changes link) fire — service/pvc with the node's **own** kind/name; the application group (kind-less) resolves with a synthetic `kind: application` and queries with `{kind:'application', name:<app>}`. Containers stays workload-only. The application name also appears in the pinned tooltip.

### Consequences (intended)

- **Edge tooltips while a node is pinned**: suppressed (hover only resumes after deselect). Faithful to "keep hover until a node is chosen".
- **Decorative `cluster` / `namespace` groups**: resolve to `null` — never pin, never open a panel. The **`application` group is now detail-eligible** (opens its app-detail + pins), so `resolveSelectedNode`'s scope intentionally diverges from `isDashboardEligible` (which still excludes the app group for the `/dashboard` button).
- **`storageclass`** is detail-eligible (verified: `isDashboardEligible` excludes only `cluster`/`namespace`/`application`), so left-clicking a storageclass **pins** its `provisioner` + `parameters` top-right and opens a header-only panel (no app/containers/alerts).
- **`code_changes` for service/pvc**: the shared prefetch fires it too, but service/pvc have no containers so its result is unused (Containers section never renders). A minor wasted call, accepted for a uniform prefetch path.
- **Dismissal**: the pinned card has no close button; the panel header keeps a close X. Deselect (background/edge tap, switch, filter, collapse) clears both.

## Capabilities

- `panel-rendering` (modified): the Hover Tooltip requirement gains a pinned-on-selection mode; the Node Detail 面板 requirement drops the Properties section and content-gates the panel; the Node Detail Application/Containers and StorageClass requirements drop their now-removed Properties-section references (attributes surface via the pinned tooltip).

## Impact

- **Code**: `src/features/hover-tooltip/**` (add pinned mode + `PinnedTooltip` type), `src/features/graph-canvas/**` (thread `pinned` prop), `src/panels/KsgPanel/**` (derive `pinned` from `selectedNode`, new `buildPinnedTooltip` helper, `labels` passthrough), `src/features/node-detail/**` (drop Properties, content-gate, `labels` on `NodeDetailData`).
- **No backend change.** Panel-only.
- **Tests**: HoverTooltip pinned-mode + suppression; NodeDetailPanel render-null + header-only-dashboard; `buildPinnedTooltip` unit; `resolveSelectedNode` labels passthrough; GraphCanvas pinned passthrough. Existing Properties-section tests removed.
