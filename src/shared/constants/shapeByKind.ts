import type { NodeKind } from './types';

export type CytoscapeNodeShape =
  | 'ellipse'
  | 'round-rectangle'
  | 'rectangle'
  | 'hexagon'
  | 'diamond'
  | 'octagon'
  | 'barrel'
  | 'tag'
  | 'cut-rectangle'
  | 'star';

// Single source of truth: keyed by upstream node `data.type`.
// stylesheet, legend, and the element filter's KNOWN_KINDS all derive from this.
export const SHAPE_BY_KIND: Record<NodeKind, CytoscapeNodeShape> = {
  pod: 'ellipse',
  service: 'round-rectangle',
  node: 'octagon',
  pvc: 'barrel',
  others: 'diamond',
  external: 'hexagon',
};

export const FALLBACK_SHAPE: CytoscapeNodeShape = 'round-rectangle';
