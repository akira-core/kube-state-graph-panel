import type cytoscape from 'cytoscape';

import { resolveSelectedNode } from './KsgPanel';

type El = cytoscape.ElementDefinition;
const node = (id: string, kind: string, extra: Record<string, unknown> = {}): El =>
  ({ group: 'nodes', data: { id, label: id, kind, ...extra } }) as unknown as El;

describe('resolveSelectedNode', () => {
  const elements = [
    node('p1', 'pod'),
    node('cl', 'node', { isCluster: true }),
    // StorageClass is a backend D6 leaf now — detail-eligible, carrying provisioner/parameters.
    {
      group: 'nodes',
      data: { id: 'sc', label: 'fast-ssd', kind: 'storageclass', provisioner: 'ebs.csi.aws.com', parameters: { type: 'gp3' } },
    } as unknown as El,
    // Decorative backend groups never open the detail panel.
    node('ns', 'node', { isNamespace: true }),
    node('app', 'node', { isApplication: true }),
  ];

  it('returns the node detail when the selected node is visible', () => {
    const result = resolveSelectedNode(elements, 'p1', new Set(['p1']));
    // An owner-less pod still resolves a queryTarget (itself) for the detail-URL flow.
    expect(result).toEqual({
      id: 'p1',
      label: 'p1',
      kind: 'pod',
      attributes: [{ key: 'kind', value: 'pod' }],
      queryTarget: { kind: 'pod', name: 'p1' },
    });
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

  it('resolves a storageclass leaf with provisioner/parameters (now detail-eligible, no queryTarget)', () => {
    const result = resolveSelectedNode(elements, 'sc', new Set(['sc']));
    // storageclass is not a Workloads DETAIL_URL kind, so no per-kind queryTarget.
    expect(result).toEqual({
      id: 'sc',
      label: 'fast-ssd',
      kind: 'storageclass',
      attributes: [
        { key: 'kind', value: 'storageclass' },
        { key: 'provisioner', value: 'ebs.csi.aws.com' },
        { key: 'type', value: 'gp3', wrap: true },
      ],
      provisioner: 'ebs.csi.aws.com',
      parameters: { type: 'gp3' },
    });
  });

  it('returns null for the decorative namespace / application groups even if visible', () => {
    expect(resolveSelectedNode(elements, 'ns', new Set(['ns']))).toBeNull();
    expect(resolveSelectedNode(elements, 'app', new Set(['app']))).toBeNull();
  });

  describe('collapse awareness (the panel never describes an off-canvas node)', () => {
    const nested = [
      node('ctrl', 'deployment', { isController: true }),
      node('p1', 'pod', { parent: 'ctrl' }),
      node('cl2', 'cluster', { isCluster: true }),
      node('ctrl2', 'deployment', { isController: true, parent: 'cl2' }),
      node('p2', 'pod', { parent: 'ctrl2' }),
    ];
    const allVisible = new Set(['ctrl', 'p1', 'cl2', 'ctrl2', 'p2']);

    it('returns null for a node folded inside a collapsed parent', () => {
      expect(resolveSelectedNode(nested, 'p1', allVisible, new Set(['ctrl']))).toBeNull();
    });

    it('returns null when ANY ancestor (not just the direct parent) is collapsed', () => {
      expect(resolveSelectedNode(nested, 'p2', allVisible, new Set(['cl2']))).toBeNull();
    });

    it('still resolves the collapsed container itself (it stays on canvas as a box)', () => {
      expect(resolveSelectedNode(nested, 'ctrl', allVisible, new Set(['ctrl']))?.id).toBe('ctrl');
    });

    it('resolves normally when the collapsed set does not cover the selection chain', () => {
      expect(resolveSelectedNode(nested, 'p1', allVisible, new Set(['ctrl2']))?.id).toBe('p1');
    });
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

    it('falls back to the standalone-pod identity when the owner kind is outside the contract', () => {
      // Static pods (owner Node) and operator CRDs (owner Rollout) must not fire
      // detail-URL queries with an out-of-contract kind.
      const staticPod = [node('p1', 'pod', { owner: { kind: 'Node', name: 'worker-1' } })];
      expect(resolveSelectedNode(staticPod, 'p1', new Set(['p1']))?.queryTarget).toEqual({
        kind: 'pod',
        name: 'p1',
      });
      const crdOwned = [node('p2', 'pod', { owner: { kind: 'Rollout', name: 'canary' } })];
      expect(resolveSelectedNode(crdOwned, 'p2', new Set(['p2']))?.queryTarget).toEqual({
        kind: 'pod',
        name: 'p2',
      });
    });
  });
});
