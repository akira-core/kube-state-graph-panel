import {
  dateTime,
  FieldType,
  LoadingState,
  type DataFrame,
  type PanelData,
  type PanelProps,
  type TimeRange,
} from '@grafana/data';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type cytoscape from 'cytoscape';
import React from 'react';

// Spy is hoisted above jest.mock so the factory closure can capture it.
const graphCanvasSpy = jest.fn();

// Stub GraphCanvas: it mounts cytoscape + runs fcose, which is not registered in
// the jest env. This lets the panel render its legend aside (the unit under test)
// without a live graph instance. EmptyState/LoadingOverlay stay real.
jest.mock('../../features/graph-canvas', () => {
  const actual = jest.requireActual<typeof import('../../features/graph-canvas')>('../../features/graph-canvas');
  return {
    ...actual,
    GraphCanvas: (props: { collapsedIds?: Set<string> }): null => {
      graphCanvasSpy(props);
      return null;
    },
  };
});

// Backend transport stub for the right-click detail-URL flow (useNodeDetailUrls).
// Dereferenced lazily inside getBackendSrv() calls, so hoisting order is safe.
const detailGetMock = jest.fn();
jest.mock('@grafana/runtime', () => ({
  getBackendSrv: (): { get: typeof detailGetMock } => ({ get: detailGetMock }),
}));

import { KsgPanel, resolveSelectedNode } from './KsgPanel';
import { defaultOptions, type KsgPanelOptions } from './KsgPanel.types';

const stubTimeRange: TimeRange = {
  from: dateTime(),
  to: dateTime(),
  raw: { from: 'now-1h', to: 'now' },
};

function buildProps(overrides: Partial<PanelProps<KsgPanelOptions>> = {}): PanelProps<KsgPanelOptions> {
  const data: PanelData = {
    state: LoadingState.Done,
    series: [],
    timeRange: stubTimeRange,
  };
  return {
    id: 1,
    data,
    timeRange: stubTimeRange,
    timeZone: 'utc',
    options: defaultOptions,
    title: 'KSG',
    transparent: false,
    width: 800,
    height: 600,
    fieldConfig: { defaults: {}, overrides: [] },
    renderCounter: 0,
    replaceVariables: (s: string): string => s,
    onOptionsChange: jest.fn(),
    onFieldConfigChange: jest.fn(),
    onChangeTimeRange: jest.fn(),
    eventBus: {
      publish: jest.fn(),
      getStream: jest.fn(),
      subscribe: jest.fn(),
      removeAllListeners: jest.fn(),
      newScopedBus: jest.fn(),
    } as never,
    ...overrides,
  };
}

