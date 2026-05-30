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
});
