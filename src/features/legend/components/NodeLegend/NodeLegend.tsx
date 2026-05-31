import { css } from '@emotion/css';
import { IconButton, useStyles2 } from '@grafana/ui';
import React from 'react';

import { SHAPE_BY_KIND } from '../../../../shared/constants/shapeByKind';
import { legendListStyles } from '../../legendStyles';
import { ShapeGlyph } from '../ShapeGlyph';

function getStyles(): { list: string; row: string; glyph: string; header: string } {
  return {
    ...legendListStyles(),
    // Fixed square box keeps every shape glyph equal width and height.
    glyph: css({
      display: 'inline-flex',
      width: 30,
      height: 30,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    }),
    header: css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }),
  };
}

export interface NodeLegendProps {
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
