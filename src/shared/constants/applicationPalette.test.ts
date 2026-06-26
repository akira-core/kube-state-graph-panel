import { APPLICATION_PALETTE, colorForApplication } from './applicationPalette';
import { CLUSTER_PALETTE } from './clusterPalette';
import { NAMESPACE_PALETTE } from './namespacePalette';

// The STATUS colours an application tint MUST never reuse (so it is never read as health).
const STATUS_HEXES = ['#73BF69', '#F2CC0C', '#E02F44'];

describe('applicationPalette', () => {
  it('colorForApplication is deterministic per name and returns a palette member', () => {
    expect(colorForApplication('checkout')).toBe(colorForApplication('checkout'));
    expect(APPLICATION_PALETTE as readonly string[]).toContain(colorForApplication('checkout'));
    expect(APPLICATION_PALETTE as readonly string[]).toContain(colorForApplication('mongo'));
  });

  it('returns a stable palette member for the empty string (no throw)', () => {
    expect(APPLICATION_PALETTE as readonly string[]).toContain(colorForApplication(''));
    expect(colorForApplication('')).toBe(colorForApplication(''));
  });

  it('avoids the STATUS colours (never confused with node health)', () => {
    const lower = APPLICATION_PALETTE.map((c) => c.toLowerCase());
    for (const status of STATUS_HEXES) {
      expect(lower).not.toContain(status.toLowerCase());
    }
  });

  it('does not collide with CLUSTER_PALETTE or NAMESPACE_PALETTE (nested boxes must stay distinguishable)', () => {
    const outer = new Set([...CLUSTER_PALETTE, ...NAMESPACE_PALETTE].map((c) => c.toLowerCase()));
    for (const c of APPLICATION_PALETTE) {
      expect(outer.has(c.toLowerCase())).toBe(false);
    }
  });
});
