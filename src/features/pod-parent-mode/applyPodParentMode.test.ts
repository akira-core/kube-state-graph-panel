import type cytoscape from 'cytoscape';

import { applyPodParentMode } from './applyPodParentMode';

type El = cytoscape.ElementDefinition;

const node = (id: string, kind: string, parent?: string): El => ({
  group: 'nodes',
  data: { id, kind, ...(parent !== undefined ? { parent } : {}) },
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
  it('drops synthesized controllers + controller-owns-pod edges in node mode, keeping everything else', () => {
    const controller: El = {
      group: 'nodes',
      data: { id: 'c1', kind: 'deployment', parent: 'cl', isController: true },
    };
    const els = [
      node('cl', 'node'),
      node('p1', 'pod', 'n1'),
      controller,
      owns('c1', 'p1'),
      edge('call', 'p1', 'other', 'pod-calls-pod'),
    ];
    const out = applyPodParentMode(els, 'node');

    // The synthesized controller node is dropped.
    expect(nodeData(out, 'c1')).toBeUndefined();
    // The controller-owns-pod edge is dropped.
    expect(hasEdge(out, 'controller-owns-pod', 'c1', 'p1')).toBe(false);
    // Everything else survives unchanged (non-controller nodes + unrelated edges).
    expect(nodeData(out, 'cl')).toBeDefined();
    expect(nodeData(out, 'p1')?.parent).toBe('n1');
    expect(hasEdge(out, 'pod-calls-pod', 'p1', 'other')).toBe(true);
    expect(out).toHaveLength(3);
  });

  it('passes non-controller node elements through in node mode (no isController nodes are dropped)', () => {
    const els = [
      node('cl', 'node'),
      node('n1', 'node', 'cl'),
      node('p1', 'pod', 'n1'),
      node('svc', 'service', 'cl'),
      edge('sel', 'svc', 'p1', 'service-selects-pod'),
    ];
    const out = applyPodParentMode(els, 'node');

    // No isController nodes present → nothing is dropped; same set passes through.
    expect(out).toHaveLength(els.length);
    expect(nodeData(out, 'n1')?.parent).toBe('cl');
    expect(nodeData(out, 'svc')).toBeDefined();
    expect(hasEdge(out, 'service-selects-pod', 'svc', 'p1')).toBe(true);
  });

  it('does not mutate the input elements in node mode (filter returns a new array)', () => {
    const controller: El = {
      group: 'nodes',
      data: { id: 'c1', kind: 'deployment', parent: 'cl', isController: true },
    };
    const els = [node('cl', 'node'), node('p1', 'pod', 'n1'), controller, owns('c1', 'p1')];
    const snapshot = JSON.stringify(els);
    const out = applyPodParentMode(els, 'node');
    // A new array is returned (not the same reference), input is unchanged.
    expect(out).not.toBe(els);
    expect(JSON.stringify(els)).toBe(snapshot);
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

  // Regression: cytoscape ALIASES the data object handed to cy.add, and the
  // expand-collapse extension re-routes a collapsed controller's edges by mutating
  // data.source in place. Every returned element must own a fresh data object so
  // that downstream mutation cannot leak back into the shared normalized input —
  // otherwise toggling controller→node corrupts edge endpoints and the workload
  // orphans (controller default-collapse → pod-mounts-pvc re-pointed to controller).
  it('returns pass-through edges as fresh data so downstream mutation cannot corrupt the input (controller mode)', () => {
    const pvcEdge = edge('e-pvc', 'p1', 'pv1', 'pod-mounts-pvc');
    const els = [
      node('n1', 'node', 'cl'),
      node('p1', 'pod', 'n1'),
      node('c1', 'statefulset', 'cl'),
      node('pv1', 'pvc', 'cl'),
      owns('c1', 'p1'),
      pvcEdge,
    ];
    const out = applyPodParentMode(els, 'controller');
    const outPvc = out.find((e) => e.data.id === 'e-pvc');
    expect(outPvc?.data).not.toBe(pvcEdge.data);

    // Simulate cytoscape re-routing the collapsed controller's edge in place.
    (outPvc?.data as cytoscape.EdgeDataDefinition).source = 'c1';
    expect((pvcEdge.data as cytoscape.EdgeDataDefinition).source).toBe('p1');
  });

  it('returns pass-through elements as fresh data in node mode', () => {
    const pvcEdge = edge('e-pvc', 'p1', 'pv1', 'pod-mounts-pvc');
    const els = [node('p1', 'pod', 'n1'), node('pv1', 'pvc', 'cl'), pvcEdge];
    const out = applyPodParentMode(els, 'node');
    const outPvc = out.find((e) => e.data.id === 'e-pvc');
    expect(outPvc?.data).not.toBe(pvcEdge.data);

    (outPvc?.data as cytoscape.EdgeDataDefinition).source = 'x';
    expect((pvcEdge.data as cytoscape.EdgeDataDefinition).source).toBe('p1');
  });
});
