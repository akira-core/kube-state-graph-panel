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

// Backend transport stub for the left-click detail-URL flow (useNodeDetailUrls)
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
    // D6: the pod nests under its cluster (no controller here) and carries labels.node;
    // node mode re-parents it under demo/node-a, making node-a a container.
    const payload = {
      elements: {
        nodes: [
          { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
          { data: { id: 'demo/node-a', type: 'node', name: 'node-a', parent: 'cluster:demo' } },
          {
            data: {
              id: 'demo/p1',
              type: 'pod',
              name: 'web',
              parent: 'cluster:demo',
              labels: { cluster: 'demo', node: 'demo/node-a' },
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

  describe('legend panel collapse toggle', () => {
    it('hides the legend aside on collapse and restores it on expand', () => {
      render(<KsgPanel {...buildProps({ options: { ...defaultOptions, showLegend: true } })} />);
      // Legend visible: its sections + the `<` collapse button are present, no floating restore button yet.
      expect(screen.getByTestId('layout-mode-control')).toBeInTheDocument();
      expect(screen.getByTestId('legend-collapse')).toBeInTheDocument();
      expect(screen.queryByTestId('legend-expand')).toBeNull();

      // Click `<` → the whole aside (its sections) is gone; only a floating `>` restore button remains.
      fireEvent.click(screen.getByTestId('legend-collapse'));
      expect(screen.queryByTestId('layout-mode-control')).toBeNull();
      expect(screen.queryByTestId('legend-collapse')).toBeNull();
      expect(screen.getByTestId('legend-expand')).toBeInTheDocument();

      // Click `>` → the aside returns; the floating restore button is gone.
      fireEvent.click(screen.getByTestId('legend-expand'));
      expect(screen.getByTestId('layout-mode-control')).toBeInTheDocument();
      expect(screen.getByTestId('legend-collapse')).toBeInTheDocument();
      expect(screen.queryByTestId('legend-expand')).toBeNull();
    });

    it('renders no collapse or restore button when showLegend is off', () => {
      render(<KsgPanel {...buildProps({ options: { ...defaultOptions, showLegend: false } })} />);
      expect(screen.queryByTestId('legend-collapse')).toBeNull();
      expect(screen.queryByTestId('legend-expand')).toBeNull();
    });
  });

  // Backend D6 controller group: cluster > controller > pod (pod carries owner +
  // labels.node so node mode can re-home it). The panel consumes + enriches this.
  const d6ControllerPayload = {
    elements: {
      nodes: [
        { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
        { data: { id: 'demo/node-a', type: 'node', name: 'node-a', parent: 'cluster:demo' } },
        {
          data: { id: 'demo/controller/StatefulSet/mongo', type: 'controller', name: 'mongo', parent: 'cluster:demo' },
        },
        {
          data: {
            id: 'demo/p1',
            type: 'pod',
            name: 'mongo-0',
            parent: 'demo/controller/StatefulSet/mongo',
            owner: { kind: 'StatefulSet', name: 'mongo' },
            labels: { cluster: 'demo', namespace: 'shop', node: 'demo/node-a' },
          },
        },
      ],
      edges: [],
    },
  };
  const D6_CONTROLLER_ID = 'demo/controller/StatefulSet/mongo';

  it('defaults to controller mode: titles the section "Controllers" and default-collapses every controller on initial load', () => {
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(d6ControllerPayload)] }],
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
    // …and the backend controller is default-collapsed (pushed to GraphCanvas)
    // by the initial-load effect once the graph data is present.
    const calls = graphCanvasSpy.mock.calls as Array<[{ collapsedIds?: Set<string> }]>;
    const lastCall = calls.at(-1)?.[0];
    expect(lastCall?.collapsedIds?.has(D6_CONTROLLER_ID)).toBe(true);
  });

  it('re-collapses controllers after leaving and re-entering controller mode', () => {
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(d6ControllerPayload)] }],
    };
    render(
      <KsgPanel
        {...buildProps({
          data: { state: LoadingState.Done, series: [frame], timeRange: stubTimeRange },
          options: { ...defaultOptions, showLegend: true },
        })}
      />
    );
    // Leave controller mode (node mode drops the backend controller container).
    act(() => {
      fireEvent.click(screen.getByLabelText('Node'));
    });
    // Re-enter controller mode — the effect re-collapses the controllers.
    act(() => {
      fireEvent.click(screen.getByLabelText('Controller'));
    });
    const calls = graphCanvasSpy.mock.calls as Array<[{ collapsedIds?: Set<string> }]>;
    const lastCall = calls.at(-1)?.[0];
    expect(lastCall?.collapsedIds?.has(D6_CONTROLLER_ID)).toBe(true);
  });

  // Full backend D6 chain (cluster > namespace > application > controller > pod) for
  // the mode-gated swatch sections + section ordering.
  const d6FullChainPayload = {
    elements: {
      nodes: [
        { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
        { data: { id: 'demo/node-a', type: 'node', name: 'node-a', parent: 'cluster:demo' } },
        { data: { id: 'demo/namespace/shop', type: 'namespace', name: 'shop', parent: 'cluster:demo' } },
        {
          data: {
            id: 'demo/application/checkout',
            type: 'application',
            name: 'checkout',
            parent: 'demo/namespace/shop',
          },
        },
        {
          data: {
            id: 'demo/controller/StatefulSet/mongo',
            type: 'controller',
            name: 'mongo',
            parent: 'demo/application/checkout',
          },
        },
        {
          data: {
            id: 'demo/p1',
            type: 'pod',
            name: 'mongo-0',
            parent: 'demo/controller/StatefulSet/mongo',
            owner: { kind: 'StatefulSet', name: 'mongo' },
            labels: { cluster: 'demo', namespace: 'shop', node: 'demo/node-a' },
          },
        },
      ],
      // A pod-to-node edge so the Edge Types section renders (drawn in controller mode).
      edges: [{ data: { id: 'e-ptn', type: 'pod-to-node', source: 'demo/p1', target: 'demo/node-a' } }],
    },
  };

  it('renders a Namespaces legend section in controller mode (none in node mode) and does NOT default-collapse namespace boxes', () => {
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(d6FullChainPayload)] }],
    };
    render(
      <KsgPanel
        {...buildProps({
          data: { state: LoadingState.Done, series: [frame], timeRange: stubTimeRange },
          options: { ...defaultOptions, showLegend: true },
        })}
      />
    );
    // Controller mode (default): a Namespaces swatch section appears.
    const nsLegend = screen.getByTestId('namespace-legend');
    expect(within(nsLegend).getByRole('heading', { name: /Namespaces/ })).toBeInTheDocument();
    // The backend controller IS default-collapsed, but its namespace box is NOT —
    // namespace stays expanded so the grouped content is visible.
    const calls = graphCanvasSpy.mock.calls as Array<[{ collapsedIds?: Set<string> }]>;
    const lastCall = calls.at(-1)?.[0];
    expect(lastCall?.collapsedIds?.has('demo/controller/StatefulSet/mongo')).toBe(true);
    expect(lastCall?.collapsedIds?.has('demo/namespace/shop')).toBe(false);
    // Node mode strips namespace groups → no section.
    act(() => {
      fireEvent.click(screen.getByLabelText('Node'));
    });
    expect(screen.queryByTestId('namespace-legend')).not.toBeInTheDocument();
  });

  it('renders an Applications legend section in controller mode (none in node mode)', () => {
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(d6FullChainPayload)] }],
    };
    render(
      <KsgPanel
        {...buildProps({
          data: { state: LoadingState.Done, series: [frame], timeRange: stubTimeRange },
          options: { ...defaultOptions, showLegend: true },
        })}
      />
    );
    const appLegend = screen.getByTestId('application-legend');
    expect(within(appLegend).getByRole('heading', { name: /Applications/ })).toBeInTheDocument();
    fireEvent.click(within(appLegend).getByTestId('application-legend-fold-toggle'));
    expect(within(appLegend).getByText('checkout')).toBeInTheDocument();
    // Node mode strips application groups → no section.
    act(() => {
      fireEvent.click(screen.getByLabelText('Node'));
    });
    expect(screen.queryByTestId('application-legend')).not.toBeInTheDocument();
  });

  it('lists a backend D6 storageclass leaf as a NodeLegend glyph, with NO separate Storage Classes swatch section', () => {
    const payload = {
      elements: {
        nodes: [
          { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
          {
            data: {
              id: 'demo/storageclass/fast-ssd',
              type: 'storageclass',
              name: 'fast-ssd',
              parent: 'cluster:demo',
              provisioner: 'ebs.csi.aws.com',
            },
          },
          { data: { id: 'demo/pvc-0', type: 'pvc', name: 'data-0', parent: 'cluster:demo', labels: { cluster: 'demo' } } },
        ],
        edges: [{ data: { id: 'e0', type: 'pvc-to-storageclass', source: 'demo/pvc-0', target: 'demo/storageclass/fast-ssd' } }],
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
    // The retired Storage Classes swatch section is gone entirely.
    expect(screen.queryByTestId('storageclass-legend')).not.toBeInTheDocument();
    // storageclass shows as a leaf glyph in the Node Kinds legend (Storage category).
    expect(screen.getByTestId('node-legend-row-storageclass')).toBeInTheDocument();
  });

  it('orders legend sections with the swatch sections (Clusters → Namespaces → Applications) AFTER Status', () => {
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(d6FullChainPayload)] }],
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
    // … then the swatch sections, moved BELOW Status, in Clusters → Namespaces → Applications order.
    expect(idx(/status/i)).toBeLessThan(idx(/clusters/i));
    expect(idx(/clusters/i)).toBeLessThan(idx(/namespaces/i));
    expect(idx(/namespaces/i)).toBeLessThan(idx(/applications/i));
  });

  it('does not render the cluster legend when there are no clusters', () => {
    render(<KsgPanel {...buildProps({ options: { ...defaultOptions, showLegend: true } })} />);
    expect(screen.queryByTestId('cluster-legend')).not.toBeInTheDocument();
  });

  it('never renders the retired Storage Classes swatch section', () => {
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

  it('resolveSelectedNode opens for k8s-node + controller + storageclass-leaf, not cluster/namespace/application (D6 scope)', () => {
    const elements: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'node1', kind: 'node', label: 'ip-10' } },
      { group: 'nodes', data: { id: 'ctrl', kind: 'statefulset', label: 'mongo', isController: true } },
      { group: 'nodes', data: { id: 'sc', kind: 'storageclass', label: 'fast', provisioner: 'ebs.csi.aws.com' } },
      { group: 'nodes', data: { id: 'cl', label: 'demo', isCluster: true } },
      { group: 'nodes', data: { id: 'ns', label: 'shop', isNamespace: true } },
      { group: 'nodes', data: { id: 'app', label: 'checkout', isApplication: true } },
    ];
    const vis = new Set(['node1', 'ctrl', 'sc', 'cl', 'ns', 'app']);
    expect(resolveSelectedNode(elements, 'node1', vis)?.kind).toBe('node');
    expect(resolveSelectedNode(elements, 'ctrl', vis)?.kind).toBe('statefulset');
    // storageclass is a D6 leaf — now detail-eligible.
    expect(resolveSelectedNode(elements, 'sc', vis)?.kind).toBe('storageclass');
    expect(resolveSelectedNode(elements, 'cl', vis)).toBeNull();
    expect(resolveSelectedNode(elements, 'ns', vis)).toBeNull();
    expect(resolveSelectedNode(elements, 'app', vis)).toBeNull();
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

  describe('left-click detail-URL flow', () => {
    const controllerId = 'demo/controller/StatefulSet/mongo';
    const payload = {
      elements: {
        nodes: [
          { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
          // Backend D6 controller group — the pod nests under it (controller mode default).
          { data: { id: controllerId, type: 'controller', name: 'mongo', parent: 'cluster:demo' } },
          {
            data: {
              id: 'demo/p1',
              type: 'pod',
              name: 'mongo-0',
              parent: controllerId,
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

    type CanvasHandlers = {
      onSelect?: (id: string | null) => void;
      onCollapsedChange?: (next: Set<string>) => void;
    };
    const lastCanvasProps = (): CanvasHandlers => (graphCanvasSpy.mock.calls as Array<[CanvasHandlers]>).at(-1)![0];

    // The Change Report (config/code_changes) calls only — separated from the per-node
    // /dashboard prefetch, which now ALSO fires on every panel open (left or right).
    const changeReportCalls = (): unknown[][] =>
      (detailGetMock.mock.calls as unknown[][]).filter((c) => /\/(config|code)_changes$/.test(String(c[0])));

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

    it('left-click eager-prefetches /dashboard AND change-report; renders the Dashboard button + change-report sections', async () => {
      detailGetMock.mockImplementation((path: string) =>
        path.endsWith('/dashboard') ? Promise.resolve({ url: 'https://dash/mongo-0' }) : Promise.resolve({})
      );
      renderPanel(withEndpoint);
      expandAll();
      // LEFT-click open: the unified panel drives BOTH the per-node /dashboard prefetch
      // AND the workload change-report prefetch (config_changes/code_changes).
      act(() => {
        lastCanvasProps().onSelect?.('demo/p1');
      });
      await waitFor(() => {
        expect(detailGetMock).toHaveBeenCalledWith(
          '/proxy/dashboard',
          {
            application: 'checkout',
            cluster: 'demo',
            kind: 'pod',
            name: 'mongo-0',
            namespace: 'shop',
            // controller mode re-parents the pod under the synthesized controller compound
            // (isController, label 'mongo') → resolved via the ancestor walk.
            controller: 'mongo',
            // from the dashboard time range (stubTimeRange), Unix-seconds strings.
            from_time: expect.any(String) as string,
            to_time: expect.any(String) as string,
          },
          undefined,
          expect.anything()
        );
      });
      // Change Report now fires on the (sole) left-click selection of a workload node.
      await waitFor(() => {
        expect(changeReportCalls()).toHaveLength(2);
      });
      const btn = await screen.findByTestId('node-detail-dashboard-button');
      expect(btn.getAttribute('href')).toBe('https://dash/mongo-0');
      expect(btn.getAttribute('target')).toBe('_blank');
      // The unified panel shows the workload change-report sections (the pod carries no
      // alerts here, so the Alerts section is absent — data-gated).
      expect(screen.getByTestId('node-detail-section-application')).toBeInTheDocument();
      expect(screen.getByTestId('node-detail-section-containers')).toBeInTheDocument();
    });

    it('pod left-click EAGER-prefetches both endpoints WITHOUT any extra click; resolved URLs render as anchors (owner kind/name + selection time)', async () => {
      // The eager prefetch resolves the application URL and the container→URL map.
      detailGetMock.mockImplementation((path: string) =>
        path.endsWith('/config_changes')
          ? Promise.resolve({ url: 'https://argo/app/checkout' })
          : Promise.resolve({ app: { url: 'https://gh/repo/app' } })
      );
      renderPanel(withEndpoint);
      expandAll();
      act(() => {
        lastCanvasProps().onSelect?.('demo/p1');
      });
      // Panel + both sections open in sync with the selection — and the right-click
      // IMMEDIATELY fires BOTH endpoints in parallel (eager prefetch, no click).
      expect(screen.getByTestId('node-detail-panel')).toBeInTheDocument();
      expect(screen.getByTestId('node-detail-section-application')).toBeInTheDocument();
      expect(screen.getByTestId('node-detail-section-containers')).toBeInTheDocument();
      // Both queries fire with the owner-derived controller kind/name + the
      // right-click time — no anchor click triggers them.
      const params = { application: 'checkout', kind: 'statefulset', name: 'mongo', time: 1717500000 };
      await waitFor(() => {
        expect(detailGetMock).toHaveBeenCalledWith('/proxy/config_changes', params, undefined, expect.anything());
      });
      expect(detailGetMock).toHaveBeenCalledWith('/proxy/code_changes', params, undefined, expect.anything());
      expect(changeReportCalls()).toHaveLength(2);

      // Once the prefetch resolves, both Change Report cells render real anchors —
      // assert their attributes (never .click() — jsdom would not navigate).
      const appLink = await screen.findByTestId('application-url-link');
      expect(appLink.getAttribute('href')).toBe('https://argo/app/checkout');
      expect(appLink.getAttribute('target')).toBe('_blank');
      expect(appLink.getAttribute('rel')).toBe('noopener noreferrer');
      const containerLink = await screen.findByTestId('container-url-link');
      expect(containerLink.getAttribute('href')).toBe('https://gh/repo/app');
      expect(containerLink.getAttribute('target')).toBe('_blank');
      expect(containerLink.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('controller left-click prefetches with its own kind/name (aggregated application), no extra click', async () => {
      renderPanel(withEndpoint);
      act(() => {
        lastCanvasProps().onSelect?.(controllerId);
      });
      // Left-click alone fires the prefetch with the controller's own kind/name.
      await waitFor(() => {
        expect(detailGetMock).toHaveBeenCalledWith(
          '/proxy/config_changes',
          { application: 'checkout', kind: 'statefulset', name: 'mongo', time: 1717500000 },
          undefined,
          expect.anything()
        );
      });
      expect(detailGetMock).toHaveBeenCalledWith(
        '/proxy/code_changes',
        { application: 'checkout', kind: 'statefulset', name: 'mongo', time: 1717500000 },
        undefined,
        expect.anything()
      );
    });

    it('left-click on a non pod/controller node opens the panel without change-report sections or queries', async () => {
      renderPanel(withEndpoint);
      act(() => {
        lastCanvasProps().onSelect?.('demo/svc');
      });
      // Flush the open-driven /dashboard prefetch's resolve inside act.
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId('node-detail-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('node-detail-section-application')).not.toBeInTheDocument();
      expect(screen.queryByTestId('node-detail-section-containers')).not.toBeInTheDocument();
      // A non pod/controller leaf fires no Change Report queries (the /dashboard
      // prefetch is eligible for any leaf and is covered elsewhere).
      expect(changeReportCalls()).toHaveLength(0);
    });

    it('never queries while the endpoint resolves to nothing (sections render, "Not found" shown)', () => {
      // No option AND no derivable datasource ref (the fixture carries no request).
      renderPanel(defaultOptions);
      expandAll();
      act(() => {
        lastCanvasProps().onSelect?.('demo/p1');
      });
      expect(screen.getByTestId('node-detail-section-application')).toBeInTheDocument();
      // No endpoint → the hook is disabled: it fires no query and the Change Report
      // cell shows the muted "Not found" hint (not a disabled button).
      expect(detailGetMock).not.toHaveBeenCalled();
      expect(screen.getByTestId('application-url-unavailable')).toBeInTheDocument();
      expect(screen.queryByTestId('application-url-link')).not.toBeInTheDocument();
      expect(screen.queryByTestId('application-url-pending')).not.toBeInTheDocument();
    });

    it('derives the endpoint from the query datasource proxy path when the option is empty', async () => {
      getInstanceSettingsMock.mockReturnValue({ url: '/api/datasources/proxy/uid/ksg-default' });
      renderPanel(defaultOptions, requestWithRef);
      expandAll();
      act(() => {
        lastCanvasProps().onSelect?.('demo/p1');
      });
      // Right-click eager-prefetches both endpoints at the derived proxy path.
      const params = { application: 'checkout', kind: 'statefulset', name: 'mongo', time: 1717500000 };
      await waitFor(() => {
        expect(detailGetMock).toHaveBeenCalledWith(
          '/api/datasources/proxy/uid/ksg-default/config_changes',
          params,
          undefined,
          expect.anything()
        );
      });
      expect(detailGetMock).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/ksg-default/code_changes',
        params,
        undefined,
        expect.anything()
      );
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
        lastCanvasProps().onSelect?.('demo/p1');
      });
      // Right-click (not a button click) fires the prefetch at the sibling paths
      // derived from the graph query's own directory.
      const params = { application: 'checkout', kind: 'statefulset', name: 'mongo', time: 1717500000 };
      await waitFor(() => {
        expect(detailGetMock).toHaveBeenCalledWith(
          '/api/datasources/proxy/uid/ksg-default/api/v1/graph/config_changes',
          params,
          undefined,
          expect.anything()
        );
      });
      expect(detailGetMock).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/ksg-default/api/v1/graph/code_changes',
        params,
        undefined,
        expect.anything()
      );
    });

    it('a configured detailEndpoint option overrides the datasource derivation', async () => {
      getInstanceSettingsMock.mockReturnValue({ url: '/api/datasources/proxy/uid/ksg-default' });
      renderPanel(withEndpoint, requestWithRef);
      expandAll();
      act(() => {
        lastCanvasProps().onSelect?.('demo/p1');
      });
      // Right-click eager-prefetches at the configured option path, not the derived one.
      const params = { application: 'checkout', kind: 'statefulset', name: 'mongo', time: 1717500000 };
      await waitFor(() => {
        expect(detailGetMock).toHaveBeenCalledWith('/proxy/config_changes', params, undefined, expect.anything());
      });
      expect(detailGetMock).toHaveBeenCalledWith('/proxy/code_changes', params, undefined, expect.anything());
      // The option short-circuits derivation — the registry is never consulted.
      expect(getInstanceSettingsMock).not.toHaveBeenCalled();
    });

    it('never queries when the query ref resolves to no usable proxy url (registry-unresolvable)', () => {
      // beforeEach defaults getInstanceSettingsMock to undefined — the ref exists
      // but the registry cannot resolve it to a proxied base path.
      renderPanel(defaultOptions, requestWithRef);
      expandAll();
      act(() => {
        lastCanvasProps().onSelect?.('demo/p1');
      });
      expect(screen.getByTestId('node-detail-section-application')).toBeInTheDocument();
      // No resolvable endpoint → the hook is disabled: no query, and the cell shows
      // the muted "Not found" hint (not a disabled button).
      expect(detailGetMock).not.toHaveBeenCalled();
      expect(screen.getByTestId('application-url-unavailable')).toBeInTheDocument();
      expect(screen.queryByTestId('application-url-link')).not.toBeInTheDocument();
    });

    it('switching from a workload to a non-workload node clears change-report and fires no new query (count stays at 2)', async () => {
      renderPanel(withEndpoint);
      expandAll();
      act(() => {
        lastCanvasProps().onSelect?.('demo/p1');
      });
      // The workload left-click eager-prefetches both Change Report endpoints: two calls.
      await waitFor(() => {
        expect(changeReportCalls()).toHaveLength(2);
      });
      // Selecting a non-workload node (service) clears the request input → the hook
      // disables, aborts in flight, and clears its caches; the service has no change-report
      // sections to refetch, so the Change Report count stays at 2.
      act(() => {
        lastCanvasProps().onSelect?.('demo/svc');
      });
      expect(screen.queryByTestId('application-url-link')).not.toBeInTheDocument();
      expect(screen.queryByTestId('node-detail-section-application')).not.toBeInTheDocument();
      expect(changeReportCalls()).toHaveLength(2);
      // Flush the service's open-driven /dashboard prefetch resolve inside act.
      await act(async () => {
        await Promise.resolve();
      });
    });

    it('collapsing the selected pod away closes the detail panel (off-canvas node never described)', async () => {
      renderPanel(withEndpoint);
      expandAll();
      act(() => {
        lastCanvasProps().onSelect?.('demo/p1');
      });
      // Flush the open-driven /dashboard prefetch's resolve inside act.
      await act(async () => {
        await Promise.resolve();
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

  describe('selected-pod variable export (left-click, non-normal)', () => {
    const payload = {
      elements: {
        nodes: [
          { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
          {
            data: {
              id: 'demo/p1',
              type: 'pod',
              name: 'mongo-0',
              status: 'critical',
              parent: 'cluster:demo',
              labels: { cluster: 'demo', namespace: 'shop' },
            },
          },
          {
            data: {
              id: 'demo/p2',
              type: 'pod',
              name: 'web-0',
              status: 'normal',
              parent: 'cluster:demo',
              labels: { cluster: 'demo', namespace: 'shop' },
            },
          },
          { data: { id: 'demo/svc', type: 'service', name: 'svc', parent: 'cluster:demo' } },
        ],
        edges: [
          { data: { id: 'e1', type: 'service-selects-pod', source: 'demo/svc', target: 'demo/p1' } },
          { data: { id: 'e2', type: 'service-selects-pod', source: 'demo/svc', target: 'demo/p2' } },
        ],
      },
    };
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [{ name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(payload)] }],
    };
    type Handlers = { onSelect?: (id: string | null) => void;};
    const lastProps = (): Handlers => (graphCanvasSpy.mock.calls as Array<[Handlers]>).at(-1)![0];
    const selectedPodCalls = (): Array<Record<string, unknown>> =>
      (locationPartialMock.mock.calls as Array<[Record<string, unknown>]>)
        .map((c) => c[0])
        .filter((q) => 'var-selected_pod' in q);
    function renderWith(selectedPodVariable: string): void {
      render(
        <KsgPanel
          {...buildProps({
            data: { state: LoadingState.Done, series: [frame], timeRange: stubTimeRange },
            options: { ...defaultOptions, selectedPodVariable },
          })}
        />
      );
    }

    it('left-click a critical pod writes its name to the variable', () => {
      renderWith('selected_pod');
      act(() => {
        lastProps().onSelect?.('demo/p1');
      });
      expect(selectedPodCalls().at(-1)).toEqual({ 'var-selected_pod': ['mongo-0'] });
    });

    it('left-click a normal pod clears the variable ($__empty)', () => {
      renderWith('selected_pod');
      act(() => {
        lastProps().onSelect?.('demo/p2');
      });
      expect(selectedPodCalls().at(-1)).toEqual({ 'var-selected_pod': ['$__empty'] });
    });

    it('does not touch the variable when the option is empty', () => {
      renderWith('');
      act(() => {
        lastProps().onSelect?.('demo/p1');
      });
      expect(selectedPodCalls()).toHaveLength(0);
    });
  });
});
