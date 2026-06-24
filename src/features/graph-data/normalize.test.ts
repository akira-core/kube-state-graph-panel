import type cytoscape from 'cytoscape';

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

  it('emits status only when the backend provides one (data-driven: a service without status gets none, a pod keeps its warning)', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'svc', name: 'svc', type: 'service', labels: { namespace: 'shop' } } },
          { data: { id: 'p', name: 'p', type: 'pod', status: 'warning', labels: {} } },
        ],
        edges: [],
      },
    };
    const byId = new Map(normalizeGraph(raw).elements.map((e) => [e.data.id, e.data]));
    // No backend status → omitted → the stylesheet's node[status] selector won't border it.
    expect(byId.get('svc')?.status).toBeUndefined();
    // A valid backend status survives verbatim.
    expect(byId.get('p')?.status).toBe('warning');
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

  it('rejects a duplicate node id into errors and keeps the first copy', () => {
    // cytoscape would silently first-wins-dedupe the second copy; the boundary must
    // surface the inconsistency instead of letting the differ flip-flop on it.
    const raw = {
      elements: {
        nodes: [{ data: { id: 'x', type: 'pod', name: 'first' } }, { data: { id: 'x', type: 'pod', name: 'second' } }],
        edges: [],
      },
    };
    const result = normalizeGraph(raw);
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]?.data.label).toBe('first');
    expect(result.errors).toContain('nodes[1] duplicate id "x"');
  });

  it('rejects a duplicate edge id into errors and keeps the first copy', () => {
    const raw = {
      elements: {
        nodes: [{ data: { id: 'a', type: 'pod' } }, { data: { id: 'b', type: 'pod' } }],
        edges: [
          { data: { id: 'e', source: 'a', target: 'b', type: 'pod-calls-pod' } },
          { data: { id: 'e', source: 'b', target: 'a', type: 'pod-calls-pod' } },
        ],
      },
    };
    const result = normalizeGraph(raw);
    const edges = result.elements.filter((el) => el.group === 'edges');
    expect(edges).toHaveLength(1);
    expect(edges[0]?.data.source).toBe('a');
    expect(result.errors).toContain('edges[1] duplicate id "e"');
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
    // The cast-free assignments above (normalize.ts now writes `kind: type` / `edgeType:
    // d.type` without `as NodeKind`/`as EdgeType`) are themselves the compile-time guard:
    // this and normalize.ts fail `tsc` if GraphNodeKind/GraphEdgeType were ever narrowed
    // back to the closed unions, since `type` is a plain string.
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

    // Cluster boxes are non-selectable (decorative, drag-only); other nodes are not
    // marked, so they keep cytoscape's default selectable:true.
    const elById = new Map(elements.map((e) => [e.data.id as string, e]));
    expect(elById.get('cluster:demo')?.selectable).toBe(false);
    expect(elById.get('demo/node-a')?.selectable).toBeUndefined();
    expect(elById.get('demo/p1')?.selectable).toBeUndefined();
  });

  it('renders a flat payload flat — no parents, no cluster containers', () => {
    const { elements } = normalizeGraph(singleClusterGolden);
    expect(elements.every((e) => e.data.parent === undefined)).toBe(true);
    expect(elements.some((e) => (e.data as Record<string, unknown>).isCluster === true)).toBe(false);
  });

  it('tags a storageclass group container (kind=storageclass, no status/alerts) and passes PVC nesting through', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'cluster/prod', type: 'cluster', name: 'prod' } },
          {
            data: {
              id: 'prod/storageclass/fast-ssd',
              type: 'storageclass',
              name: 'fast-ssd',
              parent: 'cluster/prod',
              // A group node never carries alerts even if upstream sends them.
              alerts: [{ name: 'x', severity: 'warning', time: 1 }],
            },
          },
          {
            data: {
              id: 'pvc/data-0',
              type: 'pvc',
              name: 'data-0',
              parent: 'prod/storageclass/fast-ssd',
              status: 'warning',
            },
          },
        ],
        edges: [],
      },
    };
    const { elements, errors } = normalizeGraph(raw);
    expect(errors).toEqual([]);
    const byId = new Map(elements.map((e) => [e.data.id as string, e.data as Record<string, unknown>]));
    const sc = byId.get('prod/storageclass/fast-ssd');
    // Tagged as a storageclass container: it carries its `kind` (so it can show in the
    // icon legend when collapsed + be filterable) AND the `isStorageClass` flag (own
    // "Storage classes" section, excluded from detail). Like the K8s node container it
    // is a grouping box — NO status, NO alerts. It is NOT a cluster, and keeps its
    // backend parent + label.
    expect(sc?.isStorageClass).toBe(true);
    expect(sc?.kind).toBe('storageclass');
    expect(sc?.status).toBeUndefined();
    expect(sc?.alerts).toBeUndefined();
    expect(sc?.isCluster).toBeUndefined();
    expect(sc?.parent).toBe('cluster/prod');
    expect(sc?.label).toBe('fast-ssd');
    // The PVC nests under the storageclass group verbatim and keeps kind + status.
    expect(byId.get('pvc/data-0')?.parent).toBe('prod/storageclass/fast-ssd');
    expect(byId.get('pvc/data-0')?.kind).toBe('pvc');
    expect(byId.get('pvc/data-0')?.status).toBe('warning');
  });

  describe('node alerts', () => {
    const withAlerts = (alerts: unknown): ReturnType<typeof normalizeGraph> =>
      normalizeGraph({
        elements: {
          nodes: [{ data: { id: 'p1', type: 'pod', name: 'mongo-0', alerts } }],
          edges: [],
        },
      });

    it('parses time_records onto NodeAlert.timeRecords (ascending), keeping pod/service/id', () => {
      const { elements, errors } = withAlerts([
        {
          pod: 'mongo-0',
          service: 'mongo',
          name: 'HighMem',
          severity: 'critical',
          time_records: [1717500300, 1717500000],
          id: 'a1',
        },
        { name: 'Restart', severity: 'warning', time_records: [1717500300] },
      ]);
      expect(errors).toEqual([]);
      expect(elements[0]?.data.alerts).toEqual([
        {
          pod: 'mongo-0',
          service: 'mongo',
          name: 'HighMem',
          severity: 'critical',
          timeRecords: [1717500000, 1717500300], // sorted ascending
          id: 'a1',
        },
        { name: 'Restart', severity: 'warning', timeRecords: [1717500300] },
      ]);
    });

    it('falls back to a legacy scalar time → single-element timeRecords (epoch 0 valid)', () => {
      const { elements } = withAlerts([
        { name: 'Legacy', severity: 'warning', time: 1717500000 },
        { name: 'Epoch0', severity: 'warning', time: 0 },
      ]);
      expect(elements[0]?.data.alerts).toEqual([
        { name: 'Legacy', severity: 'warning', timeRecords: [1717500000] },
        { name: 'Epoch0', severity: 'warning', timeRecords: [0] },
      ]);
    });

    it('prefers time_records over a legacy scalar time when both are present', () => {
      const { elements } = withAlerts([
        { name: 'both', severity: 'warning', time: 999, time_records: [1717500000, 1717500300] },
      ]);
      expect(elements[0]?.data.alerts).toEqual([
        { name: 'both', severity: 'warning', timeRecords: [1717500000, 1717500300] },
      ]);
    });

    it('falls back to scalar time when time_records is present but all-invalid', () => {
      const { elements } = withAlerts([{ name: 'fb', severity: 'warning', time: 1717500000, time_records: [NaN, -1] }]);
      expect(elements[0]?.data.alerts).toEqual([{ name: 'fb', severity: 'warning', timeRecords: [1717500000] }]);
    });

    it('filters non-finite/negative entries inside time_records and sorts the rest', () => {
      const { elements } = withAlerts([
        { name: 'noisy', severity: 'warning', time_records: [1717500300, -5, NaN, Infinity, 1717500000, 0] },
      ]);
      expect(elements[0]?.data.alerts).toEqual([
        { name: 'noisy', severity: 'warning', timeRecords: [0, 1717500000, 1717500300] },
      ]);
    });

    it('drops alert entries with a bad/missing name or non-string/empty severity, keeping valid ones', () => {
      const { elements } = withAlerts([
        { name: 'ok', severity: 'warning', time_records: [1717500000] },
        { severity: 'critical', time_records: [1717500000] }, // missing name
        { name: 'noSev', time_records: [1717500000] }, // missing severity
        { name: 'emptySev', severity: '', time_records: [1717500000] }, // empty severity string
        { name: 'numSev', severity: 2, time_records: [1717500000] }, // severity not a string
        'nope', // not an object
      ]);
      expect(elements[0]?.data.alerts).toEqual([{ name: 'ok', severity: 'warning', timeRecords: [1717500000] }]);
    });

    it('keeps any non-empty severity string, including custom labels the backend defines', () => {
      const { elements } = withAlerts([
        { name: 'i', severity: 'info', time_records: [1717500000] },
        { name: 'n', severity: 'normal', time_records: [1717500003] }, // not a known tier, kept verbatim
        { name: 'x', severity: 'fatal', time_records: [1717500004] }, // custom label, kept verbatim
        { name: 'p', severity: 'P1', time_records: [1717500005] }, // custom label, kept verbatim
      ]);
      expect(elements[0]?.data.alerts).toEqual([
        { name: 'i', severity: 'info', timeRecords: [1717500000] },
        { name: 'n', severity: 'normal', timeRecords: [1717500003] },
        { name: 'x', severity: 'fatal', timeRecords: [1717500004] },
        { name: 'p', severity: 'P1', timeRecords: [1717500005] },
      ]);
    });

    it('omits the alerts field when absent, empty, or no entry has a valid occurrence time', () => {
      expect(withAlerts(undefined).elements[0]?.data.alerts).toBeUndefined();
      expect(withAlerts([]).elements[0]?.data.alerts).toBeUndefined();
      // no time at all
      expect(withAlerts([{ name: 'x', severity: 'warning' }]).elements[0]?.data.alerts).toBeUndefined();
      // empty record + no scalar
      expect(
        withAlerts([{ name: 'x', severity: 'warning', time_records: [] }]).elements[0]?.data.alerts
      ).toBeUndefined();
      // all-invalid records + invalid scalar
      expect(
        withAlerts([{ name: 'x', severity: 'warning', time: -1, time_records: [NaN, -5] }]).elements[0]?.data.alerts
      ).toBeUndefined();
    });

    it('never carries alerts on a cluster container node', () => {
      const { elements } = normalizeGraph({
        elements: {
          nodes: [
            {
              data: {
                id: 'c1',
                type: 'cluster',
                name: 'demo',
                alerts: [{ name: 'x', severity: 'warning', time_records: [1] }],
              },
            },
          ],
          edges: [],
        },
      });
      expect(elements[0]?.data.alerts).toBeUndefined();
    });
  });
});

