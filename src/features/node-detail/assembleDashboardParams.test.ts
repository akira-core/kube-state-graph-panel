import type cytoscape from 'cytoscape';

import { assembleDashboardParams } from './assembleDashboardParams';

describe('assembleDashboardParams', () => {
  it('leaf: keeps kind + name (from label) + namespace, drops labels / rendering / structural fields', () => {
    const elements: cytoscape.ElementDefinition[] = [
      {
        group: 'nodes',
        data: {
          id: 'demo/p1',
          label: 'mongo-0',
          kind: 'pod',
          namespace: 'shop',
          parent: 'node1',
          status: 'critical',
          worstStatus: 'critical',
          clusterColor: '#fff',
          labels: { app: 'mongo' },
        },
      },
    ];
    // parent 'node1' is absent from elements and labels carries no cluster → no cluster param.
    expect(assembleDashboardParams(elements, 'demo/p1')).toEqual({ kind: 'pod', name: 'mongo-0', namespace: 'shop' });
  });

  it('leaf: drops every non-scalar value (alerts / containers / owner / ipAddress)', () => {
    const elements: cytoscape.ElementDefinition[] = [
      {
        group: 'nodes',
        data: {
          id: 'demo/p1',
          label: 'mongo-0',
          kind: 'pod',
          alerts: [{ name: 'HighMem', severity: 'critical', timeRecords: [1] }],
          containers: [{ name: 'app', image: 'repo/app:1' }],
          owner: { kind: 'StatefulSet', name: 'mongo' },
          ipAddress: ['10.0.0.1'],
        },
      },
    ];
    expect(assembleDashboardParams(elements, 'demo/p1')).toEqual({ kind: 'pod', name: 'mongo-0' });
  });

  it('compound (k8s-node): merges an attribute identical across ALL children that the node itself lacks', () => {
    const elements: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'node1', kind: 'node', label: 'ip-10-0-0-1' } },
      { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', namespace: 'shop', parent: 'node1' } },
      { group: 'nodes', data: { id: 'p2', kind: 'pod', label: 'mongo-1', namespace: 'shop', parent: 'node1' } },
    ];
    // own: kind=node, name=ip-10-0-0-1. children share namespace=shop (merged); children
    // kind=pod is identical but own already has kind (own-wins → stays node); name differs.
    expect(assembleDashboardParams(elements, 'node1')).toEqual({
      kind: 'node',
      name: 'ip-10-0-0-1',
      namespace: 'shop',
    });
  });

  it('compound: skips an attribute that differs across children', () => {
    const elements: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'node1', kind: 'node', label: 'ip-10-0-0-1' } },
      { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', namespace: 'shop', parent: 'node1' } },
      { group: 'nodes', data: { id: 'p2', kind: 'pod', label: 'web-0', namespace: 'web', parent: 'node1' } },
    ];
    // namespace differs (shop vs web) → not merged.
    expect(assembleDashboardParams(elements, 'node1')).toEqual({ kind: 'node', name: 'ip-10-0-0-1' });
  });

  it('compound: own value wins over a child-identical value on the same key', () => {
    const elements: cytoscape.ElementDefinition[] = [
      {
        group: 'nodes',
        data: { id: 'ctrl', kind: 'statefulset', label: 'mongo', isController: true, namespace: 'own' },
      },
      { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', namespace: 'child', parent: 'ctrl' } },
      { group: 'nodes', data: { id: 'p2', kind: 'pod', label: 'mongo-1', namespace: 'child', parent: 'ctrl' } },
    ];
    expect(assembleDashboardParams(elements, 'ctrl')).toEqual({
      kind: 'statefulset',
      name: 'mongo',
      namespace: 'own',
    });
  });

  it('compound: drops the synthesized controller id and never sends it', () => {
    const elements: cytoscape.ElementDefinition[] = [
      {
        group: 'nodes',
        data: { id: 'ctrl/demo/shop/statefulset/mongo', kind: 'statefulset', label: 'mongo', isController: true },
      },
    ];
    const params = assembleDashboardParams(elements, 'ctrl/demo/shop/statefulset/mongo');
    expect(params).toEqual({ kind: 'statefulset', name: 'mongo' });
    expect(params && 'id' in params).toBe(false);
  });

  it('childless compound → own attributes only', () => {
    const elements: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'node1', kind: 'node', label: 'ip-10-0-0-1', namespace: 'infra' } },
    ];
    expect(assembleDashboardParams(elements, 'node1')).toEqual({
      kind: 'node',
      name: 'ip-10-0-0-1',
      namespace: 'infra',
    });
  });

  it.each([
    ['cluster', { isCluster: true }],
    ['storageclass', { isStorageClass: true, kind: 'storageclass' }],
    ['namespace', { isNamespace: true }],
  ])('returns undefined for the ineligible %s compound', (_label, extra) => {
    const elements: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'g1', label: 'g1', ...extra } as cytoscape.NodeDataDefinition },
    ];
    expect(assembleDashboardParams(elements, 'g1')).toBeUndefined();
  });

  describe('cluster resolution', () => {
    it('resolves cluster from the nearest isCluster ancestor (direct parent)', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'cl', label: 'prod', isCluster: true, cluster: 'prod' } },
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', namespace: 'shop', parent: 'cl' } },
      ];
      expect(assembleDashboardParams(elements, 'p1')).toEqual({
        kind: 'pod',
        name: 'mongo-0',
        namespace: 'shop',
        cluster: 'prod',
      });
    });

    it('walks through a namespace box to the isCluster ancestor (controller nesting)', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'cl', label: 'prod', isCluster: true, cluster: 'prod' } },
        { group: 'nodes', data: { id: 'ns', label: 'shop', isNamespace: true, parent: 'cl' } },
        { group: 'nodes', data: { id: 'ctrl', kind: 'deployment', label: 'web', isController: true, parent: 'ns' } },
      ];
      expect(assembleDashboardParams(elements, 'ctrl')).toEqual({ kind: 'deployment', name: 'web', cluster: 'prod' });
    });

    it('falls back to labels.cluster when no isCluster ancestor is present', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', labels: { cluster: 'dr' } } },
      ];
      expect(assembleDashboardParams(elements, 'p1')).toEqual({ kind: 'pod', name: 'mongo-0', cluster: 'dr' });
    });

    it('prefers the ancestor cluster over labels.cluster (ancestor is authoritative)', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'cl', label: 'prod', isCluster: true, cluster: 'prod' } },
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', parent: 'cl', labels: { cluster: 'dr' } } },
      ];
      expect(assembleDashboardParams(elements, 'p1')).toEqual({ kind: 'pod', name: 'mongo-0', cluster: 'prod' });
    });

    it('emits no cluster when neither an ancestor nor labels.cluster exists', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'ext', kind: 'external', label: 'api.example' } },
      ];
      expect(assembleDashboardParams(elements, 'ext')).toEqual({ kind: 'external', name: 'api.example' });
    });
  });

  it('returns undefined for a missing node id or a null selection', () => {
    const elements: cytoscape.ElementDefinition[] = [{ group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'm' } }];
    expect(assembleDashboardParams(elements, 'nope')).toBeUndefined();
    expect(assembleDashboardParams(elements, null)).toBeUndefined();
  });
});
