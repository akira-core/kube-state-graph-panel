import { render, screen, within } from '@testing-library/react';
import React from 'react';

import { COLOR_BY_EDGE_TYPE } from '../../../../shared/constants/colorByEdgeType';

import { EdgeLegend } from './EdgeLegend';

describe('EdgeLegend', () => {
  it('renders one entry per edge type in COLOR_BY_EDGE_TYPE', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    const edgeTypes = Object.keys(COLOR_BY_EDGE_TYPE);
    const items = within(legend).getAllByRole('listitem');
    expect(items).toHaveLength(edgeTypes.length);
  });

  it('shows a label for every edge type', () => {
    render(<EdgeLegend />);
    const legend = screen.getByTestId('edge-legend');
    for (const edgeType of Object.keys(COLOR_BY_EDGE_TYPE)) {
      expect(within(legend).getByText(edgeType)).toBeInTheDocument();
    }
  });

  it('draws a same-colour arrow glyph next to every edge type', () => {
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

  it('explains pod-runs-on-node as compound nesting instead of an edge', () => {
    render(<EdgeLegend />);
    const note = screen.getByTestId('edge-legend-nesting-note');
    expect(note).toHaveTextContent(/pod-runs-on-node/);
    expect(note).toHaveTextContent(/node box/i);
  });
});
