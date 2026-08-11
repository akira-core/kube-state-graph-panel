# Design — legend-controllers-bottom

## Context

Motivation: see `proposal.md` — Why. Behavior contract: delta on `panel-rendering`「圖例 (Legend)」.

Current legend stack in `KsgPanel.tsx` (left `<aside>`):

1. `LayoutModeControl`
2. `NodeLegend`
3. `IngressToggle` (conditional)
4. `EdgeLegend`
5. `StatusLegend`
6. `ClusterLegend`
7. **`NodeContainerLegend`** (Controllers / Nodes) ← move
8. `NamespaceLegend` (controller mode)
9. `ApplicationLegend` (controller mode)

Section order is pure render order (CSS column flex); no shared order registry.

## Goals / Non-Goals

**Goals:**

- `NodeContainerLegend` is always the last rendered section in the legend rail.
- Spec + test lock the new order.

**Non-Goals:**

- Changing collapse-all behavior, mode-gating, titles, or data derivation.
- Reordering anything above Status or among Layout / kinds / edges / ingress.
- Virtualization or scroll-within-section UX.

## Decisions

### D1 — JSX reorder only

Move the `NodeContainerLegend` block to after the two mode-gated legends in `KsgPanel.tsx`. No new props, hooks, or constants. Alternative — a section-order config array — rejected as overkill for a one-time stack change.

### D2 — Spec carries full MODIFIED Legend requirement

Delta replaces the MUST order string and adds scenario「Controllers/Nodes swatch 位於 legend 最底」. Other Legend scenarios stay intact so archive merge does not drop coverage.

### D3 — Tests

Update `KsgPanel.test.tsx` order assertion from  
`clusters < controllers < namespaces < applications`  
to  
`clusters < namespaces < applications < controllers`  
(and node-mode: `clusters < nodes` as last if covered).

## Risks / Trade-offs

- [Users habituated to Controllers mid-legend] → accepted; change is deliberate UX.
- [Partial-order tests that only check Status before Clusters] → leave; still valid.

## Migration Plan

Pure frontend reorder; no options/schema migration. Revert = reorder JSX + revert spec.

## Open Questions

None.
