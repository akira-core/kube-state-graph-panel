import type cytoscape from 'cytoscape';

import { computeVisibility } from './computeVisibility';

const node = (id: string, kind: string, extra: Record<string, unknown> = {}): cytoscape.ElementDefinition =>
  ({ group: 'nodes', data: { id, kind, ...extra } }) as unknown as cytoscape.ElementDefinition;
const cluster = (id: string): cytoscape.ElementDefinition =>
  ({ group: 'nodes', data: { id, isCluster: true } }) as unknown as cytoscape.ElementDefinition;
const edge = (id: string, source: string, target: string, edgeType: string): cytoscape.ElementDefinition =>
  ({ group: 'edges', data: { id, source, target, edgeType } }) as unknown as cytoscape.ElementDefinition;

describe('computeVisibility', () => {
  it('marks everything visible when all kinds + edgeTypes are enabled', () => {
    const elements = [node('a', 'pod'), node('b', 'service'), edge('e', 'a', 'b', 'service-selects-pod')];
    const { visibleNodeIds, visibleEdgeIds } = computeVisibility(elements, ['pod', 'service'], ['service-selects-pod']);
    expect([...visibleNodeIds]).toEqual(['a', 'b']);
    expect([...visibleEdgeIds]).toEqual(['e']);
  });

  it('hides nodes whose kind is filtered out', () => {
    // Survivors stay connected so the assertion isolates kind filtering, not orphan cascade.
    const elements = [node('a', 'pod'), node('b', 'pod'), node('s', 'service'), edge('e', 'a', 'b', 'pod-calls-pod')];
    const { visibleNodeIds } = computeVisibility(elements, ['pod'], ['pod-calls-pod']);
    expect([...visibleNodeIds]).toEqual(['a', 'b']);
  });

  it('never kind-filters the network fabric wrapper (stale saved visibleKinds)', () => {
    // visibleKinds saved before the `network` kind existed: the wrapper must stay
    // visible, or every switch nested inside it disappears with it.
    const elements = [
      node('net', 'network'),
      node('sw1', 'switch', { parent: 'net' }),
      node('sw2', 'switch', { parent: 'net' }),
      edge('e', 'sw1', 'sw2', 'switch-to-switch'),
    ];
    const { visibleNodeIds } = computeVisibility(elements, ['switch'], ['switch-to-switch']);
    expect([...visibleNodeIds].sort()).toEqual(['net', 'sw1', 'sw2']);
  });

  it('orphan-cascades the network wrapper away when its switches are filtered out', () => {
    const elements = [
      node('net', 'network'),
      node('sw1', 'switch', { parent: 'net' }),
      node('p', 'pod', {}),
      node('p2', 'pod', {}),
      edge('e', 'p', 'p2', 'pod-calls-pod'),
    ];
    const { visibleNodeIds } = computeVisibility(elements, ['pod'], ['pod-calls-pod']);
    expect(visibleNodeIds.has('net')).toBe(false);
    expect(visibleNodeIds.has('sw1')).toBe(false);
  });

  it('hides edges whose edgeType is filtered out', () => {
    const elements = [node('a', 'pod'), node('b', 'service'), edge('e', 'a', 'b', 'service-selects-pod')];
    const { visibleEdgeIds } = computeVisibility(elements, ['pod', 'service'], []);
    expect([...visibleEdgeIds]).toEqual([]);
  });

  it('auto-hides edges when an endpoint becomes hidden', () => {
    const elements = [node('a', 'pod'), node('b', 'service'), edge('e', 'a', 'b', 'service-selects-pod')];
    const { visibleEdgeIds } = computeVisibility(elements, ['pod'], ['service-selects-pod']);
    expect([...visibleEdgeIds]).toEqual([]);
  });

  it('returns empty sets for empty elements', () => {
    const { visibleNodeIds, visibleEdgeIds } = computeVisibility([], ['pod'], ['service-selects-pod']);
    expect(visibleNodeIds.size).toBe(0);
    expect(visibleEdgeIds.size).toBe(0);
  });

  it('keeps unknown kinds visible by default when connected', () => {
    // Unknown kind is not subject to kind filtering (forward-compat); it stays because it has a visible edge.
    const elements = [node('cr', 'CustomResource'), node('b', 'pod'), edge('e', 'cr', 'b', 'pod-calls-pod')];
    const { visibleNodeIds } = computeVisibility(elements, ['pod'], ['pod-calls-pod']);
    expect([...visibleNodeIds]).toEqual(['cr', 'b']);
  });

  it('keeps unknown edge TYPES visible by default (forward-compat, mirrors unknown kinds)', () => {
    // A backend-added edge type is outside the filter universe (the MultiSelect
    // only lists known types) — it must render in fallback style, not vanish, and
    // its endpoints must not be orphan-cascaded away.
    const elements = [node('a', 'pod'), node('b', 'pod'), edge('e', 'a', 'b', 'pod-uses-configmap')];
    const { visibleNodeIds, visibleEdgeIds } = computeVisibility(elements, ['pod'], ['pod-calls-pod']);
    expect([...visibleEdgeIds]).toEqual(['e']);
    expect([...visibleNodeIds]).toEqual(['a', 'b']);
  });

  describe('orphan cascade-hide', () => {
    it('hides a node that loses its only edge to edge-type filtering', () => {
      const elements = [
        node('a', 'pod'),
        node('b', 'pod'),
        node('v', 'pvc'),
        edge('e1', 'a', 'b', 'pod-calls-pod'),
        edge('e2', 'a', 'v', 'pod-mounts-pvc'),
      ];
      // Hide pod-mounts-pvc only: v loses its only edge and has no children -> orphan.
      const { visibleNodeIds, visibleEdgeIds } = computeVisibility(elements, ['pod', 'pvc'], ['pod-calls-pod']);
      expect([...visibleNodeIds]).toEqual(['a', 'b']);
      expect([...visibleEdgeIds]).toEqual(['e1']);
    });

    it('hides a standalone node with no edges and no children', () => {
      const elements = [node('a', 'pod')];
      const { visibleNodeIds } = computeVisibility(elements, ['pod'], []);
      expect([...visibleNodeIds]).toEqual([]);
    });

    it('keeps a container visible while it has a visible child', () => {
      // n is a compound parent with no incident edge; it stays because child p1 stays (p1 has a visible edge).
      const elements = [
        cluster('cl'),
        node('n', 'node', { parent: 'cl' }),
        node('p1', 'pod', { parent: 'n' }),
        node('ext', 'external', { parent: 'cl' }),
        edge('e', 'p1', 'ext', 'pod-calls-pod'),
      ];
      const { visibleNodeIds } = computeVisibility(elements, ['pod', 'node', 'external'], ['pod-calls-pod']);
      expect(visibleNodeIds.has('n')).toBe(true);
      expect(visibleNodeIds.has('cl')).toBe(true);
      expect(visibleNodeIds.has('p1')).toBe(true);
    });

    it('recursively hides an emptied node container and its cluster', () => {
      const elements = [
        cluster('cl'),
        node('n', 'node', { parent: 'cl' }),
        node('p1', 'pod', { parent: 'n' }),
        node('p2', 'pod', { parent: 'n' }),
        edge('e', 'p1', 'p2', 'pod-calls-pod'),
      ];
      // Hide the only edge: pods orphan -> node empties -> cluster empties.
      const { visibleNodeIds } = computeVisibility(elements, ['pod', 'node'], []);
      expect([...visibleNodeIds]).toEqual([]);
    });

    it('keeps a cluster visible when at least one descendant stays', () => {
      const elements = [
        cluster('cl'),
        node('n', 'node', { parent: 'cl' }),
        node('p1', 'pod', { parent: 'n' }),
        node('p2', 'pod', { parent: 'n' }),
        node('v', 'pvc', { parent: 'cl' }),
        edge('e', 'p1', 'v', 'pod-mounts-pvc'),
      ];
      // p1 & v stay (connected); p2 orphans; n stays (has p1); cl stays.
      const { visibleNodeIds } = computeVisibility(elements, ['pod', 'node', 'pvc'], ['pod-mounts-pvc']);
      expect(visibleNodeIds.has('cl')).toBe(true);
      expect(visibleNodeIds.has('n')).toBe(true);
      expect(visibleNodeIds.has('p1')).toBe(true);
      expect(visibleNodeIds.has('v')).toBe(true);
      expect(visibleNodeIds.has('p2')).toBe(false);
    });
  });
});
