# KSG Compound Node Collapse + Visual Adjustments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add `cytoscape-expand-collapse`-driven collapse/expand of cluster and k8s-node compound containers (with meta-edge aggregation, legend toggles, and canvas +/- cues two-way synced) plus the accompanying node-shape/size/legend visual adjustments. **Architecture:** A new `useExpandCollapse` hook owns the expand-collapse api; GraphCanvas owns three stable refs (`apiRef`/`suppressRef`/`collapsedIdsRef`) shared between `useExpandCollapse` (writes api, binds cue events) and a collapse-aware `useCytoscape` diff-patch effect (expandAll → diff/patch → reconcile+collapse → prune). Collapsed-id state lives in `KsgPanel`, drives the legend toggles, and is reconciled after every data refresh via the pure `reconcileCollapse` helper. **Tech Stack:** React 18, TypeScript 5.9 strict, cytoscape 3.33 + cytoscape-expand-collapse 4.1.1, @grafana/ui (`useStyles2`, `IconButton`), `@emotion/css`, Jest + @testing-library/react (headless cytoscape).

## File Structure

| File                                                                    | Create/Modify | Responsibility                                                                                                                                                                                                               |
| ----------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                                          | Modify        | Add `cytoscape-expand-collapse` dependency                                                                                                                                                                                   |
| `src/shared/types/cytoscape.d.ts`                                       | Modify        | Minimal `cy.expandCollapse(opts)` + `ExpandCollapseApi` declarations (no `@types` package)                                                                                                                                   |
| `src/features/graph-canvas/registerExtensions.ts`                       | Modify        | Module-level `cytoscape.use(expandCollapse)` (rule 4)                                                                                                                                                                        |
| `src/shared/constants/shapeByKind.ts`                                   | Modify        | service→hexagon, node→round-rectangle, pvc→pentagon + distinctness comment                                                                                                                                                   |
| `src/features/graph-canvas/styles/getStylesheet.ts`                     | Modify        | base node 36→40; add `node.cy-expand-collapse-collapsed-node` (collapsed-cluster `events:'yes'`) + `edge.cy-expand-collapse-meta-edge`                                                                                       |
| `src/features/graph-canvas/sync/reconcileCollapse.ts`                   | Create        | Pure fn: `desired ∩ presentParents` → string[]                                                                                                                                                                               |
| `src/features/graph-canvas/sync/reconcileCollapse.test.ts`              | Create        | Unit tests for reconcileCollapse                                                                                                                                                                                             |
| `src/features/graph-canvas/hooks/useGraphLayout.ts`                     | Modify        | Add `runToken` input; deps `[cyRef, options, runToken]`; no double-layout on mount                                                                                                                                           |
| `src/features/graph-canvas/hooks/useGraphLayout.test.ts`                | Modify        | Append 3 runToken cases to the existing describe block (file already has 4 tests)                                                                                                                                            |
| `src/features/graph-canvas/hooks/useExpandCollapse.ts`                  | Create        | Gated by `enabled`; init api (`layoutBy:null`/`animate:false`/`cueEnabled:true`), bind after-collapse/expand with suppressRef guard → `onCollapsedChange(full Set)`. Early-returns (no `cy.expandCollapse`) when not enabled |
| `src/features/graph-canvas/hooks/useExpandCollapse.test.ts`             | Create        | Headless cytoscape, stub `cy.expandCollapse`; verify api init + cue→onCollapsedChange + guard                                                                                                                                |
| `src/features/graph-canvas/hooks/useCytoscape.ts`                       | Modify        | Make diff-patch effect collapse-aware via optional injected refs; preserve current behavior when undefined                                                                                                                   |
| `src/features/graph-canvas/hooks/useCytoscape.test.tsx`                 | Modify        | Append collapse-aware cases (expandAll→patch→reconcile+collapse order, suppressRef in/out, onCollapsedChange prune) to the existing Harness-based `.tsx` suite                                                               |
| `src/features/element-filter/hooks/useElementFilter.ts`                 | Modify        | Append meta-edge visibility pass (by endpoint visibility, exempt from edge-type filter)                                                                                                                                      |
| `src/features/element-filter/hooks/useElementFilter.test.ts`            | Modify        | Add meta-edge case                                                                                                                                                                                                           |
| `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.types.ts` | Modify        | Add `collapsedIds?` + `onCollapsedChange?` props + `runToken?`                                                                                                                                                               |
| `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx`      | Modify        | Own `apiRef`/`suppressRef`/`collapsedIdsRef`; wire `useExpandCollapse`; pass refs to `useCytoscape`; pass `runToken` to layout                                                                                               |
| `src/features/legend/components/ClusterLegend/ClusterLegend.tsx`        | Modify        | Optional `onToggleCollapseAll?`/`allCollapsed?` → IconButton; backward-compatible                                                                                                                                            |
| `src/features/legend/components/ClusterLegend/ClusterLegend.test.tsx`   | Modify        | Add toggle-rendered/triggered + no-handler cases                                                                                                                                                                             |
| `src/features/legend/components/NodeLegend/NodeLegend.tsx`              | Modify        | Optional `onToggleCollapseAll?`/`allCollapsed?`/`showCollapseToggle?` → IconButton                                                                                                                                           |
| `src/features/legend/components/NodeLegend/NodeLegend.test.tsx`         | Modify        | Add toggle cases incl. `showCollapseToggle===false`                                                                                                                                                                          |
| `src/panels/KsgPanel/KsgPanel.tsx`                                      | Modify        | `collapsedIds` state; derive container ids; toggle handlers; reorder Cluster→Node→Edge→Status; wire props                                                                                                                    |
| `src/panels/KsgPanel/KsgPanel.test.tsx`                                 | Modify        | Add legend-toggle → collapsedIds-into-GraphCanvas + no-cluster cases                                                                                                                                                         |

---

### Task 1: Add cytoscape-expand-collapse dependency + extension registration + type decl

**Files:**

- Modify: `package.json` (`dependencies`, after line 84 `"cytoscape-fcose": "^2.2.0"`)
- Modify: `src/shared/types/cytoscape.d.ts` (append a new `declare module` augmentation)
- Modify: `src/features/graph-canvas/registerExtensions.ts` (lines 1-16)
- Test: `src/features/graph-canvas/registerExtensions.test.ts` (Create)

- [ ] Step 1: Write the failing test. Create `src/features/graph-canvas/registerExtensions.test.ts`:

```ts
import cytoscape from 'cytoscape';

import { registerCytoscapeExtensions } from './registerExtensions';

describe('registerCytoscapeExtensions', () => {
  it('registers fcose, dagre and expand-collapse exactly once (idempotent)', () => {
    const useSpy = jest.spyOn(cytoscape, 'use');
    // Module import already registered once at import time; calling again must no-op.
    registerCytoscapeExtensions();
    registerCytoscapeExtensions();
    expect(useSpy).not.toHaveBeenCalled();
    useSpy.mockRestore();
  });

  it('exposes cy.expandCollapse after registration', () => {
    const cy = cytoscape({ headless: true });
    expect(typeof (cy as unknown as { expandCollapse?: unknown }).expandCollapse).toBe('function');
    cy.destroy();
  });
});
```

- [ ] Step 2: Run test to verify it fails. Command: `npx jest src/features/graph-canvas/registerExtensions.test.ts`
      Expected: FAIL — `cy.expandCollapse` is `undefined` because the extension is not yet registered and the package is not installed (import of `cytoscape-expand-collapse` in `registerExtensions.ts` does not exist yet).

- [ ] Step 3a: Install the dependency. Command: `npm install cytoscape-expand-collapse@4.1.1 --save-exact=false` (adds `"cytoscape-expand-collapse": "^4.1.1"` to `dependencies`). Verify `package.json` `dependencies` now contains it after line 84.

- [ ] Step 3b: Add the minimal type declaration. Append to `src/shared/types/cytoscape.d.ts` (after the existing closing brace of the first `declare module 'cytoscape'` block, which ends at line 32):

```ts
// cytoscape-expand-collapse has no @types package. Minimal surface used by the
// panel — see iVis-at-Bilkent/cytoscape.js-expand-collapse README. Declared here
// so the hooks can call cy.expandCollapse(opts) and the api without `any`.
declare module 'cytoscape-expand-collapse' {
  import type cytoscape from 'cytoscape';
  const ext: cytoscape.Ext;
  export default ext;
}

declare module 'cytoscape' {
  interface ExpandCollapseOptions {
    layoutBy: cytoscape.LayoutOptions | null;
    fisheye: boolean;
    animate: boolean;
    undoable: boolean;
    cueEnabled: boolean;
  }

  interface ExpandCollapseApi {
    collapse(nodes: cytoscape.NodeCollection): void;
    expand(nodes: cytoscape.NodeCollection): void;
    collapseAll(): void;
    expandAll(): void;
    isExpandable(node: cytoscape.NodeSingular): boolean;
    isCollapsible(node: cytoscape.NodeSingular): boolean;
    getCollapsedChildren(node: cytoscape.NodeSingular): cytoscape.NodeCollection;
    getCollapsedChildrenRecursively(node: cytoscape.NodeSingular): cytoscape.NodeCollection;
  }

  interface Core {
    expandCollapse(options: Partial<ExpandCollapseOptions>): ExpandCollapseApi;
  }
}
```

