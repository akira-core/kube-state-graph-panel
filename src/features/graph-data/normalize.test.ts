import { normalizeGraph } from './normalize';

describe('normalizeGraph', () => {
  it('returns empty + errors for non-object payload', () => {
    expect(normalizeGraph(null)).toEqual({ elements: [], errors: ['payload is not an object'] });
    expect(normalizeGraph(42).elements).toEqual([]);
  });

  it('normalizes a happy-path payload', () => {
    const raw = {
      nodes: [
        { id: 'pod-a', kind: 'Pod', namespace: 'default', label: 'Pod A' },
        { id: 'svc-b', kind: 'Service' },
      ],
      edges: [{ id: 'e1', source: 'pod-a', target: 'svc-b', edgeType: 'serviceSelector' }],
    };
    const result = normalizeGraph(raw);
    expect(result.errors).toEqual([]);
    expect(result.elements).toHaveLength(3);
    expect(result.elements[0]?.group).toBe('nodes');
    expect(result.elements[0]?.data.namespace).toBe('default');
    expect(result.elements[1]?.data.label).toBe('svc-b');
    expect(result.elements[2]?.group).toBe('edges');
  });

  it('skips nodes missing id or kind', () => {
    const raw = {
      nodes: [{ kind: 'Pod' }, { id: 'x' }, { id: 'ok', kind: 'Pod' }],
      edges: [],
    };
    const result = normalizeGraph(raw);
    expect(result.elements).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
  });

  it('drops edges with unknown endpoints', () => {
    const raw = {
      nodes: [{ id: 'a', kind: 'Pod' }],
      edges: [{ id: 'e1', source: 'a', target: 'ghost', edgeType: 'ownerReference' }],
    };
    const result = normalizeGraph(raw);
    expect(result.elements).toHaveLength(1);
    expect(result.errors).toContain('edges[0] references unknown node id');
  });

  it('preserves unknown kind / edgeType strings', () => {
    const raw = {
      nodes: [{ id: 'cr1', kind: 'CustomResource' }],
      edges: [],
    };
    const result = normalizeGraph(raw);
    expect(result.elements[0]?.data.kind).toBe('CustomResource');
  });

  it('passes weight through when valid number', () => {
    const raw = {
      nodes: [
        { id: 'a', kind: 'Pod' },
        { id: 'b', kind: 'Pod' },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b', edgeType: 'networkTraffic', weight: 12.5 }],
    };
    const result = normalizeGraph(raw);
    expect(result.elements[2]?.data.weight).toBe(12.5);
  });
});
