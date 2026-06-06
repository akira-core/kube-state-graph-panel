import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

import { COLOR_BY_EDGE_TYPE, EDGE_ENDPOINTS_BY_TYPE } from '../../../../shared/constants/colorByEdgeType';

import { EdgeLegend } from './EdgeLegend';

describe('EdgeLegend', () => {
  // The pod↔service pair (pod-calls-service + service-selects-pod) collapses to a
  // single bidirectional row, so the default legend has one fewer row than the
  // master map has edge types.
  const SVC_PAIR = ['pod-calls-service', 'service-selects-pod'];

  it('renders one row per edge type, collapsing the pod↔svc pair into one', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    const items = within(legend).getAllByRole('listitem');
    expect(items).toHaveLength(Object.keys(COLOR_BY_EDGE_TYPE).length - 1);
  });

  it('renders each non-merged edge type as `<from> → <to>` endpoint labels (svc for service)', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    const label = (kind: string): string => (kind === 'service' ? 'svc' : kind);
    for (const edgeType of Object.keys(COLOR_BY_EDGE_TYPE).filter((t) => !SVC_PAIR.includes(t))) {
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

  it('places a same-colour arrow glyph between the endpoints of every non-merged edge type', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    for (const [edgeType, style] of Object.entries(COLOR_BY_EDGE_TYPE).filter(([t]) => !SVC_PAIR.includes(t))) {
      const row = within(legend).getByTestId(`edge-legend-row-${edgeType}`);
      const glyph = within(row).getByTestId('edge-glyph');
      expect(glyph.querySelector('polygon')?.getAttribute('fill')).toBe(style.color);
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

  describe('service pod-parent mode', () => {
    it('lists pod-runs-on-node and drops service-selects-pod', () => {
      render(<EdgeLegend mode="service" />);
      const legend = screen.getByTestId('edge-legend');
      expect(within(legend).getByTestId('edge-legend-row-pod-runs-on-node')).toBeInTheDocument();
      expect(within(legend).queryByTestId('edge-legend-row-service-selects-pod')).toBeNull();
    });
  });

  describe('mode toggle', () => {
    it('renders no toggle button when onToggleMode is omitted', () => {
      render(<EdgeLegend />);
      expect(screen.queryByTestId('pod-parent-mode-toggle')).toBeNull();
    });

    it('calls onToggleMode when the toggle is clicked', () => {
      const onToggleMode = jest.fn();
      render(<EdgeLegend mode="node" onToggleMode={onToggleMode} />);
      fireEvent.click(screen.getByTestId('pod-parent-mode-toggle'));
      expect(onToggleMode).toHaveBeenCalledTimes(1);
    });

    it('labels the toggle by the action it performs in the current mode', () => {
      const { rerender } = render(<EdgeLegend mode="node" onToggleMode={jest.fn()} />);
      expect(screen.getByTestId('pod-parent-mode-toggle')).toHaveAttribute('aria-label', 'Nest pods under services');
      rerender(<EdgeLegend mode="service" onToggleMode={jest.fn()} />);
      expect(screen.getByTestId('pod-parent-mode-toggle')).toHaveAttribute('aria-label', 'Nest pods under nodes');
    });
  });
});
