import { render, screen, within } from '@testing-library/react';
import React from 'react';

import { categoryForKind } from '../../../../shared/constants/categoryByKind';
import { ICON_SVG_BY_KIND } from '../../../../shared/constants/iconSvgByKind';

import { NodeLegend } from './NodeLegend';

describe('NodeLegend', () => {
  it('renders one entry per kind in ICON_SVG_BY_KIND', () => {
    render(<NodeLegend />);
    const legend = screen.getByTestId('node-legend');
    const kinds = Object.keys(ICON_SVG_BY_KIND);
    const items = within(legend).getAllByRole('listitem');
    expect(items).toHaveLength(kinds.length);
  });

  it('shows a label for every kind', () => {
    render(<NodeLegend />);
    const legend = screen.getByTestId('node-legend');
    for (const kind of Object.keys(ICON_SVG_BY_KIND)) {
      expect(within(legend).getByText(kind)).toBeInTheDocument();
    }
  });

  it('draws an icon glyph next to every kind', () => {
    render(<NodeLegend />);
    const legend = screen.getByTestId('node-legend');
    for (const kind of Object.keys(ICON_SVG_BY_KIND)) {
      const row = within(legend).getByTestId(`node-legend-row-${kind}`);
      expect(within(row).getByTestId(`icon-glyph-${kind}`)).toBeInTheDocument();
    }
  });

  it('groups kinds under their super-category, and each kind sits in its category section', () => {
    render(<NodeLegend />);
    const legend = screen.getByTestId('node-legend');
    for (const kind of Object.keys(ICON_SVG_BY_KIND)) {
      const group = within(legend).getByTestId(`node-legend-group-${categoryForKind(kind)}`);
      expect(within(group).getByTestId(`node-legend-row-${kind}`)).toBeInTheDocument();
    }
  });

  it('lists only the kinds passed in (present in the graph), grouped by category', () => {
    render(<NodeLegend kinds={['pod', 'service']} />);
    const legend = screen.getByTestId('node-legend');
    expect(within(legend).getByTestId('node-legend-row-pod')).toBeInTheDocument();
    expect(within(legend).getByTestId('node-legend-row-service')).toBeInTheDocument();
    // kinds not passed in are absent
    expect(within(legend).queryByTestId('node-legend-row-pvc')).toBeNull();
    expect(within(legend).queryByTestId('node-legend-row-node')).toBeNull();
    // only categories with a present kind render a group
    expect(within(legend).getByTestId('node-legend-group-Workloads')).toBeInTheDocument();
    expect(within(legend).getByTestId('node-legend-group-Networking')).toBeInTheDocument();
    expect(within(legend).queryByTestId('node-legend-group-Storage')).toBeNull();
  });

  it('renders nothing when no kinds are present', () => {
    const { container } = render(<NodeLegend kinds={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
