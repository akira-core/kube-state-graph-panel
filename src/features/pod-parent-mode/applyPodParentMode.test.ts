import type cytoscape from 'cytoscape';

import { applyPodParentMode } from './applyPodParentMode';

type El = cytoscape.ElementDefinition;

const node = (id: string, kind: string, parent?: string): El =>
  ({ group: 'nodes', data: { id, kind, ...(parent !== undefined ? { parent } : {}) } }) as unknown as El;
const svc = (id: string, parent?: string): El => node(id, 'service', parent);
const edge = (id: string, source: string, target: string, edgeType: string): El =>
  ({ group: 'edges', data: { id, source, target, edgeType } }) as unknown as El;

const dataOf = (els: El[], id: string): Record<string, unknown> | undefined => els.find((e) => e.data.id === id)?.data;
const edges = (els: El[]): Array<Record<string, unknown>> => els.filter((e) => e.group === 'edges').map((e) => e.data);
const hasEdge = (els: El[], edgeType: string, source: string, target: string): boolean =>
  edges(els).some((d) => d.edgeType === edgeType && d.source === source && d.target === target);

describe('applyPodParentMode', () => {
  it('returns the input untouched in node mode (passthrough)', () => {
    const els = [
      node('cl', 'node'),
      node('p1', 'pod', 'n1'),
      svc('svc', 'cl'),
      edge('e', 'svc', 'p1', 'service-selects-pod'),
    ];
    expect(applyPodParentMode(els, 'node')).toBe(els);
  });

  it('re-parents a pod under its service and synthesises a pod-runs-on-node edge in service mode', () => {
    const els = [
      node('n1', 'node', 'cl'),
      node('p1', 'pod', 'n1'),
      svc('svc', 'cl'),
      edge('sel', 'svc', 'p1', 'service-selects-pod'),
      edge('call', 'p1', 'other', 'pod-calls-pod'),
    ];
    const out = applyPodParentMode(els, 'service');

    expect(dataOf(out, 'p1')?.parent).toBe('svc');
    expect(hasEdge(out, 'pod-runs-on-node', 'p1', 'n1')).toBe(true);
    // The service-selects-pod edge becomes nesting and is removed.
    expect(hasEdge(out, 'service-selects-pod', 'svc', 'p1')).toBe(false);
    // Unrelated edges survive.
    expect(hasEdge(out, 'pod-calls-pod', 'p1', 'other')).toBe(true);
  });

  it('nests a multi-service pod under the lexicographically smallest service id', () => {
    const els = [
      node('n1', 'node', 'cl'),
      node('p1', 'pod', 'n1'),
      svc('b-svc', 'cl'),
      svc('a-svc', 'cl'),
      edge('s1', 'b-svc', 'p1', 'service-selects-pod'),
      edge('s2', 'a-svc', 'p1', 'service-selects-pod'),
    ];
    const out = applyPodParentMode(els, 'service');

    expect(dataOf(out, 'p1')?.parent).toBe('a-svc');
    // service-selects-pod is not drawn in service mode: both select edges removed.
    expect(edges(out).some((d) => d.edgeType === 'service-selects-pod')).toBe(false);
    expect(hasEdge(out, 'pod-runs-on-node', 'p1', 'n1')).toBe(true);
  });

  it('leaves a pod with no selecting service mounted on its node and synthesises no edge', () => {
    const els = [
      node('n2', 'node', 'cl'),
      node('q', 'pod', 'n2'),
      node('p1', 'pod', 'n1'),
      svc('svc', 'cl'),
      edge('sel', 'svc', 'p1', 'service-selects-pod'),
    ];
    const out = applyPodParentMode(els, 'service');

    expect(dataOf(out, 'q')?.parent).toBe('n2');
    expect(hasEdge(out, 'pod-runs-on-node', 'q', 'n2')).toBe(false);
  });

  it('does not touch cross-cluster pod-calls-pod edges', () => {
    const els = [node('p1', 'pod', 'n1'), node('consumer', 'pod', 'n2'), edge('x', 'p1', 'consumer', 'pod-calls-pod')];
    const out = applyPodParentMode(els, 'service');
    expect(hasEdge(out, 'pod-calls-pod', 'p1', 'consumer')).toBe(true);
  });

  it('does not synthesise a pod-runs-on-node edge when the pod has no original node parent', () => {
    // Flat data: pod has no parent. It re-parents to the service, but there is no
    // node to draw a pod-runs-on-node edge to, so none is synthesised.
    const els = [node('p1', 'pod'), svc('svc'), edge('sel', 'svc', 'p1', 'service-selects-pod')];
    const out = applyPodParentMode(els, 'service');
    expect(dataOf(out, 'p1')?.parent).toBe('svc');
    expect(edges(out).some((d) => d.edgeType === 'pod-runs-on-node')).toBe(false);
  });

  it('does not synthesise a dangling edge when the pod parent node is absent from elements', () => {
    // Malformed/unvalidated parent: 'ghost' node is not present. No edge to a
    // non-existent target may be created.
    const els = [node('p1', 'pod', 'ghost'), svc('svc'), edge('sel', 'svc', 'p1', 'service-selects-pod')];
    const out = applyPodParentMode(els, 'service');
    expect(dataOf(out, 'p1')?.parent).toBe('svc');
    expect(edges(out).some((d) => d.edgeType === 'pod-runs-on-node')).toBe(false);
  });

  it('does not mutate the input elements', () => {
    const els = [
      node('n1', 'node', 'cl'),
      node('p1', 'pod', 'n1'),
      svc('svc', 'cl'),
      edge('sel', 'svc', 'p1', 'service-selects-pod'),
    ];
    const snapshot = JSON.stringify(els);
    applyPodParentMode(els, 'service');
    expect(JSON.stringify(els)).toBe(snapshot);
  });
});
