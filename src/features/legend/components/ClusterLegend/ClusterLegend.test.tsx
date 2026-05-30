import { render, screen, within } from '@testing-library/react';
import React from 'react';

import { ClusterLegend } from './ClusterLegend';

describe('ClusterLegend', () => {
  it('renders nothing when there are no clusters', () => {
    const { container } = render(<ClusterLegend clusters={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a swatch and name per cluster', () => {
    render(
      <ClusterLegend
        clusters={[
          { name: 'demo', color: '#14b8a6' },
          { name: 'edge', color: '#ec4899' },
        ]}
      />
    );
    const legend = screen.getByTestId('cluster-legend');
    expect(within(legend).getAllByRole('listitem')).toHaveLength(2);
    expect(within(legend).getByText('demo')).toBeInTheDocument();
    expect(within(legend).getByText('edge')).toBeInTheDocument();
  });
});
