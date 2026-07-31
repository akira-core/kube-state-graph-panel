import React from 'react';

import type { LineStyle } from '../../../../shared/constants/colorByEdgeType';

export interface EdgeGlyphProps {
  color: string;
  lineStyle: LineStyle;
  width?: number;
  height?: number;
  // When true the line is capped by an arrowhead at BOTH ends (a ↔ glyph). Used by
  // the merged `pod ↔ pod/service` legend row, which stands in for a relationship
  // that runs in both directions (pod calls service, service selects pod).
  bidirectional?: boolean;
  // Overrides the default dash rhythm for `lineStyle: 'dashed'` as an SVG stroke-dasharray
  // (e.g. '8 8'). Lets a key mirror a canvas rule that sets its own line-dash-pattern —
  // the ingress-path dash — instead of drawing a rhythm nothing on canvas uses.
  dashPattern?: string;
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
  dashPattern,
}: Readonly<EdgeGlyphProps>): React.JSX.Element {
  const dash = lineStyle === 'dashed' && dashPattern !== undefined ? dashPattern : dashArray(lineStyle);
  // Leave room on the left for the second arrowhead when bidirectional.
  const lineStart = bidirectional ? 8 : 1;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 30 12"
      role="img"
      aria-label={`${lineStyle} ${bidirectional ? 'double arrow' : 'arrow'}`}
      data-testid="edge-glyph"
    >
      <line
        x1={lineStart}
        y1={6}
        x2={22}
        y2={6}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        {...(dash !== undefined ? { strokeDasharray: dash } : {})}
      />
      {bidirectional ? <polygon points="8,2.5 1,6 8,9.5" fill={color} /> : null}
      <polygon points="22,2.5 29,6 22,9.5" fill={color} />
    </svg>
  );
}
