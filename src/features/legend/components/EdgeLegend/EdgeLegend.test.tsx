import { render, screen, within } from '@testing-library/react';
import React from 'react';

import { EDGE_ENDPOINTS_BY_TYPE, EDGE_STYLE_BY_TYPE } from '../../../../shared/constants/colorByEdgeType';
import { drawnEdgeTypesForMode } from '../../../../shared/constants/drawnEdgeTypesForMode';

import { EdgeLegend } from './EdgeLegend';

describe('EdgeLegend', () => {
  // The pod↔service pair (pod-calls-service + service-selects-pod) is OMITTED from
  // the legend (it is the pod-to-pod relationship via a Service). `node-to-switch` is
  // also omitted — it folds into the merged `switch/node → switch` fabric row. So the
  // default legend has three fewer rows than the node drawn-set has edge types.
  const SVC_PAIR = ['pod-calls-service', 'service-selects-pod'];
  const OMITTED = [...SVC_PAIR, 'node-to-switch'];

  it('omits the pod↔svc pair + node-to-switch (one row per OTHER drawn edge type)', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    const items = within(legend).getAllByRole('listitem');
    // The default legend lists the node-mode drawn set minus the omitted edges.
    expect(items).toHaveLength(drawnEdgeTypesForMode('node').length - OMITTED.length);
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
    // pod-calls-pod and switch-to-switch are covered by their own dedicated tests below
    // (they carry merged labels — `pod ↔ pod/service` and `switch/node → switch` — not
    // their raw from/to endpoints).
    for (const edgeType of drawnEdgeTypesForMode('node').filter(
      (t) => !OMITTED.includes(t) && t !== 'pod-calls-pod' && t !== 'switch-to-switch'
    )) {
      const row = within(legend).getByTestId(`edge-legend-row-${edgeType}`);
      const { from, to } = EDGE_ENDPOINTS_BY_TYPE[edgeType];
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

  it('labels the pod-calls-pod row `pod ↔ pod/service` with a bidirectional glyph (the folded svc edges)', () => {
    // The single pod-calls-pod row stands in for the omitted pod↔service pair, so it
    // reads `pod ↔ pod/service` (bidirectional) rather than a one-way `pod → pod`.
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    const row = within(legend).getByTestId('edge-legend-row-pod-calls-pod');
    expect(within(row).getByText('pod')).toBeInTheDocument();
    expect(within(row).getByText('pod/service')).toBeInTheDocument();
    // bidirectional → an arrowhead at BOTH ends.
    expect(within(row).getByTestId('edge-glyph').querySelectorAll('polygon')).toHaveLength(2);
  });

  it('merges the two fabric edges into one `switch/node → switch` row (node-to-switch folded in)', () => {
    render(<EdgeLegend edgeTypes={['switch-to-switch', 'node-to-switch']} />);
    const legend = screen.getByTestId('edge-legend');
    const row = within(legend).getByTestId('edge-legend-row-switch-to-switch');
    expect(within(row).getByText('switch/node')).toBeInTheDocument();
    expect(within(row).getByText('switch')).toBeInTheDocument();
    // node-to-switch folds into the switch row — no separate row, and exactly one row total.
    expect(within(legend).queryByTestId('edge-legend-row-node-to-switch')).toBeNull();
    expect(within(legend).getAllByRole('listitem')).toHaveLength(1);
  });

  it('colours service edges the same as pod-calls-pod on canvas (single shared style)', () => {
    // Canvas colour parity (the legend omits svc, but the style map must unify them).
    expect(EDGE_STYLE_BY_TYPE['service-selects-pod'].color).toBe(EDGE_STYLE_BY_TYPE['pod-calls-pod'].color);
    expect(EDGE_STYLE_BY_TYPE['pod-calls-service'].color).toBe(EDGE_STYLE_BY_TYPE['pod-calls-pod'].color);
  });

  it('places a same-colour arrow glyph between the endpoints of every non-omitted drawn edge type', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    // Iterate the node-mode drawn set; the omitted svc pair + node-to-switch are covered
    // separately (node-to-switch folds into the switch-to-switch row, which is still here).
    for (const edgeType of drawnEdgeTypesForMode('node').filter((t) => !OMITTED.includes(t))) {
      const row = within(legend).getByTestId(`edge-legend-row-${edgeType}`);
      const glyph = within(row).getByTestId('edge-glyph');
      expect(glyph.querySelector('polygon')?.getAttribute('fill')).toBe(EDGE_STYLE_BY_TYPE[edgeType].color);
    }
  });

  it('does not list the retired panel-synthetic edges (pod-runs-on-node / controller-owns-pod)', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    expect(within(legend).queryByTestId('edge-legend-row-pod-runs-on-node')).toBeNull();
    expect(within(legend).queryByTestId('edge-legend-row-controller-owns-pod')).toBeNull();
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
    it('lists pod-to-node + pvc-to-storageclass and drops the omitted svc pair', () => {
      // The legend is list-only now; the mode is reflected by the edge types passed in.
      render(<EdgeLegend edgeTypes={drawnEdgeTypesForMode('controller')} />);
      const legend = screen.getByTestId('edge-legend');
      expect(within(legend).getByTestId('edge-legend-row-pod-to-node')).toBeInTheDocument();
      expect(within(legend).getByTestId('edge-legend-row-pvc-to-storageclass')).toBeInTheDocument();
      // service edges are omitted from the legend in both modes (still drawn on canvas).
      expect(within(legend).queryByTestId('edge-legend-row-pod-svc')).toBeNull();
      expect(within(legend).queryByTestId('edge-legend-row-service-selects-pod')).toBeNull();
    });

    it('does not list pod-to-node in node mode (expressed as nesting there)', () => {
      render(<EdgeLegend edgeTypes={drawnEdgeTypesForMode('node')} />);
      const legend = screen.getByTestId('edge-legend');
      expect(within(legend).queryByTestId('edge-legend-row-pod-to-node')).toBeNull();
      // pvc-to-storageclass is drawn in both modes.
      expect(within(legend).getByTestId('edge-legend-row-pvc-to-storageclass')).toBeInTheDocument();
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
