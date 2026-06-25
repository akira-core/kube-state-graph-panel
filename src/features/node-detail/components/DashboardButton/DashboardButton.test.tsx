import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { DashboardButton } from './DashboardButton';

describe('DashboardButton', () => {
  it('renders a new-tab link to the URL when ready with one link', () => {
    render(
      <DashboardButton state={{ status: 'ready', urls: [{ label: 'Dashboard', url: 'https://dash/n1' }] }} />
    );
    const btn = screen.getByTestId('node-detail-dashboard-button');
    expect(btn).toHaveAttribute('href', 'https://dash/n1');
    expect(btn).toHaveAttribute('target', '_blank');
    expect(btn).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders a Dashboards menu when ready with multiple links', () => {
    render(
      <DashboardButton
        state={{
          status: 'ready',
          urls: [
            { label: 'Metrics', url: 'https://dash/metrics' },
            { label: 'Logs', url: 'https://dash/logs' },
          ],
        }}
      />
    );
    expect(screen.queryByTestId('node-detail-dashboard-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('node-detail-dashboards-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Dashboards/i }));
    const metrics = screen.getByTestId('node-detail-dashboard-link-0');
    const logs = screen.getByTestId('node-detail-dashboard-link-1');
    expect(metrics).toHaveAttribute('href', 'https://dash/metrics');
    expect(logs).toHaveAttribute('href', 'https://dash/logs');
    expect(metrics).toHaveAttribute('target', '_blank');
    expect(logs).toHaveAttribute('target', '_blank');
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
