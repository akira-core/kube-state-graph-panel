import { render, screen, within } from '@testing-library/react';
import React from 'react';

import {
  COLOR_BY_EDGE_TYPE,
  EDGE_ENDPOINTS_BY_TYPE,
  EDGE_STYLE_BY_TYPE,
} from '../../../../shared/constants/colorByEdgeType';
import { drawnEdgeTypesForMode } from '../../../../shared/constants/drawnEdgeTypesForMode';

import { EdgeLegend } from './EdgeLegend';

describe('EdgeLegend', () => {
  // The pod↔service pair (pod-calls-service + service-selects-pod) is OMITTED from
  // the legend (it is the pod-to-pod relationship via a Service), so the default
  // legend has two fewer rows than the node drawn-set has edge types.
  const SVC_PAIR = ['pod-calls-service', 'service-selects-pod'];

  it('omits the pod↔svc pair entirely (one row per OTHER drawn edge type)', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    const items = within(legend).getAllByRole('listitem');
    // The default legend lists the node-mode drawn set minus the two omitted svc edges.
    expect(items).toHaveLength(drawnEdgeTypesForMode('node').length - SVC_PAIR.length);
  });

  it('renders a Title-Case "Edge Types" heading', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    expect(within(legend).getByRole('heading', { name: 'Edge Types' })).toBeInTheDocument();
  });

  it('renders each non-omitted edge type as `<from> → <to>` endpoint labels (svc for service)', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    const label = (kind: string): string => (kind === 'service' ? 'svc' : kind);
    // controller-owns-pod is covered by its own dedicated test below.
    for (const edgeType of Object.keys(COLOR_BY_EDGE_TYPE).filter(
      (t) => !SVC_PAIR.includes(t) && t !== 'controller-owns-pod'
    )) {
      const row = within(legend).getByTestId(`edge-legend-row-${edgeType}`);
      const { from, to } = EDGE_ENDPOINTS_BY_TYPE[edgeType as keyof typeof EDGE_ENDPOINTS_BY_TYPE];
      // pod→pod renders 'pod' twice, so count occurrences rather than getByText.
      const expected = [label(from), label(to)];
      for (const text of new Set(expected)) {
        const occurrences = expected.filter((value) => value === text).length;
        expect(within(row).getAllByText(text)).toHaveLength(occurrences);
      }
    }
  });

  it('omits both svc edges and any merged pod↔svc row from the legend', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    // The pod↔service relationship is conceptually pod-to-pod, so neither the two
    // single-direction svc rows nor a merged pod↔svc row appear.
    expect(within(legend).queryByTestId('edge-legend-row-pod-calls-service')).toBeNull();
    expect(within(legend).queryByTestId('edge-legend-row-service-selects-pod')).toBeNull();
    expect(within(legend).queryByTestId('edge-legend-row-pod-svc')).toBeNull();
  });

  it('colours service edges the same as pod-calls-pod on canvas (single shared style)', () => {
    // Canvas colour parity (the legend omits svc, but the style map must unify them).
    expect(COLOR_BY_EDGE_TYPE['service-selects-pod'].color).toBe(COLOR_BY_EDGE_TYPE['pod-calls-pod'].color);
    expect(COLOR_BY_EDGE_TYPE['pod-calls-service'].color).toBe(COLOR_BY_EDGE_TYPE['pod-calls-pod'].color);
  });

  it('places a same-colour arrow glyph between the endpoints of every non-omitted drawn edge type', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    // Iterate the node-mode drawn set (controller-owns-pod is no longer drawn in
    // node mode, so it has no row); the merged svc pair is covered separately.
    for (const edgeType of drawnEdgeTypesForMode('node').filter((t) => !SVC_PAIR.includes(t))) {
      const row = within(legend).getByTestId(`edge-legend-row-${edgeType}`);
      const glyph = within(row).getByTestId('edge-glyph');
      expect(glyph.querySelector('polygon')?.getAttribute('fill')).toBe(EDGE_STYLE_BY_TYPE[edgeType].color);
    }
  });

  it('does not list pod-runs-on-node as a drawn edge', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    expect(within(legend).queryByTestId('edge-legend-row-pod-runs-on-node')).toBeNull();
  });

  it('renders no explanatory note', () => {
    render(<EdgeLegend />);
    expect(screen.queryByTestId('edge-legend-nesting-note')).toBeNull();
  });

  it('lists only the edge types passed in (present in the graph)', () => {
    render(<EdgeLegend edgeTypes={['switch-to-switch', 'pod-mounts-pvc']} />);
    const legend = screen.getByTestId('edge-legend');
    expect(within(legend).getByTestId('edge-legend-row-switch-to-switch')).toBeInTheDocument();
    expect(within(legend).getByTestId('edge-legend-row-pod-mounts-pvc')).toBeInTheDocument();
    expect(within(legend).queryByTestId('edge-legend-row-pod-calls-pod')).toBeNull();
    expect(within(legend).queryByTestId('edge-legend-row-service-selects-pod')).toBeNull();
  });

  it('renders nothing when no edge types are present', () => {
    const { container } = render(<EdgeLegend edgeTypes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  describe('controller pod-parent mode', () => {
    it('lists pod-runs-on-node and drops controller-owns-pod + the omitted svc pair', () => {
      // The legend is list-only now; the mode is reflected by the edge types passed in.
      render(<EdgeLegend edgeTypes={drawnEdgeTypesForMode('controller')} />);
      const legend = screen.getByTestId('edge-legend');
      expect(within(legend).getByTestId('edge-legend-row-pod-runs-on-node')).toBeInTheDocument();
      expect(within(legend).queryByTestId('edge-legend-row-controller-owns-pod')).toBeNull();
      // service edges are omitted from the legend in both modes (still drawn on canvas).
      expect(within(legend).queryByTestId('edge-legend-row-pod-svc')).toBeNull();
      expect(within(legend).queryByTestId('edge-legend-row-service-selects-pod')).toBeNull();
    });
  });

  describe('controller-owns-pod label', () => {
    it('is no longer drawn in node mode (filtered out of the node drawn-set)', () => {
      render(<EdgeLegend edgeTypes={drawnEdgeTypesForMode('node')} />);
      const legend = screen.getByTestId('edge-legend');
      expect(within(legend).queryByTestId('edge-legend-row-controller-owns-pod')).toBeNull();
    });

    it('still shows "controller" as the FROM label (not "deployment") when explicitly listed', () => {
      // The type stays in the endpoint/style maps, so if it is ever passed in
      // explicitly the label logic must still resolve to the generic "controller".
      render(<EdgeLegend edgeTypes={['controller-owns-pod']} />);
      const legend = screen.getByTestId('edge-legend');
      const row = within(legend).getByTestId('edge-legend-row-controller-owns-pod');
      expect(within(row).getByText('controller')).toBeInTheDocument();
      expect(within(row).getByText('pod')).toBeInTheDocument();
      expect(within(row).queryByText('deployment')).toBeNull();
    });
  });

  describe('no mode toggle (moved to LayoutModeControl at the top of the legend)', () => {
    it('renders no pod-parent-mode toggle button', () => {
      render(<EdgeLegend />);
      expect(screen.queryByTestId('pod-parent-mode-toggle')).toBeNull();
    });

    it('still renders no toggle when an explicit edge list is passed', () => {
      render(<EdgeLegend edgeTypes={drawnEdgeTypesForMode('node')} />);
      expect(screen.queryByTestId('pod-parent-mode-toggle')).toBeNull();
    });
  });
});
