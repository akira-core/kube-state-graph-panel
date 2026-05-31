import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import React from 'react';

import { COLOR_BY_EDGE_TYPE } from '../../../../shared/constants/colorByEdgeType';
import { legendListStyles } from '../../legendStyles';
import { EdgeGlyph } from '../EdgeGlyph';

function getStyles(): { list: string; row: string; glyph: string; note: string } {
  return {
    ...legendListStyles(),
    glyph: css({ display: 'inline-flex', width: 30, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }),
    note: css({ marginTop: 4, fontSize: 11, opacity: 0.7, lineHeight: 1.3 }),
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
      {/* pod-runs-on-node has no glyph: the backend expresses it as compound
          nesting, not an edge (design D31). Explain the nesting so the absent
          edge type does not read as missing data. */}
      <p className={styles.note} data-testid="edge-legend-nesting-note">
        Nesting: a pod sits inside its node box (pod-runs-on-node); nodes, services and PVCs sit inside their cluster
        box.
      </p>
    </div>
  );
}
