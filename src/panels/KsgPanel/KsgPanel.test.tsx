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

// Backend transport stub for the right-click detail-URL flow (useNodeDetailUrls)
// plus the datasource registry stub for endpoint derivation (resolveDetailEndpoint)
// plus the locationService stub for the pod-list variable export (useVariableExport).
// Dereferenced lazily inside the service getters, so hoisting order is safe.
const detailGetMock = jest.fn();
const getInstanceSettingsMock = jest.fn();
const locationPartialMock = jest.fn();
const locationGetSearchMock = jest.fn(() => new URLSearchParams());
jest.mock('@grafana/runtime', () => ({
  getBackendSrv: (): { get: typeof detailGetMock } => ({ get: detailGetMock }),
  getDataSourceSrv: (): { getInstanceSettings: typeof getInstanceSettingsMock } => ({
    getInstanceSettings: getInstanceSettingsMock,
  }),
  locationService: {
    getSearch: (): URLSearchParams => locationGetSearchMock(),
    partial: (query: Record<string, unknown>, replace?: boolean): void => {
      locationPartialMock(query, replace);
    },
  },
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
    locationPartialMock.mockClear();
    locationGetSearchMock.mockReset();
    locationGetSearchMock.mockReturnValue(new URLSearchParams());
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

  it('does not touch the dashboard variable URL state by default', () => {
    const payload = {
      elements: {
        nodes: [{ data: { id: 'demo/p1', type: 'pod', name: 'web' } }],
        edges: [],
      },
    };
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(payload)] }],
    };
    render(
      <KsgPanel {...buildProps({ data: { state: LoadingState.Done, series: [frame], timeRange: stubTimeRange } })} />
    );
    expect(locationGetSearchMock).not.toHaveBeenCalled();
    expect(locationPartialMock).not.toHaveBeenCalled();
  });

  it('exports the pod names into the configured dashboard variable', () => {
    const payload = {
      elements: {
        nodes: [
          { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
          { data: { id: 'demo/p2', type: 'pod', name: 'web-1', parent: 'cluster:demo' } },
          { data: { id: 'demo/p1', type: 'pod', name: 'web-0', parent: 'cluster:demo' } },
          { data: { id: 'demo/svc', type: 'service', name: 'web-svc', parent: 'cluster:demo' } },
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
          options: { ...defaultOptions, podListVariable: 'pod_list' },
        })}
      />
    );
    expect(locationPartialMock).toHaveBeenCalledWith({ 'var-pod_list': ['web-0', 'web-1'] }, true);
  });

  it('does not export while the query is in an error state', () => {
    render(
      <KsgPanel
        {...buildProps({
          data: {
            state: LoadingState.Error,
            series: [],
            errors: [{ message: 'boom', refId: 'A' }],
            timeRange: stubTimeRange,
          },
          options: { ...defaultOptions, podListVariable: 'pod_list' },
        })}
      />
    );
    expect(locationPartialMock).not.toHaveBeenCalled();
  });

  it('does not export during the first load (loading, no elements yet)', () => {
    render(
      <KsgPanel
        {...buildProps({
          data: { state: LoadingState.Loading, series: [], timeRange: stubTimeRange },
          options: { ...defaultOptions, podListVariable: 'pod_list' },
        })}
      />
    );
    expect(locationPartialMock).not.toHaveBeenCalled();
  });

  it('does not export when a Done frame carries no recognizable payload', () => {
    // A hidden/not-yet-run query or a transform stripping every frame must not be
    // written out as "no pods" — only a loaded graph may clear the variable.
    render(
      <KsgPanel
        {...buildProps({
          data: { state: LoadingState.Done, series: [], timeRange: stubTimeRange },
          options: { ...defaultOptions, podListVariable: 'pod_list' },
        })}
      />
    );
    expect(locationPartialMock).not.toHaveBeenCalled();
  });

  it('does not export when the whole payload fails to normalize', () => {
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify({ nodes: 'bogus' })] }],
    };
    render(
      <KsgPanel
        {...buildProps({
          data: { state: LoadingState.Done, series: [frame], timeRange: stubTimeRange },
          options: { ...defaultOptions, podListVariable: 'pod_list' },
        })}
      />
    );
    expect(locationPartialMock).not.toHaveBeenCalled();
  });

  it('clears the variable with the $__empty sentinel for a loaded graph with zero pods', () => {
    const payload = {
      elements: { nodes: [{ data: { id: 'demo/svc', type: 'service', name: 'web-svc' } }], edges: [] },
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
          options: { ...defaultOptions, podListVariable: 'pod_list' },
        })}
      />
    );
    expect(locationPartialMock).toHaveBeenCalledWith({ 'var-pod_list': ['$__empty'] }, true);
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

  describe('legend kind visibility toggles', () => {
    // A pod and a service joined by an edge (keeps both out of the orphan
    // cascade), so the icon legend lists two togglable kinds.
    const payload = {
      elements: {
        nodes: [
          { data: { id: 'p1', type: 'pod', name: 'web' } },
          { data: { id: 's1', type: 'service', name: 'web-svc' } },
        ],
        edges: [{ data: { id: 'e1', type: 'service-selects-pod', source: 's1', target: 'p1' } }],
      },
    };
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(payload)] }],
    };
    const dataDone: PanelData = { state: LoadingState.Done, series: [frame], timeRange: stubTimeRange };

    it('eye click writes visibleKinds through onOptionsChange (other options untouched)', () => {
      const onOptionsChange = jest.fn<void, [KsgPanelOptions]>();
      render(<KsgPanel {...buildProps({ data: dataDone, onOptionsChange })} />);
      fireEvent.click(screen.getByTestId('node-legend-toggle-service'));
      expect(onOptionsChange).toHaveBeenCalledTimes(1);
      const next = onOptionsChange.mock.calls.at(0)![0];
      expect(next.visibleKinds).toEqual(defaultOptions.visibleKinds.filter((k) => k !== 'service'));
      expect({ ...next, visibleKinds: defaultOptions.visibleKinds }).toEqual(defaultOptions);
    });

    it('a hidden kind keeps its legend row (Show affordance) and the eye click restores it', () => {
      const onOptionsChange = jest.fn<void, [KsgPanelOptions]>();
      const options: KsgPanelOptions = {
        ...defaultOptions,
        visibleKinds: defaultOptions.visibleKinds.filter((k) => k !== 'service'),
      };
      render(<KsgPanel {...buildProps({ data: dataDone, options, onOptionsChange })} />);
      // Hidden from the canvas: the visibility handed to GraphCanvas drops the
      // service node and its incident edge (endpoint rule)…
      type CanvasVisibility = { visibility?: { visibleNodeIds: Set<string>; visibleEdgeIds: Set<string> } };
      const canvasProps = (graphCanvasSpy.mock.calls as Array<[CanvasVisibility]>).at(-1)![0];
      expect(canvasProps.visibility?.visibleNodeIds.has('s1')).toBe(false);
      expect(canvasProps.visibility?.visibleEdgeIds.has('e1')).toBe(false);
      // …but the legend row survives, flipped to the Show affordance.
      expect(screen.getByTestId('node-legend-row-service')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Show service' }));
      const next = onOptionsChange.mock.calls.at(0)![0];
      // Restored in canonical ALL_KINDS order — a hide/show round-trip converges
      // back to the default array instead of appending at the tail.
      expect(next.visibleKinds).toEqual(defaultOptions.visibleKinds);
    });

    it('hiding a kind leaves the collapse state (collapsedIds) untouched', () => {
      const clusterPayload = {
        elements: {
          nodes: [
            { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
            { data: { id: 'demo/p1', type: 'pod', name: 'web', parent: 'cluster:demo' } },
            { data: { id: 'demo/s1', type: 'service', name: 'web-svc', parent: 'cluster:demo' } },
          ],
          edges: [{ data: { id: 'e1', type: 'service-selects-pod', source: 'demo/s1', target: 'demo/p1' } }],
        },
      };
      const clusterFrame: DataFrame = {
        name: 'graph',
        length: 1,
        fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(clusterPayload)] }],
      };
      const data: PanelData = { state: LoadingState.Done, series: [clusterFrame], timeRange: stubTimeRange };
      const { rerender } = render(<KsgPanel {...buildProps({ data })} />);
      fireEvent.click(screen.getByTestId('cluster-collapse-toggle'));
      // Re-render with the kind filtered out — the option write a real Grafana
      // host would loop back — and assert the collapsed cluster stayed collapsed.
      rerender(
        <KsgPanel
          {...buildProps({
            data,
            options: { ...defaultOptions, visibleKinds: defaultOptions.visibleKinds.filter((k) => k !== 'service') },
          })}
        />
      );
      type CanvasProps = { collapsedIds?: Set<string> };
      const lastCall = (graphCanvasSpy.mock.calls as Array<[CanvasProps]>).at(-1)![0];
      expect(lastCall.collapsedIds?.has('cluster:demo')).toBe(true);
    });

    it('a pod-parent mode flip never writes options: the hidden kind survives the round-trip', () => {
      const onOptionsChange = jest.fn();
      const options: KsgPanelOptions = {
        ...defaultOptions,
        visibleKinds: defaultOptions.visibleKinds.filter((k) => k !== 'service'),
      };
      render(<KsgPanel {...buildProps({ data: dataDone, options, onOptionsChange })} />);
      act(() => {
        fireEvent.click(screen.getByLabelText('Node'));
      });
      act(() => {
        fireEvent.click(screen.getByLabelText('Controller'));
      });
      expect(onOptionsChange).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Show service' })).toBeInTheDocument();
    });

    it('hiding every present kind shows the filtered-out empty state while the legend rows stay restorable', () => {
      // pvc stays checked but absent from the graph — the message must key off
      // the computed visibility, not visibleKinds.length.
      render(<KsgPanel {...buildProps({ data: dataDone, options: { ...defaultOptions, visibleKinds: ['pvc'] } })} />);
      expect(screen.getByText('All node types filtered')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Show pod' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Show service' })).toBeInTheDocument();
    });

    it('a canvas blanked by edge-type filtering alone does not blame node types', () => {
      // All kinds stay checked; hiding every edge type orphan-cascades the
      // whole graph away — the message must not claim node types are filtered.
      render(<KsgPanel {...buildProps({ data: dataDone, options: { ...defaultOptions, visibleEdgeTypes: [] } })} />);
      expect(screen.getByText('All elements filtered out')).toBeInTheDocument();
      expect(screen.queryByText('All node types filtered')).toBeNull();
      // The kind rows stay full-strength (Hide affordance) — they are not the cause.
      expect(screen.getByRole('button', { name: 'Hide pod' })).toBeInTheDocument();
    });
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

    function renderPanel(options: KsgPanelOptions, request?: PanelData['request']): void {
      render(
        <KsgPanel
          {...buildProps({
            data: {
              state: LoadingState.Done,
              series: [frame],
              timeRange: stubTimeRange,
              ...(request !== undefined ? { request } : {}),
            },
            options,
          })}
        />
      );
    }
    const withEndpoint: KsgPanelOptions = { ...defaultOptions, detailEndpoint: '/proxy' };
    // A query request whose target refs the demo Infinity datasource — the
    // derivation source when the detailEndpoint option is left empty.
    const requestWithRef = {
      targets: [{ refId: 'A', datasource: { uid: 'ksg-default', type: 'yesoreyeram-infinity-datasource' } }],
    } as unknown as NonNullable<PanelData['request']>;

    beforeEach(() => {
      detailGetMock.mockReset();
      detailGetMock.mockResolvedValue({});
      getInstanceSettingsMock.mockReset();
      getInstanceSettingsMock.mockReturnValue(undefined);
      jest.spyOn(Date, 'now').mockReturnValue(1717500000123);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('pod right-click opens the panel WITHOUT querying; clicking the buttons fires the queries (owner kind/name + click time)', async () => {
      renderPanel(withEndpoint);
      expandAll();
      act(() => {
        lastCanvasProps().onContextSelect?.('demo/p1');
      });
      // Panel + both sections open in sync with the selection — but nothing is
      // fetched yet (lazy: right-click only builds the query input).
      expect(screen.getByTestId('node-detail-panel')).toBeInTheDocument();
      expect(screen.getByTestId('node-detail-section-application')).toBeInTheDocument();
      expect(screen.getByTestId('node-detail-section-containers')).toBeInTheDocument();
      expect(detailGetMock).not.toHaveBeenCalled();

      // Clicking each Change Report button fires its query with the owner-derived
      // controller kind/name and the right-click time.
      const params = { application: 'checkout', kind: 'statefulset', name: 'mongo', time: 1717500000 };
      fireEvent.click(screen.getByTestId('application-url-button'));
      await waitFor(() => {
        expect(detailGetMock).toHaveBeenCalledWith('/proxy/config_changes', params, undefined, expect.anything());
      });
      fireEvent.click(screen.getByTestId('container-url-button'));
      await waitFor(() => {
        expect(detailGetMock).toHaveBeenCalledWith('/proxy/code_changes', params, undefined, expect.anything());
      });
    });

    it('controller button click queries with its own kind/name (aggregated application)', async () => {
      renderPanel(withEndpoint);
      act(() => {
        lastCanvasProps().onContextSelect?.(controllerId);
      });
      expect(detailGetMock).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('application-url-button'));
      await waitFor(() => {
        expect(detailGetMock).toHaveBeenCalledWith(
          '/proxy/config_changes',
          { application: 'checkout', kind: 'statefulset', name: 'mongo', time: 1717500000 },
          undefined,
          expect.anything()
        );
      });
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

    it('never queries while the endpoint resolves to nothing (sections render, buttons disabled)', () => {
      // No option AND no derivable datasource ref (the fixture carries no request).
      renderPanel(defaultOptions);
      expandAll();
      act(() => {
        lastCanvasProps().onContextSelect?.('demo/p1');
      });
      expect(screen.getByTestId('node-detail-section-application')).toBeInTheDocument();
      expect(detailGetMock).not.toHaveBeenCalled();
      // No endpoint → the button renders disabled, so a click can never query.
      const button = screen.getByTestId('application-url-button');
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(detailGetMock).not.toHaveBeenCalled();
    });

    it('derives the endpoint from the query datasource proxy path when the option is empty', async () => {
      getInstanceSettingsMock.mockReturnValue({ url: '/api/datasources/proxy/uid/ksg-default' });
      renderPanel(defaultOptions, requestWithRef);
      expandAll();
      act(() => {
        lastCanvasProps().onContextSelect?.('demo/p1');
      });
      expect(detailGetMock).not.toHaveBeenCalled();
      const params = { application: 'checkout', kind: 'statefulset', name: 'mongo', time: 1717500000 };
      fireEvent.click(screen.getByTestId('application-url-button'));
      await waitFor(() => {
        expect(detailGetMock).toHaveBeenCalledWith(
          '/api/datasources/proxy/uid/ksg-default/config_changes',
          params,
          undefined,
          expect.anything()
        );
      });
      fireEvent.click(screen.getByTestId('container-url-button'));
      await waitFor(() => {
        expect(detailGetMock).toHaveBeenCalledWith(
          '/api/datasources/proxy/uid/ksg-default/code_changes',
          params,
          undefined,
          expect.anything()
        );
      });
    });

    it('derives the detail endpoints as siblings of the graph query path (proxy mount + query directory)', async () => {
      getInstanceSettingsMock.mockReturnValue({ url: '/api/datasources/proxy/uid/ksg-default' });
      // The graph query target carries the real backend path; the detail lookups
      // must resolve next to it (same directory, last segment swapped), so post-
      // proxy they hit http://backend/api/v1/graph/{config_changes,code_changes}.
      const requestWithGraphUrl = {
        targets: [
          {
            refId: 'A',
            datasource: { uid: 'ksg-default', type: 'yesoreyeram-infinity-datasource' },
            url: '/api/v1/graph/service_graph?start=1&end=2',
          },
        ],
      } as unknown as NonNullable<PanelData['request']>;
      renderPanel(defaultOptions, requestWithGraphUrl);
      expandAll();
      act(() => {
        lastCanvasProps().onContextSelect?.('demo/p1');
      });
      const params = { application: 'checkout', kind: 'statefulset', name: 'mongo', time: 1717500000 };
      fireEvent.click(screen.getByTestId('application-url-button'));
      await waitFor(() => {
        expect(detailGetMock).toHaveBeenCalledWith(
          '/api/datasources/proxy/uid/ksg-default/api/v1/graph/config_changes',
          params,
          undefined,
          expect.anything()
        );
      });
      fireEvent.click(screen.getByTestId('container-url-button'));
      await waitFor(() => {
        expect(detailGetMock).toHaveBeenCalledWith(
          '/api/datasources/proxy/uid/ksg-default/api/v1/graph/code_changes',
          params,
          undefined,
          expect.anything()
        );
      });
    });

    it('a configured detailEndpoint option overrides the datasource derivation', async () => {
      getInstanceSettingsMock.mockReturnValue({ url: '/api/datasources/proxy/uid/ksg-default' });
      renderPanel(withEndpoint, requestWithRef);
      expandAll();
      act(() => {
        lastCanvasProps().onContextSelect?.('demo/p1');
      });
      const params = { application: 'checkout', kind: 'statefulset', name: 'mongo', time: 1717500000 };
      fireEvent.click(screen.getByTestId('application-url-button'));
      await waitFor(() => {
        expect(detailGetMock).toHaveBeenCalledWith('/proxy/config_changes', params, undefined, expect.anything());
      });
      fireEvent.click(screen.getByTestId('container-url-button'));
      await waitFor(() => {
        expect(detailGetMock).toHaveBeenCalledWith('/proxy/code_changes', params, undefined, expect.anything());
      });
      // The option short-circuits derivation — the registry is never consulted.
      expect(getInstanceSettingsMock).not.toHaveBeenCalled();
    });

    it('never queries when the query ref resolves to no usable proxy url (registry-unresolvable)', () => {
      // beforeEach defaults getInstanceSettingsMock to undefined — the ref exists
      // but the registry cannot resolve it to a proxied base path.
      renderPanel(defaultOptions, requestWithRef);
      expandAll();
      act(() => {
        lastCanvasProps().onContextSelect?.('demo/p1');
      });
      expect(screen.getByTestId('node-detail-section-application')).toBeInTheDocument();
      expect(detailGetMock).not.toHaveBeenCalled();
      const button = screen.getByTestId('application-url-button');
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(detailGetMock).not.toHaveBeenCalled();
    });

    it('a left-click after a right-click shows the alerts view and never queries', async () => {
      renderPanel(withEndpoint);
      expandAll();
      act(() => {
        lastCanvasProps().onContextSelect?.('demo/p1');
      });
      fireEvent.click(screen.getByTestId('application-url-button'));
      await waitFor(() => {
        expect(detailGetMock).toHaveBeenCalledTimes(1);
      });
      // Left-click switches to the alerts view (no Change Report buttons) and never
      // queries — the count stays put.
      act(() => {
        lastCanvasProps().onSelect?.(controllerId);
      });
      expect(screen.queryByTestId('application-url-button')).not.toBeInTheDocument();
      expect(detailGetMock).toHaveBeenCalledTimes(1);
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
