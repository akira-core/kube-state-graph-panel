import { fireEvent, render, screen, within } from '@testing-library/react';
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

  it('draws the matching shape glyph next to every kind', () => {
    render(<NodeLegend />);
    const legend = screen.getByTestId('node-legend');
    for (const [kind, shape] of Object.entries(SHAPE_BY_KIND)) {
      const row = within(legend).getByTestId(`node-legend-row-${kind}`);
      expect(within(row).getByTestId(`shape-glyph-${shape}`)).toBeInTheDocument();
    }
  });

  it('renders a node collapse toggle and fires onToggleCollapseAll when showCollapseToggle', () => {
    const onToggle = jest.fn();
    render(<NodeLegend onToggleCollapseAll={onToggle} allCollapsed={false} showCollapseToggle />);
    fireEvent.click(screen.getByTestId('node-collapse-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders no node toggle when showCollapseToggle is false', () => {
    render(<NodeLegend onToggleCollapseAll={jest.fn()} allCollapsed={false} showCollapseToggle={false} />);
    expect(screen.queryByTestId('node-collapse-toggle')).not.toBeInTheDocument();
  });
});
