// Display formatting for the backend's RED edge measurements (`data.metrics`).
//
// Pure and dependency-free by design (design D4). `@grafana/data`'s value formatters were
// the obvious alternative, but none of them implement the rule this module exists for:
// the backend rounds to 6 significant digits and a wide query window legitimately yields
// `rate: 3.86e-7`, so any formatter that can round a non-zero value down to `0` renders
// live traffic as "no traffic". Everything here is built around never doing that.

// Significant digits kept before the value is stringified. Three is enough to read a rate
// or a latency at a glance and few enough that the key column stays narrow.
const SIGNIFICANT_DIGITS = 3;

// Above this many milliseconds the duration reads better in seconds: `2.5 s` is grasped at
// a glance where `2500 ms` invites a decimal-place miscount.
const SECONDS_THRESHOLD_MS = 1000;

const MS_PER_SECOND = 1000;

// Percent conversion for a fraction-valued rate. The multiplication and the `%` suffix are
// applied together (see formatErrorRate) so the two can never drift apart.
const RATIO_TO_PERCENT = 100;

/**
 * Renders a number at up to 3 significant digits with trailing zeros stripped.
 *
 * Magnitude is never lost: rounding happens through `toPrecision`, and the result is
 * stringified by `Number`, which falls back to exponent notation for magnitudes too small
 * to write out in full. A non-zero input therefore never formats as `"0"` — the property
 * holds by construction rather than by a special case.
 */
export function formatSignificant(value: number): string {
  return String(Number(value.toPrecision(SIGNIFICANT_DIGITS)));
}

/** Requests per second, e.g. `5 req/s`. */
export function formatRate(rate: number): string {
  return `${formatSignificant(rate)} req/s`;
}

/**
 * Failed fraction rendered as a percentage, e.g. `0.2` → `20%`.
 *
 * `0` renders as `0%` and means "measured, no failures" — the *unmeasured* case is an
 * absent field, which the caller renders as no row at all rather than as `0%`.
 */
export function formatErrorRate(errorRate: number): string {
  return `${formatSignificant(errorRate * RATIO_TO_PERCENT)}%`;
}

/** Server-observed duration, in milliseconds below 1000 and seconds at or above it. */
export function formatDurationMs(durationMs: number): string {
  if (durationMs >= SECONDS_THRESHOLD_MS) {
    return `${formatSignificant(durationMs / MS_PER_SECOND)} s`;
  }
  return `${formatSignificant(durationMs)} ms`;
}
