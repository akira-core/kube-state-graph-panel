import type cytoscape from 'cytoscape';

import { applyPodParentMode } from './applyPodParentMode';

type El = cytoscape.ElementDefinition;

const node = (id: string, kind: string, parent?: string): El => ({
  group: 'nodes',
  data: { id, kind, ...(parent !== undefined ? { parent } : {}) } as cytoscape.NodeDataDefinition,
});
const owns = (ctrl: string, pod: string): El => ({
  group: 'edges',
  data: { id: `o:${ctrl}:${pod}`, source: ctrl, target: pod, edgeType: 'controller-owns-pod' },
});
const edge = (id: string, source: string, target: string, edgeType: string): El => ({
  group: 'edges',
  data: { id, source, target, edgeType },
});

const nodeData = (els: El[], id: string): cytoscape.NodeDataDefinition | undefined =>
  els.find((e) => e.group === 'nodes' && e.data.id === id)?.data;
const edgeDatas = (els: El[]): cytoscape.EdgeDataDefinition[] =>
  els.filter((e) => e.group === 'edges').map((e) => e.data as cytoscape.EdgeDataDefinition);
const hasEdge = (els: El[], edgeType: string, source: string, target: string): boolean =>
  edgeDatas(els).some((d) => d.edgeType === edgeType && d.source === source && d.target === target);

describe('applyPodParentMode', () => {
  it('returns the input untouched in node mode (passthrough)', () => {
    const els = [node('cl', 'node'), node('p1', 'pod', 'n1'), node('c1', 'deployment', 'cl'), owns('c1', 'p1')];
    expect(applyPodParentMode(els, 'node')).toBe(els);
  });

  it('re-parents a pod under its controller and synthesises a pod-runs-on-node edge in controller mode', () => {
    const els = [
      node('n1', 'node', 'cl'),
      node('p1', 'pod', 'n1'),
      node('c1', 'deployment', 'cl'),
      owns('c1', 'p1'),
      edge('call', 'p1', 'other', 'pod-calls-pod'),
    ];
    const out = applyPodParentMode(els, 'controller');

    expect(nodeData(out, 'p1')?.parent).toBe('c1');
    expect(hasEdge(out, 'pod-runs-on-node', 'p1', 'n1')).toBe(true);
    // The synthesised edge has the canonical id.
    const synth = edgeDatas(out).find((d) => d.edgeType === 'pod-runs-on-node');
    expect(synth?.id).toBe('ppm:pod-runs-on-node:p1');
    // The controller-owns-pod edge becomes nesting and is removed.
    expect(hasEdge(out, 'controller-owns-pod', 'c1', 'p1')).toBe(false);
    // Unrelated edges survive.
    expect(hasEdge(out, 'pod-calls-pod', 'p1', 'other')).toBe(true);
  });

  it('nests a multi-owner pod under the lexicographically smallest controller id', () => {
    const els = [
      node('n1', 'node', 'cl'),
      node('p1', 'pod', 'n1'),
      node('b-ctrl', 'deployment', 'cl'),
      node('a-ctrl', 'deployment', 'cl'),
      owns('b-ctrl', 'p1'),
      owns('a-ctrl', 'p1'),
    ];
    const out = applyPodParentMode(els, 'controller');

    expect(nodeData(out, 'p1')?.parent).toBe('a-ctrl');
    // controller-owns-pod is not drawn in controller mode: all owns edges removed.
    expect(edgeDatas(out).some((d) => d.edgeType === 'controller-owns-pod')).toBe(false);
    expect(hasEdge(out, 'pod-runs-on-node', 'p1', 'n1')).toBe(true);
  });

  it('leaves a pod with no controller-owns-pod edge untouched (no re-parent, no synthesised edge)', () => {
    const els = [
      node('n2', 'node', 'cl'),
      node('q', 'pod', 'n2'),
      node('p1', 'pod', 'n1'),
      node('c1', 'deployment', 'cl'),
      owns('c1', 'p1'),
    ];
    const out = applyPodParentMode(els, 'controller');

    expect(nodeData(out, 'q')?.parent).toBe('n2');
    expect(hasEdge(out, 'pod-runs-on-node', 'q', 'n2')).toBe(false);
  });

  it('re-parents a pod whose original parent is a cluster container (not a node kind) but synthesises no edge', () => {
    // The pod's original parent `cl` is a cluster container, not a K8s `node`. It is
    // re-parented to its controller, but no pod-runs-on-node edge may point at a
    // cluster — only a real `node`-kind node earns the synthesised edge.
    const cluster: El = { group: 'nodes', data: { id: 'cl', isCluster: true } };
    const els = [cluster, node('p1', 'pod', 'cl'), node('c1', 'deployment', 'cl'), owns('c1', 'p1')];
    const out = applyPodParentMode(els, 'controller');

    expect(nodeData(out, 'p1')?.parent).toBe('c1');
    expect(edgeDatas(out).some((d) => d.edgeType === 'pod-runs-on-node')).toBe(false);
  });

  it('preserves service-selects-pod and pod-calls-service edges in controller mode', () => {
    const els = [
      node('n1', 'node', 'cl'),
      node('p1', 'pod', 'n1'),
      node('c1', 'deployment', 'cl'),
      node('svc', 'service', 'cl'),
      owns('c1', 'p1'),
      edge('sel', 'svc', 'p1', 'service-selects-pod'),
      edge('call', 'p1', 'svc', 'pod-calls-service'),
    ];
    const out = applyPodParentMode(els, 'controller');

    expect(nodeData(out, 'p1')?.parent).toBe('c1');
    expect(hasEdge(out, 'service-selects-pod', 'svc', 'p1')).toBe(true);
    expect(hasEdge(out, 'pod-calls-service', 'p1', 'svc')).toBe(true);
  });

  it('does not mutate the input elements', () => {
    const els = [
      node('n1', 'node', 'cl'),
      node('p1', 'pod', 'n1'),
      node('c1', 'deployment', 'cl'),
      node('svc', 'service', 'cl'),
      owns('c1', 'p1'),
      edge('sel', 'svc', 'p1', 'service-selects-pod'),
    ];
    const snapshot = JSON.stringify(els);
    applyPodParentMode(els, 'controller');
    expect(JSON.stringify(els)).toBe(snapshot);
  });
});
