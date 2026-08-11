# Legend: Controllers / Nodes section to bottom

## Why

The Controllers (or Nodes, in node mode) swatch section currently sits between Clusters and Namespaces in the left legend. Users scan mode-gated compound groups (Namespaces / Applications) more often after Clusters, then want the long Controllers/Nodes collapse list at the **bottom** so it does not push those sections down or dominate mid-legend. The main `panel-rendering` legend-order requirement currently freezes Controllers in the middle of the swatch stack, so the UI cannot move without a spec delta.

## What Changes

- Reorder legend **swatch** sections so `Nodes`|`Controllers` (`NodeContainerLegend`) renders **last** (bottom of the legend rail).
- New vertical order (everything above Status unchanged):

  `Layout` → `Node Kinds` → `Ingress Gateway` (if present) → `Edge Types` → `Status` → `Clusters` → `Namespaces` → `Applications` → **`Nodes`|`Controllers`**

- Behavior of each section (collapse-all, mode-gating, titles) is **unchanged** — only **DOM / visual stack order**.
- Update the legend-order test that asserts Controllers before Namespaces/Applications.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `panel-rendering`: the **圖例 (Legend)** requirement's MUST vertical order for swatch sections — `Nodes`|`Controllers` moves from after `Clusters` to after `Applications` (legend bottom).

## Impact

- `src/panels/KsgPanel/KsgPanel.tsx` — reorder JSX of legend sections in the left `<aside>`.
- `src/panels/KsgPanel/KsgPanel.test.tsx` — section-order assertion.
- Main spec delta only; no new features, no backend/options schema change.
