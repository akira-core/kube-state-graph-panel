import type cytoscape from 'cytoscape';

import { resolveSelectedNode } from './KsgPanel';

type El = cytoscape.ElementDefinition;
const node = (id: string, kind: string, extra: Record<string, unknown> = {}): El =>
  ({ group: 'nodes', data: { id, label: id, kind, ...extra } }) as unknown as El;

describe('resolveSelectedNode', () => {
  const elements = [
    node('p1', 'pod'),
    node('cl', 'node', { isCluster: true }),
    // StorageClass group: a grouping container that DOES carry a kind but is still
    // excluded from the detail panel via the isStorageClass flag (mirrors normalize).
    {
      group: 'nodes',
      data: { id: 'sc', label: 'fast-ssd', kind: 'storageclass', isStorageClass: true },
    } as unknown as El,
  ];

  it('returns the node detail when the selected node is visible', () => {
    const result = resolveSelectedNode(elements, 'p1', new Set(['p1']));
    // An owner-less pod still resolves a queryTarget (itself) for the detail-URL flow.
    expect(result).toEqual({ id: 'p1', label: 'p1', kind: 'pod', queryTarget: { kind: 'pod', name: 'p1' } });
  });

  it('returns null when nothing is selected', () => {
    expect(resolveSelectedNode(elements, null, new Set(['p1']))).toBeNull();
  });

  it('returns null when the selected node is hidden (not in the visible set)', () => {
    // e.g. orphan cascade or kind filter hid the node after it was selected.
    expect(resolveSelectedNode(elements, 'p1', new Set())).toBeNull();
  });

  it('returns null for a cluster container even if visible', () => {
    expect(resolveSelectedNode(elements, 'cl', new Set(['cl']))).toBeNull();
  });

  it('returns null for a storageclass group container even if visible (pure grouping box, no detail)', () => {
    expect(resolveSelectedNode(elements, 'sc', new Set(['sc']))).toBeNull();
  });

  describe('application / containers / queryTarget passthrough (detail-URL flow)', () => {
    const containers = [{ name: 'app', image: 'repo/app:1.2' }];

    it('carries application and containers onto the detail data', () => {
      const els = [node('p1', 'pod', { application: 'checkout', containers })];
      const result = resolveSelectedNode(els, 'p1', new Set(['p1']));
      expect(result?.application).toBe('checkout');
      expect(result?.containers).toEqual(containers);
    });

    it("resolves a pod's queryTarget from its owner (kind lowercased)", () => {
      const els = [node('p1', 'pod', { owner: { kind: 'StatefulSet', name: 'mongo' } })];
      expect(resolveSelectedNode(els, 'p1', new Set(['p1']))?.queryTarget).toEqual({
        kind: 'statefulset',
        name: 'mongo',
      });
    });

    it('resolves a standalone (owner-less) pod queryTarget from its own kind/name', () => {
      const els = [node('p1', 'pod')];
      expect(resolveSelectedNode(els, 'p1', new Set(['p1']))?.queryTarget).toEqual({ kind: 'pod', name: 'p1' });
    });

    it('resolves a controller queryTarget from itself', () => {
      const els = [
        {
          group: 'nodes',
          data: { id: 'c1', label: 'mongo', kind: 'statefulset', isController: true },
        } as unknown as El,
      ];
      expect(resolveSelectedNode(els, 'c1', new Set(['c1']))?.queryTarget).toEqual({
        kind: 'statefulset',
        name: 'mongo',
      });
    });

    it('omits queryTarget for kinds outside the detail-URL set (no query may ever fire)', () => {
      const els = [node('s1', 'service', { application: 'stray' })];
      const result = resolveSelectedNode(els, 's1', new Set(['s1']));
      expect(result?.queryTarget).toBeUndefined();
    });
  });
});
