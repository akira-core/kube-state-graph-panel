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
  // The pod↔service pair (pod-calls-service + service-selects-pod) collapses to a
  // single bidirectional row, so the default legend has one fewer row than the
  // master map has edge types.
  const SVC_PAIR = ['pod-calls-service', 'service-selects-pod'];

  it('renders one row per drawn edge type, collapsing the pod↔svc pair into one', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    const items = within(legend).getAllByRole('listitem');
    // The default legend lists the node-mode drawn set; the pod↔svc pair (both
    // present) collapses to a single bidirectional row, so the row count is the
    // node drawn-set size minus one.
    expect(items).toHaveLength(drawnEdgeTypesForMode('node').length - 1);
  });

  it('renders each non-merged edge type as `<from> → <to>` endpoint labels (svc for service)', () => {
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

  it('collapses pod-calls-service + service-selects-pod into one bidirectional pod ↔ svc row', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    // The two single-direction svc rows are gone…
    expect(within(legend).queryByTestId('edge-legend-row-pod-calls-service')).toBeNull();
    expect(within(legend).queryByTestId('edge-legend-row-service-selects-pod')).toBeNull();
    // …replaced by one merged row with both endpoints and a two-headed arrow.
    const row = within(legend).getByTestId('edge-legend-row-pod-svc');
    expect(within(row).getByText('pod')).toBeInTheDocument();
    expect(within(row).getByText('svc')).toBeInTheDocument();
    expect(within(row).getByTestId('edge-glyph-arrow-start')).toBeInTheDocument();
    // Coloured with the shared svc-edge green.
    expect(within(row).getByTestId('edge-glyph').querySelector('polygon')?.getAttribute('fill')).toBe(
      COLOR_BY_EDGE_TYPE['pod-calls-service'].color
    );
  });

  it('places a same-colour arrow glyph between the endpoints of every non-merged drawn edge type', () => {
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
    it('lists pod-runs-on-node and drops controller-owns-pod (service edges still drawn)', () => {
      // The legend is list-only now; the mode is reflected by the edge types passed in.
      render(<EdgeLegend edgeTypes={drawnEdgeTypesForMode('controller')} />);
      const legend = screen.getByTestId('edge-legend');
      expect(within(legend).getByTestId('edge-legend-row-pod-runs-on-node')).toBeInTheDocument();
      expect(within(legend).queryByTestId('edge-legend-row-controller-owns-pod')).toBeNull();
      // service-selects-pod is part of the merged pod↔svc row in both modes.
      expect(within(legend).getByTestId('edge-legend-row-pod-svc')).toBeInTheDocument();
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
