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
  const caretIcon = folded ? 'angle-right' : 'angle-down';
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
            <Icon name={caretIcon} size="sm" />
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
