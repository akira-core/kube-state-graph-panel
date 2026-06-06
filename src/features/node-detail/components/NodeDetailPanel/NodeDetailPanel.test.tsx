import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { NodeDetailPanel } from './NodeDetailPanel';
import type { NodeDetailData } from './NodeDetailPanel.types';

const sample: NodeDetailData = {
  id: 'p1',
  label: 'mongo-0',
  kind: 'pod',
  status: 'critical',
  alerts: [{ pod: 'mongo-1', service: 'mongo', name: 'HighMemory', severity: 'critical', time: 1717500000 }],
};

describe('NodeDetailPanel', () => {
  it('renders nothing when node is null', () => {
    render(<NodeDetailPanel node={null} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />);
    expect(screen.queryByTestId('node-detail-panel')).not.toBeInTheDocument();
  });

  it('renders title, kind/status badges and the alerts table', () => {
    render(<NodeDetailPanel node={sample} onClose={jest.fn()} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    expect(screen.getByTestId('node-detail-panel')).toBeInTheDocument();
    expect(screen.getByText('mongo-0')).toBeInTheDocument();
    expect(screen.getByTestId('node-detail-kind')).toHaveTextContent('pod');
    expect(screen.getByTestId('node-detail-status')).toHaveTextContent('critical');
    expect(screen.getByText('Alerts')).toBeInTheDocument();
    expect(screen.getByTestId('node-detail-section-alerts')).toBeInTheDocument();
    expect(screen.getByText('HighMemory')).toBeInTheDocument();
  });

  it('shows "No alerts" when the node carries none', () => {
    const noAlerts: NodeDetailData = { id: 'p2', label: 'web', kind: 'pod' };
    render(<NodeDetailPanel node={noAlerts} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />);
    expect(screen.getByTestId('alert-table-empty')).toHaveTextContent('No alerts');
  });

  it('forwards alert time clicks to onAlertTimeClick (seconds)', () => {
    const onAlertTimeClick = jest.fn();
    render(<NodeDetailPanel node={sample} onClose={jest.fn()} onAlertTimeClick={onAlertTimeClick} timeZone="utc" />);
    fireEvent.click(screen.getByTestId('alert-time'));
    expect(onAlertTimeClick).toHaveBeenCalledWith(1717500000);
  });

  it('swaps content when re-rendered for a different node (alerts → No alerts)', () => {
    const { rerender } = render(
      <NodeDetailPanel node={sample} onClose={jest.fn()} onAlertTimeClick={jest.fn()} timeZone="utc" />
    );
    expect(screen.getByText('HighMemory')).toBeInTheDocument();

    const other: NodeDetailData = { id: 'p9', label: 'web-1', kind: 'pod' };
    rerender(<NodeDetailPanel node={other} onClose={jest.fn()} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    expect(screen.getByText('web-1')).toBeInTheDocument();
    expect(screen.queryByText('HighMemory')).not.toBeInTheDocument();
    expect(screen.getByTestId('alert-table-empty')).toHaveTextContent('No alerts');
  });

  it('keeps the header (and its close button) outside the scrollable body so it stays pinned', () => {
    render(<NodeDetailPanel node={sample} onClose={jest.fn()} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    const scrollBody = screen.getByTestId('node-detail-scroll');
    // The alerts live INSIDE the scroll region...
    expect(scrollBody).toContainElement(screen.getByTestId('node-detail-section-alerts'));
    // ...but the close button does NOT, so scrolling a long alert list never carries
    // the header (and its ✕) out of view.
    expect(scrollBody).not.toContainElement(screen.getByLabelText('Close detail panel'));
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = jest.fn();
    render(<NodeDetailPanel node={sample} onClose={onClose} onAlertTimeClick={jest.fn()} />);
    fireEvent.click(screen.getByLabelText('Close detail panel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
