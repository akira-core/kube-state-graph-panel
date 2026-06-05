import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

import { SwatchLegend } from './SwatchLegend';

const COMMON = { testId: 'demo-legend', rowTestIdPrefix: 'demo-legend-row-' } as const;

describe('SwatchLegend', () => {
  it('renders nothing when there are no entries', () => {
    const { container } = render(<SwatchLegend title="Demo" entries={[]} {...COMMON} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a swatch and name per entry under its title', () => {
    render(
      <SwatchLegend
        title="Nodes"
        entries={[
          { name: 'worker-0', color: '#0ea5e9' },
          { name: 'worker-1', color: '#0ea5e9' },
        ]}
        {...COMMON}
      />
    );
    const legend = screen.getByTestId('demo-legend');
    expect(within(legend).getByRole('heading', { name: 'Nodes' })).toBeInTheDocument();
    expect(within(legend).getAllByRole('listitem')).toHaveLength(2);
    expect(within(legend).getByTestId('demo-legend-row-worker-0')).toBeInTheDocument();
    expect(within(legend).getByText('worker-1')).toBeInTheDocument();
  });

  it('renders a collapse toggle that fires onToggleCollapseAll', () => {
    const onToggle = jest.fn();
    render(
      <SwatchLegend
        title="Nodes"
        entries={[{ name: 'worker-0', color: '#0ea5e9' }]}
        onToggleCollapseAll={onToggle}
        collapseToggleTestId="node-collapse-toggle"
        collapseNoun="nodes"
        {...COMMON}
      />
    );
    fireEvent.click(screen.getByTestId('node-collapse-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Collapse all nodes')).toBeInTheDocument();
  });

  it('renders no toggle when onToggleCollapseAll is absent', () => {
    render(<SwatchLegend title="Nodes" entries={[{ name: 'worker-0', color: '#0ea5e9' }]} {...COMMON} />);
    expect(screen.queryByTestId('node-collapse-toggle')).not.toBeInTheDocument();
  });
});