- [ ] Step 3c: Register the extension at module level. Edit `src/features/graph-canvas/registerExtensions.ts` to:

```ts
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import expandCollapse from 'cytoscape-expand-collapse';
import fcose from 'cytoscape-fcose';

let registered = false;

export function registerCytoscapeExtensions(): void {
  if (registered) {
    return;
  }
  cytoscape.use(fcose);
  cytoscape.use(dagre);
  cytoscape.use(expandCollapse);
  registered = true;
}

registerCytoscapeExtensions();
```

- [ ] Step 4: Run test to verify it passes. Command: `npx jest src/features/graph-canvas/registerExtensions.test.ts`
      Expected: PASS. Then `npm run typecheck` Expected: PASS (no `any`, declarations resolve).

- [ ] Step 5: Commit. `git add package.json package-lock.json src/shared/types/cytoscape.d.ts src/features/graph-canvas/registerExtensions.ts src/features/graph-canvas/registerExtensions.test.ts` then `git commit -m "feat: add cytoscape-expand-collapse dep, register extension, type decl"`

---

### Task 2: Reshape node kinds (single-source SHAPE_BY_KIND)

**Files:**

- Modify: `src/shared/constants/shapeByKind.ts` (lines 16-27)
- Test: `src/features/graph-canvas/styles/getStylesheet.test.ts` (existing — the `maps every backend node kind to its SHAPE_BY_KIND shape` test at lines 49-54 already iterates `SHAPE_BY_KIND`, so it auto-follows; add an explicit shape assertion test in the same file)

- [ ] Step 1: Write the failing test. Add this `it` block inside the `describe('getStylesheet', ...)` block in `src/features/graph-canvas/styles/getStylesheet.test.ts` (after the existing `maps every backend node kind...` test at line 54):

```ts
it('uses the reconfigured kind shapes (service=hexagon, node=round-rectangle, pvc=pentagon)', () => {
  const shapeFn = styleFor('node').shape as ShapeFn;
  expect(shapeFn(fakeEle({ kind: 'service' }))).toBe('hexagon');
  expect(shapeFn(fakeEle({ kind: 'node' }))).toBe('round-rectangle');
  expect(shapeFn(fakeEle({ kind: 'pvc' }))).toBe('pentagon');
  expect(shapeFn(fakeEle({ kind: 'pod' }))).toBe('ellipse');
});
```

- [ ] Step 2: Run test to verify it fails. Command: `npx jest src/features/graph-canvas/styles/getStylesheet.test.ts -t 'reconfigured kind shapes'`
      Expected: FAIL — current map has `service: 'round-rectangle'`, `node: 'pentagon'`, `pvc: 'barrel'`.

- [ ] Step 3: Write minimal implementation. Edit `src/shared/constants/shapeByKind.ts` lines 16-27 to:

```ts
// Single source of truth: keyed by upstream node `data.type`.
// stylesheet, legend, and the element filter's KNOWN_KINDS all derive from this.
// Shapes are chosen to be mutually distinct at small sizes — no two many-sided
// polygons that read alike: pod=ellipse / service=hexagon / node=round-rectangle
// / pvc=pentagon / others=diamond / external=star. node uses round-rectangle so
// the leaf/collapsed node glyph matches the node:parent container box it becomes
// when it holds pods (it is itself a compound node).
export const SHAPE_BY_KIND: Record<NodeKind, CytoscapeNodeShape> = {
  pod: 'ellipse',
  service: 'hexagon',
  node: 'round-rectangle',
  pvc: 'pentagon',
  others: 'diamond',
  external: 'star',
};
```

- [ ] Step 4: Run the single test to verify it passes. Command: `npx jest src/features/graph-canvas/styles/getStylesheet.test.ts -t 'reconfigured kind shapes'` Expected: PASS.

- [ ] Step 4b: Update the existing `styles compound parents...` test assertion. The existing test `styles compound parents as boxes and leaves by kind (headless :parent)` (lines 74-96) asserts the childless `leaf-node` (kind `node`) renders as `'pentagon'` (line 91). Since `node` kind is now `round-rectangle`, change that assertion. In `src/features/graph-canvas/styles/getStylesheet.test.ts`, replace:

```ts
// A childless node falls through to its kind shape (pentagon), not a box.
expect(cy.getElementById('leaf-node').style('shape')).toBe('pentagon');
```

with:

```ts
// A childless node falls through to its kind shape (round-rectangle), not a box.
expect(cy.getElementById('leaf-node').style('shape')).toBe('round-rectangle');
```

(This must happen BEFORE the full-file re-run below, otherwise that re-run FAILS on this stale assertion.)

- [ ] Step 4c: Re-run the full file to verify it passes. Command: `npx jest src/features/graph-canvas/styles/getStylesheet.test.ts` Expected: PASS (NodeLegend test auto-follows the map; the existing NodeLegend test queries `shape-glyph-${shape}` from the map so it stays green).

- [ ] Step 5: Commit. `git add src/shared/constants/shapeByKind.ts src/features/graph-canvas/styles/getStylesheet.test.ts` then `git commit -m "feat: reshape node kinds (service hexagon, node round-rect, pvc pentagon)"`

---

### Task 3: Stylesheet — enlarge leaf nodes + collapsed-node and meta-edge selectors

**Files:**

- Modify: `src/features/graph-canvas/styles/getStylesheet.ts` (base node `width/height` at lines 77-78; add new selectors after `node[?isCluster]` block ends at line 127 and after the `edge` block)
- Test: `src/features/graph-canvas/styles/getStylesheet.test.ts` (add assertions)
- Update snapshot: `src/features/graph-canvas/styles/__snapshots__/getStylesheet.test.ts.snap`

- [ ] Step 1: Write the failing test. Add these `it` blocks to `src/features/graph-canvas/styles/getStylesheet.test.ts`:

```ts
it('enlarges base leaf node to 40x40', () => {
  const nodeStyle = styleFor('node');
  expect(nodeStyle.width).toBe(40);
  expect(nodeStyle.height).toBe(40);
});

it('declares collapsed-node and meta-edge selectors with collapsed-cluster events override after node[?isCluster]', () => {
  const sheet = getStylesheet({ theme: createTheme() }) as unknown as Array<{ selector: string; style?: StyleRecord }>;
  const selectors = sheet.map((s) => s.selector);
  expect(selectors).toContain('node.cy-expand-collapse-collapsed-node');
  expect(selectors).toContain('node[?isCluster].cy-expand-collapse-collapsed-node');
  expect(selectors).toContain('edge.cy-expand-collapse-meta-edge');
  // collapsed-cluster events:'yes' override must come AFTER the decorative
  // node[?isCluster] (events:'no') so it wins the cascade.
  expect(selectors.indexOf('node[?isCluster].cy-expand-collapse-collapsed-node')).toBeGreaterThan(
    selectors.indexOf('node[?isCluster]')
  );
  const collapsedCluster = sheet.find((s) => s.selector === 'node[?isCluster].cy-expand-collapse-collapsed-node');
  expect(collapsedCluster?.style?.events).toBe('yes');
  const metaEdge = sheet.find((s) => s.selector === 'edge.cy-expand-collapse-meta-edge');
  expect(metaEdge?.style?.['line-color']).toBe('#94a3b8');
});
```

- [ ] Step 2: Run test to verify it fails. Command: `npx jest src/features/graph-canvas/styles/getStylesheet.test.ts -t 'collapsed-node and meta-edge'`
      Expected: FAIL — selectors absent; width/height still 36.

- [ ] Step 3a: Enlarge base node. In `src/features/graph-canvas/styles/getStylesheet.ts` change lines 77-78:

```ts
        width: 40,
        height: 40,
```

- [ ] Step 3b: Add collapsed-node + collapsed-cluster override after the `node[?isCluster]` block (the object ending at line 127, just before `...statusSelectors,` on line 128). Insert:

```ts
    {
      // Collapsed compound node (cluster or k8s node). Heavier border signals it
      // can be expanded; the +/- cue is drawn by the extension independently.
      selector: 'node.cy-expand-collapse-collapsed-node',
      style: {
        'border-width': 3,
        'border-opacity': 0.9,
      },
    },
    {
      // A COLLAPSED cluster becomes clickable (expand / show detail). Declared
      // after node[?isCluster] (events:'no') so this events:'yes' wins. Expanded
      // clusters stay decorative.
      selector: 'node[?isCluster].cy-expand-collapse-collapsed-node',
      style: {
        events: 'yes',
      },
    },
```

- [ ] Step 3c: Add the meta-edge selector after the `edge` block (the last object, ending at line 152 before the closing `];`). Insert as a new array element after the `edge` object:

