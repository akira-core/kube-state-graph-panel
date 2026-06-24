import type cytoscape from 'cytoscape';

import { extractPodNames } from './extractPodNames';

function node(data: cytoscape.NodeDataDefinition): cytoscape.ElementDefinition {
  return { group: 'nodes', data };
}

function edge(id: string, source: string, target: string): cytoscape.ElementDefinition {
  return { group: 'edges', data: { id, source, target, edgeType: 'pod-calls-pod' } };
}

describe('extractPodNames', () => {
  it('returns only pod labels from a mixed element list, sorted', () => {
    const elements = [
      node({ id: 'pod-b', kind: 'pod', label: 'mongo-1' }),
      node({ id: 'svc-1', kind: 'service', label: 'mongo-headless' }),
      node({ id: 'pod-a', kind: 'pod', label: 'mongo-0' }),
      node({ id: 'node-1', kind: 'node', label: 'worker-1' }),
      node({ id: 'cluster-prod', isCluster: true, cluster: 'prod', label: 'prod' }),
      edge('e1', 'pod-a', 'pod-b'),
    ];
    expect(extractPodNames(elements)).toEqual(['mongo-0', 'mongo-1']);
  });

  it('dedupes same-named pods across clusters and sorts lexicographically', () => {
    const elements = [
      node({ id: 'prod/gateway', kind: 'pod', label: 'gateway' }),
      node({ id: 'dr/gateway', kind: 'pod', label: 'gateway' }),
      node({ id: 'dr/consumer', kind: 'pod', label: 'consumer' }),
    ];
    expect(extractPodNames(elements)).toEqual(['consumer', 'gateway']);
  });

  it('falls back to the node id when label is missing or empty', () => {
    const elements = [
      node({ id: 'pod-no-label', kind: 'pod' }),
      node({ id: 'pod-empty-label', kind: 'pod', label: '' }),
    ];
    expect(extractPodNames(elements)).toEqual(['pod-empty-label', 'pod-no-label']);
  });

  it('returns an empty list for empty input', () => {
    expect(extractPodNames([])).toEqual([]);
  });

  it('ignores nodes without a pod kind and all edges', () => {
    const elements = [
      node({ id: 'pvc-1', kind: 'pvc', label: 'data-mongo-0' }),
      node({ id: 'ctrl-1', kind: 'statefulset', isController: true, label: 'mongo' }),
      edge('e1', 'pvc-1', 'ctrl-1'),
    ];
    expect(extractPodNames(elements)).toEqual([]);
  });
});
