import { FALLBACK_STATUS, STATUS_BORDER_KINDS, STATUS_COLOR } from './colorByStatus';

describe('colorByStatus', () => {
  it('maps each status to its hardcoded hex colour', () => {
    expect(STATUS_COLOR).toEqual({
      normal: '#73BF69',
      warning: '#F2CC0C',
      critical: '#E02F44',
    });
  });

  it('defaults absent/unknown status to normal', () => {
    expect(FALLBACK_STATUS).toBe('normal');
  });

  it('renders a status border only for pod/node/pvc', () => {
    expect([...STATUS_BORDER_KINDS]).toEqual(['pod', 'node', 'pvc']);
  });
});
