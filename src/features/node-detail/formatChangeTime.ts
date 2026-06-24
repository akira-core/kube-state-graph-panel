import { dateTime, dateTimeFormat } from '@grafana/data';

/**
 * Format an RFC 3339 / ISO 8601 (UTC) Change Report diff timestamp for display in the
 * Current / Previous columns. Returns the localized absolute time in the panel's
 * `timeZone` (e.g. `2026-06-16 10:30:00`), or `undefined` when there is nothing valid
 * to show:
 *   - `iso` undefined / empty string → `undefined`.
 *   - `iso` not a parseable date → `undefined` (NEVER the `'Invalid date'` sentinel
 *     `dateTimeFormat` would otherwise return for a bad input — the cell renders a
 *     muted "—" off `undefined` instead).
 *
 * The raw ISO string is kept by the caller for the cell's `title`; this only produces
 * the human-facing value. `timeZone` is forwarded the same way `AlertTable` does
 * (omitted when undefined → Grafana's default zone).
 */
export function formatChangeTime(iso: string | undefined, timeZone?: string): string | undefined {
  if (iso === undefined || iso.length === 0) {
    return undefined;
  }
  if (!dateTime(iso).isValid()) {
    return undefined;
  }
  return dateTimeFormat(iso, timeZone !== undefined ? { timeZone } : {});
}
