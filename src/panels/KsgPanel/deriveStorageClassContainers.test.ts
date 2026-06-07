import type cytoscape from 'cytoscape';

import { deriveStorageClassContainers } from './deriveStorageClassContainers';

const NEUTRAL = '#888888';

function node(data: Record<string, unknown>): cytoscape.ElementDefinition {
  return { group: 'nodes', data };
}

describe('deriveStorageClassContainers', () => {
  it('derives a storageclass group coloured by its parent cluster', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true, clusterColor: '#0ea5e9', label: 'prod' }),
      node({ id: 'prod/storageclass/fast-ssd', isStorageClass: true, parent: 'cluster/prod', label: 'fast-ssd' }),
      node({ id: 'pvc/data-0', kind: 'pvc', parent: 'prod/storageclass/fast-ssd', label: 'data-0' }),
    ];
    const { containerEntries, containerIds } = deriveStorageClassContainers(els, NEUTRAL);
    expect(containerEntries).toEqual([{ name: 'fast-ssd', color: '#0ea5e9' }]);
    expect(containerIds).toEqual(['prod/storageclass/fast-ssd']);
  });

  it('ignores clusters, K8s-node containers and leaf nodes', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true, clusterColor: '#0ea5e9', label: 'prod' }),
      node({ id: 'node/worker-0', kind: 'node', parent: 'cluster/prod', label: 'worker-0' }),
      node({ id: 'pvc/x', kind: 'pvc', parent: 'cluster/prod', label: 'x' }),
    ];
    const { containerEntries, containerIds } = deriveStorageClassContainers(els, NEUTRAL);
    expect(containerEntries).toEqual([]);
    expect(containerIds).toEqual([]);
  });

  it('skips a childless storageclass (drawn leaf, not a container — parity with deriveContainers)', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true, clusterColor: '#0ea5e9', label: 'prod' }),
      node({ id: 'prod/storageclass/empty', isStorageClass: true, parent: 'cluster/prod', label: 'empty' }),
    ];
    const { containerEntries, containerIds } = deriveStorageClassContainers(els, NEUTRAL);
    expect(containerEntries).toEqual([]);
    expect(containerIds).toEqual([]);
  });

  it('falls back to the neutral colour when the parent cluster colour is unknown', () => {
    const els = [
      node({ id: 'sc/orphan', isStorageClass: true, parent: 'cluster/missing', label: 'gp2' }),
      node({ id: 'pvc/x', kind: 'pvc', parent: 'sc/orphan' }),
    ];
    const { containerEntries } = deriveStorageClassContainers(els, NEUTRAL);
    expect(containerEntries).toEqual([{ name: 'gp2', color: NEUTRAL }]);
  });

  it('returns every storageclass id (not name-deduped) for the collapse toggle', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true, clusterColor: '#0ea5e9', label: 'prod' }),
      node({ id: 'cluster/dr', isCluster: true, clusterColor: '#8b5cf6', label: 'dr' }),
      node({ id: 'prod/storageclass/fast-ssd', isStorageClass: true, parent: 'cluster/prod', label: 'fast-ssd' }),
      node({ id: 'dr/storageclass/fast-ssd', isStorageClass: true, parent: 'cluster/dr', label: 'fast-ssd' }),
      node({ id: 'p1', kind: 'pvc', parent: 'prod/storageclass/fast-ssd' }),
      node({ id: 'p2', kind: 'pvc', parent: 'dr/storageclass/fast-ssd' }),
    ];
    const { containerEntries, containerIds } = deriveStorageClassContainers(els, NEUTRAL);
    // swatches dedupe by name (one "fast-ssd", first-seen cluster's colour) …
    expect(containerEntries).toEqual([{ name: 'fast-ssd', color: '#0ea5e9' }]);
    // … but BOTH ids must collapse/expand together.
    expect(containerIds).toEqual(['prod/storageclass/fast-ssd', 'dr/storageclass/fast-ssd']);
  });

  it('labels by id when the storageclass node has no label', () => {
    const els = [
      node({ id: 'sc/no-label', isStorageClass: true }),
      node({ id: 'pvc/y', kind: 'pvc', parent: 'sc/no-label' }),
    ];
    const { containerEntries, containerIds } = deriveStorageClassContainers(els, NEUTRAL);
    expect(containerEntries).toEqual([{ name: 'sc/no-label', color: NEUTRAL }]);
    expect(containerIds).toEqual(['sc/no-label']);
  });
});
