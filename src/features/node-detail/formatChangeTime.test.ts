import { formatChangeTime } from './formatChangeTime';

describe('formatChangeTime', () => {
  it('formats a valid RFC 3339 (UTC) string to a localized absolute time in the given timeZone', () => {
    const out = formatChangeTime('2026-06-16T10:30:00Z', 'utc');
    expect(out).toBeDefined();
    expect(out).toContain('2026-06-16');
    expect(out).toContain('10:30');
  });

  it('respects the timeZone (a non-UTC zone shifts the rendered value)', () => {
    const utc = formatChangeTime('2026-06-16T10:30:00Z', 'utc');
    const ny = formatChangeTime('2026-06-16T10:30:00Z', 'America/New_York');
    expect(ny).toBeDefined();
    expect(ny).not.toEqual(utc);
  });

  it('returns undefined for undefined / empty input', () => {
    expect(formatChangeTime(undefined, 'utc')).toBeUndefined();
    expect(formatChangeTime('', 'utc')).toBeUndefined();
  });

  it('returns undefined (never "Invalid date") for an unparseable string', () => {
    const out = formatChangeTime('not-a-date', 'utc');
    expect(out).toBeUndefined();
  });

  it('formats without a timeZone (Grafana default zone) without throwing', () => {
    const out = formatChangeTime('2026-06-16T10:30:00Z');
    expect(out).toBeDefined();
    expect(typeof out).toBe('string');
    expect((out ?? '').length).toBeGreaterThan(0);
  });
});