```ts
    {
      // Aggregated edge synthesised by expand-collapse when a container is
      // collapsed. Neutral colour + slightly heavier; exempt from edge-type
      // filtering (visibility follows endpoints only — see useElementFilter).
      selector: 'edge.cy-expand-collapse-meta-edge',
      style: {
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        width: 2.5,
        'line-color': FALLBACK_EDGE_STYLE.color,
        'target-arrow-color': FALLBACK_EDGE_STYLE.color,
        'line-style': 'solid',
      },
    },
```

(`FALLBACK_EDGE_STYLE` is already imported on line 4 of the file.)

- [ ] Step 4: Run test to verify it passes. Command: `npx jest src/features/graph-canvas/styles/getStylesheet.test.ts -t 'collapsed-node and meta-edge'` Expected: PASS. Then update the snapshot: `npx jest src/features/graph-canvas/styles/getStylesheet.test.ts -u` Expected: PASS (snapshot rewritten with width/height 40 + new selectors). Then `npm run typecheck` Expected: PASS.

- [ ] Step 5: Commit. `git add src/features/graph-canvas/styles/getStylesheet.ts src/features/graph-canvas/styles/getStylesheet.test.ts src/features/graph-canvas/styles/__snapshots__/getStylesheet.test.ts.snap` then `git commit -m "feat: enlarge leaf nodes to 40px, add collapsed-node + meta-edge styles"`

---

### Task 4: Pure fn reconcileCollapse

**Files:**

- Create: `src/features/graph-canvas/sync/reconcileCollapse.ts`
- Test: `src/features/graph-canvas/sync/reconcileCollapse.test.ts`

- [ ] Step 1: Write the failing test. Create `src/features/graph-canvas/sync/reconcileCollapse.test.ts`:

```ts
import { reconcileCollapse } from './reconcileCollapse';

describe('reconcileCollapse', () => {
  it('returns all desired ids when every parent still exists', () => {
    const result = reconcileCollapse(new Set(['A', 'B', 'C']), new Set(['A', 'B', 'C']));
    expect(result.sort()).toEqual(['A', 'B', 'C']);
  });

  it('drops desired ids whose parent was removed by the update', () => {
    const result = reconcileCollapse(new Set(['A', 'B', 'C']), new Set(['A', 'B']));
    expect(result.sort()).toEqual(['A', 'B']);
  });

  it('returns empty when desired is empty', () => {
    expect(reconcileCollapse(new Set(), new Set(['A', 'B']))).toEqual([]);
  });

  it('returns empty when no desired parent is present', () => {
    expect(reconcileCollapse(new Set(['X']), new Set(['A', 'B']))).toEqual([]);
  });
});
```

- [ ] Step 2: Run test to verify it fails. Command: `npx jest src/features/graph-canvas/sync/reconcileCollapse.test.ts`
      Expected: FAIL — module `./reconcileCollapse` does not exist.

- [ ] Step 3: Write minimal implementation. Create `src/features/graph-canvas/sync/reconcileCollapse.ts`:

```ts
/**
 * Returns the parent ids that should be re-collapsed after a diff-patch:
 * the desired collapsed set intersected with the parents that still exist.
 * presentParents is the id set of cy.nodes(':parent') taken AFTER the patch.
 * Example: desired={A,B,C}, presentParents={A,B} (C removed) → ['A','B'].
 * Cluster vs k8s-node is not distinguished — both are :parent, same behaviour.
 */
export function reconcileCollapse(desired: ReadonlySet<string>, presentParents: ReadonlySet<string>): string[] {
  const result: string[] = [];
  for (const id of desired) {
    if (presentParents.has(id)) {
      result.push(id);
    }
  }
  return result;
}
```

- [ ] Step 4: Run test to verify it passes. Command: `npx jest src/features/graph-canvas/sync/reconcileCollapse.test.ts` Expected: PASS.

- [ ] Step 5: Commit. `git add src/features/graph-canvas/sync/reconcileCollapse.ts src/features/graph-canvas/sync/reconcileCollapse.test.ts` then `git commit -m "feat: add reconcileCollapse pure helper"`

---

### Task 5: useGraphLayout gains runToken input

**Files:**

- Modify: `src/features/graph-canvas/hooks/useGraphLayout.ts` (props interface lines 6-9; effect deps line 35)
- Test: `src/features/graph-canvas/hooks/useGraphLayout.test.ts` (Modify — file ALREADY EXISTS with 4 tests)

- [ ] Step 1: Write the failing tests. The file `src/features/graph-canvas/hooks/useGraphLayout.test.ts` ALREADY EXISTS with 4 passing tests inside a single `describe('useGraphLayout', ...)` block: `calls cy.stop() then cy.layout(options).run() on mount`, `reruns layout when name changes`, `does not rerun layout when name is unchanged across renders`, and `is a no-op when cyRef is null`. Those existing tests call `useGraphLayout({ cyRef, name })` / `useGraphLayout({ cyRef, name: 'fcose' })` (no `runToken`) via the existing `makeCy()` + `stubLayout(cy)` helpers, and they will continue to pass after `runToken` is added because it defaults to `0`. Do NOT recreate or overwrite the file — APPEND the following 3 runToken cases to the END of the existing `describe('useGraphLayout', ...)` block (just before its closing `});` on line 75), reusing the existing `makeCy`/`stubLayout` helpers:

```ts
it('reruns layout when runToken changes', () => {
  const cy = makeCy();
  const { layoutSpy } = stubLayout(cy);
  const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;
  const { rerender } = renderHook(
    ({ runToken }: { runToken: number }) => useGraphLayout({ cyRef, name: 'fcose', runToken }),
    { initialProps: { runToken: 0 } }
  );
  expect(layoutSpy).toHaveBeenCalledTimes(1);
  rerender({ runToken: 1 });
  expect(layoutSpy).toHaveBeenCalledTimes(2);
});

it('does not rerun layout when runToken is unchanged across renders', () => {
  const cy = makeCy();
  const { layoutSpy } = stubLayout(cy);
  const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;
  const { rerender } = renderHook(
    ({ runToken }: { runToken: number }) => useGraphLayout({ cyRef, name: 'fcose', runToken }),
    { initialProps: { runToken: 0 } }
  );
  expect(layoutSpy).toHaveBeenCalledTimes(1);
  rerender({ runToken: 0 });
  expect(layoutSpy).toHaveBeenCalledTimes(1);
});

it('defaults runToken to 0 so existing mount-only callers run layout exactly once', () => {
  const cy = makeCy();
  const { layoutSpy } = stubLayout(cy);
  const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;
  renderHook(() => useGraphLayout({ cyRef, name: 'fcose' })); // no runToken passed
  expect(layoutSpy).toHaveBeenCalledTimes(1);
});
```

- [ ] Step 2: Run tests to verify the new cases fail. Command: `npx jest src/features/graph-canvas/hooks/useGraphLayout.test.ts`
      Expected: FAIL — `runToken` is not in `UseGraphLayoutProps` (TS error), and the effect does not depend on it. The 4 pre-existing tests must still be present (do not delete them); confirm they are unaffected by the additions.

- [ ] Step 3: Write minimal implementation. Edit `src/features/graph-canvas/hooks/useGraphLayout.ts`:
  - Change the props interface (lines 6-9) to:

```ts
export interface UseGraphLayoutProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  name: LayoutName;
  // Bumped by the consumer (GraphCanvas) when collapse state changes content, so
  // layout reruns. Defaults to 0 so existing callers keep mount-only behaviour.
  // useGraphLayout remains the SINGLE source of cy.layout() execution (rule 2).
  runToken?: number;
}
```

- Change the function signature (line 11) to destructure runToken with a default:

```ts
export function useGraphLayout({ cyRef, name, runToken = 0 }: UseGraphLayoutProps): void {
```

- Change the effect deps (line 35) from `}, [cyRef, options]);` to:

```ts
  }, [cyRef, options, runToken]);
```

- [ ] Step 4: Run tests to verify they pass. Command: `npx jest src/features/graph-canvas/hooks/useGraphLayout.test.ts` Expected: PASS — all 7 tests green: the 4 pre-existing ones (`calls cy.stop() then cy.layout(options).run() on mount`, `reruns layout when name changes`, `does not rerun layout when name is unchanged across renders`, `is a no-op when cyRef is null`) plus the 3 new runToken cases. The pre-existing tests pass unchanged because `runToken` defaults to `0`. Then `npm run typecheck` Expected: PASS (GraphCanvas still compiles because `runToken` is optional).

- [ ] Step 5: Commit. `git add src/features/graph-canvas/hooks/useGraphLayout.ts src/features/graph-canvas/hooks/useGraphLayout.test.ts` then `git commit -m "feat: add runToken input to useGraphLayout to rerun layout on collapse change"`

---

### Task 6: useExpandCollapse hook

**Files:**

