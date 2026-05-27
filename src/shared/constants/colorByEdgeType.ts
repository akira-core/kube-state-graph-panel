import type { EdgeType } from './types';

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface EdgeStyle {
  color: string;
  lineStyle: LineStyle;
}

export const COLOR_BY_EDGE_TYPE: Record<EdgeType, EdgeStyle> = {
  ownerReference: { color: '#3b82f6', lineStyle: 'solid' },
  serviceSelector: { color: '#10b981', lineStyle: 'dashed' },
  networkTraffic: { color: '#f97316', lineStyle: 'solid' },
  ingressBackend: { color: '#a855f7', lineStyle: 'dotted' },
};

export const FALLBACK_EDGE_STYLE: EdgeStyle = { color: '#94a3b8', lineStyle: 'solid' };
