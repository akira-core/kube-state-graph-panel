import type { AlertSeverity } from './types';

// Single source of truth for the KNOWN alert-severity badge colours. Distinct from
// STATUS_COLOR (node health): severity adds an 'info' tier and has no 'normal'.
// Hardcoded hex (not theme semantic) to match STATUS_COLOR's product decision;
// the alert table derives its badge colour from this map via severityColor().
export const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  info: '#5794F2', // blue
  warning: '#F2CC0C', // yellow
  critical: '#E02F44', // red
};

// The backend's alert `severity` is a free-form label — users define their own
// (e.g. 'page', 'P1', 'major'). Unknown labels keep their literal text and render
// in the CRITICAL colour: an uncategorised alert is treated as most-severe so it is
// never visually under-emphasised (fail-loud), rather than being silently dropped
// before it reaches the table.
export const FALLBACK_SEVERITY_COLOR = SEVERITY_COLOR.critical;

// Badge colour for any severity string: a known tier's colour, else the neutral
// fallback. Never throws, never blank — the single lookup the alert table uses.
export function severityColor(severity: string): string {
  return (SEVERITY_COLOR as Record<string, string>)[severity] ?? FALLBACK_SEVERITY_COLOR;
}