- Create: `src/features/graph-canvas/hooks/useExpandCollapse.ts`
- Test: `src/features/graph-canvas/hooks/useExpandCollapse.test.ts`

- [ ] Step 1: Write the failing test. Create `src/features/graph-canvas/hooks/useExpandCollapse.test.ts`:

```ts
import { renderHook } from '@testing-library/react';
import cytoscape from 'cytoscape';
import type { MutableRefObject } from 'react';

import { useExpandCollapse } from './useExpandCollapse';

interface FakeApi {
  expandAll: jest.Mock;
  collapse: jest.Mock;
  getCollapsedChildren: jest.Mock;
}

function setup(): {
  cy: cytoscape.Core;
  cyRef: MutableRefObject<cytoscape.Core | null>;
  api: FakeApi;
  handlers: Record<string, (e: unknown) => void>;
} {
  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    elements: [
      { group: 'nodes', data: { id: 'cl', isCluster: true } },
      { group: 'nodes', data: { id: 'p1', parent: 'cl', kind: 'pod' } },
    ],
  });
  const api: FakeApi = { expandAll: jest.fn(), collapse: jest.fn(), getCollapsedChildren: jest.fn() };
  // expand-collapse is not registered in jest — stub the constructor.
  jest.spyOn(cy as unknown as { expandCollapse: () => unknown }, 'expandCollapse').mockReturnValue(api);
  const handlers: Record<string, (e: unknown) => void> = {};
  jest.spyOn(cy, 'on').mockImplementation(((evt: string, cb: (e: unknown) => void) => {
    handlers[evt] = cb;
    return cy;
  }) as never);
  const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;
  return { cy, cyRef, api, handlers };
}

describe('useExpandCollapse', () => {
  it('initialises the api with layoutBy:null/animate:false/cueEnabled:true when enabled + ready', () => {
    const { cy, cyRef } = setup();
    const apiRef = { current: null } as MutableRefObject<unknown>;
    const collapsedIdsRef = { current: new Set<string>() };
    const suppressRef = { current: false };
    renderHook(() =>
      useExpandCollapse({
        cyRef,
        enabled: true,
        isReady: true,
        apiRef: apiRef as never,
        collapsedIdsRef,
        suppressRef,
        onCollapsedChange: jest.fn(),
      })
    );
    expect(cy.expandCollapse).toHaveBeenCalledWith(
      expect.objectContaining({ layoutBy: null, animate: false, cueEnabled: true })
    );
    expect(apiRef.current).not.toBeNull();
  });

  it('does nothing when not ready', () => {
    const { cy, cyRef } = setup();
    const apiRef = { current: null } as MutableRefObject<unknown>;
    renderHook(() =>
      useExpandCollapse({
        cyRef,
        enabled: true,
        isReady: false,
        apiRef: apiRef as never,
        collapsedIdsRef: { current: new Set() },
        suppressRef: { current: false },
        onCollapsedChange: jest.fn(),
      })
    );
    expect(cy.expandCollapse).not.toHaveBeenCalled();
    expect(apiRef.current).toBeNull();
  });

  it('does nothing when not enabled even if ready (never touches the unregistered extension)', () => {
    const { cy, cyRef } = setup();
    const apiRef = { current: null } as MutableRefObject<unknown>;
    renderHook(() =>
      useExpandCollapse({
        cyRef,
        enabled: false,
        isReady: true,
        apiRef: apiRef as never,
        collapsedIdsRef: { current: new Set() },
        suppressRef: { current: false },
        onCollapsedChange: jest.fn(),
      })
    );
    expect(cy.expandCollapse).not.toHaveBeenCalled();
    expect(apiRef.current).toBeNull();
  });

  it('reports the full collapsed Set from cue events when not suppressed', () => {
    const { cy, cyRef, handlers } = setup();
    cy.getElementById('cl').addClass('cy-expand-collapse-collapsed-node');
    const onCollapsedChange = jest.fn();
    renderHook(() =>
      useExpandCollapse({
        cyRef,
        enabled: true,
        isReady: true,
        apiRef: { current: null } as never,
        collapsedIdsRef: { current: new Set() },
        suppressRef: { current: false },
        onCollapsedChange,
      })
    );
    handlers['expandcollapse.aftercollapse']?.({});
    expect(onCollapsedChange).toHaveBeenCalledWith(new Set(['cl']));
  });

  it('ignores cue events while suppressRef is true (programmatic guard)', () => {
    const { cy, cyRef, handlers } = setup();
    cy.getElementById('cl').addClass('cy-expand-collapse-collapsed-node');
    const onCollapsedChange = jest.fn();
    const suppressRef = { current: true };
    renderHook(() =>
      useExpandCollapse({
        cyRef,
        enabled: true,
        isReady: true,
        apiRef: { current: null } as never,
        collapsedIdsRef: { current: new Set() },
        suppressRef,
        onCollapsedChange,
      })
    );
    handlers['expandcollapse.aftercollapse']?.({});
    expect(onCollapsedChange).not.toHaveBeenCalled();
  });
});
```

- [ ] Step 2: Run test to verify it fails. Command: `npx jest src/features/graph-canvas/hooks/useExpandCollapse.test.ts`
      Expected: FAIL — module `./useExpandCollapse` does not exist.

- [ ] Step 3: Write minimal implementation. Create `src/features/graph-canvas/hooks/useExpandCollapse.ts`:

```ts
import type cytoscape from 'cytoscape';
import { useEffect } from 'react';

const CUE_EVENTS = 'expandcollapse.aftercollapse expandcollapse.afterexpand';
const COLLAPSED_NODE_CLASS = '.cy-expand-collapse-collapsed-node';

export interface UseExpandCollapseProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  // Gate: only init the extension when collapse is actually wired (GraphCanvas
  // sets this from collapseEnabled). When false the effect early-returns and
  // NEVER calls cy.expandCollapse — the backward-compatible no-collapse path
  // must never touch the (potentially unregistered) extension.
  enabled: boolean;
  isReady: boolean;
  // Owned by GraphCanvas. This hook WRITES the api; useCytoscape READS it.
  apiRef: React.MutableRefObject<cytoscape.ExpandCollapseApi | null>;
  // Mirror of KsgPanel.collapsedIds; read by useCytoscape, not by this hook.
  collapsedIdsRef: React.MutableRefObject<ReadonlySet<string>>;
  // Set true by useCytoscape during programmatic expand/collapse so cue events
  // fired by those operations do not loop back as user actions.
  suppressRef: React.MutableRefObject<boolean>;
  onCollapsedChange: (next: Set<string>) => void;
}

export function useExpandCollapse({
  cyRef,
  enabled,
  isReady,
  apiRef,
  suppressRef,
  onCollapsedChange,
}: UseExpandCollapseProps): void {
  useEffect(() => {
    const cy = cyRef.current;
    if (!enabled || !isReady || cy === null) {
      return;
    }
    apiRef.current = cy.expandCollapse({
      layoutBy: null,
      fisheye: false,
      animate: false,
      undoable: false,
      cueEnabled: true,
    });
    const handleCue = (): void => {
      // Programmatic apply in progress (useCytoscape) — ignore the echoed event.
      if (suppressRef.current) {
        return;
      }
      const next = new Set(cy.nodes(COLLAPSED_NODE_CLASS).map((n) => n.id()));
      onCollapsedChange(next);
    };
    cy.on(CUE_EVENTS, handleCue);
    return (): void => {
      cy.off(CUE_EVENTS, handleCue);
      apiRef.current = null;
    };
    // collapsedIdsRef/suppressRef are stable refs; re-bind only on instance swap
    // or when the enabled gate flips.
  }, [cyRef, enabled, isReady, apiRef, suppressRef, onCollapsedChange]);
}
```

- [ ] Step 4: Run test to verify it passes. Command: `npx jest src/features/graph-canvas/hooks/useExpandCollapse.test.ts` Expected: PASS. Then `npm run typecheck` Expected: PASS.

- [ ] Step 5: Commit. `git add src/features/graph-canvas/hooks/useExpandCollapse.ts src/features/graph-canvas/hooks/useExpandCollapse.test.ts` then `git commit -m "feat: add useExpandCollapse hook (api init + cue->onCollapsedChange w/ guard)"`

---

### Task 7: Make useCytoscape diff-patch effect collapse-aware

**Files:**

- Modify: `src/features/graph-canvas/hooks/useCytoscape.ts` (props interface lines 8-11; diff-patch effect lines 56-81)
- Test: `src/features/graph-canvas/hooks/useCytoscape.test.tsx` (Modify — file ALREADY EXISTS, Harness-based `.tsx`)

