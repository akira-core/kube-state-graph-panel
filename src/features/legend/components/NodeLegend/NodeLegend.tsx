import React from 'react';

import { SHAPE_BY_KIND } from '../../../../shared/constants/shapeByKind';

export function NodeLegend(): React.JSX.Element {
  const entries = Object.entries(SHAPE_BY_KIND);
  return (
    <div data-testid="node-legend">
      <h4>Node kinds</h4>
      <ul>
        {entries.map(([kind, shape]) => (
          <li key={kind}>
            <span data-shape={shape}>{shape}</span>
            <span> {kind}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
