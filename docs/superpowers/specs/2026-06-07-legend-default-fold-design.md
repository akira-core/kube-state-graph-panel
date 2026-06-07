# Legend default-fold for swatch sections

**Date:** 2026-06-07
**Status:** Design approved, pending spec review

## Problem

The panel's legend (`features/legend`, rendered left of the canvas in a 200px-wide,
`overflow-y: auto` rail) stacks seven sections. Three of them enumerate **one row per
entity**:

- `ClusterLegend` — one swatch row per cluster
- `NodeContainerLegend` — one row per K8s node (node mode) or per synthesized controller (controller mode)
- `StorageClassLegend` — one row per StorageClass

All three are thin wrappers over the shared `SwatchLegend`, which renders a `<ul>` with
one `<li>` per entry. On a large Kubernetes cluster these lists grow to dozens or hundreds
of rows, pushing the bounded sections below them (Node kinds, Edge types, Status) far down
the rail and forcing heavy scrolling.

The remaining four sections are bounded and short (`NodeLegend` ≤ 6 kinds, `EdgeLegend`
≤ 4 edge types, `StatusLegend` fixed) and are **out of scope**.

## Goal

Make the three swatch sections collapsible, **folded by default**, so the legend rail
stays compact regardless of cluster size while the entity lists remain one click away.

## Decisions

| Decision                     | Choice                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Default state                | **Always folded** (every swatch section loads folded)                                |
| Affordance                   | Click the section header (caret + title) to toggle                                   |
| Count                        | **Always shown** in the title — `Clusters (12)` — in both folded and expanded states |
| Scope                        | Only the three swatch sections; the bounded sections are untouched                   |
| State location               | Local `useState` inside `SwatchLegend` (ephemeral)                                   |
| Existing collapse-all button | Retained; unaffected and independent of the fold control                             |

"Ephemeral" means fold state lives only in component state: it resets to folded on reload/
remount, but a user's expand persists across data refreshes while the component stays
mounted. This matches the codebase convention that runtime UI state (e.g. `podParentMode`,
`collapsedIds`) is React-owned, since Grafana panel options are read-only at runtime.

This fold control is **distinct** from the existing collapse-all `IconButton`
(`minus-circle`/`plus-circle`) in the header, which collapses the _on-canvas compound
nodes_ (`collapsedIds`). Folding only hides the legend list; it never touches the graph.

## Architecture

The entire change lives in **one production file**: `SwatchLegend.tsx`. The three wrappers
(`ClusterLegend`, `NodeContainerLegend`, `StorageClassLegend`) inherit the behavior with
**no changes** — they already pass `title`, `entries`, `testId`, and the collapse-all props
through.

### `SwatchLegend` behavior

- Add `const [folded, setFolded] = useState(true)` — folded by default.
- The header (`styles.header`, `display:flex; justify-content:space-between`) holds two
  **sibling** controls:
  1. **Fold toggle** — WAI-ARIA accordion pattern: an `<h4>` wrapping a
     `<button type="button" aria-expanded={!folded}>`. The button contains a decorative
     caret `Icon` (`angle-right` when folded, `angle-down` when expanded) and the title text
     `` `${title} (${entries.length})` ``. Clicking toggles `folded`.
  2. **Collapse-all `IconButton`** — unchanged, rendered to the right only when
     `onToggleCollapseAll` is provided.

  Because the two controls are siblings (not nested), clicking the collapse-all button does
  not bubble into the fold toggle — no `stopPropagation` needed.

- The `<ul>` of swatch rows renders **only when `!folded`**.
- Empty entries still `return null` (unchanged) — folding never applies to an empty section.
- Fold-toggle test id is derived internally as `` `${testId}-fold-toggle` `` (e.g.
  `cluster-legend-fold-toggle`). No new public prop; the wrappers stay byte-for-byte the same.

### Styling

- The fold button is reset to look like the existing heading: `background:none; border:none;
padding:0; cursor:pointer; font:inherit; color:inherit; display:flex; align-items:center;
gap`. The `<h4>` margin is reset so the row keeps its current height.
- New styles are local to `SwatchLegend`'s `getStyles`; `legendStyles.ts` is not touched.

## Accessibility

- The control is a real `<button>` with `aria-expanded` reflecting the open state, wrapped in
  the `<h4>` so heading semantics and screen-reader heading navigation are preserved.
- The caret `Icon` is decorative (Grafana `Icon` is `aria-hidden` by default); the button's
  accessible name comes from the visible title text, e.g. `Nodes (4)`.

## Testing

### `SwatchLegend.test.tsx` (new + migrated)

- **Default folded:** no `listitem`s in the DOM; title shows `(N)`; caret is `angle-right`;
  `aria-expanded="false"`.
- **Expand:** clicking the fold toggle reveals the rows; caret becomes `angle-down`;
  `aria-expanded="true"`. Clicking again re-folds.
- **Independence:** clicking the collapse-all `IconButton` fires `onToggleCollapseAll` and does
  **not** change the fold state.
- **Count always shown:** `(N)` is present in both folded and expanded states.
- **Empty entries → null** (unchanged).

### Migrated wrapper tests

`ClusterLegend.test.tsx`, `NodeContainerLegend.test.tsx`, `StorageClassLegend.test.tsx`, and
the existing `SwatchLegend.test.tsx` cases currently assert swatch rows are present. Two
adjustments each:

1. Expand the section (click the fold toggle) before asserting rows / `listitem` count.
2. Heading queries that match the exact name `'Nodes'` / `'Clusters'` / `'Controllers'` must
   account for the appended count — match `/Nodes/` (or the full `'Nodes (2)'`), since the
   heading's accessible name now includes `(N)`.

The collapse-all tests (clicking `node-collapse-toggle` etc.) and the "renders nothing when
empty" tests are unaffected.

### No panel/e2e impact

No `KsgPanel` test or Playwright spec references the swatch row test ids
(`cluster-legend-row-*`, `node-container-legend-row-*`, `storageclass-legend-row-*`), so the
change is contained to the legend feature's own tests.

## Out of scope (YAGNI)

- Folding the bounded sections (Node kinds / Edge types / Status).
- A panel option for the default state or a per-entry-count threshold.
- Persisting fold state across reloads.
