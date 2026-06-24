import { CLUSTER_PALETTE } from './clusterPalette';
import { NAMESPACE_PALETTE, colorForNamespace } from './namespacePalette';

// The STATUS colours a namespace tint MUST never reuse (so it is never read as health).
const STATUS_HEXES = ['#73BF69', '#F2CC0C', '#E02F44'];

describe('namespacePalette', () => {
  it('colorForNamespace is deterministic per name and returns a palette member', () => {
    expect(colorForNamespace('shop')).toBe(colorForNamespace('shop'));
    expect(NAMESPACE_PALETTE as readonly string[]).toContain(colorForNamespace('shop'));
    expect(NAMESPACE_PALETTE as readonly string[]).toContain(colorForNamespace('payments'));
  });

  it('returns a stable palette member for the empty string (no throw)', () => {
    expect(NAMESPACE_PALETTE as readonly string[]).toContain(colorForNamespace(''));
    expect(colorForNamespace('')).toBe(colorForNamespace(''));
  });

  it('avoids the STATUS colours (never confused with node health)', () => {
    const lower = NAMESPACE_PALETTE.map((c) => c.toLowerCase());
    for (const status of STATUS_HEXES) {
      expect(lower).not.toContain(status.toLowerCase());
    }
  });

  it('does not collide with CLUSTER_PALETTE (nested boxes must stay distinguishable)', () => {
    const cluster = new Set(CLUSTER_PALETTE.map((c) => c.toLowerCase()));
    for (const c of NAMESPACE_PALETTE) {
      expect(cluster.has(c.toLowerCase())).toBe(false);
    }
  });
});