- [ ] Step 1: Write the failing tests. The file `src/features/graph-canvas/hooks/useCytoscape.test.tsx` ALREADY EXISTS (note the `.tsx` extension). It imports `{ render, act } from '@testing-library/react'`, defines a `Harness` component that calls `useCytoscape({ elements, stylesheet })`, and has 5 passing tests in `describe('useCytoscape', ...)`: `creates a cytoscape instance on mount and destroys it on unmount`, `init does not auto-run a layout extension (proves preset init layout)`, `applies element diffs without rebuilding the instance`, `swaps stylesheet without rebuilding the instance`, and `flips isReady to true once the instance exists ...`. Those existing tests pass `useCytoscape({ elements, stylesheet })` with NO collapse refs and must keep passing unchanged — the new props are all OPTIONAL, so when omitted the diff-patch effect behaves exactly as before. Do NOT create a parallel `.ts` file; APPEND a new sibling `describe('useCytoscape collapse-aware diff-patch', ...)` block to the SAME `.tsx` file (after the existing `describe('useCytoscape', ...)` block closes on line 118). The new block does NOT mount through the real DOM `Harness` (init needs a container); instead it drives the diff-patch effect over a pre-built headless `cy` via a small inline harness that injects `cyRef.current`. Add these imports to the top of the file if not already present: `import { renderHook } from '@testing-library/react';` and `import type { MutableRefObject } from 'react';`. Append:

```ts
const baseElements: cytoscape.ElementDefinition[] = [
  { group: 'nodes', data: { id: 'cl', isCluster: true } },
  { group: 'nodes', data: { id: 'p1', parent: 'cl', kind: 'pod' } },
];

describe('useCytoscape collapse-aware diff-patch', () => {
  it('expands all, patches, then re-collapses present parents and reports prune in order', () => {
    const cy = cytoscape({ headless: true, styleEnabled: true, elements: baseElements });
    const order: string[] = [];
    const states: boolean[] = [];
    const suppressRef = { current: false };
    const api = {
      // Record suppress state while expandAll runs, plus call order.
      expandAll: jest.fn(() => {
        states.push(suppressRef.current);
        order.push('expandAll');
      }),
      collapse: jest.fn(() => order.push('collapse')),
    } as unknown as cytoscape.ExpandCollapseApi;
    const apiRef = { current: api } as MutableRefObject<cytoscape.ExpandCollapseApi | null>;
    const collapsedIdsRef = { current: new Set(['cl']) } as MutableRefObject<ReadonlySet<string>>;
    const onCollapsedChange = jest.fn();

    // Drive the diff-patch effect directly over a pre-built headless cy: seed
    // cyRef.current before rerendering so the (container-less) init effect no-ops.
    const { result, rerender } = renderHook(
      (props: { elements: cytoscape.ElementDefinition[] }) =>
        useCytoscape({
          elements: props.elements,
          stylesheet: [],
          apiRef,
          collapsedIdsRef,
          suppressRef,
          onCollapsedChange,
        }),
      { initialProps: { elements: baseElements } }
    );
    result.current.cyRef.current = cy;
    rerender({ elements: [...baseElements, { group: 'nodes', data: { id: 'p2', parent: 'cl', kind: 'pod' } }] });

    expect(order[0]).toBe('expandAll');
    expect(order).toContain('collapse');
    expect(order.indexOf('expandAll')).toBeLessThan(order.indexOf('collapse'));
    // suppressRef was true while expandAll ran and false again afterward.
    expect(states[0]).toBe(true);
    expect(suppressRef.current).toBe(false);
    // 'cl' still present → not a prune → onCollapsedChange NOT called.
    expect(onCollapsedChange).not.toHaveBeenCalled();
    cy.destroy();
  });

  it('prunes removed parents and reports the shrunken Set', () => {
    const cy = cytoscape({ headless: true, styleEnabled: true, elements: baseElements });
    const api = { expandAll: jest.fn(), collapse: jest.fn() } as unknown as cytoscape.ExpandCollapseApi;
    const apiRef = { current: api } as MutableRefObject<cytoscape.ExpandCollapseApi | null>;
    const collapsedIdsRef = { current: new Set(['cl', 'ghost']) } as MutableRefObject<ReadonlySet<string>>;
    const onCollapsedChange = jest.fn();
    const { result, rerender } = renderHook(
      (props: { elements: cytoscape.ElementDefinition[] }) =>
        useCytoscape({
          elements: props.elements,
          stylesheet: [],
          apiRef,
          collapsedIdsRef,
          suppressRef: { current: false },
          onCollapsedChange,
        }),
      { initialProps: { elements: baseElements } }
    );
    result.current.cyRef.current = cy;
    rerender({ elements: [...baseElements, { group: 'nodes', data: { id: 'p2', parent: 'cl', kind: 'pod' } }] });
    // 'ghost' was never a present parent → reconcile=['cl'], size 1 !== desired 2 → prune reported.
    expect(onCollapsedChange).toHaveBeenCalledWith(new Set(['cl']));
    cy.destroy();
  });
});
```

(The backward-compatible "refs not injected" path is already covered by the existing `applies element diffs without rebuilding the instance` test, so no separate no-refs case is needed.)

- [ ] Step 2: Run tests to verify they fail. Command: `npx jest src/features/graph-canvas/hooks/useCytoscape.test.tsx`
      Expected: FAIL — `UseCytoscapeProps` does not accept `apiRef`/`collapsedIdsRef`/`suppressRef`/`onCollapsedChange` (TS error) and the effect is not collapse-aware. The 5 pre-existing tests must still be present and unaffected.

- [ ] Step 3a: Extend the props interface. In `src/features/graph-canvas/hooks/useCytoscape.ts`, replace the interface (lines 8-11) with:

```ts
export interface UseCytoscapeProps {
  elements: cytoscape.ElementDefinition[];
  stylesheet: CyStylesheet[];
  // Optional collapse integration (injected by GraphCanvas). When all undefined,
  // the diff-patch effect behaves exactly as before (backward compatible).
  apiRef?: React.MutableRefObject<cytoscape.ExpandCollapseApi | null>;
  collapsedIdsRef?: React.MutableRefObject<ReadonlySet<string>>;
  suppressRef?: React.MutableRefObject<boolean>;
  onCollapsedChange?: (next: Set<string>) => void;
}
```

- [ ] Step 3b: Destructure the new props in the signature (line 27):

```ts
export function useCytoscape({
  elements,
  stylesheet,
  apiRef,
  collapsedIdsRef,
  suppressRef,
  onCollapsedChange,
}: UseCytoscapeProps): UseCytoscapeReturn {
```

- [ ] Step 3c: Replace the diff-patch effect (lines 56-81) with the collapse-aware version. Add the import `import { reconcileCollapse } from '../sync/reconcileCollapse';` near the existing `import { diffElements }` on line 4. New effect body:

