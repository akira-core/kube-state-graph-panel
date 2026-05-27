import React from 'react';

import { COLOR_BY_EDGE_TYPE } from '../../../../shared/constants/colorByEdgeType';

export function EdgeLegend(): React.JSX.Element {
  const entries = Object.entries(COLOR_BY_EDGE_TYPE);
  return (
    <div data-testid="edge-legend">
      <h4>Edge types</h4>
      <ul>
        {entries.map(([edgeType, { color, lineStyle }]) => (
          <li key={edgeType}>
            <span style={{ color, borderBottom: `2px ${lineStyle} ${color}`, paddingBottom: 2 }}>
              {edgeType}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