function podWithOwner(id: string, cluster: string, ns: string, owner: { kind: string; name: string }) {
  return {
    data: { id, name: id, type: 'pod', parent: `${cluster}/node-a`, owner, labels: { cluster, namespace: ns } },
  };
}

describe('normalizeGraph — controller synthesis', () => {
  // A collapsed controller's rectangle is tinted by the worst STATUS among its child
  // pods (see getStylesheet); normalize aggregates it onto the synthesized controller
  // as data.worstStatus (rank critical>warning>normal). STATUS — not alerts — drives
  // the tint: every node carries a status (default normal), so a pod that is `warning`
  // WITHOUT an alert still propagates.
  const ownedPodWithStatus = (id: string, owner: { kind: string; name: string }, status?: string) => ({
    data: {
      id,
      name: id,
      type: 'pod',
      parent: 'cluster/prod',
      owner,
      labels: { cluster: 'prod', namespace: 'shop' },
      ...(status !== undefined ? { status } : {}),
    },
  });
  const controllerOf = (raw: unknown): cytoscape.NodeDataDefinition | undefined => {
    const controllers = normalizeGraph(raw).elements.filter(
      (e) => e.group === 'nodes' && (e.data as cytoscape.NodeDataDefinition).isController === true
    );
    return controllers.length > 0 ? controllers[0]!.data : undefined;
  };
  const withControllerPods = (...pods: Array<ReturnType<typeof ownedPodWithStatus>>): unknown => ({
    elements: {
      nodes: [{ data: { id: 'cluster/prod', name: 'prod', type: 'cluster', labels: {} } }, ...pods],
      edges: [],
    },
  });

  it('tags the synthesized controller with the worst child-pod STATUS (warning + critical → critical)', () => {
    const raw = withControllerPods(
      ownedPodWithStatus('prod/p1', { kind: 'Deployment', name: 'api' }, 'warning'),
      ownedPodWithStatus('prod/p2', { kind: 'Deployment', name: 'api' }, 'critical')
    );
    expect(controllerOf(raw)?.worstStatus).toBe('critical');
  });

  it('propagates a warning STATUS even when the pod carries no alert (status, not alerts)', () => {
    const raw = withControllerPods(ownedPodWithStatus('prod/p1', { kind: 'Deployment', name: 'api' }, 'warning'));
    expect(controllerOf(raw)?.worstStatus).toBe('warning');
  });

  it('treats an unknown / absent status as normal (default), so worstStatus is normal (drawn too, D10)', () => {
    const raw = withControllerPods(ownedPodWithStatus('prod/p1', { kind: 'Deployment', name: 'api' }, 'bogus'));
    expect(controllerOf(raw)?.worstStatus).toBe('normal');
  });

  it('writes worstStatus normal when every owned pod is normal (all-healthy collapses to green, D10)', () => {
    const raw = withControllerPods(ownedPodWithStatus('prod/p1', { kind: 'Deployment', name: 'api' }, 'normal'));
    expect(controllerOf(raw)?.worstStatus).toBe('normal');
  });

  // The SAME collapse-status propagation applies to a k8s `node` container: a collapsed
  // node borders by the worst of its OWN status and its child pods' statuses (worst-wins,
  // never downgraded). normalize tags it onto the node as data.worstStatus.
  describe('collapsed k8s node status tint (data.worstStatus)', () => {
    const dataOf = (raw: unknown, id: string): cytoscape.NodeDataDefinition | undefined =>
      normalizeGraph(raw).elements.find(
        (e) => e.group === 'nodes' && (e.data as cytoscape.NodeDataDefinition).id === id
      )?.data;
    const k8sNode = (id: string, status?: string) => ({
      data: { id, name: id, type: 'node', parent: 'cluster/prod', ...(status !== undefined ? { status } : {}) },
    });
    const podUnder = (id: string, parent: string, status?: string) => ({
      data: { id, name: id, type: 'pod', parent, ...(status !== undefined ? { status } : {}) },
    });
    const graph = (...nodes: Array<{ data: Record<string, unknown> }>): unknown => ({
      elements: { nodes: [{ data: { id: 'cluster/prod', name: 'prod', type: 'cluster' } }, ...nodes], edges: [] },
    });

    it('tints a collapsed node by the worst child-pod status (normal node + critical pod → critical)', () => {
      const raw = graph(k8sNode('node/w0', 'normal'), podUnder('pod/a', 'node/w0', 'critical'));
      expect(dataOf(raw, 'node/w0')?.worstStatus).toBe('critical');
    });

    it("never downgrades below the node's own status (critical node + normal pod → critical)", () => {
      const raw = graph(k8sNode('node/w0', 'critical'), podUnder('pod/a', 'node/w0', 'normal'));
      expect(dataOf(raw, 'node/w0')?.worstStatus).toBe('critical');
    });

    it('propagates a child warning onto a normal node (worst-wins → warning)', () => {
      const raw = graph(k8sNode('node/w0', 'normal'), podUnder('pod/a', 'node/w0', 'warning'));
      expect(dataOf(raw, 'node/w0')?.worstStatus).toBe('warning');
    });

    it('takes the worst of own status and children (warning node + critical pod → critical)', () => {
      const raw = graph(k8sNode('node/w0', 'warning'), podUnder('pod/a', 'node/w0', 'critical'));
      expect(dataOf(raw, 'node/w0')?.worstStatus).toBe('critical');
    });

    it('writes worstStatus normal when the node and all its pods are normal (green box, D10)', () => {
      const raw = graph(k8sNode('node/w0', 'normal'), podUnder('pod/a', 'node/w0', 'normal'));
      expect(dataOf(raw, 'node/w0')?.worstStatus).toBe('normal');
    });

    it('writes worstStatus normal for a status-less node whose pods are all status-less (children = info)', () => {
      const raw = graph(k8sNode('node/w0'), podUnder('pod/a', 'node/w0'));
      expect(dataOf(raw, 'node/w0')?.worstStatus).toBe('normal');
    });

    it('omits worstStatus for a node with no status and no child pods (no data is not normal)', () => {
      const raw = graph(k8sNode('node/w0'));
      expect(dataOf(raw, 'node/w0')?.worstStatus).toBeUndefined();
    });
  });

  // A controller's detail-panel alert table lists every owned pod's alerts: normalize
  // concatenates them in stable podId order onto the synthesized controller. Entries
  // missing `pod` are attributed to their source pod's label on a COPY (the pod
  // element's own alerts stay untouched); entries carrying an `id` dedupe across pods.
  // Colour stays STATUS-driven (worstStatus above) — alerts never tint.
  describe('controller alert aggregation (data.alerts)', () => {
    const alertPod = (id: string, name: string, alerts?: unknown, status?: string) => ({
      data: {
        id,
        name,
        type: 'pod',
        parent: 'cluster/prod',
        owner: { kind: 'StatefulSet', name: 'mongo' },
        labels: { cluster: 'prod', namespace: 'shop' },
        ...(alerts !== undefined ? { alerts } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    });
    const graphOf = (...pods: Array<{ data: Record<string, unknown> }>): unknown => ({
      elements: {
        nodes: [{ data: { id: 'cluster/prod', name: 'prod', type: 'cluster', labels: {} } }, ...pods],
        edges: [],
      },
    });

    it('concatenates child-pod alerts in stable podId order, attributing each to its pod', () => {
      // raw order p2 before p1 — aggregation must still come out p1-first (podId sort).
      const raw = graphOf(
        alertPod('prod/p2', 'mongo-1', [{ name: 'CrashLoop', severity: 'warning', time_records: [1717500300] }]),
        alertPod('prod/p1', 'mongo-0', [{ name: 'HighMem', severity: 'critical', time_records: [1717500000] }])
      );
      expect(controllerOf(raw)?.alerts).toEqual([
        { name: 'HighMem', severity: 'critical', timeRecords: [1717500000], pod: 'mongo-0' },
        { name: 'CrashLoop', severity: 'warning', timeRecords: [1717500300], pod: 'mongo-1' },
      ]);
    });

    it('keeps an explicit backend pod attribution instead of backfilling', () => {
      const raw = graphOf(
        alertPod('prod/p1', 'mongo-0', [
          { name: 'SvcDown', severity: 'critical', pod: 'other-pod', time_records: [1717500000] },
        ])
      );
      expect(controllerOf(raw)?.alerts).toEqual([
        { name: 'SvcDown', severity: 'critical', pod: 'other-pod', timeRecords: [1717500000] },
      ]);
    });

    it('dedupes alerts sharing an id across pods (first in stable order wins); keeps id-less ones', () => {
      const shared = { name: 'SvcDegraded', severity: 'warning', time_records: [1717500000], id: 'a1' };
      const local = { name: 'Local', severity: 'info', time_records: [1717500100] };
      const raw = graphOf(
        alertPod('prod/p1', 'mongo-0', [shared, local]),
        alertPod('prod/p2', 'mongo-1', [shared, local])
      );
      const alerts = controllerOf(raw)?.alerts;
      expect(alerts?.filter((a) => a.id === 'a1')).toHaveLength(1);
      expect(alerts?.[0]?.pod).toBe('mongo-0'); // first in stable podId order wins
      expect(alerts?.filter((a) => a.name === 'Local')).toHaveLength(2); // no id → never deduped
    });

    it('omits controller alerts when no owned pod carries any', () => {
      const raw = graphOf(alertPod('prod/p1', 'mongo-0'));
      expect(controllerOf(raw)?.alerts).toBeUndefined();
    });

    it('keeps colour status-driven: a critical alert on a normal pod never escalates worstStatus', () => {
      const raw = graphOf(
        alertPod(
          'prod/p1',
          'mongo-0',
          [{ name: 'HighMem', severity: 'critical', time_records: [1717500000] }],
          'normal'
        )
      );
      const ctrl = controllerOf(raw);
      expect(ctrl?.alerts).toHaveLength(1);
      expect(ctrl?.worstStatus).toBe('normal'); // STATUS (not alert severity) drives the tint
    });

    it('leaves owns-edge synthesis untouched by the aggregation (one edge per alerting pod)', () => {
      const raw = graphOf(
        alertPod('prod/p1', 'mongo-0', [{ name: 'HighMem', severity: 'critical', time_records: [1717500000] }]),
        alertPod('prod/p2', 'mongo-1', [{ name: 'CrashLoop', severity: 'warning', time_records: [1717500300] }])
      );
      const owns = normalizeGraph(raw).elements.filter(
        (e) => e.group === 'edges' && (e.data as cytoscape.EdgeDataDefinition).edgeType === 'controller-owns-pod'
      );
      expect(owns.map((e) => (e.data as cytoscape.EdgeDataDefinition).target).sort()).toEqual(['prod/p1', 'prod/p2']);
    });

    it('leaves the source pod element untouched by the backfill (no pod field added there)', () => {
      const raw = graphOf(
        alertPod('prod/p1', 'mongo-0', [{ name: 'HighMem', severity: 'critical', time_records: [1717500000] }])
      );
      const pod = normalizeGraph(raw).elements.find((e) => (e.data as cytoscape.NodeDataDefinition).id === 'prod/p1')
        ?.data as cytoscape.NodeDataDefinition;
      expect(pod.alerts).toEqual([{ name: 'HighMem', severity: 'critical', timeRecords: [1717500000] }]);
    });
  });

  // Pods carry the backend's ArgoCD `application` + `containers` verbatim (validated);
  // a synthesized controller aggregates both from its owned pods — application from the
  // first valued pod in stable podId order, containers as the (name, image)-deduped
  // union. Both fields are OMITTED (never undefined-valued) when nothing survives.
  describe('application / containers passthrough and aggregation', () => {
    const specPod = (id: string, extra: Record<string, unknown>, owner?: { kind: string; name: string }) => ({
      data: {
        id,
        name: id,
        type: 'pod',
        parent: 'cluster/prod',
        ...(owner !== undefined ? { owner } : {}),
        labels: { cluster: 'prod', namespace: 'shop' },
        ...extra,
      },
    });
    const graphOf = (...pods: Array<{ data: Record<string, unknown> }>): unknown => ({
      elements: {
        nodes: [{ data: { id: 'cluster/prod', name: 'prod', type: 'cluster', labels: {} } }, ...pods],
        edges: [],
      },
    });
    const dataOf = (raw: unknown, id: string): cytoscape.NodeDataDefinition | undefined =>
      normalizeGraph(raw).elements.find(
        (e) => e.group === 'nodes' && (e.data as cytoscape.NodeDataDefinition).id === id
      )?.data;
    const mongo = { kind: 'StatefulSet', name: 'mongo' };

    it('passes a pod application and containers through verbatim', () => {
      const raw = graphOf(
        specPod('prod/p1', { application: 'checkout', containers: [{ name: 'app', image: 'repo/app:1.2' }] })
      );
      const pod = dataOf(raw, 'prod/p1');
      expect(pod?.application).toBe('checkout');
      expect(pod?.containers).toEqual([{ name: 'app', image: 'repo/app:1.2' }]);
    });

    it('omits both fields when absent or empty (old backend output stays unchanged)', () => {
      const raw = graphOf(specPod('prod/p1', {}), specPod('prod/p2', { application: '', containers: [] }));
      for (const id of ['prod/p1', 'prod/p2']) {
        const pod = dataOf(raw, id);
        expect(pod?.application).toBeUndefined();
        expect(pod?.containers).toBeUndefined();
        expect(pod !== undefined && 'application' in pod).toBe(false);
        expect(pod !== undefined && 'containers' in pod).toBe(false);
      }
      expect(normalizeGraph(raw).errors).toEqual([]);
    });

    it('drops malformed container entries, keeping valid ones', () => {
      const raw = graphOf(
        specPod('prod/p1', {
          containers: [
            { name: 'app', image: 'repo/app:1.2' },
            { name: '', image: 'x' }, // empty name
            { name: 'noimg' }, // missing image
            { name: 'numimg', image: 7 }, // image not a string
            'nope', // not an object
          ],
        })
      );
      expect(dataOf(raw, 'prod/p1')?.containers).toEqual([{ name: 'app', image: 'repo/app:1.2' }]);
    });

    it('omits containers when no entry survives validation', () => {
      const raw = graphOf(specPod('prod/p1', { containers: [{ name: '', image: '' }, 'junk'] }));
      expect(dataOf(raw, 'prod/p1')?.containers).toBeUndefined();
    });

    it('aggregates application onto the controller from the first valued pod in stable podId order', () => {
      // Raw order p2 (beta) before p1 (alpha) — the podId sort must still pick p1's value.
      const raw = graphOf(
        specPod('prod/p2', { application: 'beta' }, mongo),
        specPod('prod/p1', { application: 'alpha' }, mongo)
      );
      expect(controllerOf(raw)?.application).toBe('alpha');
    });

    it('skips application-less pods when picking the controller application', () => {
      const raw = graphOf(specPod('prod/p1', {}, mongo), specPod('prod/p2', { application: 'beta' }, mongo));
      expect(controllerOf(raw)?.application).toBe('beta');
    });

    it('aggregates the containers union onto the controller, deduped by (name, image) and sorted', () => {
      const app = { name: 'app', image: 'repo/app:1.2' };
      const raw = graphOf(
        specPod('prod/p1', { containers: [app] }, mongo),
        specPod('prod/p2', { containers: [app, { name: 'sidecar', image: 'repo/sc:0.9' }] }, mongo),
        specPod('prod/p3', { containers: [app] }, mongo)
      );
      expect(controllerOf(raw)?.containers).toEqual([
        { name: 'app', image: 'repo/app:1.2' },
        { name: 'sidecar', image: 'repo/sc:0.9' },
      ]);
    });

    it('keeps same-named containers with different images apart (deduped by the PAIR)', () => {
      const raw = graphOf(
        specPod('prod/p1', { containers: [{ name: 'app', image: 'repo/app:1.2' }] }, mongo),
        specPod('prod/p2', { containers: [{ name: 'app', image: 'repo/app:1.3' }] }, mongo)
      );
      expect(controllerOf(raw)?.containers).toEqual([
        { name: 'app', image: 'repo/app:1.2' },
        { name: 'app', image: 'repo/app:1.3' },
      ]);
    });

    it('omits both controller fields when no owned pod carries a value', () => {
      const raw = graphOf(specPod('prod/p1', {}, mongo));
      const ctrl = controllerOf(raw);
      expect(ctrl).toBeDefined();
      expect(ctrl !== undefined && 'application' in ctrl).toBe(false);
      expect(ctrl !== undefined && 'containers' in ctrl).toBe(false);
    });

    it('leaves worstStatus, dedup and owns edges untouched by the aggregation', () => {
      const raw = graphOf(
        specPod('prod/p1', { application: 'checkout', status: 'critical' }, mongo),
        specPod('prod/p2', { containers: [{ name: 'app', image: 'repo/app:1.2' }] }, mongo)
      );
      const { elements } = normalizeGraph(raw);
      const controllers = elements.filter(
        (e) => e.group === 'nodes' && (e.data as cytoscape.NodeDataDefinition).isController === true
      );
      expect(controllers).toHaveLength(1); // dedup key unchanged
      expect((controllers[0]!.data as cytoscape.NodeDataDefinition).worstStatus).toBe('critical');
      const owns = elements.filter(
        (e) => e.group === 'edges' && (e.data as cytoscape.EdgeDataDefinition).edgeType === 'controller-owns-pod'
      );
      expect(owns.map((e) => (e.data as cytoscape.EdgeDataDefinition).target).sort()).toEqual(['prod/p1', 'prod/p2']);
    });

    it('is deterministic and does not mutate the input across repeated calls', () => {
      const raw = graphOf(
        specPod('prod/p2', { application: 'beta', containers: [{ name: 'b', image: 'r/b:1' }] }, mongo),
        specPod('prod/p1', { application: 'alpha', containers: [{ name: 'a', image: 'r/a:1' }] }, mongo)
      );
      const snapshot = JSON.stringify(raw);
      const a = JSON.stringify(normalizeGraph(raw).elements);
      const b = JSON.stringify(normalizeGraph(raw).elements);
      expect(a).toBe(b);
      expect(JSON.stringify(raw)).toBe(snapshot);
    });
  });

  it('synthesizes one controller node + an owns edge per owned pod, deduped by (cluster,ns,kind,name)', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'cluster/prod', name: 'prod', type: 'cluster', labels: {} } },
          {
            data: {
              id: 'prod/node-a',
              name: 'node-a',
              type: 'node',
              parent: 'cluster/prod',
              labels: { cluster: 'prod' },
            },
          },
          podWithOwner('prod/p1', 'prod', 'shop', { kind: 'StatefulSet', name: 'mongo' }),
          podWithOwner('prod/p2', 'prod', 'shop', { kind: 'StatefulSet', name: 'mongo' }),
        ],
        edges: [],
      },
    };
    const { elements } = normalizeGraph(raw);
    const controllers = elements.filter(
      (e) => e.group === 'nodes' && (e.data as cytoscape.NodeDataDefinition).isController === true
    );
    expect(controllers).toHaveLength(1);
    const ctrl = controllers[0]!.data as cytoscape.NodeDataDefinition;
    expect(ctrl.kind).toBe('statefulset');
    expect(ctrl.label).toBe('mongo');
    expect(ctrl.parent).toBe('cluster/prod');
    const owns = elements.filter(
      (e) => e.group === 'edges' && (e.data as cytoscape.EdgeDataDefinition).edgeType === 'controller-owns-pod'
    );
    expect(owns).toHaveLength(2);
    expect(owns.map((e) => (e.data as cytoscape.EdgeDataDefinition).target).sort()).toEqual(['prod/p1', 'prod/p2']);
    expect(owns.every((e) => (e.data as cytoscape.EdgeDataDefinition).source === ctrl.id)).toBe(true);
  });

  it('keeps same-named controllers in different namespaces separate', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'cluster/prod', name: 'prod', type: 'cluster', labels: {} } },
          podWithOwner('prod/a1', 'prod', 'a', { kind: 'Deployment', name: 'api' }),
          podWithOwner('prod/b1', 'prod', 'b', { kind: 'Deployment', name: 'api' }),
        ],
        edges: [],
      },
    };
    const ctrls = normalizeGraph(raw).elements.filter(
      (e) => (e.data as cytoscape.NodeDataDefinition).isController === true
    );
    expect(ctrls).toHaveLength(2);
  });

  it('tags the synthesized controller with its namespace (from owned pods)', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'cluster/prod', name: 'prod', type: 'cluster', labels: {} } },
          podWithOwner('prod/p1', 'prod', 'shop', { kind: 'Deployment', name: 'api' }),
        ],
        edges: [],
      },
    };
    const ctrl = normalizeGraph(raw).elements.find(
      (e) => (e.data as cytoscape.NodeDataDefinition).isController === true
    )?.data as cytoscape.NodeDataDefinition | undefined;
    expect(ctrl?.namespace).toBe('shop');
  });

  it('omits the controller namespace when owned pods carry none (exactOptionalPropertyTypes)', () => {
    const raw = {
      elements: {
        nodes: [{ data: { id: 'p1', name: 'p1', type: 'pod', labels: { owner_kind: 'Job', owner_name: 'batch' } } }],
        edges: [],
      },
    };
    const ctrl = normalizeGraph(raw).elements.find(
      (e) => (e.data as cytoscape.NodeDataDefinition).isController === true
    )?.data as cytoscape.NodeDataDefinition | undefined;
    expect(ctrl).toBeDefined();
    expect(ctrl !== undefined && 'namespace' in ctrl).toBe(false);
  });

  it('gives same-named controllers in different namespaces their own namespace', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'cluster/prod', name: 'prod', type: 'cluster', labels: {} } },
          podWithOwner('prod/a1', 'prod', 'a', { kind: 'Deployment', name: 'api' }),
          podWithOwner('prod/b1', 'prod', 'b', { kind: 'Deployment', name: 'api' }),
        ],
        edges: [],
      },
    };
    const namespaces = normalizeGraph(raw)
      .elements.filter((e) => (e.data as cytoscape.NodeDataDefinition).isController === true)
      .map((e) => (e.data as cytoscape.NodeDataDefinition).namespace);
    expect([...namespaces].sort()).toEqual(['a', 'b']);
  });

  it('does not synthesize for pods without an owner', () => {
    const raw = {
      elements: {
        nodes: [{ data: { id: 'prod/p1', name: 'p1', type: 'pod', labels: { cluster: 'prod', namespace: 'x' } } }],
        edges: [],
      },
    };
    expect(
      normalizeGraph(raw).elements.some((e) => (e.data as cytoscape.NodeDataDefinition).isController === true)
    ).toBe(false);
  });

  it('falls back to legacy labels.owner_kind / owner_name', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'cluster/prod', name: 'prod', type: 'cluster', labels: {} } },
          {
            data: {
              id: 'prod/p1',
              name: 'p1',
              type: 'pod',
              parent: 'cluster/prod',
              labels: { cluster: 'prod', namespace: 'x', owner_kind: 'DaemonSet', owner_name: 'fluentd' },
            },
          },
        ],
        edges: [],
      },
    };
    const ctrl = normalizeGraph(raw).elements.find(
      (e) => (e.data as cytoscape.NodeDataDefinition).isController === true
    )?.data as cytoscape.NodeDataDefinition | undefined;
    expect(ctrl?.kind).toBe('daemonset');
    expect(ctrl?.label).toBe('fluentd');
  });

  it('gives an owner-but-no-cluster pod a parentless (top-level) controller', () => {
    const raw = {
      elements: {
        nodes: [
          {
            data: {
              id: 'p1',
              name: 'p1',
              type: 'pod',
              labels: { namespace: 'x', owner_kind: 'Job', owner_name: 'batch' },
            },
          },
        ],
        edges: [],
      },
    };
    const ctrl = normalizeGraph(raw).elements.find(
      (e) => (e.data as cytoscape.NodeDataDefinition).isController === true
    )?.data as cytoscape.NodeDataDefinition | undefined;
    expect(ctrl).toBeDefined();
    expect(ctrl?.parent).toBeUndefined();
  });

  it('is deterministic and does not mutate input', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'cluster/prod', name: 'prod', type: 'cluster', labels: {} } },
          podWithOwner('prod/p1', 'prod', 'shop', { kind: 'Deployment', name: 'web' }),
        ],
        edges: [],
      },
    };
    const snapshot = JSON.stringify(raw);
    const a = JSON.stringify(normalizeGraph(raw).elements);
    const b = JSON.stringify(normalizeGraph(raw).elements);
    expect(a).toBe(b);
    // Proves non-mutation: raw is byte-for-byte identical after both calls.
    expect(JSON.stringify(raw)).toBe(snapshot);
  });

  it("synthesizes a parentless controller when the pod's cluster label has no matching cluster node", () => {
    // The pod references cluster "orphan-cluster" which has no cluster container in the payload.
    const raw = {
      elements: {
        nodes: [podWithOwner('prod/p1', 'orphan-cluster', 'shop', { kind: 'ReplicaSet', name: 'api' })],
        edges: [],
      },
    };
    const ctrl = normalizeGraph(raw).elements.find(
      (e) => (e.data as cytoscape.NodeDataDefinition).isController === true
    )?.data as cytoscape.NodeDataDefinition | undefined;
    expect(ctrl).toBeDefined();
    // clusterIdByName.get('orphan-cluster') returns undefined → no parent assigned.
    expect(ctrl?.parent).toBeUndefined();
  });
});
