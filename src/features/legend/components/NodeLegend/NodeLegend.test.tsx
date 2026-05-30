import { render, screen, within } from '@testing-library/react';
import React from 'react';

import { SHAPE_BY_KIND } from '../../../../shared/constants/shapeByKind';

import { NodeLegend } from './NodeLegend';

describe('NodeLegend', () => {
  it('renders one entry per kind in SHAPE_BY_KIND', () => {
    render(<NodeLegend />);
    const legend = screen.getByTestId('node-legend');
    const kinds = Object.keys(SHAPE_BY_KIND);
    const items = within(legend).getAllByRole('listitem');
    expect(items).toHaveLength(kinds.length);
  });

  it('shows a label for every kind', () => {
    render(<NodeLegend />);
    const legend = screen.getByTestId('node-legend');
    for (const kind of Object.keys(SHAPE_BY_KIND)) {
      expect(within(legend).getByText(kind)).toBeInTheDocument();
    }
  });
});
