import { FALLBACK_SEVERITY_COLOR, SEVERITY_COLOR, severityColor } from './colorBySeverity';

describe('severityColor', () => {
  it('maps each known tier to its badge colour', () => {
    expect(severityColor('info')).toBe(SEVERITY_COLOR.info);
    expect(severityColor('warning')).toBe(SEVERITY_COLOR.warning);
    expect(severityColor('critical')).toBe(SEVERITY_COLOR.critical);
  });

  it('falls back to the critical colour for unknown / custom / empty labels (fail-loud, no data lost)', () => {
    expect(severityColor('fatal')).toBe(FALLBACK_SEVERITY_COLOR);
    expect(severityColor('P1')).toBe(FALLBACK_SEVERITY_COLOR);
    expect(severityColor('normal')).toBe(FALLBACK_SEVERITY_COLOR);
    expect(severityColor('')).toBe(FALLBACK_SEVERITY_COLOR);
  });

  it('treats the fallback AS the critical tier (unknown severity reads as most-severe)', () => {
    expect(FALLBACK_SEVERITY_COLOR).toBe(SEVERITY_COLOR.critical);
  });
});
