import { useTheme2 } from '@grafana/ui';
import React from 'react';

import type { CytoscapeNodeShape } from '../../../../shared/constants/shapeByKind';

export interface ShapeGlyphProps {
  shape: CytoscapeNodeShape;
  /** Rendered px (the glyph is always square, so this is both width and height). */
  size?: number;
  fill?: string;
  stroke?: string;
}

interface ShapePaint {
  fill: string;
  stroke: string;
  strokeWidth: number;
}

/** Uniform scale for legend glyphs (~1.5× the base 16×16 geometry). */
const GLYPH_SCALE = 1.5;
const GLYPH_CENTER = 8;
// viewBox padding so scaled shapes (esp. star / octagon) are not clipped
const GLYPH_VIEW_MIN = -2;
const GLYPH_VIEW_SIZE = 20;

// Faithful 16×16 renditions of the cytoscape node shapes the panel uses, so the
// legend is a true key to the canvas. Every glyph is drawn inside the same
// 16-unit square and rendered in a fixed-size box, so all glyphs are equal
// width and height regardless of a shape's natural aspect ratio.
function renderShape(shape: CytoscapeNodeShape, paint: ShapePaint): React.JSX.Element {
  const common = {
    fill: paint.fill,
    stroke: paint.stroke,
    strokeWidth: paint.strokeWidth,
    strokeLinejoin: 'round' as const,
  };
  switch (shape) {
    case 'ellipse':
      return <circle cx={8} cy={8} r={6} {...common} />;
    case 'rectangle':
      return <rect x={2} y={2} width={12} height={12} {...common} />;
    case 'cut-rectangle':
      return <polygon points="4,2 12,2 14,4 14,12 12,14 4,14 2,12 2,4" {...common} />;
    case 'pentagon':
      return <polygon points="8,1.8 13.9,6.1 11.6,13 4.4,13 2.1,6.1" {...common} />;
    case 'hexagon':
      // Flat-top (pointy left/right), matching cytoscape's built-in `hexagon`
      // node orientation so the legend reads as a true key to the canvas.
      return <polygon points="4.9,2.63 11.1,2.63 14.2,8 11.1,13.37 4.9,13.37 1.8,8" {...common} />;
    case 'octagon':
      return <polygon points="5.5,2 10.5,2 14,5.5 14,10.5 10.5,14 5.5,14 2,10.5 2,5.5" {...common} />;
    case 'diamond':
      return <polygon points="8,2 14,8 8,14 2,8" {...common} />;
    case 'tag':
      return <polygon points="2,2 11,2 14,8 11,14 2,14" {...common} />;
    case 'star':
      return (
        <polygon
          points="8,1.5 9.53,5.9 14.18,5.99 10.47,8.8 11.82,13.26 8,10.6 4.18,13.26 5.53,8.8 1.82,5.99 6.47,5.9"
          {...common}
        />
      );
    case 'barrel':
      return <path d="M4,2.6 C2.4,6 2.4,10 4,13.4 L12,13.4 C13.6,10 13.6,6 12,2.6 Z" {...common} />;
    default:
      return <rect x={2} y={2} width={12} height={12} rx={2.5} ry={2.5} {...common} />;
  }
}

export function ShapeGlyph({ shape, size = 27, fill, stroke }: Readonly<ShapeGlyphProps>): React.JSX.Element {
  const theme = useTheme2();
  // Match the on-canvas node look: neutral fill + medium border.
  const colors = theme.colors as unknown as {
    background: { secondary: string };
    border: { medium: string };
  };
  const paint: ShapePaint = {
    fill: fill ?? colors.background.secondary,
    stroke: stroke ?? colors.border.medium,
    strokeWidth: 1.4,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${GLYPH_VIEW_MIN} ${GLYPH_VIEW_MIN} ${GLYPH_VIEW_SIZE} ${GLYPH_VIEW_SIZE}`}
      role="img"
      aria-label={`${shape} shape`}
      data-testid={`shape-glyph-${shape}`}
    >
      <g
        transform={`translate(${GLYPH_CENTER} ${GLYPH_CENTER}) scale(${GLYPH_SCALE}) translate(${-GLYPH_CENTER} ${-GLYPH_CENTER})`}
      >
        {renderShape(shape, paint)}
      </g>
    </svg>
  );
}
