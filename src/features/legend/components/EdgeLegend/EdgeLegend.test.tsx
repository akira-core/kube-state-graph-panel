import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

import { COLOR_BY_EDGE_TYPE, EDGE_ENDPOINTS_BY_TYPE } from '../../../../shared/constants/colorByEdgeType';

import { EdgeLegend } from './EdgeLegend';

describe('EdgeLegend', () => {
  it('renders one entry per edge type in COLOR_BY_EDGE_TYPE', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    const edgeTypes = Object.keys(COLOR_BY_EDGE_TYPE);
    const items = within(legend).getAllByRole('listitem');
    expect(items).toHaveLength(edgeTypes.length);
  });

  it('renders each edge type as `<from> → <to>` endpoint labels (svc for service)', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    const label = (kind: string): string => (kind === 'service' ? 'svc' : kind);
    for (const edgeType of Object.keys(COLOR_BY_EDGE_TYPE)) {
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

  it('lists the pod → svc edge (pod-calls-service)', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    const row = within(legend).getByTestId('edge-legend-row-pod-calls-service');
    expect(within(row).getByText('pod')).toBeInTheDocument();
    expect(within(row).getByText('svc')).toBeInTheDocument();
  });

  it('places a same-colour arrow glyph between the endpoints of every edge type', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    for (const [edgeType, style] of Object.entries(COLOR_BY_EDGE_TYPE)) {
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
