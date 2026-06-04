import { buildSwitchConstraints } from './buildSwitchConstraints';
import type { SwitchTierResult } from './types';

const tiers = (entries: Array<[string, number]>): SwitchTierResult => {
  const tierById = new Map(entries);
  let maxTier = -1;
  for (const [, tier] of entries) {
    if (tier > maxTier) {
      maxTier = tier;
    }
  }
  return { tierById, maxTier };
};

describe('buildSwitchConstraints', () => {
  it('returns null for fewer than two switches', () => {
    expect(buildSwitchConstraints(tiers([]))).toBeNull();
    expect(buildSwitchConstraints(tiers([['only', 0]]))).toBeNull();
  });

  it('aligns a single tier of multiple switches into one row with no relative placement', () => {
    const result = buildSwitchConstraints(
      tiers([
        ['a', 0],
        ['b', 0],
      ])
    );
    expect(result).not.toBeNull();
    expect(result?.alignmentConstraint?.horizontal).toEqual([['a', 'b']]);
    expect(result?.relativePlacementConstraint).toBeUndefined();
  });

  it('creates one alignment group per tier that has two or more members', () => {
    const result = buildSwitchConstraints(
      tiers([
        ['a', 0],
        ['b', 0],
        ['c', 1], // singleton tier — not an alignment group
        ['d', 2],
        ['e', 2],
      ])
    );
    expect(result?.alignmentConstraint?.horizontal).toEqual([
      ['a', 'b'],
      ['d', 'e'],
    ]);
  });

  it('stacks adjacent tiers with tier k above tier k+1 via a representative each', () => {
    const result = buildSwitchConstraints(
      tiers([
        ['a', 0],
        ['b', 0],
        ['c', 1],
        ['d', 2],
        ['e', 2],
      ])
    );
    const rel = result?.relativePlacementConstraint ?? [];
    expect(rel).toHaveLength(2);
    expect(rel[0]).toMatchObject({ top: 'a', bottom: 'c' });
    expect(rel[1]).toMatchObject({ top: 'c', bottom: 'd' });
    // every gap is the same positive separation
    expect(rel.every((r) => typeof r.gap === 'number' && r.gap > 0)).toBe(true);
    expect(new Set(rel.map((r) => r.gap)).size).toBe(1);
  });

  it('stacks a pure chain (singleton tiers) without any alignment group', () => {
    const result = buildSwitchConstraints(
      tiers([
        ['a', 0],
        ['b', 1],
        ['c', 2],
      ])
    );
    expect(result).not.toBeNull();
    expect(result?.alignmentConstraint).toBeUndefined();
    expect(result?.relativePlacementConstraint).toEqual([
      expect.objectContaining({ top: 'a', bottom: 'b' }),
      expect.objectContaining({ top: 'b', bottom: 'c' }),
    ]);
  });

  it('references only the supplied switch ids', () => {
    const ids = new Set(['a', 'b', 'c', 'd', 'e']);
    const result = buildSwitchConstraints(
      tiers([
        ['a', 0],
        ['b', 0],
        ['c', 1],
        ['d', 2],
        ['e', 2],
      ])
    );
    const referenced = [
      ...(result?.alignmentConstraint?.horizontal.flat() ?? []),
      ...(result?.relativePlacementConstraint?.flatMap((r) => [r.top, r.bottom]) ?? []),
    ];
    for (const id of referenced) {
      expect(ids.has(id)).toBe(true);
    }
  });
});
