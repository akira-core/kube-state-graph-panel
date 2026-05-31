import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import React from 'react';

import { STATUS_COLOR } from '../../../../shared/constants/colorByStatus';
import { legendListStyles } from '../../legendStyles';

function getStyles(): { list: string; row: string; swatch: string } {
  return {
    ...legendListStyles(),
    // Solid colour square; status colours are the point, keep them unmuted.
    swatch: css({
      width: 14,
      height: 14,
      flexShrink: 0,
      borderRadius: 3,
      borderStyle: 'solid',
      borderWidth: 1.5,
    }),
  };
}

// Status colours (normal/warning/critical) derive from STATUS_COLOR so the
// legend always matches the on-canvas borders. Text stays the theme colour —
// the yellow/green swatches are hard to read as text.
export function StatusLegend(): React.JSX.Element {
  const styles = useStyles2(getStyles);
  const entries = Object.entries(STATUS_COLOR);
  return (
    <div data-testid="status-legend">
      <h4>Status</h4>
      <ul className={styles.list}>
        {entries.map(([status, color]) => (
          <li key={status} className={styles.row} data-testid={`status-legend-row-${status}`}>
            <span
              className={styles.swatch}
              data-testid={`status-legend-swatch-${status}`}
              style={{ backgroundColor: color, borderColor: color }}
            />
            <span>{status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
