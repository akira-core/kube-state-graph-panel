import type cytoscape from 'cytoscape';

import { normalizeGraph } from './normalize';

// Fixtures mirror the upstream kube-state-graph D6 cytoscape payload contract
// (cluster > namespace > application > controller > pod; node + storageclass leaves
// under the cluster; pvc / service under the namespace).
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
          type: 'pod-to-node',
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
    expect(edge?.data.edgeType).toBe('pod-to-node'); // mapped from data.type
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
        edges: [{ data: { id: 'e1', source: 'a', target: 'ghost', type: 'pod-to-node' } }],
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

  // ── Service / PVC ArgoCD `application` passthrough (backend D6 enrichment) ──
  // The backend now resolves an ArgoCD application for service / pvc leaves too (from
  // the annotation tracking-id) and nests them under their application group. normalize
  // passes that `application` through on those leaves exactly as it does for pods —
  // `containers` / `owner` remain pod-only.
  describe('service / pvc application passthrough (backend D6)', () => {
    const leaf = (type: string, extra: Record<string, unknown>): unknown => ({
      elements: {
        nodes: [{ data: { id: `prod/${type}1`, name: `${type}1`, type, labels: { namespace: 'shop' }, ...extra } }],
        edges: [],
      },
    });
    const dataOf = (raw: unknown): cytoscape.NodeDataDefinition | undefined =>
      normalizeGraph(raw).elements.find((e) => e.data.id !== undefined)?.data;

    it('passes a service node application through verbatim', () => {
      expect(dataOf(leaf('service', { application: 'mongodb' }))?.application).toBe('mongodb');
    });

    it('passes a pvc node application through verbatim', () => {
      expect(dataOf(leaf('pvc', { application: 'mongodb' }))?.application).toBe('mongodb');
    });

    it('omits application on a service node with no application', () => {
      const d = dataOf(leaf('service', {}));
      expect(d !== undefined && 'application' in d).toBe(false);
    });

    it('omits application on a service node whose application is not a string', () => {
      const d = dataOf(leaf('service', { application: 42 }));
      expect(d !== undefined && 'application' in d).toBe(false);
    });

    it('never carries containers / owner onto a service leaf (those stay pod-only)', () => {
      const d = dataOf(
        leaf('service', { application: 'mongodb', containers: [{ name: 'c', image: 'r/c:1' }], owner: { kind: 'X', name: 'y' } })
      );
      expect(d?.application).toBe('mongodb');
      expect(d !== undefined && 'containers' in d).toBe(false);
      expect(d !== undefined && 'owner' in d).toBe(false);
    });
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

    // Every compound parent — including the decorative cluster — is selectable so the
    // built-in expand-collapse +/- cue can surface on selection; normalize no longer
    // marks any node selectable:false (cytoscape's default selectable:true applies).
    const elById = new Map(elements.map((e) => [e.data.id as string, e]));
    expect(elById.get('cluster:demo')?.selectable).toBeUndefined();
    expect(elById.get('demo/node-a')?.selectable).toBeUndefined();
    expect(elById.get('demo/p1')?.selectable).toBeUndefined();
  });

  it('renders a flat payload flat — no parents, no cluster containers', () => {
    const { elements } = normalizeGraph(singleClusterGolden);
    expect(elements.every((e) => e.data.parent === undefined)).toBe(true);
    expect(elements.some((e) => (e.data as Record<string, unknown>).isCluster === true)).toBe(false);
  });

  // ── Backend D6 decorative group nodes (namespace / application / controller) ──
  describe('backend group-node recognition (D4)', () => {
    const byId = (raw: unknown): Map<string, cytoscape.NodeDataDefinition> =>
      new Map(normalizeGraph(raw).elements.map((e) => [e.data.id as string, e.data as cytoscape.NodeDataDefinition]));
    const elById = (raw: unknown): Map<string, cytoscape.ElementDefinition> =>
      new Map(normalizeGraph(raw).elements.map((e) => [e.data.id as string, e]));

    it('normalizes a namespace group node: isNamespace + accent, no kind, selectable (cue surface)', () => {
      const raw = {
        elements: {
          nodes: [
            { data: { id: 'cluster/prod', type: 'cluster', name: 'prod' } },
            { data: { id: 'prod/namespace/shop', type: 'namespace', name: 'shop', parent: 'cluster/prod', labels: {} } },
          ],
          edges: [],
        },
      };
      const d = byId(raw).get('prod/namespace/shop');
      expect(d?.isNamespace).toBe(true);
      expect(d?.namespace).toBe('shop');
      expect(typeof d?.namespaceColor).toBe('string');
      expect(d?.kind).toBeUndefined();
      expect(d?.parent).toBe('cluster/prod'); // passthrough verbatim
      expect(elById(raw).get('prod/namespace/shop')?.selectable).toBeUndefined(); // selectable (no selectable:false)
    });

    it('normalizes an application group node: isApplication + accent, no kind, selectable (cue surface)', () => {
      const raw = {
        elements: {
          nodes: [
            {
              data: {
                id: 'prod/namespace/shop/application/checkout',
                type: 'application',
                name: 'checkout',
                parent: 'prod/namespace/shop',
                labels: {},
              },
            },
          ],
          edges: [],
        },
      };
      const d = byId(raw).get('prod/namespace/shop/application/checkout');
      expect(d?.isApplication).toBe(true);
      expect(d?.application).toBe('checkout');
      expect(typeof d?.applicationColor).toBe('string');
      expect(d?.kind).toBeUndefined();
      expect(d?.parent).toBe('prod/namespace/shop');
      expect(elById(raw).get('prod/namespace/shop/application/checkout')?.selectable).toBeUndefined(); // selectable (no selectable:false)
    });

    it('normalizes a controller group node: isController, kind from child pod owner.kind, selectable:false', () => {
      const ctrlId = 'prod/namespace/shop/application/mongo/controller/StatefulSet/mongo';
      const raw = {
        elements: {
          nodes: [
            { data: { id: 'cluster/prod', type: 'cluster', name: 'prod' } },
            { data: { id: ctrlId, type: 'controller', name: 'mongo', parent: 'cluster/prod', labels: {} } },
            {
              data: {
                id: 'prod/p1',
                type: 'pod',
                name: 'mongo-0',
                parent: ctrlId,
                owner: { kind: 'StatefulSet', name: 'mongo' },
                labels: { cluster: 'prod', namespace: 'shop' },
              },
            },
          ],
          edges: [],
        },
      };
      const d = byId(raw).get(ctrlId);
      expect(d?.isController).toBe(true);
      expect(d?.kind).toBe('statefulset'); // lowercased child owner.kind
      expect(d?.parent).toBe('cluster/prod');
      // A controller is detail-eligible (resolveSelectedNode opens it) so it MUST stay
      // selectable — unlike the purely-decorative cluster/namespace/application groups.
      // selectable:false would make the canvas tap/cxttap gate drop every controller click.
      expect(elById(raw).get(ctrlId)?.selectable).toBeUndefined();
    });
  });

  // ── New backend edges pass through (D6) ──
  it('maps the new backend edges pod-to-node and pvc-to-storageclass (not the unknown fallback)', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'cluster/prod', type: 'cluster', name: 'prod' } },
          { data: { id: 'prod/node-a', type: 'node', name: 'node-a', parent: 'cluster/prod' } },
          { data: { id: 'prod/p1', type: 'pod', name: 'p1', parent: 'cluster/prod', labels: { node: 'prod/node-a' } } },
          { data: { id: 'prod/pvc1', type: 'pvc', name: 'pvc1', parent: 'cluster/prod' } },
          { data: { id: 'prod/storageclass/gp3', type: 'storageclass', name: 'gp3', parent: 'cluster/prod' } },
        ],
        edges: [
          { data: { id: 'e1', type: 'pod-to-node', source: 'prod/p1', target: 'prod/node-a' } },
          { data: { id: 'e2', type: 'pvc-to-storageclass', source: 'prod/pvc1', target: 'prod/storageclass/gp3' } },
        ],
      },
    };
    const { elements, errors } = normalizeGraph(raw);
    expect(errors).toEqual([]);
    const edges = elements.filter((e) => e.group === 'edges');
    expect(edges.map((e) => (e.data as cytoscape.EdgeDataDefinition).edgeType).sort()).toEqual([
      'pod-to-node',
      'pvc-to-storageclass',
    ]);
  });

  it('does not invent a pvc-to-storageclass edge for a PVC with no resolved storageclass', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'cluster/prod', type: 'cluster', name: 'prod' } },
          { data: { id: 'prod/pvc1', type: 'pvc', name: 'pvc1', parent: 'prod/namespace/db' } },
        ],
        edges: [],
      },
    };
    const { elements } = normalizeGraph(raw);
    expect(elements.some((e) => e.group === 'edges')).toBe(false);
  });

  // ── StorageClass is now a LEAF (D3) ──
  describe('storageclass leaf', () => {
    const byId = (raw: unknown): Map<string, cytoscape.NodeDataDefinition> =>
      new Map(normalizeGraph(raw).elements.map((e) => [e.data.id as string, e.data as cytoscape.NodeDataDefinition]));

    it('normalizes as a kind:storageclass leaf with provisioner/parameters, no isStorageClass, no status', () => {
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
                provisioner: 'rook-ceph.rbd.csi.ceph.com',
                parameters: { pool: 'kube', fs: 'ext4' },
              },
            },
          ],
          edges: [],
        },
      };
      const sc = byId(raw).get('prod/storageclass/fast-ssd') as Record<string, unknown> | undefined;
      expect(sc?.kind).toBe('storageclass');
      expect(sc?.provisioner).toBe('rook-ceph.rbd.csi.ceph.com');
      expect(sc?.parameters).toEqual({ pool: 'kube', fs: 'ext4' });
      expect(sc !== undefined && 'isStorageClass' in sc).toBe(false);
      expect(sc?.status).toBeUndefined();
      expect(sc?.isCluster).toBeUndefined();
      expect(sc?.parent).toBe('cluster/prod');
      expect(sc?.label).toBe('fast-ssd');
    });

    it('omits provisioner / parameters for a bare (referenced-but-undefined) storageclass', () => {
      const raw = {
        elements: {
          nodes: [{ data: { id: 'prod/storageclass/bare', type: 'storageclass', name: 'bare' } }],
          edges: [],
        },
      };
      const sc = byId(raw).get('prod/storageclass/bare') as Record<string, unknown> | undefined;
      expect(sc?.kind).toBe('storageclass');
      expect(sc !== undefined && 'provisioner' in sc).toBe(false);
      expect(sc !== undefined && 'parameters' in sc).toBe(false);
    });

    it('drops parameters that fail the string-record shape, keeping the rest', () => {
      const raw = {
        elements: {
          nodes: [
            {
              data: {
                id: 'prod/storageclass/sc',
                type: 'storageclass',
                name: 'sc',
                provisioner: 'csi',
                parameters: { pool: 'kube', bad: 7 }, // non-string value → whole map dropped
              },
            },
          ],
          edges: [],
        },
      };
      const sc = byId(raw).get('prod/storageclass/sc') as Record<string, unknown> | undefined;
      expect(sc?.provisioner).toBe('csi');
      expect(sc !== undefined && 'parameters' in sc).toBe(false);
    });
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
      expect(withAlerts([{ name: 'x', severity: 'warning' }]).elements[0]?.data.alerts).toBeUndefined();
      expect(
        withAlerts([{ name: 'x', severity: 'warning', time_records: [] }]).elements[0]?.data.alerts
      ).toBeUndefined();
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

