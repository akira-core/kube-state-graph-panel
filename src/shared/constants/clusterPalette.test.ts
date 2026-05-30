import { CLUSTER_PALETTE, colorForCluster } from './clusterPalette';

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