```ts
// Elements diff-and-patch (collapse-aware when refs are injected).
useEffect(() => {
  const cy = cyRef.current;
  if (cy === null) {
    return;
  }
  const api = apiRef?.current ?? null;

  // 1) Restore the real (fully expanded) graph so the diff compares against the
  //    true topology, not the collapsed view. No api / no collapse → no-op.
  if (api) {
    if (suppressRef) {
      suppressRef.current = true;
    }
    api.expandAll();
  }

  // 2) Diff real-vs-incoming and patch (remove → add → update), as before.
  const current = cy.elements().jsons() as cytoscape.ElementDefinition[];
  const diff = diffElements(current, elements);
  if (diff.toAdd.length > 0 || diff.toRemove.length > 0 || diff.toUpdate.length > 0) {
    cy.batch(() => {
      if (diff.toRemove.length > 0) {
        cy.remove(diff.toRemove.map((id) => `#${id}`).join(', '));
      }
      if (diff.toAdd.length > 0) {
        cy.add(diff.toAdd);
      }
      for (const el of diff.toUpdate) {
        const target = cy.getElementById(el.data.id ?? '');
        if (target.length > 0) {
          target.data(el.data);
        }
      }
    });
  }

  // 3) Re-apply collapse to the parents that still exist after the patch.
  if (api) {
    const present = new Set(cy.nodes(':parent').map((n) => n.id()));
    const desired = collapsedIdsRef?.current ?? new Set<string>();
    const recollapse = reconcileCollapse(desired, present);
    if (recollapse.length > 0) {
      api.collapse(cy.collection(recollapse.map((id) => cy.getElementById(id))));
    }
    if (suppressRef) {
      suppressRef.current = false;
    }
    // 4) Prune: parents removed by this update drop out of the reported set.
    if (recollapse.length !== desired.size) {
      onCollapsedChange?.(new Set(recollapse));
    }
  }
}, [elements]); // eslint-disable-line react-hooks/exhaustive-deps -- refs are stable; deps intentionally stay [elements] to keep a single update cycle
```

- [ ] Step 4: Run tests to verify they pass. Command: `npx jest src/features/graph-canvas/hooks/useCytoscape.test.tsx` Expected: PASS — all 7 tests green: the 5 pre-existing ones (incl. `creates a cytoscape instance on mount and destroys it on unmount` and `init does not auto-run a layout extension`) still pass because the new collapse props are optional and the no-refs path is unchanged, plus the 2 new collapse-aware cases. Then `npm run typecheck` Expected: PASS.

- [ ] Step 5: Commit. `git add src/features/graph-canvas/hooks/useCytoscape.ts src/features/graph-canvas/hooks/useCytoscape.test.tsx` then `git commit -m "feat: make useCytoscape diff-patch collapse-aware via injected refs"`

---

### Task 8: useElementFilter — meta-edge visibility pass

**Files:**

- Modify: `src/features/element-filter/hooks/useElementFilter.ts` (effect body lines 26-33)
- Test: `src/features/element-filter/hooks/useElementFilter.test.ts` (add a case)

- [ ] Step 1: Write the failing test. Add this `it` block to `src/features/element-filter/hooks/useElementFilter.test.ts`:

```ts
it('keeps a meta-edge visible by endpoint visibility, exempt from edge-type filter', () => {
  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    elements: [
      { group: 'nodes', data: { id: 'a', kind: 'pod' } },
      { group: 'nodes', data: { id: 'b', kind: 'pod' } },
      { group: 'nodes', data: { id: 'c', kind: 'service' } },
      // meta-edge has no edgeType and is NOT in `elements` → must not be hidden
      // by the edge-type pass; visibility follows its endpoints.
      { group: 'edges', data: { id: 'meta', source: 'a', target: 'b' } },
      { group: 'edges', data: { id: 'meta2', source: 'a', target: 'c' } },
    ],
  });
  cy.getElementById('meta').addClass('cy-expand-collapse-meta-edge');
  cy.getElementById('meta2').addClass('cy-expand-collapse-meta-edge');
  const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;

  renderHook(() =>
    useElementFilter({
      cyRef,
      // Only the real (non-meta) elements are passed in, as in production.
      elements: [
        { group: 'nodes', data: { id: 'a', kind: 'pod' } },
        { group: 'nodes', data: { id: 'b', kind: 'pod' } },
        { group: 'nodes', data: { id: 'c', kind: 'service' } },
      ] as cytoscape.ElementDefinition[],
      visibleKinds: ['pod'],
      visibleEdgeTypes: [],
    })
  );

  // a,b are pods → visible; c is service → hidden.
  expect(cy.getElementById('meta').style('visibility')).toBe('visible');
  // meta2 has a hidden endpoint (c) → hidden.
  expect(cy.getElementById('meta2').style('visibility')).toBe('hidden');
});
```

- [ ] Step 2: Run test to verify it fails. Command: `npx jest src/features/element-filter/hooks/useElementFilter.test.ts -t 'meta-edge'`
      Expected: FAIL — current loop sets every edge not in `visibleEdgeIds` to hidden, so `meta` would be hidden.

- [ ] Step 3: Write minimal implementation. Edit the effect body of `src/features/element-filter/hooks/useElementFilter.ts`. Replace lines 26-33 (the `cy.batch(...)` block) with:

```ts
cy.batch(() => {
  cy.nodes().forEach((node) => {
    node.style('visibility', visibleNodeIds.has(node.id()) ? 'visible' : 'hidden');
  });
  cy.edges().forEach((edge) => {
    edge.style('visibility', visibleEdgeIds.has(edge.id()) ? 'visible' : 'hidden');
  });
  // Meta-edges (synthesised by expand-collapse) are not in `elements`, so they
  // are absent from visibleEdgeIds and would be wrongly hidden above. They
  // aggregate multiple edge types, so they are exempt from edge-type filtering;
  // visibility follows their endpoints only. Run AFTER the node pass so the
  // endpoint visibility we read is already up to date.
  cy.edges('.cy-expand-collapse-meta-edge').forEach((edge) => {
    const visible = edge.source().style('visibility') === 'visible' && edge.target().style('visibility') === 'visible';
    edge.style('visibility', visible ? 'visible' : 'hidden');
  });
});
```

- [ ] Step 4: Run test to verify it passes. Command: `npx jest src/features/element-filter/hooks/useElementFilter.test.ts` Expected: PASS (both the original and new cases). Then `npm run typecheck` Expected: PASS.

- [ ] Step 5: Commit. `git add src/features/element-filter/hooks/useElementFilter.ts src/features/element-filter/hooks/useElementFilter.test.ts` then `git commit -m "feat: exempt expand-collapse meta-edges from edge-type filter"`

---

### Task 9: GraphCanvas wires expand-collapse refs + props

**Files:**

- Modify: `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.types.ts` (interface lines 7-17)
- Modify: `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx` (imports + body lines 1-41)

- [ ] Step 1: No standalone GraphCanvas test. A direct `render(<GraphCanvas layout="fcose" .../>)` would THROW at mount in the jest env for two independent reasons: (1) `useGraphLayout` calls `cy.layout({ name: 'fcose' }).run()` and fcose is NOT registered in jest → cytoscape throws "No such layout `fcose` found" (the existing `useCytoscape.test.tsx` documents exactly this), and (2) once `isReady` flips true, `useExpandCollapse` would call `cy.expandCollapse(...)`, which is `undefined` in jest (extension not registered) → "cy.expandCollapse is not a function". So the assertion `getByTestId('graph-canvas-root')` is never reached. The collapse-aware wiring is therefore verified WITHOUT a direct-render GraphCanvas test: the individual hooks are unit-tested in Tasks 6 (useExpandCollapse) and 7 (useCytoscape), and the end-to-end GraphCanvas prop wiring (`collapsedIds` in, `onCollapsedChange` out) is exercised in `KsgPanel.test.tsx` (Task 11), where `GraphCanvas` is already MOCKED so no real cytoscape mounts. Do NOT create `GraphCanvas.test.tsx`. (The `enabled` gate added below also guarantees `useExpandCollapse` never calls `cy.expandCollapse` on the backward-compatible no-collapse path, so even if a future test renders GraphCanvas without collapse props it cannot hit the unregistered extension — but it would still hit the fcose layout throw unless `layout="preset"` or the layout/extension hooks are mocked.)

- [ ] Step 2: Confirm there is no failing GraphCanvas test to run (this step is type-level only). The TS compile failure that drives this task is that `GraphCanvasProps` does not yet declare `collapsedIds`/`onCollapsedChange`; `KsgPanel.tsx` (Task 11) will fail `npm run typecheck` when it tries to pass those props until Step 3a lands. Verify via `npm run typecheck` after Task 11 wiring is drafted, or simply proceed to Step 3 here.

- [ ] Step 3a: Extend the types. Edit `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.types.ts` interface (lines 7-17) to add (after `selectedId?: string | null;`):

```ts
  // Compound-collapse integration. Optional → when omitted, GraphCanvas runs
  // without expand-collapse (backward compatible). collapsedIds is the set of
  // collapsed parent container ids; onCollapsedChange always receives the full
  // next Set (not a delta).
  collapsedIds?: Set<string>;
  onCollapsedChange?: (next: Set<string>) => void;
```

- [ ] Step 3b: Wire the hook + refs in `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx`. Add imports (after line 9 `import { useGraphLayout }`):

```ts
import { useExpandCollapse } from '../../hooks/useExpandCollapse';
```

Add `useRef` to the React import on line 4: `import React, { useEffect, useRef } from 'react';`. Add a cytoscape type import is already present (line 3). Replace the destructure (line 31) and the hook calls (lines 34-41) with:

```ts
const {
  elements,
  stylesheet,
  layout,
  visibleKinds,
  visibleEdgeTypes,
  onSelect,
  selectedId,
  collapsedIds,
  onCollapsedChange,
} = props;
const styles = useStyles2(getStyles);

// GraphCanvas owns the expand-collapse refs so useExpandCollapse (writer) and
// useCytoscape's diff-patch (reader) share one api/guard/desired-set.
const apiRef = useRef<cytoscape.ExpandCollapseApi | null>(null);
const suppressRef = useRef(false);
const collapsedIdsRef = useRef<ReadonlySet<string>>(collapsedIds ?? new Set());
useEffect(() => {
  collapsedIdsRef.current = collapsedIds ?? new Set();
}, [collapsedIds]);

// runToken bumps only when collapsed-id CONTENT changes, so layout reruns once
// per real collapse change (not on every render). Equality by size + sorted join.
const runToken = useCollapseRunToken(collapsedIds);

const collapseEnabled = onCollapsedChange !== undefined;

const { containerRef, cyRef, isReady } = useCytoscape({
  elements,
  stylesheet,
  ...(collapseEnabled ? { apiRef, collapsedIdsRef, suppressRef, onCollapsedChange } : {}),
});

useGraphLayout({ cyRef, name: layout, runToken });
useGraphResize({ cyRef, containerRef });
useElementFilter({ cyRef, elements, visibleKinds, visibleEdgeTypes });
useExpandCollapse({
  cyRef,
  // Gate: only init the extension when collapse is wired. On the no-collapse
  // path this stays false so the effect early-returns and never calls the
  // (potentially unregistered) cy.expandCollapse.
  enabled: collapseEnabled,
  isReady,
  apiRef,
  collapsedIdsRef,
  suppressRef,
  onCollapsedChange: onCollapsedChange ?? noop,
});
```

Add a `noop` constant and the `useCollapseRunToken` helper above the component (after `getStyles`, before `export function GraphCanvas`):

```ts
function noop(): void {
  // No-op collapsed-change sink for the backward-compatible (no-collapse) path.
}

