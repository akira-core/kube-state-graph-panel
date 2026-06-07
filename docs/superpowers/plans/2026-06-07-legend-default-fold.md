# Legend default-fold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three swatch legend sections (Clusters / Nodes-or-Controllers / Storage classes) collapsible and folded by default, so the legend rail stays compact on large clusters.

**Architecture:** All behaviour lives in the shared `SwatchLegend` component. It gains a local `useState(true)` fold flag; the section header becomes a WAI-ARIA accordion (`<h4>` wrapping a `<button aria-expanded>`) whose title always shows the entry count `Title (N)`; the swatch `<ul>` renders only when expanded. The three wrappers (`ClusterLegend`, `NodeContainerLegend`, `StorageClassLegend`) inherit this with zero changes. The pre-existing collapse-all `IconButton` (which collapses on-canvas compound nodes) stays in the header as an independent sibling control.

**Tech Stack:** React 18 + TypeScript (strict), `@grafana/ui` (`Icon`, `IconButton`, `useStyles2`), `@emotion/css`, Jest + `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-06-07-legend-default-fold-design.md`

---

## File Structure

Only one production file changes; the rest are test migrations. The production change breaks three wrapper tests (rows now hidden by default; heading name now includes the count), so production + all four test files ship in **one atomic commit** to keep every commit green.

- **Modify (production):** `src/features/legend/components/SwatchLegend/SwatchLegend.tsx`
  - Sole owner of fold state, the accordion header, the count, and conditional `<ul>` rendering.
- **Modify (tests):**
  - `src/features/legend/components/SwatchLegend/SwatchLegend.test.tsx` — new fold tests + migrate existing row/heading assertions.
  - `src/features/legend/components/ClusterLegend/ClusterLegend.test.tsx` — expand before asserting rows.
  - `src/features/legend/components/NodeContainerLegend/NodeContainerLegend.test.tsx` — expand before asserting rows; heading name → regex.
  - `src/features/legend/components/StorageClassLegend/StorageClassLegend.test.tsx` — expand before asserting rows; heading name → regex.
- **Unchanged:** `ClusterLegend.tsx`, `NodeContainerLegend.tsx`, `StorageClassLegend.tsx`, `legendStyles.ts`, `KsgPanel.tsx`.

---

## Task 1: Add default-fold to `SwatchLegend` (atomic, TDD)

**Files:**

- Modify: `src/features/legend/components/SwatchLegend/SwatchLegend.tsx`
- Test: `src/features/legend/components/SwatchLegend/SwatchLegend.test.tsx`
- Test: `src/features/legend/components/ClusterLegend/ClusterLegend.test.tsx`
- Test: `src/features/legend/components/NodeContainerLegend/NodeContainerLegend.test.tsx`
- Test: `src/features/legend/components/StorageClassLegend/StorageClassLegend.test.tsx`

- [ ] **Step 1: Rewrite `SwatchLegend.test.tsx` with fold behaviour**

Replace the entire file contents with:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

import { SwatchLegend } from './SwatchLegend';

const COMMON = { testId: 'demo-legend', rowTestIdPrefix: 'demo-legend-row-' } as const;
const TWO = [
  { name: 'worker-0', color: '#0ea5e9' },
  { name: 'worker-1', color: '#0ea5e9' },
];