// ── D8: node worstStatus aggregated via pod-to-node edges ──
describe('normalizeGraph — node worstStatus via pod-to-node edges', () => {
  const dataOf = (raw: unknown, id: string): cytoscape.NodeDataDefinition | undefined =>
    normalizeGraph(raw).elements.find((e) => e.group === 'nodes' && (e.data as cytoscape.NodeDataDefinition).id === id)
      ?.data;
  const k8sNode = (id: string, status?: string) => ({
    data: { id, name: id, type: 'node', parent: 'cluster/prod', ...(status !== undefined ? { status } : {}) },
  });
  const podNode = (id: string, status?: string) => ({
    data: { id, name: id, type: 'pod', parent: 'cluster/prod', ...(status !== undefined ? { status } : {}) },
  });
  const podToNode = (podId: string, nodeId: string) => ({
    data: { id: `e:${podId}:${nodeId}`, type: 'pod-to-node', source: podId, target: nodeId },
  });
  const graph = (nodes: Array<{ data: Record<string, unknown> }>, edges: Array<{ data: Record<string, unknown> }> = []): unknown => ({
    elements: { nodes: [{ data: { id: 'cluster/prod', name: 'prod', type: 'cluster' } }, ...nodes], edges },
  });

  it('takes the worst of pods reachable via pod-to-node (warning + critical → critical)', () => {
    const raw = graph(
      [k8sNode('node/w0', 'normal'), podNode('pod/a', 'warning'), podNode('pod/b', 'critical')],
      [podToNode('pod/a', 'node/w0'), podToNode('pod/b', 'node/w0')]
    );
    expect(dataOf(raw, 'node/w0')?.worstStatus).toBe('critical');
  });

  it("never downgrades below the node's own status (critical node + normal reachable pod → critical)", () => {
    const raw = graph([k8sNode('node/w0', 'critical'), podNode('pod/a', 'normal')], [podToNode('pod/a', 'node/w0')]);
    expect(dataOf(raw, 'node/w0')?.worstStatus).toBe('critical');
  });

  it('propagates a reachable warning onto a normal node (worst-wins → warning)', () => {
    const raw = graph([k8sNode('node/w0', 'normal'), podNode('pod/a', 'warning')], [podToNode('pod/a', 'node/w0')]);
    expect(dataOf(raw, 'node/w0')?.worstStatus).toBe('warning');
  });

  it('writes worstStatus normal when the node and its reachable pods are all normal (green box, D10)', () => {
    const raw = graph([k8sNode('node/w0', 'normal'), podNode('pod/a', 'normal')], [podToNode('pod/a', 'node/w0')]);
    expect(dataOf(raw, 'node/w0')?.worstStatus).toBe('normal');
  });

  it('writes worstStatus normal for a status-less node with a status-less reachable pod (has info)', () => {
    const raw = graph([k8sNode('node/w0'), podNode('pod/a')], [podToNode('pod/a', 'node/w0')]);
    expect(dataOf(raw, 'node/w0')?.worstStatus).toBe('normal');
  });

  it('omits worstStatus for a node with no status and no reachable pod (no data is not normal)', () => {
    const raw = graph([k8sNode('node/w0')]);
    expect(dataOf(raw, 'node/w0')?.worstStatus).toBeUndefined();
  });
});

