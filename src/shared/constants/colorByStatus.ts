import type { NodeKind, NodeStatus } from './types';

// Single source of truth for status border colour. Hardcoded hex (not theme
// semantic) per product decision; the stylesheet and StatusLegend both derive
// from this map.
export const STATUS_COLOR: Record<NodeStatus, string> = {
  normal: '#73BF69', // green
  warning: '#F2CC0C', // yellow
  critical: '#E02F44', // red
};

// Absent / unparseable status defaults here.
export const FALLBACK_STATUS: NodeStatus = 'normal';

// Only these kinds render a status border (product decision). Other kinds keep
// the theme's neutral border. K8s `node` is included even though it is a
// compound parent — see getStylesheet selector ordering.
export const STATUS_BORDER_KINDS: readonly NodeKind[] = ['pod', 'node', 'pvc'];