// A stable numeric token that increments only when the collapsed-id set CONTENT
// changes (size + sorted membership), so useGraphLayout reruns once per real
// collapse change rather than on every parent render.
function useCollapseRunToken(collapsedIds: Set<string> | undefined): number {
  const tokenRef = useRef(0);
  const keyRef = useRef('');
  const key = collapsedIds === undefined ? '' : [...collapsedIds].sort().join('|');
  if (key !== keyRef.current) {
    keyRef.current = key;
    tokenRef.current += 1;
  }
  return tokenRef.current;
}
```

Note: `useExpandCollapse` only initialises the extension when `enabled` (i.e. `collapseEnabled === true`, which requires `onCollapsedChange` to be provided). On the no-collapse path `enabled` is false, so the hook's effect early-returns and `cy.expandCollapse` is NEVER called; the refs are still created but `useCytoscape` is not given them (the conditional spread below omits them), so `apiRef.current` stays `null` and the diff effect behaves exactly as before. `exactOptionalPropertyTypes` requires the conditional spread shown above so absent props are truly absent.

- [ ] Step 4: Verify. Run `npm run typecheck` Expected: PASS (`GraphCanvasProps` now declares `collapsedIds`/`onCollapsedChange`; the conditional spread satisfies `exactOptionalPropertyTypes`). Then `npx jest src/features/graph-canvas` Expected: PASS (no regressions in existing selectSingle / diff / useGraphLayout / useCytoscape / useExpandCollapse tests). There is intentionally NO `GraphCanvas.test.tsx` — a direct render would throw on the unregistered fcose layout (see Step 1); the wiring is covered by Tasks 6/7 (hooks) and Task 11 (`KsgPanel.test.tsx`, where GraphCanvas is mocked).

- [ ] Step 5: Commit. `git add src/features/graph-canvas/components/GraphCanvas/GraphCanvas.types.ts src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx` then `git commit -m "feat: wire expand-collapse refs + collapse props into GraphCanvas"`

---

### Task 10: ClusterLegend + NodeLegend collapse toggles (backward-compatible)

**Files:**

- Modify: `src/features/legend/components/ClusterLegend/ClusterLegend.tsx` (props lines 12-14; render lines 33-51)
- Modify: `src/features/legend/components/ClusterLegend/ClusterLegend.test.tsx`
- Modify: `src/features/legend/components/NodeLegend/NodeLegend.tsx` (signature line 24; render lines 27-42)
- Modify: `src/features/legend/components/NodeLegend/NodeLegend.test.tsx`

- [ ] Step 1: Write the failing tests. `@testing-library/user-event` is NOT installed (`node_modules/@testing-library` has only `dom/`, `jest-dom/`, `react/`), so use `fireEvent` from `@testing-library/react` (already a dependency and used by the existing legend tests). Ensure `fireEvent` is in the existing import from `@testing-library/react` at the top of each test file (e.g. `import { fireEvent, render, screen } from '@testing-library/react';`).
      Add to `src/features/legend/components/ClusterLegend/ClusterLegend.test.tsx`:

```ts
  it('renders a collapse toggle and fires onToggleCollapseAll', () => {
    const onToggle = jest.fn();
    render(
      <ClusterLegend
        clusters={[{ name: 'demo', color: '#14b8a6' }]}
        onToggleCollapseAll={onToggle}
        allCollapsed={false}
      />
    );
    fireEvent.click(screen.getByTestId('cluster-collapse-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders no toggle when onToggleCollapseAll is absent', () => {
    render(<ClusterLegend clusters={[{ name: 'demo', color: '#14b8a6' }]} />);
    expect(screen.queryByTestId('cluster-collapse-toggle')).not.toBeInTheDocument();
  });
```

Add to `src/features/legend/components/NodeLegend/NodeLegend.test.tsx`:

```ts
  it('renders a node collapse toggle and fires onToggleCollapseAll when showCollapseToggle', () => {
    const onToggle = jest.fn();
    render(<NodeLegend onToggleCollapseAll={onToggle} allCollapsed={false} showCollapseToggle />);
    fireEvent.click(screen.getByTestId('node-collapse-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders no node toggle when showCollapseToggle is false', () => {
    render(<NodeLegend onToggleCollapseAll={jest.fn()} allCollapsed={false} showCollapseToggle={false} />);
    expect(screen.queryByTestId('node-collapse-toggle')).not.toBeInTheDocument();
  });
```

- [ ] Step 2: Run tests to verify they fail. Command: `npx jest src/features/legend/components/ClusterLegend src/features/legend/components/NodeLegend`
      Expected: FAIL — toggle props/elements do not exist (TS error + missing test ids).

- [ ] Step 3a: Edit `src/features/legend/components/ClusterLegend/ClusterLegend.tsx`. Add `IconButton` import: `import { IconButton, useStyles2 } from '@grafana/ui';`. Add a header row style to `getStyles` (extend the returned object):

```ts
function getStyles(): { list: string; row: string; swatch: string; header: string } {
  return {
    ...legendListStyles(),
    swatch: css({
      width: 14,
      height: 14,
      flexShrink: 0,
      borderRadius: 3,
      borderStyle: 'solid',
      borderWidth: 1.5,
    }),
    header: css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }),
  };
}
```

Change the props interface (lines 12-14) to:

```ts
export interface ClusterLegendProps {
  clusters: readonly ClusterLegendEntry[];
  // Optional collapse toggle. When omitted, the legend stays purely presentational
  // (backward compatible). When provided, a small IconButton toggles all clusters.
  onToggleCollapseAll?: () => void;
  allCollapsed?: boolean;
}
```

Change the component to render the toggle in the header (replace the `<h4>Clusters</h4>` line area). New component body:

```ts
export function ClusterLegend({
  clusters,
  onToggleCollapseAll,
  allCollapsed = false,
}: Readonly<ClusterLegendProps>): React.JSX.Element | null {
  const styles = useStyles2(getStyles);
  if (clusters.length === 0) {
    return null;
  }
  return (
    <div data-testid="cluster-legend">
      <div className={styles.header}>
        <h4>Clusters</h4>
        {onToggleCollapseAll !== undefined && (
          <IconButton
            data-testid="cluster-collapse-toggle"
            name={allCollapsed ? 'angle-down' : 'angle-up'}
            aria-label={allCollapsed ? 'Expand all clusters' : 'Collapse all clusters'}
            tooltip={allCollapsed ? 'Expand all clusters' : 'Collapse all clusters'}
            size="sm"
            onClick={onToggleCollapseAll}
          />
        )}
      </div>
      <ul className={styles.list}>
        {clusters.map(({ name, color }) => (
          <li key={name} className={styles.row} data-testid={`cluster-legend-row-${name}`}>
            <span className={styles.swatch} style={{ backgroundColor: `${color}22`, borderColor: color }} />
            <span style={{ color }}>{name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] Step 3b: Edit `src/features/legend/components/NodeLegend/NodeLegend.tsx`. Add `IconButton` import: `import { IconButton, useStyles2 } from '@grafana/ui';`. Add header style to `getStyles`:

```ts
function getStyles(): { list: string; row: string; glyph: string; header: string } {
  return {
    ...legendListStyles(),
    glyph: css({
      display: 'inline-flex',
      width: 18,
      height: 18,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    }),
    header: css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }),
  };
}
```

Add a props interface and update the signature + render:

```ts
export interface NodeLegendProps {
  // Optional collapse toggle for k8s-node containers. showCollapseToggle gates
  // the button (set by KsgPanel from k8sNodeContainerIds.length > 0).
  onToggleCollapseAll?: () => void;
  allCollapsed?: boolean;
  showCollapseToggle?: boolean;
}

export function NodeLegend({
  onToggleCollapseAll,
  allCollapsed = false,
  showCollapseToggle = false,
}: Readonly<NodeLegendProps> = {}): React.JSX.Element {
  const styles = useStyles2(getStyles);
  const entries = Object.entries(SHAPE_BY_KIND);
  return (
    <div data-testid="node-legend">
      <div className={styles.header}>
        <h4>Node kinds</h4>
        {showCollapseToggle && onToggleCollapseAll !== undefined && (
          <IconButton
            data-testid="node-collapse-toggle"
            name={allCollapsed ? 'angle-down' : 'angle-up'}
            aria-label={allCollapsed ? 'Expand all nodes' : 'Collapse all nodes'}
            tooltip={allCollapsed ? 'Expand all nodes' : 'Collapse all nodes'}
            size="sm"
            onClick={onToggleCollapseAll}
          />
        )}
      </div>
      <ul className={styles.list}>
        {entries.map(([kind, shape]) => (
          <li key={kind} className={styles.row} data-testid={`node-legend-row-${kind}`}>
            <span className={styles.glyph}>
              <ShapeGlyph shape={shape} />
            </span>
            <span>{kind}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] Step 4: Run tests to verify they pass. Command: `npx jest src/features/legend/components/ClusterLegend src/features/legend/components/NodeLegend` Expected: PASS (new toggle cases + existing presentational cases). Then `npm run typecheck` Expected: PASS.

- [ ] Step 5: Commit. `git add src/features/legend/components/ClusterLegend src/features/legend/components/NodeLegend` then `git commit -m "feat: optional collapse toggles on ClusterLegend and NodeLegend"`

---

### Task 11: KsgPanel — collapsedIds state, derived container ids, handlers, legend reorder

**Files:**

- Modify: `src/panels/KsgPanel/KsgPanel.tsx` (imports line 5; add derivations after `clusterEntries` memo at line 114; legend render lines 139-146; GraphCanvas props lines 152-160)
- Modify: `src/panels/KsgPanel/KsgPanel.test.tsx`

- [ ] Step 1: Write the failing tests. Add to `src/panels/KsgPanel/KsgPanel.test.tsx`. First, change the GraphCanvas mock (lines 16-19) so the test can assert props it receives:

```ts
const graphCanvasSpy = jest.fn();
jest.mock('../../features/graph-canvas', () => {
  const actual = jest.requireActual<typeof import('../../features/graph-canvas')>('../../features/graph-canvas');
  return {
    ...actual,
    GraphCanvas: (props: { collapsedIds?: Set<string> }): null => {
      graphCanvasSpy(props);
      return null;
    },
  };
});
```

(Move `const graphCanvasSpy = jest.fn();` above the `jest.mock`. Reset it with `beforeEach(() => graphCanvasSpy.mockClear());` inside the describe.)
Add tests:

```ts
  it('collapses all clusters via the cluster legend toggle and passes collapsedIds to GraphCanvas', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const payload = {
      elements: {
        nodes: [
          { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
          { data: { id: 'demo/node-a', type: 'node', name: 'node-a', parent: 'cluster:demo' } },
          { data: { id: 'demo/p1', type: 'pod', name: 'web', parent: 'demo/node-a', labels: { cluster: 'demo' } } },
        ],
        edges: [],
      },
    };
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(payload)] }],
    };
    render(
      <KsgPanel
        {...buildProps({
          data: { state: LoadingState.Done, series: [frame], timeRange: stubTimeRange },
          options: { ...defaultOptions, showLegend: true },
        })}
      />
    );
    fireEvent.click(screen.getByTestId('cluster-collapse-toggle'));
    const lastCall = graphCanvasSpy.mock.calls.at(-1)?.[0] as { collapsedIds?: Set<string> };
    expect(lastCall.collapsedIds?.has('cluster:demo')).toBe(true);
  });

  it('collapses all k8s-node containers via the node legend toggle and passes collapsedIds to GraphCanvas', async () => {
    const { fireEvent } = await import('@testing-library/react');
    // Same fixture shape as the cluster case: demo/node-a (type node) is a parent
    // of the pod demo/p1, so k8sNodeContainerIds = ['demo/node-a'] and NodeLegend
    // renders showCollapseToggle (length > 0).
    const payload = {
      elements: {
        nodes: [
          { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
          { data: { id: 'demo/node-a', type: 'node', name: 'node-a', parent: 'cluster:demo' } },
          { data: { id: 'demo/p1', type: 'pod', name: 'web', parent: 'demo/node-a', labels: { cluster: 'demo' } } },
        ],
        edges: [],
      },
    };
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(payload)] }],
    };
    render(
      <KsgPanel
        {...buildProps({
          data: { state: LoadingState.Done, series: [frame], timeRange: stubTimeRange },
          options: { ...defaultOptions, showLegend: true },
        })}
      />
    );
    // The node toggle is gated on showCollapseToggle (k8sNodeContainerIds.length > 0).
    fireEvent.click(screen.getByTestId('node-collapse-toggle'));
    const lastCall = graphCanvasSpy.mock.calls.at(-1)?.[0] as { collapsedIds?: Set<string> };
    expect(lastCall.collapsedIds?.has('demo/node-a')).toBe(true);
  });

  it('does not render the cluster legend when there are no clusters', () => {
    render(<KsgPanel {...buildProps({ options: { ...defaultOptions, showLegend: true } })} />);
    expect(screen.queryByTestId('cluster-legend')).not.toBeInTheDocument();
  });
```

- [ ] Step 2: Run tests to verify they fail. Command: `npx jest src/panels/KsgPanel/KsgPanel.test.tsx`
      Expected: FAIL — no `cluster-collapse-toggle` is rendered (KsgPanel does not yet pass `onToggleCollapseAll`); `collapsedIds` not passed to GraphCanvas.

- [ ] Step 3a: Edit imports in `src/panels/KsgPanel/KsgPanel.tsx` line 5 to add `useCallback`:

```ts
import React, { useCallback, useMemo, useState } from 'react';
```

- [ ] Step 3b: Add collapse state + derived ids + handlers after the `clusterEntries` useMemo (after line 114, before the `if (seriesError ...)` guard on line 116):

```ts
// Collapsed parent-container ids. Lives here so the legend toggles (siblings of
// GraphCanvas) and the canvas share one source. GraphCanvas reports the full
// next Set via onCollapsedChange (cue events / data-refresh prune).
const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

// Cluster container ids = backend cluster containers (isCluster).
const clusterContainerIds = useMemo<string[]>(() => {
  const ids: string[] = [];
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.isCluster === true && typeof d.id === 'string') {
      ids.push(d.id);
    }
  }
  return ids;
}, [elements]);

