import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import React from 'react';

import { COLOR_BY_EDGE_TYPE } from '../../../../shared/constants/colorByEdgeType';
import { legendListStyles } from '../../legendStyles';
import { EdgeGlyph } from '../EdgeGlyph';

function getStyles(): { list: string; row: string; glyph: string } {
  return {
    ...legendListStyles(),
    glyph: css({ display: 'inline-flex', width: 30, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }),
  };
}

export function EdgeLegend(): React.JSX.Element {
  const styles = useStyles2(getStyles);
  const entries = Object.entries(COLOR_BY_EDGE_TYPE);
  return (
    <div data-testid="edge-legend">
      <h4>Edge types</h4>
      <ul className={styles.list}>
        {entries.map(([edgeType, { color, lineStyle }]) => (
          <li key={edgeType} className={styles.row} data-testid={`edge-legend-row-${edgeType}`}>
            <span className={styles.glyph}>
              <EdgeGlyph color={color} lineStyle={lineStyle} />
            </span>
            <span style={{ color }}>{edgeType}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