// ── D5: controller enrichment (backend emits the group; normalize decorates it) ──
describe('normalizeGraph — controller enrichment', () => {
  const CTRL_ID = 'prod/namespace/shop/application/mongo/controller/StatefulSet/mongo';
  const mongoOwner = { kind: 'StatefulSet', name: 'mongo' };
  const controllerNode = (id = CTRL_ID, name = 'mongo', parent = 'cluster/prod') => ({
    data: { id, name, type: 'controller', parent, labels: {} },
  });
  const childPod = (
    id: string,
    name: string,
    extra: Record<string, unknown> = {},
    owner: { kind: string; name: string } | undefined = mongoOwner,
    controllerId = CTRL_ID
  ) => ({
    data: {
      id,
      name,
      type: 'pod',
      parent: controllerId,
      ...(owner !== undefined ? { owner } : {}),
      labels: { cluster: 'prod', namespace: 'shop' },
      ...extra,
    },
  });
  const enrichGraph = (...pods: Array<{ data: Record<string, unknown> }>): unknown => ({
    elements: {
      nodes: [{ data: { id: 'cluster/prod', name: 'prod', type: 'cluster', labels: {} } }, controllerNode(), ...pods],
      edges: [],
    },
  });
  const controllerOf = (raw: unknown): cytoscape.NodeDataDefinition | undefined =>
    normalizeGraph(raw).elements.find((e) => (e.data as cytoscape.NodeDataDefinition).isController === true)?.data;

  it('derives the controller kind from a child pod owner.kind (lowercased) and flags isController', () => {
    const ctrl = controllerOf(enrichGraph(childPod('prod/p1', 'mongo-0')));
    expect(ctrl?.isController).toBe(true);
    expect(ctrl?.kind).toBe('statefulset');
    expect(ctrl?.label).toBe('mongo');
    expect(ctrl?.parent).toBe('cluster/prod');
  });

  it('does NOT synthesize controllers (an owned pod with no controller group yields none)', () => {
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
              owner: { kind: 'Deployment', name: 'api' },
              labels: { cluster: 'prod', namespace: 'shop' },
            },
          },
        ],
        edges: [],
      },
    };
    expect(
      normalizeGraph(raw).elements.some((e) => (e.data as cytoscape.NodeDataDefinition).isController === true)
    ).toBe(false);
  });

  it('does NOT synthesize controller-owns-pod edges', () => {
    const owns = normalizeGraph(enrichGraph(childPod('prod/p1', 'mongo-0'))).elements.filter(
      (e) => e.group === 'edges' && (e.data as cytoscape.EdgeDataDefinition).edgeType === 'controller-owns-pod'
    );
    expect(owns).toHaveLength(0);
  });

  describe('worstStatus (worst child-pod status, always written)', () => {
    it('takes the worst child-pod status (warning + critical → critical)', () => {
      const raw = enrichGraph(
        childPod('prod/p1', 'mongo-0', { status: 'warning' }),
        childPod('prod/p2', 'mongo-1', { status: 'critical' })
      );
      expect(controllerOf(raw)?.worstStatus).toBe('critical');
    });

    it('propagates a child warning without any alert (status, not alerts)', () => {
      expect(controllerOf(enrichGraph(childPod('prod/p1', 'mongo-0', { status: 'warning' })))?.worstStatus).toBe(
        'warning'
      );
    });

    it('treats unknown / absent status as normal (drawn green, D10)', () => {
      expect(controllerOf(enrichGraph(childPod('prod/p1', 'mongo-0', { status: 'bogus' })))?.worstStatus).toBe('normal');
      expect(controllerOf(enrichGraph(childPod('prod/p1', 'mongo-0')))?.worstStatus).toBe('normal');
    });
  });

  describe('application / containers aggregation', () => {
    it('aggregates application from the first valued child pod in stable podId order', () => {
      // Raw order p2 (beta) before p1 (alpha) — the podId sort must still pick p1's value.
      const raw = enrichGraph(
        childPod('prod/p2', 'mongo-1', { application: 'beta' }),
        childPod('prod/p1', 'mongo-0', { application: 'alpha' })
      );
      expect(controllerOf(raw)?.application).toBe('alpha');
    });

    it('skips application-less child pods when picking the controller application', () => {
      const raw = enrichGraph(childPod('prod/p1', 'mongo-0'), childPod('prod/p2', 'mongo-1', { application: 'beta' }));
      expect(controllerOf(raw)?.application).toBe('beta');
    });

    it('aggregates the containers union, deduped by (name, image) and sorted', () => {
      const app = { name: 'app', image: 'repo/app:1.2' };
      const raw = enrichGraph(
        childPod('prod/p1', 'mongo-0', { containers: [app] }),
        childPod('prod/p2', 'mongo-1', { containers: [app, { name: 'sidecar', image: 'repo/sc:0.9' }] }),
        childPod('prod/p3', 'mongo-2', { containers: [app] })
      );
      expect(controllerOf(raw)?.containers).toEqual([
        { name: 'app', image: 'repo/app:1.2' },
        { name: 'sidecar', image: 'repo/sc:0.9' },
      ]);
    });

    it('keeps same-named containers with different images apart (deduped by the PAIR)', () => {
      const raw = enrichGraph(
        childPod('prod/p1', 'mongo-0', { containers: [{ name: 'app', image: 'repo/app:1.2' }] }),
        childPod('prod/p2', 'mongo-1', { containers: [{ name: 'app', image: 'repo/app:1.3' }] })
      );
      expect(controllerOf(raw)?.containers).toEqual([
        { name: 'app', image: 'repo/app:1.2' },
        { name: 'app', image: 'repo/app:1.3' },
      ]);
    });

    it('omits both fields when no child pod carries a value', () => {
      const ctrl = controllerOf(enrichGraph(childPod('prod/p1', 'mongo-0')));
      expect(ctrl).toBeDefined();
      expect(ctrl !== undefined && 'application' in ctrl).toBe(false);
      expect(ctrl !== undefined && 'containers' in ctrl).toBe(false);
    });
  });

  describe('alert aggregation', () => {
    it('concatenates child-pod alerts in stable podId order, attributing each to its pod', () => {
      const raw = enrichGraph(
        childPod('prod/p2', 'mongo-1', {
          alerts: [{ name: 'CrashLoop', severity: 'warning', time_records: [1717500300] }],
        }),
        childPod('prod/p1', 'mongo-0', {
          alerts: [{ name: 'HighMem', severity: 'critical', time_records: [1717500000] }],
        })
      );
      expect(controllerOf(raw)?.alerts).toEqual([
        { name: 'HighMem', severity: 'critical', timeRecords: [1717500000], pod: 'mongo-0' },
        { name: 'CrashLoop', severity: 'warning', timeRecords: [1717500300], pod: 'mongo-1' },
      ]);
    });

    it('keeps an explicit backend pod attribution instead of backfilling', () => {
      const raw = enrichGraph(
        childPod('prod/p1', 'mongo-0', {
          alerts: [{ name: 'SvcDown', severity: 'critical', pod: 'other-pod', time_records: [1717500000] }],
        })
      );
      expect(controllerOf(raw)?.alerts).toEqual([
        { name: 'SvcDown', severity: 'critical', pod: 'other-pod', timeRecords: [1717500000] },
      ]);
    });

    it('dedupes alerts sharing an id across pods (first in stable order wins); keeps id-less ones', () => {
      const shared = { name: 'SvcDegraded', severity: 'warning', time_records: [1717500000], id: 'a1' };
      const local = { name: 'Local', severity: 'info', time_records: [1717500100] };
      const raw = enrichGraph(
        childPod('prod/p1', 'mongo-0', { alerts: [shared, local] }),
        childPod('prod/p2', 'mongo-1', { alerts: [shared, local] })
      );
      const alerts = controllerOf(raw)?.alerts;
      expect(alerts?.filter((a) => a.id === 'a1')).toHaveLength(1);
      expect(alerts?.find((a) => a.id === 'a1')?.pod).toBe('mongo-0'); // first in stable podId order wins
      expect(alerts?.filter((a) => a.name === 'Local')).toHaveLength(2); // no id → never deduped
    });

    it('omits controller alerts when no child pod carries any', () => {
      expect(controllerOf(enrichGraph(childPod('prod/p1', 'mongo-0')))?.alerts).toBeUndefined();
    });

    it('keeps colour status-driven: a critical alert on a normal pod never escalates worstStatus', () => {
      const raw = enrichGraph(
        childPod('prod/p1', 'mongo-0', {
          status: 'normal',
          alerts: [{ name: 'HighMem', severity: 'critical', time_records: [1717500000] }],
        })
      );
      const ctrl = controllerOf(raw);
      expect(ctrl?.alerts).toHaveLength(1);
      expect(ctrl?.worstStatus).toBe('normal');
    });

    it('leaves the source pod element untouched by the backfill (no pod field added there)', () => {
      const raw = enrichGraph(
        childPod('prod/p1', 'mongo-0', {
          alerts: [{ name: 'HighMem', severity: 'critical', time_records: [1717500000] }],
        })
      );
      const pod = normalizeGraph(raw).elements.find((e) => (e.data as cytoscape.NodeDataDefinition).id === 'prod/p1')
        ?.data as cytoscape.NodeDataDefinition;
      expect(pod.alerts).toEqual([{ name: 'HighMem', severity: 'critical', timeRecords: [1717500000] }]);
    });
  });

  it('is deterministic and does not mutate the input across repeated calls', () => {
    const raw = enrichGraph(
      childPod('prod/p2', 'mongo-1', { application: 'beta', containers: [{ name: 'b', image: 'r/b:1' }] }),
      childPod('prod/p1', 'mongo-0', { application: 'alpha', containers: [{ name: 'a', image: 'r/a:1' }] })
    );
    const snapshot = JSON.stringify(raw);
    const a = JSON.stringify(normalizeGraph(raw).elements);
    const b = JSON.stringify(normalizeGraph(raw).elements);
    expect(a).toBe(b);
    expect(JSON.stringify(raw)).toBe(snapshot);
  });
});
