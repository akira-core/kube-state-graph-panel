import { normalizeGraph } from './normalize';

// Fixtures mirror upstream kube-state-graph golden cytoscape payloads
// (internal/api/testdata/golden/*-cytoscape.json).
const singleClusterGolden = {
  apiVersion: 'v1',
  clusters: ['cluster-alpha'],
  elements: {
    nodes: [
      { data: { id: 'cluster-alpha/worker-0', name: 'worker-0', type: 'node', labels: { cluster: 'cluster-alpha' } } },
      {
        data: {
          id: 'cluster-alpha/p1',
          name: 'checkout',
          type: 'pod',
          labels: { cluster: 'cluster-alpha', namespace: 'shop', node: 'cluster-alpha/worker-0' },
        },
      },
    ],
    edges: [
      {
        data: {
          id: '781eb391-3e20-5ebf-9b56-36d42bf6d687',
          type: 'pod-runs-on-node',
          source: 'cluster-alpha/p1',
          target: 'cluster-alpha/worker-0',
          labels: {},
        },
      },
    ],
  },
};

describe('normalizeGraph', () => {
  it('returns empty + errors for non-object payload', () => {
    expect(normalizeGraph(null)).toEqual({ elements: [], errors: ['payload is not an object'] });
    expect(normalizeGraph(42).elements).toEqual([]);
  });

  it('normalizes the wrapped cytoscape golden payload', () => {
    const result = normalizeGraph(singleClusterGolden);
    expect(result.errors).toEqual([]);
    expect(result.elements).toHaveLength(3);

    const worker = result.elements[0];
    expect(worker?.group).toBe('nodes');
    expect(worker?.data.kind).toBe('node');
    expect(worker?.data.label).toBe('worker-0');

    const pod = result.elements[1];
    expect(pod?.data.kind).toBe('pod');
    expect(pod?.data.namespace).toBe('shop'); // extracted from labels.namespace

    // Node labels pass through verbatim (guards the node-labels spread).
    expect(pod?.data.labels).toEqual({
      cluster: 'cluster-alpha',
      namespace: 'shop',
      node: 'cluster-alpha/worker-0',
    });
    expect(worker?.data.labels).toEqual({ cluster: 'cluster-alpha' });

    const edge = result.elements[2];
    expect(edge?.group).toBe('edges');
    expect(edge?.data.edgeType).toBe('pod-runs-on-node'); // mapped from data.type
  });

  it('maps ipaddress array to data.ipAddress', () => {
    const raw = {
      elements: {
        nodes: [
          {
            data: {
              id: 'cluster-alpha/shop/payments',
              name: 'payments',
              type: 'service',
              ipaddress: ['10.0.0.5'],
              labels: { namespace: 'shop' },
            },
          },
        ],
        edges: [],
      },
    };
    const result = normalizeGraph(raw);
    expect(result.elements[0]?.data.ipAddress).toEqual(['10.0.0.5']);
  });

  it('omits ipAddress when absent or empty', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'a', name: 'a', type: 'pod', labels: {} } },
          { data: { id: 'b', name: 'b', type: 'pod', ipaddress: [], labels: {} } },
        ],
        edges: [],
      },
    };
    const result = normalizeGraph(raw);
    expect(result.elements[0]?.data.ipAddress).toBeUndefined();
    expect(result.elements[1]?.data.ipAddress).toBeUndefined();
  });

  it('accepts the unwrapped { nodes, edges } shape identically', () => {
    const wrapped = normalizeGraph(singleClusterGolden);
    const unwrapped = normalizeGraph(singleClusterGolden.elements);
    expect(unwrapped.elements).toEqual(wrapped.elements);
    expect(unwrapped.errors).toEqual([]);
  });

  it('tolerates flat (non-data-wrapped) entries', () => {
    const raw = {
      nodes: [{ id: 'a', name: 'A', type: 'pod', labels: {} }],
      edges: [],
    };
    const result = normalizeGraph(raw);
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]?.data.kind).toBe('pod');
    expect(result.elements[0]?.data.label).toBe('A');
  });

  it('falls back label to id when name is missing', () => {
    const raw = { elements: { nodes: [{ data: { id: 'x', type: 'pod', labels: {} } }], edges: [] } };
    const result = normalizeGraph(raw);
    expect(result.elements[0]?.data.label).toBe('x');
  });

  it('skips nodes missing id or type', () => {
    const raw = {
      elements: {
        nodes: [{ data: { type: 'pod' } }, { data: { id: 'x' } }, { data: { id: 'ok', type: 'pod' } }],
        edges: [],
      },
    };
    const result = normalizeGraph(raw);
    expect(result.elements).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
  });

  it('drops edges with unknown endpoints', () => {
    const raw = {
      elements: {
        nodes: [{ data: { id: 'a', type: 'pod' } }],
        edges: [{ data: { id: 'e1', source: 'a', target: 'ghost', type: 'pod-runs-on-node' } }],
      },
    };
    const result = normalizeGraph(raw);
    expect(result.elements).toHaveLength(1);
    expect(result.errors).toContain('edges[0] references unknown node id');
  });

  it('preserves unknown kind / edgeType strings (forward-compat)', () => {
    const raw = {
      elements: {
        nodes: [{ data: { id: 'cr1', type: 'customresource' } }, { data: { id: 'cr2', type: 'pod' } }],
        edges: [{ data: { id: 'e', source: 'cr1', target: 'cr2', type: 'future-relation' } }],
      },
    };
    const result = normalizeGraph(raw);
    expect(result.errors).toEqual([]);
    expect(result.elements[0]?.data.kind).toBe('customresource');
    expect(result.elements[2]?.data.edgeType).toBe('future-relation');
  });

  it('reports missing nodes/edges arrays', () => {
    const result = normalizeGraph({ elements: {} });
    expect(result.errors).toContain('payload.nodes is missing or not an array');
    expect(result.errors).toContain('payload.edges is missing or not an array');
  });

  it('normalizes an external node with an embedded :// id (preserved verbatim, no ipAddress)', () => {
    const rawExternalUrl = {
      apiVersion: 'v1',
      clusters: ['cluster-alpha'],
      elements: {
        nodes: [
          {
            data: {
              id: 'cluster-alpha/p1',
              name: 'checkout',
              type: 'pod',
              labels: { cluster: 'cluster-alpha', namespace: 'shop' },
            },
          },
          {
            data: {
              id: 'external/http://api.example.com',
              name: 'http://api.example.com',
              type: 'external',
              labels: {},
            },
          },
        ],
        edges: [
          {
            data: {
              id: '5bca0ff4-9abc-5d57-8ef2-2c7b949add06',
              type: 'pod-calls-pod',
              source: 'cluster-alpha/p1',
              target: 'external/http://api.example.com',
              labels: { cluster: 'cluster-alpha' },
            },
          },
        ],
      },
    };
    const result = normalizeGraph(rawExternalUrl);
    expect(result.errors).toEqual([]);
    expect(result.elements).toHaveLength(3);

    const ext = result.elements.find((e) => e.data.id === 'external/http://api.example.com');
    expect(ext?.group).toBe('nodes');
    expect(ext?.data.kind).toBe('external');
    expect(ext?.data.id).toBe('external/http://api.example.com'); // embedded :// preserved verbatim
    expect(ext?.data.label).toBe('http://api.example.com');
    expect(ext?.data.ipAddress).toBeUndefined();

    const edge = result.elements.find((e) => e.data.id === '5bca0ff4-9abc-5d57-8ef2-2c7b949add06');
    expect(edge?.group).toBe('edges');
    expect(edge?.data.edgeType).toBe('pod-calls-pod');
  });

  it("normalizes the 'external' missing-UID-fallback node as an edge source", () => {
    const rawFallback = {
      apiVersion: 'v1',
      clusters: ['cluster-alpha'],
      elements: {
        nodes: [
          {
            data: {
              id: 'cluster-alpha/p1',
              name: 'checkout',
              type: 'pod',
              labels: { cluster: 'cluster-alpha', namespace: 'shop' },
            },
          },
          { data: { id: 'external/admin', name: 'admin', type: 'external', labels: {} } },
        ],
        edges: [
          {
            data: {
              id: '93a2f25a-b472-54da-b8d2-55398dde8f8f',
              type: 'pod-calls-pod',
              source: 'external/admin',
              target: 'cluster-alpha/p1',
              labels: {},
            },
          },
        ],
      },
    };
    const result = normalizeGraph(rawFallback);
    expect(result.errors).toEqual([]);

    const external = result.elements.find((e) => e.data.id === 'external/admin');
    expect(external?.data.kind).toBe('external');
    expect(external?.data.label).toBe('admin');
    expect(external?.data.id).toBe('external/admin');
    expect(external?.data.ipAddress).toBeUndefined();

    // external-as-source must not be dropped or have its endpoints reordered.
    const edge = result.elements.find((e) => e.data.id === '93a2f25a-b472-54da-b8d2-55398dde8f8f');
    expect(edge?.data.source).toBe('external/admin');
    expect(edge?.data.target).toBe('cluster-alpha/p1');
  });

  it('normalizes the service golden payload (service node + service-selects-pod edge)', () => {
    const rawService = {
      apiVersion: 'v1',
      clusters: ['cluster-alpha'],
      elements: {
        nodes: [
          {
            data: {
              id: 'cluster-alpha/p1',
              name: 'checkout',
              type: 'pod',
              labels: { cluster: 'cluster-alpha', namespace: 'shop' },
            },
          },
          {
            data: {
              id: 'cluster-alpha/shop/payments',
              name: 'payments',
              type: 'service',
              ipaddress: ['10.0.0.5'],
              labels: { cluster: 'cluster-alpha', namespace: 'shop' },
            },
          },
          {
            data: {
              id: 'cluster-alpha/pay0',
              name: 'payments-0',
              type: 'pod',
              labels: { cluster: 'cluster-alpha', namespace: 'shop' },
            },
          },
        ],
        edges: [
          {
            data: {
              id: '8c67d50f-d94a-5518-9a04-6a9ccd8f5711',
              type: 'pod-calls-pod',
              source: 'cluster-alpha/p1',
              target: 'cluster-alpha/shop/payments',
              labels: { cluster: 'cluster-alpha' },
            },
          },
          {
            data: {
              id: 'c979a62f-33f8-5f78-a89a-03770c01c3cd',
              type: 'service-selects-pod',
              source: 'cluster-alpha/shop/payments',
              target: 'cluster-alpha/pay0',
              labels: { namespace: 'shop' },
            },
          },
        ],
      },
    };
    const result = normalizeGraph(rawService);
    expect(result.errors).toEqual([]);
    expect(result.elements).toHaveLength(5);

    const service = result.elements.find((e) => e.data.id === 'cluster-alpha/shop/payments');
    expect(service?.data.kind).toBe('service');
    expect(service?.data.ipAddress).toEqual(['10.0.0.5']);

    const callsEdge = result.elements.find((e) => e.data.id === '8c67d50f-d94a-5518-9a04-6a9ccd8f5711');
    expect(callsEdge?.data.edgeType).toBe('pod-calls-pod');
    expect(callsEdge?.data.target).toBe('cluster-alpha/shop/payments');

    const selectsEdge = result.elements.find((e) => e.data.id === 'c979a62f-33f8-5f78-a89a-03770c01c3cd');
    expect(selectsEdge?.data.edgeType).toBe('service-selects-pod');
    expect(selectsEdge?.data.labels).toEqual({ namespace: 'shop' });
  });

  it('passes backend compound parents through and colours cluster containers (no synthesis)', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
          { data: { id: 'demo/node-a', type: 'node', name: 'node-a', parent: 'cluster:demo' } },
          {
            data: {
              id: 'demo/p1',
              type: 'pod',
              name: 'web',
              parent: 'demo/node-a',
              labels: { cluster: 'demo', namespace: 'shop' },
            },
          },
          { data: { id: 'external/ext', type: 'external', name: 'ext' } },
        ],
        edges: [],
      },
    };
    const { elements, errors } = normalizeGraph(raw);
    expect(errors).toEqual([]);

    const byId = new Map(elements.map((e) => [e.data.id as string, e.data as Record<string, unknown>]));
    // Cluster container is recognised and assigned a palette colour (panel concern).
    expect(byId.get('cluster:demo')?.isCluster).toBe(true);
    expect(typeof byId.get('cluster:demo')?.clusterColor).toBe('string');
    // The backend's `parent` is passed through verbatim — no panel-side synthesis.
    expect(byId.get('demo/node-a')?.parent).toBe('cluster:demo');
    expect(byId.get('demo/p1')?.parent).toBe('demo/node-a');
    // Top-level nodes (no parent) stay top-level.
    expect(byId.get('external/ext')?.parent).toBeUndefined();
    expect(byId.get('external/ext')?.isCluster).toBeUndefined();
    // Exactly the four input nodes — nothing invented.
    expect(elements.filter((e) => e.group === 'nodes')).toHaveLength(4);
  });

  it('renders a flat payload flat — no parents, no cluster containers', () => {
    const { elements } = normalizeGraph(singleClusterGolden);
    expect(elements.every((e) => e.data.parent === undefined)).toBe(true);
    expect(elements.some((e) => (e.data as Record<string, unknown>).isCluster === true)).toBe(false);
  });
});
