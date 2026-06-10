import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { NodeDetailPanel } from './NodeDetailPanel';
import type { NodeDetailData } from './NodeDetailPanel.types';

const sample: NodeDetailData = {
  id: 'p1',
  label: 'mongo-0',
  kind: 'pod',
  status: 'critical',
  alerts: [{ pod: 'mongo-1', service: 'mongo', name: 'HighMemory', severity: 'critical', timeRecords: [1717500000] }],
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

  describe('Application / Containers sections', () => {
    const podWithBoth: NodeDetailData = {
      id: 'p1',
      label: 'mongo-0',
      kind: 'pod',
      application: 'checkout',
      containers: [{ name: 'app', image: 'repo/app:1.2' }],
    };

    it('renders both sections for a pod carrying application and containers', () => {
      render(<NodeDetailPanel node={podWithBoth} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />);
      expect(screen.getByTestId('node-detail-section-application')).toBeInTheDocument();
      expect(screen.getByTestId('node-detail-section-containers')).toBeInTheDocument();
      expect(screen.getByText('checkout')).toBeInTheDocument();
      expect(screen.getByText('app')).toBeInTheDocument();
      expect(screen.getByText('repo/app:1.2')).toBeInTheDocument();
    });

    it('renders both sections for a controller kind (statefulset)', () => {
      render(
        <NodeDetailPanel node={{ ...podWithBoth, kind: 'statefulset' }} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />
      );
      expect(screen.getByTestId('node-detail-section-application')).toBeInTheDocument();
      expect(screen.getByTestId('node-detail-section-containers')).toBeInTheDocument();
    });

    it('never renders the sections for a non pod/controller kind, even with stray data', () => {
      render(
        <NodeDetailPanel node={{ ...podWithBoth, kind: 'service' }} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />
      );
      expect(screen.queryByTestId('node-detail-section-application')).not.toBeInTheDocument();
      expect(screen.queryByTestId('node-detail-section-containers')).not.toBeInTheDocument();
    });

    it('hides only the Application section when application is absent (independent gating)', () => {
      const noApp: NodeDetailData = {
        id: 'p1',
        label: 'mongo-0',
        kind: 'pod',
        containers: [{ name: 'app', image: 'repo/app:1.2' }],
      };
      render(<NodeDetailPanel node={noApp} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />);
      expect(screen.queryByTestId('node-detail-section-application')).not.toBeInTheDocument();
      expect(screen.getByTestId('node-detail-section-containers')).toBeInTheDocument();
    });

    it('hides only the Containers section when containers are absent or empty', () => {
      const noContainers: NodeDetailData = { id: 'p1', label: 'mongo-0', kind: 'pod', application: 'checkout' };
      const { rerender } = render(
        <NodeDetailPanel node={noContainers} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />
      );
      expect(screen.getByTestId('node-detail-section-application')).toBeInTheDocument();
      expect(screen.queryByTestId('node-detail-section-containers')).not.toBeInTheDocument();
      rerender(
        <NodeDetailPanel node={{ ...podWithBoth, containers: [] }} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />
      );
      expect(screen.queryByTestId('node-detail-section-containers')).not.toBeInTheDocument();
    });

    it('keeps the Alerts section and header intact alongside the new sections (failure isolation)', () => {
      render(
        <NodeDetailPanel
          node={{ ...podWithBoth, alerts: sample.alerts ?? [] }}
          onClose={jest.fn()}
          onAlertTimeClick={jest.fn()}
          urls={{
            loading: false,
            applicationUrl: undefined,
            urlByContainer: undefined,
            applicationError: 'app lookup failed',
            containersError: 'image lookup failed',
          }}
        />
      );
      // Both lookup errors show in their own sections…
      expect(screen.getByTestId('application-table-error')).toHaveTextContent('app lookup failed');
      expect(screen.getByTestId('container-table-error')).toHaveTextContent('image lookup failed');
      // …while the header and the alert table stay untouched.
      expect(screen.getByText('mongo-0')).toBeInTheDocument();
      expect(screen.getByText('HighMemory')).toBeInTheDocument();
    });

    it('passes the lookup state down: resolved URLs land on the section buttons', () => {
      render(
        <NodeDetailPanel
          node={podWithBoth}
          onClose={jest.fn()}
          onAlertTimeClick={jest.fn()}
          urls={{
            loading: false,
            applicationUrl: 'https://argo/app/checkout',
            urlByContainer: { app: 'https://x/app' },
            applicationError: undefined,
            containersError: undefined,
          }}
        />
      );
      expect(screen.getByTestId('application-url-button')).toHaveAttribute('href', 'https://argo/app/checkout');
      expect(screen.getByTestId('container-url-button')).toHaveAttribute('href', 'https://x/app');
    });

    it('renders disabled buttons when urls is omitted (idle: left-click / endpoint unset)', () => {
      render(<NodeDetailPanel node={podWithBoth} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />);
      expect(screen.getByTestId('application-url-button')).not.toHaveAttribute('href');
      expect(screen.getByTestId('container-url-button')).not.toHaveAttribute('href');
    });
  });
});
