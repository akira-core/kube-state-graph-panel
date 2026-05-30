import type { NodeKind } from './types';

export type CytoscapeNodeShape =
  | 'ellipse'
  | 'round-rectangle'
  | 'rectangle'
  | 'hexagon'
  | 'diamond'
  | 'octagon'
  | 'pentagon'
  | 'barrel'
  | 'tag'
  | 'cut-rectangle'
  | 'star';

// Single source of truth: keyed by upstream node `data.type`.
// stylesheet, legend, and the element filter's KNOWN_KINDS all derive from this.
// Shapes are chosen to be mutually distinct at small sizes — no two many-sided
// polygons that read alike (pentagon=node vs star=external vs diamond=others).
export const SHAPE_BY_KIND: Record<NodeKind, CytoscapeNodeShape> = {
  pod: 'ellipse',
  service: 'round-rectangle',
  node: 'pentagon',
  pvc: 'barrel',
  others: 'diamond',
  external: 'star',
};

export const FALLBACK_SHAPE: CytoscapeNodeShape = 'round-rectangle';
