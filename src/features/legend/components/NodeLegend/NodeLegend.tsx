import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import React from 'react';

import { SHAPE_BY_KIND } from '../../../../shared/constants/shapeByKind';
import { legendListStyles } from '../../legendStyles';
import { ShapeGlyph } from '../ShapeGlyph';

function getStyles(): { list: string; row: string; glyph: string } {
  return {
    ...legendListStyles(),
    // Fixed square box keeps every shape glyph equal width and height.
    glyph: css({
      display: 'inline-flex',
      width: 18,
      height: 18,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    }),
  };
}

export function NodeLegend(): React.JSX.Element {
  const styles = useStyles2(getStyles);
  const entries = Object.entries(SHAPE_BY_KIND);
  return (
    <div data-testid="node-legend">
      <h4>Node kinds</h4>
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