// K8s node container ids = node-kind nodes that are a parent of some node.
const k8sNodeContainerIds = useMemo<string[]>(() => {
  const parentIds = new Set<string>();
  for (const el of elements) {
    if (el.group === 'nodes') {
      const p = (el.data as cytoscape.NodeDataDefinition).parent;
      if (typeof p === 'string') {
        parentIds.add(p);
      }
    }
  }
  const ids: string[] = [];
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.kind === 'node' && typeof d.id === 'string' && parentIds.has(d.id)) {
      ids.push(d.id);
    }
  }
  return ids;
}, [elements]);

const allClustersCollapsed = clusterContainerIds.length > 0 && clusterContainerIds.every((id) => collapsedIds.has(id));
const allNodesCollapsed = k8sNodeContainerIds.length > 0 && k8sNodeContainerIds.every((id) => collapsedIds.has(id));

const toggleClusters = useCallback(() => {
  setCollapsedIds((prev) => {
    const next = new Set(prev);
    const collapseThem = !clusterContainerIds.every((id) => prev.has(id));
    for (const id of clusterContainerIds) {
      if (collapseThem) {
        next.add(id);
      } else {
        next.delete(id);
      }
    }
    return next;
  });
}, [clusterContainerIds]);

const toggleNodes = useCallback(() => {
  setCollapsedIds((prev) => {
    const next = new Set(prev);
    const collapseThem = !k8sNodeContainerIds.every((id) => prev.has(id));
    for (const id of k8sNodeContainerIds) {
      if (collapseThem) {
        next.add(id);
      } else {
        next.delete(id);
      }
    }
    return next;
  });
}, [k8sNodeContainerIds]);
```

- [ ] Step 3c: Reorder the legend (Cluster → Node → Edge → Status) and wire toggles. Replace the `<aside ...>` block (lines 140-145) with:

```ts
        <aside className={styles.legendArea}>
          <ClusterLegend
            clusters={clusterEntries}
            onToggleCollapseAll={toggleClusters}
            allCollapsed={allClustersCollapsed}
          />
          <NodeLegend
            onToggleCollapseAll={toggleNodes}
            allCollapsed={allNodesCollapsed}
            showCollapseToggle={k8sNodeContainerIds.length > 0}
          />
          <EdgeLegend />
          <StatusLegend />
        </aside>
```

- [ ] Step 3d: Wire collapse props into `<GraphCanvas .../>` (lines 152-160) — add after `selectedId={selectedNodeId}`:

```ts
collapsedIds = { collapsedIds };
onCollapsedChange = { setCollapsedIds };
```

- [ ] Step 4: Run tests to verify they pass. Command: `npx jest src/panels/KsgPanel/KsgPanel.test.tsx` Expected: PASS (cluster toggle → `cluster:demo` in collapsedIds into GraphCanvas; node toggle → `demo/node-a` in collapsedIds into GraphCanvas; cluster legend absent with no clusters). Then `npm run typecheck` Expected: PASS. Then run the full suite: `npm run test:ci` Expected: PASS. Then `npm run lint` Expected: PASS (zero warnings).

- [ ] Step 5: Commit. `git add src/panels/KsgPanel/KsgPanel.tsx src/panels/KsgPanel/KsgPanel.test.tsx` then `git commit -m "feat: collapsedIds state, container-id derivation, legend reorder + toggle wiring"`
