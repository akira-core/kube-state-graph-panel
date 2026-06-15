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

    it('renders both sections for a pod carrying application and containers (valid lookups)', () => {
      render(
        <NodeDetailPanel
          node={podWithBoth}
          onClose={jest.fn()}
          onAlertTimeClick={jest.fn()}
          view="detail"
          lookups={{
            enabled: true,
            application: { status: 'ready', url: 'https://app.example/checkout' },
            containers: { phase: 'settled', byName: { app: { status: 'ready', url: 'https://img.example/app' } } },
          }}
        />
      );
      expect(screen.getByTestId('node-detail-section-application')).toBeInTheDocument();
      expect(screen.getByTestId('node-detail-section-containers')).toBeInTheDocument();
      expect(screen.getByText('checkout')).toBeInTheDocument();
      expect(screen.getByText('app')).toBeInTheDocument();
      expect(screen.getByText('repo/app:1.2')).toBeInTheDocument();
    });

    it('renders both sections for a controller kind (statefulset)', () => {
      render(
        <NodeDetailPanel
          node={{ ...podWithBoth, kind: 'statefulset' }}
          onClose={jest.fn()}
          onAlertTimeClick={jest.fn()}
          view="detail"
        />
      );
      expect(screen.getByTestId('node-detail-section-application')).toBeInTheDocument();
      expect(screen.getByTestId('node-detail-section-containers')).toBeInTheDocument();
    });

    it('never renders the sections for a non pod/controller kind, even with stray data', () => {
      render(
        <NodeDetailPanel
          node={{ ...podWithBoth, kind: 'service' }}
          onClose={jest.fn()}
          onAlertTimeClick={jest.fn()}
          view="detail"
        />
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
      render(<NodeDetailPanel node={noApp} onClose={jest.fn()} onAlertTimeClick={jest.fn()} view="detail" />);
      expect(screen.queryByTestId('node-detail-section-application')).not.toBeInTheDocument();
      expect(screen.getByTestId('node-detail-section-containers')).toBeInTheDocument();
    });

    it('hides only the Containers section when containers are absent or empty', () => {
      const noContainers: NodeDetailData = { id: 'p1', label: 'mongo-0', kind: 'pod', application: 'checkout' };
      const { rerender } = render(
        <NodeDetailPanel node={noContainers} onClose={jest.fn()} onAlertTimeClick={jest.fn()} view="detail" />
      );
      expect(screen.getByTestId('node-detail-section-application')).toBeInTheDocument();
      expect(screen.queryByTestId('node-detail-section-containers')).not.toBeInTheDocument();
      rerender(
        <NodeDetailPanel
          node={{ ...podWithBoth, containers: [] }}
          onClose={jest.fn()}
          onAlertTimeClick={jest.fn()}
          view="detail"
        />
      );
      expect(screen.queryByTestId('node-detail-section-containers')).not.toBeInTheDocument();
    });

    it('keeps the header intact and hides the Alerts table in the detail view (failure isolation)', () => {
      render(
        <NodeDetailPanel
          node={{ ...podWithBoth, alerts: sample.alerts ?? [] }}
          onClose={jest.fn()}
          onAlertTimeClick={jest.fn()}
          view="detail"
          lookups={{
            enabled: true,
            application: { status: 'unavailable', error: 'app lookup failed' },
            containers: { phase: 'settled', byName: {} },
          }}
        />
      );
      // Each section independently renders the muted "No change report" hint beside
      // its own Change Report column — the application failure does not suppress the
      // containers section, and vice versa.
      expect(screen.getByTestId('application-url-unavailable')).toBeInTheDocument();
      expect(screen.getByTestId('container-url-unavailable')).toBeInTheDocument();
      // The full error message is recoverable via the hint's title attribute.
      expect(screen.getByTestId('application-url-unavailable')).toHaveAttribute('title', 'app lookup failed');
      // …while the header stays untouched and the Alerts table (left-click view
      // content) is not rendered in the detail view, even though alerts exist.
      expect(screen.getByText('mongo-0')).toBeInTheDocument();
      expect(screen.queryByTestId('node-detail-section-alerts')).not.toBeInTheDocument();
    });

    it('threads resolved lookup state down: sections render real anchors with the prefetched URLs', () => {
      render(
        <NodeDetailPanel
          node={podWithBoth}
          onClose={jest.fn()}
          onAlertTimeClick={jest.fn()}
          view="detail"
          lookups={{
            enabled: true,
            application: { status: 'ready', url: 'u1' },
            containers: { phase: 'settled', byName: { app: { status: 'ready', url: 'u2' } } },
          }}
        />
      );
      // The Change Report cells render plain <a href> anchors (eager prefetch — no
      // window.open, no click trigger). Assert their attributes; never .click() them
      // (jsdom does not navigate, and clicking would only log noise).
      const appLink = screen.getByTestId('application-url-link');
      expect(appLink).toHaveAttribute('href', 'u1');
      expect(appLink).toHaveAttribute('target', '_blank');
      expect(appLink).toHaveAttribute('rel', 'noopener noreferrer');

      const containerLink = screen.getByTestId('container-url-link');
      expect(containerLink).toHaveAttribute('href', 'u2');
      expect(containerLink).toHaveAttribute('target', '_blank');
      expect(containerLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('shows the muted "No change report" hint and no links when lookups is omitted (idle default)', () => {
      render(<NodeDetailPanel node={podWithBoth} onClose={jest.fn()} onAlertTimeClick={jest.fn()} view="detail" />);
      expect(screen.getByTestId('application-url-unavailable')).toBeInTheDocument();
      expect(screen.getByTestId('container-url-unavailable')).toBeInTheDocument();
      expect(screen.queryByTestId('application-url-link')).not.toBeInTheDocument();
      expect(screen.queryByTestId('container-url-link')).not.toBeInTheDocument();
    });
  });
});
