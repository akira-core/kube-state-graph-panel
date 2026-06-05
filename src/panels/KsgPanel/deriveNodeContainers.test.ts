import type cytoscape from 'cytoscape';

import { deriveNodeContainers } from './deriveNodeContainers';

const NEUTRAL = '#888888';

function node(data: Record<string, unknown>): cytoscape.ElementDefinition {
  return { group: 'nodes', data };
}
function edge(data: Record<string, unknown>): cytoscape.ElementDefinition {
  return { group: 'edges', data };
}

describe('deriveNodeContainers', () => {
  it('treats a node that parents pods as a container coloured by its cluster', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true, clusterColor: '#0ea5e9', label: 'prod' }),
      node({ id: 'node/worker-0', kind: 'node', parent: 'cluster/prod', label: 'worker-0' }),
      node({ id: 'pod/a', kind: 'pod', parent: 'node/worker-0', label: 'a' }),
    ];
    const { nodeEntries, showNodeKindIcon } = deriveNodeContainers(els, NEUTRAL);
    expect(nodeEntries).toEqual([{ name: 'worker-0', color: '#0ea5e9' }]);
    expect(showNodeKindIcon).toBe(false);
  });

  it('keeps a collapsed container in the swatch list AND puts node in the icon legend', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true, clusterColor: '#0ea5e9', label: 'prod' }),
      node({ id: 'node/worker-0', kind: 'node', parent: 'cluster/prod', label: 'worker-0' }),
      node({ id: 'pod/a', kind: 'pod', parent: 'node/worker-0', label: 'a' }),
    ];
    const { nodeEntries, showNodeKindIcon } = deriveNodeContainers(els, NEUTRAL, new Set(['node/worker-0']));
    // Still swatched (so its expand toggle stays available)…
    expect(nodeEntries).toEqual([{ name: 'worker-0', color: '#0ea5e9' }]);
    // …and now also earns the icon slot (it renders as a glyph while collapsed).
    expect(showNodeKindIcon).toBe(true);
  });

  it('falls back to the neutral colour when a node container has no cluster parent', () => {
    const els = [
      node({ id: 'node/w', kind: 'node', label: 'w' }),
      node({ id: 'pod/a', kind: 'pod', parent: 'node/w', label: 'a' }),
    ];
    const { nodeEntries } = deriveNodeContainers(els, NEUTRAL);
    expect(nodeEntries).toEqual([{ name: 'w', color: NEUTRAL }]);
  });

  it('treats a childless node as a drawn leaf (not a container)', () => {
    const els = [
      node({ id: 'node/w', kind: 'node', label: 'w' }),
      node({ id: 'pod/a', kind: 'pod', label: 'a' }),
      edge({ id: 'e', source: 'pod/a', target: 'node/w', edgeType: 'pod-runs-on-node' }),
    ];
    const { nodeEntries, showNodeKindIcon } = deriveNodeContainers(els, NEUTRAL);
    expect(nodeEntries).toEqual([]);
    expect(showNodeKindIcon).toBe(true);
  });

  it('colours each node by its own cluster across multiple clusters', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true, clusterColor: '#0ea5e9', label: 'prod' }),
      node({ id: 'cluster/dr', isCluster: true, clusterColor: '#8b5cf6', label: 'dr' }),
      node({ id: 'node/w0', kind: 'node', parent: 'cluster/prod', label: 'w0' }),
      node({ id: 'node/w2', kind: 'node', parent: 'cluster/dr', label: 'w2' }),
      node({ id: 'pod/a', kind: 'pod', parent: 'node/w0', label: 'a' }),
      node({ id: 'pod/b', kind: 'pod', parent: 'node/w2', label: 'b' }),
    ];
    const { nodeEntries } = deriveNodeContainers(els, NEUTRAL);
    expect(nodeEntries).toEqual([
      { name: 'w0', color: '#0ea5e9' },
      { name: 'w2', color: '#8b5cf6' },
    ]);
  });

  it('dedupes node containers sharing a display name', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true, clusterColor: '#0ea5e9', label: 'prod' }),
      node({ id: 'node/w-1', kind: 'node', parent: 'cluster/prod', label: 'worker' }),
      node({ id: 'node/w-2', kind: 'node', parent: 'cluster/prod', label: 'worker' }),
      node({ id: 'pod/a', kind: 'pod', parent: 'node/w-1', label: 'a' }),
      node({ id: 'pod/b', kind: 'pod', parent: 'node/w-2', label: 'b' }),
    ];
    const { nodeEntries } = deriveNodeContainers(els, NEUTRAL);
    expect(nodeEntries).toEqual([{ name: 'worker', color: '#0ea5e9' }]);
  });
});
