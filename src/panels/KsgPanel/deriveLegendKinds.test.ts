import type cytoscape from 'cytoscape';

import { deriveLegendKinds } from './deriveLegendKinds';

function node(data: Record<string, unknown>): cytoscape.ElementDefinition {
  return { group: 'nodes', data };
}
const NONE = new Set<string>();

describe('deriveLegendKinds', () => {
  it('lists drawn leaves but drops expanded containers (which live in their own swatch section)', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true }),
      node({ id: 'node/w0', kind: 'node', parent: 'cluster/prod' }), // expanded container → dropped
      node({ id: 'pod/a', kind: 'pod', parent: 'node/w0' }), // leaf → listed
      node({ id: 'svc/s', kind: 'service', parent: 'cluster/prod' }), // leaf → listed
    ];
    expect(deriveLegendKinds(els, NONE)).toEqual(['pod', 'service']);
  });

  it('drops a cluster (no kind) entirely', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true }),
      node({ id: 'pod/a', kind: 'pod', parent: 'cluster/prod' }),
    ];
    expect(deriveLegendKinds(els, NONE)).toEqual(['pod']);
  });

  it('shows a kind for a childless container (drawn leaf, e.g. controller-mode K8s node)', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true }),
      node({ id: 'node/w0', kind: 'node', parent: 'cluster/prod' }), // no children → leaf → listed
    ];
    expect(deriveLegendKinds(els, NONE)).toEqual(['node']);
  });

  it('swaps storageclass ⇄ pvc on collapse: expanded shows pvc, collapsed shows storageclass', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true }),
      node({ id: 'prod/storageclass/fast-ssd', kind: 'storageclass', isStorageClass: true, parent: 'cluster/prod' }),
      node({ id: 'pvc/a', kind: 'pvc', parent: 'prod/storageclass/fast-ssd' }),
      node({ id: 'pvc/b', kind: 'pvc', parent: 'prod/storageclass/fast-ssd' }),
    ];
    // Expanded: storageclass is a container (dropped), its PVCs are visible leaves.
    expect(deriveLegendKinds(els, NONE)).toEqual(['pvc']);
    // Collapsed: PVCs are aggregated away (collapsed ancestor) → pvc drops; the
    // collapsed storageclass renders its glyph → storageclass takes pvc's place.
    expect(deriveLegendKinds(els, new Set(['prod/storageclass/fast-ssd']))).toEqual(['storageclass']);
  });

  it('drops children of a collapsed K8s node and shows the node kind instead', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true }),
      node({ id: 'node/w0', kind: 'node', parent: 'cluster/prod' }),
      node({ id: 'pod/a', kind: 'pod', parent: 'node/w0' }),
    ];
    expect(deriveLegendKinds(els, new Set(['node/w0']))).toEqual(['node']);
  });

  it('hides everything inside a collapsed cluster (cluster has no kind/icon)', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true }),
      node({ id: 'node/w0', kind: 'node', parent: 'cluster/prod' }),
      node({ id: 'pod/a', kind: 'pod', parent: 'node/w0' }),
    ];
    expect(deriveLegendKinds(els, new Set(['cluster/prod']))).toEqual([]);
  });

  it('is deduped and in first-seen order', () => {
    const els = [
      node({ id: 'p1', kind: 'pod' }),
      node({ id: 'e1', kind: 'external' }),
      node({ id: 'p2', kind: 'pod' }),
    ];
    expect(deriveLegendKinds(els, NONE)).toEqual(['pod', 'external']);
  });
});
