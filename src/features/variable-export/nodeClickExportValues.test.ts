import type cytoscape from 'cytoscape';

import { nodeClickExportValues } from './nodeClickExportValues';

describe('nodeClickExportValues', () => {
  describe('pod click', () => {
    it.each([undefined, 'normal', 'warning', 'critical'] as const)(
      'exports [label] regardless of status (status=%s) — no status gating',
      (status) => {
        const elements: cytoscape.ElementDefinition[] = [
          {
            group: 'nodes',
            data: {
              id: 'p1',
              kind: 'pod',
              label: 'mongo-0',
              ...(status !== undefined ? { status } : {}),
            },
          },
        ];
        expect(nodeClickExportValues(elements, 'p1')).toEqual({ podNames: ['mongo-0'], clusterName: [] });
      }
    );

    it('resolves cluster from the nearest isCluster ancestor via the parent chain', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'cl', label: 'prod', isCluster: true, cluster: 'prod' } },
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', parent: 'cl' } },
      ];
      expect(nodeClickExportValues(elements, 'p1')).toEqual({ podNames: ['mongo-0'], clusterName: ['prod'] });
    });

    it('walks through an intermediate (non-cluster) ancestor to reach the isCluster container', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'cl', label: 'prod', isCluster: true, cluster: 'prod' } },
        { group: 'nodes', data: { id: 'ctrl', kind: 'statefulset', label: 'mongo', isController: true, parent: 'cl' } },
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', parent: 'ctrl' } },
      ];
      expect(nodeClickExportValues(elements, 'p1')).toEqual({ podNames: ['mongo-0'], clusterName: ['prod'] });
    });

    it('falls back to the node own data.labels.cluster when no isCluster ancestor exists', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', labels: { cluster: 'dr' } } },
      ];
      expect(nodeClickExportValues(elements, 'p1')).toEqual({ podNames: ['mongo-0'], clusterName: ['dr'] });
    });

    it('prefers the ancestor cluster over labels.cluster (ancestor is authoritative)', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'cl', label: 'prod', isCluster: true, cluster: 'prod' } },
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', parent: 'cl', labels: { cluster: 'dr' } } },
      ];
      expect(nodeClickExportValues(elements, 'p1')).toEqual({ podNames: ['mongo-0'], clusterName: ['prod'] });
    });

    it('clears only clusterName when neither an isCluster ancestor nor labels.cluster exists (podNames stays populated)', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0' } },
      ];
      expect(nodeClickExportValues(elements, 'p1')).toEqual({ podNames: ['mongo-0'], clusterName: [] });
    });
  });

  describe('controller click', () => {
    it('exports every direct child pod label, deduped and sorted lexicographically', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'cl', label: 'prod', isCluster: true, cluster: 'prod' } },
        { group: 'nodes', data: { id: 'ctrl', kind: 'statefulset', label: 'mongo', isController: true, parent: 'cl' } },
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-2', parent: 'ctrl' } },
        { group: 'nodes', data: { id: 'p2', kind: 'pod', label: 'mongo-0', parent: 'ctrl' } },
        { group: 'nodes', data: { id: 'p3', kind: 'pod', label: 'mongo-1', parent: 'ctrl' } },
      ];
      expect(nodeClickExportValues(elements, 'ctrl')).toEqual({
        podNames: ['mongo-0', 'mongo-1', 'mongo-2'],
        clusterName: ['prod'],
      });
    });

    it('dedupes identical child pod labels', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'ctrl', kind: 'statefulset', label: 'mongo', isController: true } },
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', parent: 'ctrl' } },
        { group: 'nodes', data: { id: 'p2', kind: 'pod', label: 'mongo-0', parent: 'ctrl' } },
      ];
      expect(nodeClickExportValues(elements, 'ctrl')).toEqual({ podNames: ['mongo-0'], clusterName: [] });
    });

    it('only counts DIRECT children whose kind is pod — excludes non-pod children and deeper descendants', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'ctrl', kind: 'statefulset', label: 'mongo', isController: true } },
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', parent: 'ctrl' } },
        // non-pod direct child: excluded
        { group: 'nodes', data: { id: 'pvc1', kind: 'pvc', label: 'mongo-data-0', parent: 'ctrl' } },
        // grandchild (parent is p1, not ctrl): excluded even if kind pod
        { group: 'nodes', data: { id: 'p1a', kind: 'pod', label: 'nested', parent: 'p1' } },
      ];
      expect(nodeClickExportValues(elements, 'ctrl')).toEqual({ podNames: ['mongo-0'], clusterName: [] });
    });

    it('exports [] for podNames when the controller has zero pod children', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'ctrl', kind: 'statefulset', label: 'mongo', isController: true } },
      ];
      expect(nodeClickExportValues(elements, 'ctrl')).toEqual({ podNames: [], clusterName: [] });
    });

    it('resolves cluster for the controller itself via its own ancestor chain', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'cl', label: 'dr', isCluster: true, cluster: 'dr' } },
        { group: 'nodes', data: { id: 'ctrl', kind: 'deployment', label: 'nats', isController: true, parent: 'cl' } },
      ];
      expect(nodeClickExportValues(elements, 'ctrl')).toEqual({ podNames: [], clusterName: ['dr'] });
    });
  });

  describe('other node kinds', () => {
    it.each([
      ['service', { kind: 'service' }],
      ['node', { kind: 'node' }],
      ['pvc', { kind: 'pvc' }],
      ['storageclass', { kind: 'storageclass' }],
      ['namespace group', { isNamespace: true }],
      ['application group', { isApplication: true }],
      ['cluster container', { isCluster: true }],
    ])('exports both [] for a %s node', (_label, extra) => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'n1', label: 'thing', ...extra } },
      ];
      expect(nodeClickExportValues(elements, 'n1')).toEqual({ podNames: [], clusterName: [] });
    });
  });

  describe('no selection', () => {
    it('exports both [] when selectedNodeId is null', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0' } },
      ];
      expect(nodeClickExportValues(elements, null)).toEqual({ podNames: [], clusterName: [] });
    });

    it('exports both [] when selectedNodeId is not found in elements', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0' } },
      ];
      expect(nodeClickExportValues(elements, 'nope')).toEqual({ podNames: [], clusterName: [] });
    });
  });

  describe('parent cycle safety', () => {
    it('terminates (bounded hop guard) on a self-referential parent without infinite-looping', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', parent: 'p1' } },
      ];
      expect(nodeClickExportValues(elements, 'p1')).toEqual({ podNames: ['mongo-0'], clusterName: [] });
    });

    it('terminates (bounded hop guard) on a multi-node parent cycle without infinite-looping', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'a', label: 'a', parent: 'b' } },
        { group: 'nodes', data: { id: 'b', label: 'b', parent: 'a' } },
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', parent: 'a' } },
      ];
      expect(nodeClickExportValues(elements, 'p1')).toEqual({ podNames: ['mongo-0'], clusterName: [] });
    });
  });
});
