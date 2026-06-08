import React from 'react';

import type { LineStyle } from '../../../../shared/constants/colorByEdgeType';

export interface EdgeGlyphProps {
  color: string;
  lineStyle: LineStyle;
  width?: number;
  height?: number;
}

// Mirrors the on-canvas edge: a line in the edge colour + line-style, capped by
// a filled arrowhead of the same colour — so the legend reads as a true key.
function dashArray(lineStyle: LineStyle): string | undefined {
  switch (lineStyle) {
    case 'dashed':
      return '5 3';
    case 'dotted':
      return '1.5 3';
    default:
      return undefined;
  }
}

export function EdgeGlyph({ color, lineStyle, width = 30, height = 12 }: Readonly<EdgeGlyphProps>): React.JSX.Element {
  const dash = dashArray(lineStyle);
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 30 12"
      role="img"
      aria-label={`${lineStyle} arrow`}
      data-testid="edge-glyph"
    >
      <line
        x1={1}
        y1={6}
        x2={22}
        y2={6}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        {...(dash !== undefined ? { strokeDasharray: dash } : {})}
      />
      <polygon points="22,2.5 29,6 22,9.5" fill={color} />
    </svg>
  );
}
