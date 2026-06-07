import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

import { StorageClassLegend } from './StorageClassLegend';

describe('StorageClassLegend', () => {
  it('renders nothing when there are no storage classes', () => {
    const { container } = render(<StorageClassLegend storageClasses={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a swatch per storage class under a "Storage classes" heading', () => {
    render(
      <StorageClassLegend
        storageClasses={[
          { name: 'fast-ssd', color: '#0ea5e9' },
          { name: 'standard', color: '#8b5cf6' },
        ]}
      />
    );
    const legend = screen.getByTestId('storageclass-legend');
    expect(within(legend).getByRole('heading', { name: /Storage classes/ })).toBeInTheDocument();
    fireEvent.click(within(legend).getByTestId('storageclass-legend-fold-toggle'));
    expect(within(legend).getAllByRole('listitem')).toHaveLength(2);
    expect(within(legend).getByTestId('storageclass-legend-row-fast-ssd')).toBeInTheDocument();
    expect(within(legend).getByText('standard')).toBeInTheDocument();
  });

  it('fires the collapse toggle', () => {
    const onToggle = jest.fn();
    render(
      <StorageClassLegend storageClasses={[{ name: 'fast-ssd', color: '#0ea5e9' }]} onToggleCollapseAll={onToggle} />
    );
    fireEvent.click(screen.getByTestId('storageclass-collapse-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
