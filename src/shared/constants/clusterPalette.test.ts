import { CLUSTER_PALETTE, colorForCluster } from './clusterPalette';
import { STATUS_COLOR } from './colorByStatus';

describe('CLUSTER_PALETTE', () => {
  it('shares no colour with the status palette (a cluster accent must never read as node health)', () => {
    const statusColors = new Set(Object.values(STATUS_COLOR).map((c) => c.toLowerCase()));
    for (const color of CLUSTER_PALETTE) {
      expect(statusColors.has(color.toLowerCase())).toBe(false);
    }
  });
});

describe('colorForCluster', () => {
  it('is deterministic for a given name', () => {
    expect(colorForCluster('demo')).toBe(colorForCluster('demo'));
  });

  it('stays stable when other clusters appear or disappear (hashed, not positional)', () => {
    const beta = colorForCluster('beta');
    // Asking about a different cluster must not change beta's colour — the bug a
    // positional-index scheme would have: dropping 'alpha' reshuffles 'beta'.
    void colorForCluster('alpha');
    void colorForCluster('gamma');
    expect(colorForCluster('beta')).toBe(beta);
  });

  it('always returns a colour from the palette', () => {
    for (const name of ['demo', 'edge', 'prod-eu-west-1', '', 'x']) {
      expect(CLUSTER_PALETTE).toContain(colorForCluster(name));
    }
  });
});
