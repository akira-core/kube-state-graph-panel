import { css } from '@emotion/css';
import { IconButton, useStyles2 } from '@grafana/ui';
import React from 'react';

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

// A titled list of colour swatches + names, with an optional collapse-all toggle.
// Shared by ClusterLegend and NodeContainerLegend so the swatch row + header
// layout lives in one place. Colours are translucent fill + solid border, so the
// swatch always matches its on-canvas translucent backplate. Renders nothing when
// there are no entries.
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
  if (entries.length === 0) {
    return null;
  }
  const collapseLabel = allCollapsed ? `Expand all ${collapseNoun}` : `Collapse all ${collapseNoun}`;
  return (
    <div data-testid={testId}>
      <div className={styles.header}>
        <h4>{title}</h4>
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
      <ul className={styles.list}>
        {entries.map(({ name, color }) => (
          <li key={name} className={styles.row} data-testid={`${rowTestIdPrefix}${name}`}>
            <span className={styles.swatch} style={{ backgroundColor: `${color}22`, borderColor: color }} />
            <span style={{ color }}>{name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
