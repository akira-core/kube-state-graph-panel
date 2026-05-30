import type { EdgeType } from './types';

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface EdgeStyle {
  color: string;
  lineStyle: LineStyle;
}

// Single source of truth: keyed by upstream edge `data.type`.
export const COLOR_BY_EDGE_TYPE: Record<EdgeType, EdgeStyle> = {
  'pod-runs-on-node': { color: '#3b82f6', lineStyle: 'solid' },
  'pod-mounts-pvc': { color: '#a855f7', lineStyle: 'dotted' },
  'pod-calls-pod': { color: '#f97316', lineStyle: 'solid' },
  'service-selects-pod': { color: '#10b981', lineStyle: 'dashed' },
};

export const FALLBACK_EDGE_STYLE: EdgeStyle = { color: '#94a3b8', lineStyle: 'solid' };
