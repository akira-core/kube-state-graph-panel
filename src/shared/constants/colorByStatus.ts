import type { NodeStatus } from './types';

// Single source of truth for status border colour. Hardcoded hex (not theme
// semantic) per product decision; the stylesheet and StatusLegend both derive
// from this map.
export const STATUS_COLOR: Record<NodeStatus, string> = {
  normal: '#73BF69', // green
  warning: '#F2CC0C', // yellow
  critical: '#E02F44', // red
};

// Aggregation default for an absent / unparseable status: a node that carries no
// status renders NO status border (data-driven — getStylesheet borders `node[status]`,
// not a kind whitelist; normalize omits the field when the backend sends none), but it
// still counts as `normal` when a parent rolls up its worst child status (worstStatus).
export const FALLBACK_STATUS: NodeStatus = 'normal';
