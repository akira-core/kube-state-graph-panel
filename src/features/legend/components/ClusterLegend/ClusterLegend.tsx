import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import React from 'react';

import { legendListStyles } from '../../legendStyles';

export interface ClusterLegendEntry {
  name: string;
  color: string;
}

export interface ClusterLegendProps {
  clusters: readonly ClusterLegendEntry[];
}

function getStyles(): { list: string; row: string; swatch: string } {
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
  };
}

// Swatches for the clusters present in the data. Colours come from each backend
// cluster container node (data.clusterColor, assigned in normalize) so they
// always match the translucent on-canvas backplates. Renders nothing when empty.
export function ClusterLegend({ clusters }: Readonly<ClusterLegendProps>): React.JSX.Element | null {
  const styles = useStyles2(getStyles);
  if (clusters.length === 0) {
    return null;
  }
  return (
    <div data-testid="cluster-legend">
      <h4>Clusters</h4>
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
