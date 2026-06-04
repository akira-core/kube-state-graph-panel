import type cytoscape from 'cytoscape';

import type { EdgeType } from '../../shared/constants/types';

import { computeSwitchTiers } from './computeSwitchTiers';

const sw = (id: string, extra: Record<string, unknown> = {}): cytoscape.ElementDefinition => ({
  group: 'nodes',
  data: { id, kind: 'switch', ...extra },
});

const k8sNode = (id: string): cytoscape.ElementDefinition => ({ group: 'nodes', data: { id, kind: 'node' } });

const edge = (id: string, source: string, target: string, edgeType: EdgeType): cytoscape.ElementDefinition => ({
  group: 'edges',
  data: { id, source, target, edgeType },
});

describe('computeSwitchTiers', () => {
  it('assigns tier 0 to a switch with a node-to-switch edge (access)', () => {
    const { tierById, maxTier } = computeSwitchTiers([
      k8sNode('n1'),
      sw('sw1'),
      edge('e1', 'n1', 'sw1', 'node-to-switch'),
    ]);
    expect(tierById.get('sw1')).toBe(0);
    expect(maxTier).toBe(0);
  });

  it('treats a switch as access regardless of node-to-switch edge orientation', () => {
    const { tierById } = computeSwitchTiers([
      k8sNode('n1'),
      sw('sw1'),
      // switch as the source endpoint instead of the target
      edge('e1', 'sw1', 'n1', 'node-to-switch'),
    ]);
    expect(tierById.get('sw1')).toBe(0);
  });

  it('increases tier by switch-to-switch BFS distance from the access set', () => {
    const { tierById, maxTier } = computeSwitchTiers([
      k8sNode('n1'),
      sw('sw0'),
      sw('sw1'),
      sw('sw2'),
      edge('e0', 'n1', 'sw0', 'node-to-switch'),
      edge('e1', 'sw0', 'sw1', 'switch-to-switch'),
      edge('e2', 'sw1', 'sw2', 'switch-to-switch'),
    ]);
    expect(tierById.get('sw0')).toBe(0);
    expect(tierById.get('sw1')).toBe(1);
    expect(tierById.get('sw2')).toBe(2);
    expect(maxTier).toBe(2);
  });

  it('defaults an isolated switch (no edges) to tier 0', () => {
    const { tierById } = computeSwitchTiers([sw('lonely')]);
    expect(tierById.get('lonely')).toBe(0);
  });

  it('terminates on a cyclic switch-to-switch graph with stable shortest-distance tiers', () => {
    const { tierById } = computeSwitchTiers([
      k8sNode('n1'),
      sw('a'),
      sw('b'),
      sw('c'),
      edge('e0', 'n1', 'a', 'node-to-switch'),
      edge('e1', 'a', 'b', 'switch-to-switch'),
      edge('e2', 'b', 'c', 'switch-to-switch'),
      edge('e3', 'c', 'a', 'switch-to-switch'), // back-edge closes the a-b-c-a cycle
    ]);
    // a is access (tier 0); b and c are each one hop from a (the back-edge makes c
    // adjacent to a), so BFS shortest distance puts both at tier 1 and terminates.
    expect(tierById.get('a')).toBe(0);
    expect(tierById.get('b')).toBe(1);
    expect(tierById.get('c')).toBe(1);
  });

  it('lets a numeric backend tier override the derived value', () => {
    const { tierById } = computeSwitchTiers([
      k8sNode('n1'),
      sw('sw0', { tier: 5 }),
      edge('e0', 'n1', 'sw0', 'node-to-switch'), // would derive tier 0
    ]);
    expect(tierById.get('sw0')).toBe(5);
  });

  it('reads a backend tier from a labels string when present', () => {
    const { tierById } = computeSwitchTiers([sw('sw0', { labels: { tier: '3' } })]);
    expect(tierById.get('sw0')).toBe(3);
  });

  it('returns an empty mapping and maxTier -1 when there are no switch nodes', () => {
    const { tierById, maxTier } = computeSwitchTiers([
      k8sNode('n1'),
      { group: 'nodes', data: { id: 'p1', kind: 'pod' } },
      edge('e0', 'p1', 'n1', 'pod-runs-on-node'),
    ]);
    expect(tierById.size).toBe(0);
    expect(maxTier).toBe(-1);
  });
});
