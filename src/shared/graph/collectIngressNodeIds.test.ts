import type cytoscape from 'cytoscape';

import { collectIngressNodeIds } from './collectIngressNodeIds';

const INGRESS_LABELS = { labels: { role: 'ingress-gateway' } };

const node = (id: string, kind: string, extra: Record<string, unknown> = {}): cytoscape.ElementDefinition =>
  ({ group: 'nodes', data: { id, kind, ...extra } }) as unknown as cytoscape.ElementDefinition;
const edge = (id: string, source: string, target: string, edgeType: string): cytoscape.ElementDefinition =>
  ({ group: 'edges', data: { id, source, target, edgeType } }) as unknown as cytoscape.ElementDefinition;

describe('collectIngressNodeIds', () => {
  it('returns an empty set when no node carries the ingress label', () => {
    const elements = [
      node('svc', 'service'),
      node('pod', 'pod'),
      edge('e', 'svc', 'pod', 'service-selects-pod'),
    ];
    expect(collectIngressNodeIds(elements).size).toBe(0);
  });

  it('marks a labeled node of any kind', () => {
    const elements = [node('igw', 'pod', INGRESS_LABELS), node('a', 'pod')];
    expect([...collectIngressNodeIds(elements)]).toEqual(['igw']);
  });

  it('expands one level to the pods a labeled service selects', () => {
    const elements = [
      node('igwSvc', 'service', INGRESS_LABELS),
      node('igwPod', 'pod'),
      edge('e', 'igwSvc', 'igwPod', 'service-selects-pod'),
    ];
    expect([...collectIngressNodeIds(elements)].sort()).toEqual(['igwPod', 'igwSvc']);
  });

  it('does NOT transitively close: a pod added via expansion never seeds further expansion', () => {
    // igwSvc → igwPod (added), then igwPod → a via service-selects-pod must NOT pull in `a`.
    const elements = [
      node('igwSvc', 'service', INGRESS_LABELS),
      node('igwPod', 'pod'),
      node('a', 'pod'),
      edge('e1', 'igwSvc', 'igwPod', 'service-selects-pod'),
      edge('e2', 'igwPod', 'a', 'service-selects-pod'),
    ];
    expect([...collectIngressNodeIds(elements)].sort()).toEqual(['igwPod', 'igwSvc']);
  });

  it('leaves pods selected by an unlabeled service untouched', () => {
    const elements = [
      node('otherSvc', 'service'),
      node('somePod', 'pod'),
      edge('e', 'otherSvc', 'somePod', 'service-selects-pod'),
    ];
    expect(collectIngressNodeIds(elements).size).toBe(0);
  });

  it('only expands via service-selects-pod, not other edge types', () => {
    const elements = [
      node('igwSvc', 'service', INGRESS_LABELS),
      node('caller', 'pod'),
      edge('e', 'caller', 'igwSvc', 'pod-calls-service'),
    ];
    // The pod calling the ingress service is not itself an ingress node.
    expect([...collectIngressNodeIds(elements)]).toEqual(['igwSvc']);
  });
});
