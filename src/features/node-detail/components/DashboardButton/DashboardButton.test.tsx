import { render, screen } from '@testing-library/react';
import React from 'react';

import { DashboardButton } from './DashboardButton';

describe('DashboardButton', () => {
  it('renders a new-tab link to the URL when ready', () => {
    render(<DashboardButton state={{ status: 'ready', url: 'https://dash/n1' }} />);
    const btn = screen.getByTestId('node-detail-dashboard-button');
    expect(btn).toHaveAttribute('href', 'https://dash/n1');
    expect(btn).toHaveAttribute('target', '_blank');
    expect(btn).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders nothing while loading', () => {
    const { container } = render(<DashboardButton state={{ status: 'loading' }} />);
    expect(screen.queryByTestId('node-detail-dashboard-button')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when unavailable', () => {
    const { container } = render(<DashboardButton state={{ status: 'unavailable' }} />);
    expect(screen.queryByTestId('node-detail-dashboard-button')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