describe('KsgPanel', () => {
  beforeEach(() => {
    graphCanvasSpy.mockClear();
  });

  it('renders empty state when no data', () => {
    render(<KsgPanel {...buildProps()} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('renders loading overlay while loading', () => {
    render(
      <KsgPanel {...buildProps({ data: { state: LoadingState.Loading, series: [], timeRange: stubTimeRange } })} />
    );
    expect(screen.getByTestId('loading-overlay')).toBeInTheDocument();
  });

  it('renders error banner on series error', () => {
    render(
      <KsgPanel
        {...buildProps({
          data: {
            state: LoadingState.Error,
            series: [],
            errors: [{ message: 'boom', refId: 'A' }],
            timeRange: stubTimeRange,
          },
        })}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('renders cluster swatches derived from backend cluster container nodes', () => {
    const payload = {
      elements: {
        nodes: [
          { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
          { data: { id: 'demo/p1', type: 'pod', name: 'web', parent: 'cluster:demo', labels: { cluster: 'demo' } } },
        ],
        edges: [],
      },
    };
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(payload)] }],
    };
    render(
      <KsgPanel
        {...buildProps({
          data: { state: LoadingState.Done, series: [frame], timeRange: stubTimeRange },
          options: { ...defaultOptions, showLegend: true },
        })}
      />
    );
    const legend = screen.getByTestId('cluster-legend');
    fireEvent.click(within(legend).getByTestId('cluster-legend-fold-toggle'));
    expect(within(legend).getByText('demo')).toBeInTheDocument();
  });

  it('collapses all clusters via the cluster legend toggle and passes collapsedIds to GraphCanvas', () => {
    const payload = {
      elements: {
        nodes: [
          { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
          { data: { id: 'demo/node-a', type: 'node', name: 'node-a', parent: 'cluster:demo' } },
          { data: { id: 'demo/p1', type: 'pod', name: 'web', parent: 'demo/node-a', labels: { cluster: 'demo' } } },
        ],
        edges: [],
      },
    };
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(payload)] }],
    };
    render(
      <KsgPanel
        {...buildProps({
          data: { state: LoadingState.Done, series: [frame], timeRange: stubTimeRange },
          options: { ...defaultOptions, showLegend: true },
        })}
      />
    );
    fireEvent.click(screen.getByTestId('cluster-collapse-toggle'));
    const calls = graphCanvasSpy.mock.calls as Array<[{ collapsedIds?: Set<string> }]>;
    const lastCall = calls.at(-1)?.[0];
    expect(lastCall?.collapsedIds?.has('cluster:demo')).toBe(true);
  });

  it('collapses all k8s-node containers via the node legend toggle and passes collapsedIds to GraphCanvas', () => {
    const payload = {
      elements: {
        nodes: [
          { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
          { data: { id: 'demo/node-a', type: 'node', name: 'node-a', parent: 'cluster:demo' } },
          { data: { id: 'demo/p1', type: 'pod', name: 'web', parent: 'demo/node-a', labels: { cluster: 'demo' } } },
        ],
        edges: [],
      },
    };
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(payload)] }],
    };
    render(
      <KsgPanel
        {...buildProps({
          data: { state: LoadingState.Done, series: [frame], timeRange: stubTimeRange },
          options: { ...defaultOptions, showLegend: true },
        })}
      />
    );
    // K8s `node` boxes are containers only in node mode; the panel now defaults to
    // controller mode, so switch to node mode first to expose the node toggle.
    act(() => {
      fireEvent.click(screen.getByLabelText('Node'));
    });
    fireEvent.click(screen.getByTestId('node-collapse-toggle'));
    const calls = graphCanvasSpy.mock.calls as Array<[{ collapsedIds?: Set<string> }]>;
    const lastCall = calls.at(-1)?.[0];
    expect(lastCall?.collapsedIds?.has('demo/node-a')).toBe(true);
  });

  it('shows a Layout Node|Controller control at the top of the legend', () => {
    render(<KsgPanel {...buildProps({ options: { ...defaultOptions, showLegend: true } })} />);
    expect(screen.getByTestId('layout-mode-control')).toBeInTheDocument();
    expect(screen.getByText('Layout')).toBeInTheDocument();
    expect(screen.getByLabelText('Node')).toBeInTheDocument();
    expect(screen.getByLabelText('Controller')).toBeInTheDocument();
  });

  it('defaults to controller mode: titles the section "Controllers" and default-collapses every controller on initial load', () => {
    const payload = {
      elements: {
        nodes: [
          { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
          { data: { id: 'demo/node-a', type: 'node', name: 'node-a', parent: 'cluster:demo' } },
          {
            data: {
              id: 'demo/p1',
              type: 'pod',
              name: 'mongo-0',
              parent: 'demo/node-a',
              owner: { kind: 'StatefulSet', name: 'mongo' },
              labels: { cluster: 'demo', namespace: 'shop' },
            },
          },
        ],
        edges: [],
      },
    };
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(payload)] }],
    };
    render(
      <KsgPanel
        {...buildProps({
          data: { state: LoadingState.Done, series: [frame], timeRange: stubTimeRange },
          options: { ...defaultOptions, showLegend: true },
        })}
      />
    );
    // The panel defaults to controller mode, so the container section is "Controllers"
    // on initial load — no toggle needed.
    const containerLegend = screen.getByTestId('node-container-legend');
    expect(within(containerLegend).getByRole('heading', { name: /Controllers/ })).toBeInTheDocument();
    // …and the synthesized controller is default-collapsed (pushed to GraphCanvas)
    // by the initial-load effect once the graph data is present.
    const calls = graphCanvasSpy.mock.calls as Array<[{ collapsedIds?: Set<string> }]>;
    const lastCall = calls.at(-1)?.[0];
    expect(lastCall?.collapsedIds?.has('ctrl/demo/shop/statefulset/mongo')).toBe(true);
  });

  it('re-collapses controllers after leaving and re-entering controller mode', () => {
    const payload = {
      elements: {
        nodes: [
          { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
          { data: { id: 'demo/node-a', type: 'node', name: 'node-a', parent: 'cluster:demo' } },
          {
            data: {
              id: 'demo/p1',
              type: 'pod',
              name: 'mongo-0',
              parent: 'demo/node-a',
              owner: { kind: 'StatefulSet', name: 'mongo' },
              labels: { cluster: 'demo', namespace: 'shop' },
            },
          },
        ],
        edges: [],
      },
    };
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(payload)] }],
    };
    render(
      <KsgPanel
        {...buildProps({
          data: { state: LoadingState.Done, series: [frame], timeRange: stubTimeRange },
          options: { ...defaultOptions, showLegend: true },
        })}
      />
    );
    // Leave controller mode (node mode drops the synthesized controller container).
    act(() => {
      fireEvent.click(screen.getByLabelText('Node'));
    });
    // Re-enter controller mode — the effect re-collapses the controllers.
    act(() => {
      fireEvent.click(screen.getByLabelText('Controller'));
    });
    const calls = graphCanvasSpy.mock.calls as Array<[{ collapsedIds?: Set<string> }]>;
    const lastCall = calls.at(-1)?.[0];
    expect(lastCall?.collapsedIds?.has('ctrl/demo/shop/statefulset/mongo')).toBe(true);
  });

  it('renders a "Storage classes" legend section and default-folds storage classes on load (toggle expands)', () => {
    const payload = {
      elements: {
        nodes: [
          { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
          {
            data: { id: 'demo/storageclass/fast-ssd', type: 'storageclass', name: 'fast-ssd', parent: 'cluster:demo' },
          },
          {
            data: {
              id: 'demo/pvc-0',
              type: 'pvc',
              name: 'data-0',
              parent: 'demo/storageclass/fast-ssd',
              labels: { cluster: 'demo' },
            },
          },
          {
            data: { id: 'demo/p0', type: 'pod', name: 'mongo-0', parent: 'cluster:demo', labels: { cluster: 'demo' } },
          },
        ],
        edges: [{ data: { id: 'e0', type: 'pod-mounts-pvc', source: 'demo/p0', target: 'demo/pvc-0' } }],
      },
    };
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(payload)] }],
    };
    render(
      <KsgPanel
        {...buildProps({
          data: { state: LoadingState.Done, series: [frame], timeRange: stubTimeRange },
          options: { ...defaultOptions, showLegend: true },
        })}
      />
    );
    const legend = screen.getByTestId('storageclass-legend');
    expect(within(legend).getByRole('heading', { name: /Storage Classes/ })).toBeInTheDocument();
    fireEvent.click(within(legend).getByTestId('storageclass-legend-fold-toggle'));
    expect(within(legend).getByText('fast-ssd')).toBeInTheDocument();
    // Storage-class containers are DEFAULT-folded on first load (mode-independent),
    // pushed to GraphCanvas without any user action.
    const initial = (graphCanvasSpy.mock.calls as Array<[{ collapsedIds?: Set<string> }]>).at(-1)?.[0];
    expect(initial?.collapsedIds?.has('demo/storageclass/fast-ssd')).toBe(true);
    // The collapse-all toggle now EXPANDS (already collapsed) → removes the id.
    fireEvent.click(screen.getByTestId('storageclass-collapse-toggle'));
    const afterToggle = (graphCanvasSpy.mock.calls as Array<[{ collapsedIds?: Set<string> }]>).at(-1)?.[0];
    expect(afterToggle?.collapsedIds?.has('demo/storageclass/fast-ssd')).toBe(false);
  });

  it('orders legend sections with the swatch sections (Clusters / Storage Classes) AFTER Status', () => {
    const payload = {
      elements: {
        nodes: [
          { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
          {
            data: { id: 'demo/storageclass/fast-ssd', type: 'storageclass', name: 'fast-ssd', parent: 'cluster:demo' },
          },
          {
            data: {
              id: 'demo/pvc-0',
              type: 'pvc',
              name: 'data-0',
              parent: 'demo/storageclass/fast-ssd',
              labels: { cluster: 'demo' },
            },
          },
          {
            data: { id: 'demo/p0', type: 'pod', name: 'mongo-0', parent: 'cluster:demo', labels: { cluster: 'demo' } },
          },
        ],
        edges: [{ data: { id: 'e0', type: 'pod-mounts-pvc', source: 'demo/p0', target: 'demo/pvc-0' } }],
      },
    };
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(payload)] }],
    };
    render(
      <KsgPanel
        {...buildProps({
          data: { state: LoadingState.Done, series: [frame], timeRange: stubTimeRange },
          options: { ...defaultOptions, showLegend: true },
        })}
      />
    );
    const headings = screen.getAllByRole('heading').map((h) => h.textContent ?? '');
    const idx = (re: RegExp): number => headings.findIndex((t) => re.test(t));
    // The reference sections come first, in this order …
    expect(idx(/node kinds/i)).toBeGreaterThanOrEqual(0);
    expect(idx(/node kinds/i)).toBeLessThan(idx(/edge types/i));
    expect(idx(/edge types/i)).toBeLessThan(idx(/status/i));
    // … then the swatch sections, moved BELOW Status.
    expect(idx(/status/i)).toBeLessThan(idx(/clusters/i));
    expect(idx(/clusters/i)).toBeLessThan(idx(/storage classes/i));
  });

  it('does not render the cluster legend when there are no clusters', () => {
    render(<KsgPanel {...buildProps({ options: { ...defaultOptions, showLegend: true } })} />);
    expect(screen.queryByTestId('cluster-legend')).not.toBeInTheDocument();
  });

  it('does not render the storage-class legend when there are no storage classes', () => {
    render(<KsgPanel {...buildProps({ options: { ...defaultOptions, showLegend: true } })} />);
    expect(screen.queryByTestId('storageclass-legend')).not.toBeInTheDocument();
  });

  it("resolveSelectedNode carries a node's alerts onto the detail data", () => {
    const alerts = [{ name: 'HighMem', severity: 'critical' as const, timeRecords: [1717500000] }];
    const elements: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'p1', label: 'mongo-0', kind: 'pod', alerts } },
    ];
    const node = resolveSelectedNode(elements, 'p1', new Set(['p1']));
    expect(node?.alerts).toEqual(alerts);
  });

  it("resolveSelectedNode carries a synthesized controller's aggregated child-pod alerts (panel side needs no change)", () => {
    // normalize aggregates owned pods' alerts onto the controller (see normalize.ts);
    // the detail panel's AlertTable then renders them off data.alerts as for any node.
    const alerts = [
      { name: 'HighMem', severity: 'critical', timeRecords: [1717500000], pod: 'mongo-0' },
      { name: 'CrashLoop', severity: 'warning', timeRecords: [1717500300], pod: 'mongo-1' },
    ];
    const elements: cytoscape.ElementDefinition[] = [
      {
        group: 'nodes',
        data: {
          id: 'ctrl/prod/shop/statefulset/mongo',
          label: 'mongo',
          kind: 'statefulset',
          isController: true,
          alerts,
        },
      },
    ];
    const node = resolveSelectedNode(
      elements,
      'ctrl/prod/shop/statefulset/mongo',
      new Set(['ctrl/prod/shop/statefulset/mongo'])
    );
    expect(node?.alerts).toEqual(alerts);
  });

  it('rewinds the dashboard time range to a ±5m window when an alert time is clicked', () => {
    const onChangeTimeRange = jest.fn();
    const payload = {
      elements: {
        nodes: [
          {
            data: {
              id: 'p1',
              type: 'pod',
              name: 'mongo-0',
              alerts: [
                { pod: 'mongo-0', service: 'mongo', name: 'HighMemory', severity: 'critical', time: 1717500000 },
              ],
            },
          },
          { data: { id: 'p2', type: 'pod', name: 'web' } },
        ],
        edges: [{ data: { id: 'e1', type: 'pod-calls-pod', source: 'p1', target: 'p2' } }],
      },
    };
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(payload)] }],
    };
    render(
      <KsgPanel
        {...buildProps({
          data: { state: LoadingState.Done, series: [frame], timeRange: stubTimeRange },
          onChangeTimeRange,
        })}
      />
    );
    // Drive selection through the onSelect prop the panel hands GraphCanvas.
    const calls = graphCanvasSpy.mock.calls as Array<[{ onSelect?: (id: string) => void }]>;
    const onSelect = calls.at(-1)?.[0].onSelect;
    act(() => {
      onSelect?.('p1');
    });
    expect(screen.getByText('HighMemory')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('alert-time'));
    expect(onChangeTimeRange).toHaveBeenCalledWith({ from: 1717499700000, to: 1717500300000 });
  });

  describe('right-click detail-URL flow', () => {
    const payload = {
      elements: {
        nodes: [
          { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
          {
            data: {
              id: 'demo/p1',
              type: 'pod',
              name: 'mongo-0',
              parent: 'cluster:demo',
              owner: { kind: 'StatefulSet', name: 'mongo' },
              application: 'checkout',
              containers: [{ name: 'app', image: 'repo/app:1.2' }],
              labels: { cluster: 'demo', namespace: 'shop' },
            },
          },
          { data: { id: 'demo/svc', type: 'service', name: 'mongo-svc', parent: 'cluster:demo' } },
        ],
        // The edge keeps the family out of the orphan cascade (edge-less leaves
        // hide), so the pod/controller/service stay selectable.
        edges: [{ data: { id: 'e1', type: 'service-selects-pod', source: 'demo/svc', target: 'demo/p1' } }],
      },
    };
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(payload)] }],
    };
    const controllerId = 'ctrl/demo/shop/statefulset/mongo';

    type CanvasHandlers = {
      onSelect?: (id: string | null) => void;
      onContextSelect?: (id: string) => void;
      onCollapsedChange?: (next: Set<string>) => void;
    };
    const lastCanvasProps = (): CanvasHandlers => (graphCanvasSpy.mock.calls as Array<[CanvasHandlers]>).at(-1)![0];

    // Controller mode default-collapses the synthesized controller, folding the pod
    // off the canvas — where it cannot be clicked, and where resolveSelectedNode
    // (correctly) refuses to open the panel for it. Expand first, as a user would.
    const expandAll = (): void => {
      act(() => {
        lastCanvasProps().onCollapsedChange?.(new Set());
      });
    };

    function renderPanel(options: KsgPanelOptions): void {
      render(
        <KsgPanel
          {...buildProps({
            data: { state: LoadingState.Done, series: [frame], timeRange: stubTimeRange },
            options,
          })}
        />
      );
    }
    const withEndpoint: KsgPanelOptions = { ...defaultOptions, detailEndpoint: '/proxy' };

    beforeEach(() => {
      detailGetMock.mockReset();
      detailGetMock.mockResolvedValue({});
      jest.spyOn(Date, 'now').mockReturnValue(1717500000123);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('pod right-click opens the panel and fires both queries with owner kind/name + click time', async () => {
      renderPanel(withEndpoint);
      expandAll();
      act(() => {
        lastCanvasProps().onContextSelect?.('demo/p1');
      });
      // Panel + both sections open in sync with the selection.
      expect(screen.getByTestId('node-detail-panel')).toBeInTheDocument();
      expect(screen.getByTestId('node-detail-section-application')).toBeInTheDocument();
      expect(screen.getByTestId('node-detail-section-containers')).toBeInTheDocument();
      await waitFor(() => {
        expect(detailGetMock).toHaveBeenCalledTimes(2);
      });
      const params = { application: 'checkout', kind: 'statefulset', name: 'mongo', time: 1717500000 };
      expect(detailGetMock).toHaveBeenCalledWith('/proxy/api/v1/config_changes', params, undefined, expect.anything());
      expect(detailGetMock).toHaveBeenCalledWith('/proxy/api/v1/code_changes', params, undefined, expect.anything());
    });

    it('controller right-click queries with its own kind/name (aggregated application)', async () => {
      renderPanel(withEndpoint);
      act(() => {
        lastCanvasProps().onContextSelect?.(controllerId);
      });
      await waitFor(() => {
        expect(detailGetMock).toHaveBeenCalledTimes(2);
      });
      expect(detailGetMock).toHaveBeenCalledWith(
        '/proxy/api/v1/config_changes',
        { application: 'checkout', kind: 'statefulset', name: 'mongo', time: 1717500000 },
        undefined,
        expect.anything()
      );
    });

    it('left-click opens the alerts view and never queries (no detail sections)', () => {
      renderPanel(withEndpoint);
      expandAll();
      act(() => {
        lastCanvasProps().onSelect?.('demo/p1');
      });
      expect(screen.getByTestId('node-detail-panel')).toBeInTheDocument();
      expect(detailGetMock).not.toHaveBeenCalled();
      // Left-click renders the alerts view only — Application/Containers belong
      // to the right-click detail view.
      expect(screen.getByTestId('node-detail-section-alerts')).toBeInTheDocument();
      expect(screen.queryByTestId('node-detail-section-application')).not.toBeInTheDocument();
      expect(screen.queryByTestId('node-detail-section-containers')).not.toBeInTheDocument();
    });

    it('right-click on a non pod/controller node opens the panel without sections or queries', () => {
      renderPanel(withEndpoint);
      act(() => {
        lastCanvasProps().onContextSelect?.('demo/svc');
      });
      expect(screen.getByTestId('node-detail-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('node-detail-section-application')).not.toBeInTheDocument();
      expect(screen.queryByTestId('node-detail-section-containers')).not.toBeInTheDocument();
      expect(detailGetMock).not.toHaveBeenCalled();
    });

    it('never queries while detailEndpoint is unset (sections render, buttons disabled)', () => {
      renderPanel(defaultOptions);
      expandAll();
      act(() => {
        lastCanvasProps().onContextSelect?.('demo/p1');
      });
      expect(screen.getByTestId('node-detail-section-application')).toBeInTheDocument();
      expect(detailGetMock).not.toHaveBeenCalled();
      expect(screen.getByTestId('application-url-button')).not.toHaveAttribute('href');
    });

    it('a later left-click clears the lookup intent (no extra queries for the new node)', async () => {
      renderPanel(withEndpoint);
      expandAll();
      act(() => {
        lastCanvasProps().onContextSelect?.('demo/p1');
      });
      await waitFor(() => {
        expect(detailGetMock).toHaveBeenCalledTimes(2);
      });
      act(() => {
        lastCanvasProps().onSelect?.(controllerId);
      });
      expect(detailGetMock).toHaveBeenCalledTimes(2); // unchanged — left-click never queries
    });

    it('collapsing the selected pod away closes the detail panel (off-canvas node never described)', () => {
      renderPanel(withEndpoint);
      expandAll();
      act(() => {
        lastCanvasProps().onSelect?.('demo/p1');
      });
      expect(screen.getByTestId('node-detail-panel')).toBeInTheDocument();
      // Re-collapse the pod's controller (legend toggle / cue): the pod folds off
      // the canvas, so the panel must close rather than describe a hidden node.
      act(() => {
        lastCanvasProps().onCollapsedChange?.(new Set([controllerId]));
      });
      expect(screen.queryByTestId('node-detail-panel')).not.toBeInTheDocument();
    });
  });
});
