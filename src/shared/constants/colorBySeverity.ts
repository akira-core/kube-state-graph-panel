import type { AlertSeverity } from './types';

// Single source of truth for alert-severity badge colour. Distinct from
// STATUS_COLOR (node health): severity adds an 'info' tier and has no 'normal'.
// Hardcoded hex (not theme semantic) to match STATUS_COLOR's product decision;
// the alert table derives its badge colour from this map.
export const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  info: '#5794F2', // blue
  warning: '#F2CC0C', // yellow
  critical: '#E02F44', // red
};

// Absent / unparseable severity defaults here (defensive: normalize already
// drops alerts whose severity is not in the enum).
export const FALLBACK_SEVERITY: AlertSeverity = 'info';