describe('SwatchLegend', () => {
  it('renders nothing when there are no entries', () => {
    const { container } = render(<SwatchLegend title="Demo" entries={[]} {...COMMON} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is folded by default: no rows, count in title, collapsed caret', () => {
    render(<SwatchLegend title="Nodes" entries={TWO} {...COMMON} />);
    const legend = screen.getByTestId('demo-legend');
    expect(within(legend).queryAllByRole('listitem')).toHaveLength(0);
    expect(within(legend).getByRole('heading', { name: /Nodes/ })).toBeInTheDocument();
    const toggle = within(legend).getByTestId('demo-legend-fold-toggle');
    expect(toggle).toHaveTextContent('Nodes (2)');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands on toggle to reveal one row per entry, then re-folds', () => {
    render(<SwatchLegend title="Nodes" entries={TWO} {...COMMON} />);
    const legend = screen.getByTestId('demo-legend');
    const toggle = within(legend).getByTestId('demo-legend-fold-toggle');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(legend).getAllByRole('listitem')).toHaveLength(2);
    expect(within(legend).getByTestId('demo-legend-row-worker-0')).toBeInTheDocument();
    expect(within(legend).getByText('worker-1')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(legend).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('shows the entry count in the title whether folded or expanded', () => {
    render(<SwatchLegend title="Nodes" entries={TWO} {...COMMON} />);
    const toggle = screen.getByTestId('demo-legend-fold-toggle');
    expect(toggle).toHaveTextContent('Nodes (2)');
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('Nodes (2)');
  });

  it('fires onToggleCollapseAll without changing fold state', () => {
    const onToggle = jest.fn();
    render(
      <SwatchLegend
        title="Nodes"
        entries={[{ name: 'worker-0', color: '#0ea5e9' }]}
        onToggleCollapseAll={onToggle}
        collapseToggleTestId="node-collapse-toggle"
        collapseNoun="nodes"
        {...COMMON}
      />
    );
    const foldToggle = screen.getByTestId('demo-legend-fold-toggle');
    expect(foldToggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByTestId('node-collapse-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    // Collapse-all is independent of fold: the section stays folded.
    expect(foldToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByLabelText('Collapse all nodes')).toBeInTheDocument();
  });

  it('renders no collapse toggle when onToggleCollapseAll is absent', () => {
    render(<SwatchLegend title="Nodes" entries={[{ name: 'worker-0', color: '#0ea5e9' }]} {...COMMON} />);
    expect(screen.queryByTestId('node-collapse-toggle')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Migrate `ClusterLegend.test.tsx`**

Replace the `'renders a swatch and name per cluster'` test (only that test) so it expands first. The full updated test block:

```tsx
it('renders a swatch and name per cluster', () => {
  render(
    <ClusterLegend
      clusters={[
        { name: 'demo', color: '#14b8a6' },
        { name: 'edge', color: '#ec4899' },
      ]}
    />
  );
  const legend = screen.getByTestId('cluster-legend');
  fireEvent.click(within(legend).getByTestId('cluster-legend-fold-toggle'));
  expect(within(legend).getAllByRole('listitem')).toHaveLength(2);
  expect(within(legend).getByText('demo')).toBeInTheDocument();
  expect(within(legend).getByText('edge')).toBeInTheDocument();
});
```

(`fireEvent`, `within`, `screen` are already imported in this file. The other three tests in the file are unchanged.)

- [ ] **Step 3: Migrate `NodeContainerLegend.test.tsx`**

Replace the `'renders a swatch per node container under a "Nodes" heading'` test and the `'uses a custom title heading when provided (controller mode)'` test:

```tsx
it('renders a swatch per node container under a "Nodes" heading', () => {
  render(
    <NodeContainerLegend
      nodes={[
        { name: 'worker-0', color: '#0ea5e9' },
        { name: 'worker-2', color: '#8b5cf6' },
      ]}
    />
  );
  const legend = screen.getByTestId('node-container-legend');
  expect(within(legend).getByRole('heading', { name: /Nodes/ })).toBeInTheDocument();
  fireEvent.click(within(legend).getByTestId('node-container-legend-fold-toggle'));
  expect(within(legend).getAllByRole('listitem')).toHaveLength(2);
  expect(within(legend).getByTestId('node-container-legend-row-worker-0')).toBeInTheDocument();
  expect(within(legend).getByText('worker-2')).toBeInTheDocument();
});
```

```tsx
it('uses a custom title heading when provided (controller mode)', () => {
  render(
    <NodeContainerLegend nodes={[{ name: 'web', color: '#0ea5e9' }]} title="Controllers" collapseNoun="controllers" />
  );
  const legend = screen.getByTestId('node-container-legend');
  expect(within(legend).getByRole('heading', { name: /Controllers/ })).toBeInTheDocument();
});
```

(The `'renders nothing'` and `'fires the collapse toggle'` tests are unchanged.)

- [ ] **Step 4: Migrate `StorageClassLegend.test.tsx`**

Replace the `'renders a swatch per storage class under a "Storage classes" heading'` test:

```tsx
it('renders a swatch per storage class under a "Storage classes" heading', () => {
  render(
    <StorageClassLegend
      storageClasses={[
        { name: 'fast-ssd', color: '#0ea5e9' },
        { name: 'standard', color: '#8b5cf6' },
      ]}
    />
  );
  const legend = screen.getByTestId('storageclass-legend');
  expect(within(legend).getByRole('heading', { name: /Storage classes/ })).toBeInTheDocument();
  fireEvent.click(within(legend).getByTestId('storageclass-legend-fold-toggle'));
  expect(within(legend).getAllByRole('listitem')).toHaveLength(2);
  expect(within(legend).getByTestId('storageclass-legend-row-fast-ssd')).toBeInTheDocument();
  expect(within(legend).getByText('standard')).toBeInTheDocument();
});
```

(The `'renders nothing'` and `'fires the collapse toggle'` tests are unchanged.)

- [ ] **Step 5: Run the legend test suite to verify it FAILS**

Run: `npx jest src/features/legend --silent 2>&1 | tail -30`
Expected: FAIL. The new/migrated tests fail because the current `SwatchLegend` always renders rows, has no `*-fold-toggle` button, and its heading has no count. (`renders nothing` and collapse-all tests still pass.)

- [ ] **Step 6: Implement the fold in `SwatchLegend.tsx`**

Replace the entire file contents with:

```tsx
import { css } from '@emotion/css';
import { Icon, IconButton, useStyles2 } from '@grafana/ui';
import React, { useState } from 'react';

import { legendListStyles } from '../../legendStyles';

export interface SwatchLegendEntry {
  name: string;
  color: string;
}

export interface SwatchLegendProps {
  // Section heading (e.g. 'Clusters' / 'Nodes').
  title: string;
  // Wrapper test id (e.g. 'cluster-legend' / 'node-container-legend').
  testId: string;
  // Row test ids are `${rowTestIdPrefix}${name}`.
  rowTestIdPrefix: string;
  entries: readonly SwatchLegendEntry[];
  onToggleCollapseAll?: () => void;
  allCollapsed?: boolean;
  // Collapse toggle test id (e.g. 'cluster-collapse-toggle' / 'node-collapse-toggle').
  collapseToggleTestId?: string;
  // Plural noun for the collapse aria-label / tooltip (e.g. 'clusters' / 'nodes').
  collapseNoun?: string;
}

function getStyles(): { list: string; row: string; swatch: string; header: string; foldToggle: string } {
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
    // The fold control is styled to read as the surrounding <h4> heading text: no
    // button chrome, inherits the heading font/colour, just a clickable caret + title.
    foldToggle: css({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      margin: 0,
      padding: 0,
      border: 'none',
      background: 'none',
      font: 'inherit',
      color: 'inherit',
      cursor: 'pointer',
    }),
  };
}

// A titled list of colour swatches + names, FOLDED BY DEFAULT, with an optional
// collapse-all toggle. Shared by ClusterLegend / NodeContainerLegend /
// StorageClassLegend so the swatch row + accordion header live in one place. The
// header is a WAI-ARIA accordion: an <h4> wrapping a button that toggles the list
// and always shows the entry count `Title (N)`. Colours are translucent fill +
// solid border, matching each on-canvas translucent backplate. Renders nothing
// when there are no entries.
//
// The fold control (this component's local state) is DISTINCT from the collapse-all
// IconButton, which collapses the on-canvas compound nodes via onToggleCollapseAll;
// the two are sibling controls and never affect each other.
export function SwatchLegend({
  title,
  testId,
  rowTestIdPrefix,
  entries,
  onToggleCollapseAll,
  allCollapsed = false,
  collapseToggleTestId,
  collapseNoun = 'items',
}: Readonly<SwatchLegendProps>): React.JSX.Element | null {
  const styles = useStyles2(getStyles);
  // Folded by default so the legend rail stays compact on large clusters. Ephemeral:
  // a user expand persists while mounted but resets to folded on reload/remount.
  const [folded, setFolded] = useState(true);
  if (entries.length === 0) {
    return null;
  }
  const collapseLabel = allCollapsed ? `Expand all ${collapseNoun}` : `Collapse all ${collapseNoun}`;
  return (
    <div data-testid={testId}>
      <div className={styles.header}>
        <h4>
          <button
            type="button"
            className={styles.foldToggle}
            aria-expanded={!folded}
            data-testid={`${testId}-fold-toggle`}
            onClick={() => setFolded((f) => !f)}
          >
            <Icon name={folded ? 'angle-right' : 'angle-down'} size="sm" />
            {`${title} (${entries.length})`}
          </button>
        </h4>
        {onToggleCollapseAll !== undefined && (
          <IconButton
            data-testid={collapseToggleTestId}
            name={allCollapsed ? 'plus-circle' : 'minus-circle'}
            aria-label={collapseLabel}
            tooltip={collapseLabel}
            size="sm"
            onClick={onToggleCollapseAll}
          />
        )}
      </div>
      {!folded && (
        <ul className={styles.list}>
          {entries.map(({ name, color }) => (
            <li key={name} className={styles.row} data-testid={`${rowTestIdPrefix}${name}`}>
              <span className={styles.swatch} style={{ backgroundColor: `${color}22`, borderColor: color }} />
              <span style={{ color }}>{name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Run the legend test suite to verify it PASSES**

Run: `npx jest src/features/legend --silent 2>&1 | tail -20`
Expected: PASS — all legend tests green (SwatchLegend, ClusterLegend, NodeContainerLegend, StorageClassLegend, plus the untouched NodeLegend / EdgeLegend / StatusLegend / IconGlyph / EdgeGlyph / LayoutModeControl).

- [ ] **Step 8: Typecheck + lint the changed files**

Run: `npm run typecheck && npx eslint src/features/legend/components/SwatchLegend src/features/legend/components/ClusterLegend src/features/legend/components/NodeContainerLegend src/features/legend/components/StorageClassLegend --max-warnings=0`
Expected: no type errors, no lint warnings. (If `Icon`'s `name` union rejects the ternary, widen via `const caret = folded ? 'angle-right' : 'angle-down';` typed as `IconName` from `@grafana/data` — but the inline literal union should satisfy it.)

- [ ] **Step 9: Commit (atomic — production + all four test files together)**

```bash
git add src/features/legend/components/SwatchLegend/SwatchLegend.tsx \
  src/features/legend/components/SwatchLegend/SwatchLegend.test.tsx \
  src/features/legend/components/ClusterLegend/ClusterLegend.test.tsx \
  src/features/legend/components/NodeContainerLegend/NodeContainerLegend.test.tsx \
  src/features/legend/components/StorageClassLegend/StorageClassLegend.test.tsx
git commit -m "feat(legend): fold swatch sections by default with entry count"
```

---

## Task 2: Full quality gate + visual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full CI test suite**

Run: `npm run test:ci`
Expected: PASS — all suites green (no regressions outside the legend feature).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: webpack build succeeds, `dist/` updated.

- [ ] **Step 3: Visual verification in the demo (manual)**

Run: `docker compose up -d` (showcase only — no backend needed for the legend), then open `http://localhost:3000/d/ksg-switch-demo`.
Confirm:

- Clusters / Nodes (or Controllers) / Storage classes sections each load **folded**, showing `Title (N)` with a right-pointing caret and **no** swatch rows.
- Clicking a section header expands it (caret points down, rows appear); the count stays visible; clicking again re-folds.
- The existing collapse-all icon still collapses/expands the on-canvas compound nodes and does **not** toggle the legend fold.
- Node kinds / Edge types / Status sections are unchanged (always visible).

- [ ] **Step 4: Update the spec status**

Edit `docs/superpowers/specs/2026-06-07-legend-default-fold-design.md`: change the header `**Status:**` line to `Implemented 2026-06-07`. Commit:

```bash
git add docs/superpowers/specs/2026-06-07-legend-default-fold-design.md
git commit -m "docs: mark legend default-fold spec implemented"
```

---

## Self-Review

- **Spec coverage:** Default-folded (Step 6 `useState(true)`), always-shown count (`Title (N)` in Step 6 + asserted Steps 1/3/4), click-header affordance + caret (`<button>` + `Icon`), three-section scope (production change is in shared `SwatchLegend`; bounded sections untouched), independent collapse-all (sibling control, asserted in Step 1's `fires onToggleCollapseAll without changing fold state`), accessibility (`<h4>` + `<button aria-expanded>`), no panel/e2e impact (Task 2 Step 1 covers it). All spec decisions map to a step.
- **Placeholder scan:** none — every code/test step shows full contents; commands have expected output.
- **Type consistency:** fold-toggle test id `${testId}-fold-toggle` is used identically in production (Step 6) and every test (`demo-legend-fold-toggle`, `cluster-legend-fold-toggle`, `node-container-legend-fold-toggle`, `storageclass-legend-fold-toggle`). `setFolded` updater form matches across steps. `getStyles` return type includes the new `foldToggle` key.
