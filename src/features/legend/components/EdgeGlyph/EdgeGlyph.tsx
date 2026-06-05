import React from 'react';

import type { LineStyle } from '../../../../shared/constants/colorByEdgeType';

export interface EdgeGlyphProps {
  color: string;
  lineStyle: LineStyle;
  width?: number;
  height?: number;
  // When true, draw an arrowhead at BOTH ends — used by the merged `pod ↔ svc`
  // legend row, which stands in for the pod-calls-service + service-selects-pod
  // pair (both drawn on canvas, same colour, opposite directions).
  bidirectional?: boolean;
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

export function EdgeGlyph({
  color,
  lineStyle,
  width = 30,
  height = 12,
  bidirectional = false,
}: Readonly<EdgeGlyphProps>): React.JSX.Element {
  const dash = dashArray(lineStyle);
  // The line is inset on the left to make room for the second arrowhead when
  // bidirectional; otherwise it runs from the edge.
  const lineX1 = bidirectional ? 8 : 1;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 30 12"
      role="img"
      aria-label={`${bidirectional ? 'bidirectional' : lineStyle} arrow`}
      data-testid="edge-glyph"
    >
      <line
        x1={lineX1}
        y1={6}
        x2={22}
        y2={6}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        {...(dash !== undefined ? { strokeDasharray: dash } : {})}
      />
      {bidirectional && <polygon points="8,2.5 1,6 8,9.5" fill={color} data-testid="edge-glyph-arrow-start" />}
      <polygon points="22,2.5 29,6 22,9.5" fill={color} />
    </svg>
  );
}
