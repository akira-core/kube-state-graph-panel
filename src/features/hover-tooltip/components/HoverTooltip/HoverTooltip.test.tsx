import { render, screen } from '@testing-library/react';
import type cytoscape from 'cytoscape';
import React from 'react';

import type { HoveredElement } from '../../hooks/useHoverElement';

jest.mock('../../hooks/useHoverElement', () => ({
  useHoverElement: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- test needs typed mock handle
const { useHoverElement } = require('../../hooks/useHoverElement') as {
  useHoverElement: jest.Mock<HoveredElement | null, [unknown]>;
};

import { HoverTooltip } from './HoverTooltip';

const cyRefStub = { current: null as cytoscape.Core | null };

describe('HoverTooltip', () => {
  beforeEach(() => {
    useHoverElement.mockReset();
  });

  it('renders nothing when no element is hovered', () => {
    useHoverElement.mockReturnValue(null);
    const { container } = render(<HoverTooltip cyRef={cyRefStub} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows node metadata when hovering a node', () => {
    useHoverElement.mockReturnValue({
      id: 'pod-1',
      group: 'nodes',
      data: {
        id: 'pod-1',
        label: 'My Pod',
        kind: 'pod',
        namespace: 'default',
        ipAddress: ['10.244.0.10'],
        labels: { app: 'web', version: '1.2.3' },
      },
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.getByText('My Pod')).toBeInTheDocument();
    expect(screen.getByText('pod')).toBeInTheDocument();
    expect(screen.getByText('default')).toBeInTheDocument();
    expect(screen.getByText('10.244.0.10')).toBeInTheDocument();
    expect(screen.getByText('web')).toBeInTheDocument();
    expect(screen.getByText('1.2.3')).toBeInTheDocument();
  });

  it('joins multiple ip addresses with a comma', () => {
    useHoverElement.mockReturnValue({
      id: 'node-1',
      group: 'nodes',
      data: { id: 'node-1', label: 'worker', kind: 'node', ipAddress: ['10.0.0.1', '10.0.0.2'] },
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.getByText('10.0.0.1, 10.0.0.2')).toBeInTheDocument();
  });

  it('shows edge metadata when hovering an edge', () => {
    useHoverElement.mockReturnValue({
      id: 'e1',
      group: 'edges',
      data: { id: 'e1', source: 'a', target: 'b', edgeType: 'service-selects-pod' },
      sourceLabel: 'A',
      targetLabel: 'B',
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.getByText('A → B')).toBeInTheDocument();
    expect(screen.getByText('service-selects-pod')).toBeInTheDocument();
  });

  it('omits missing optional fields', () => {
    useHoverElement.mockReturnValue({
      id: 'pod-2',
      group: 'nodes',
      data: { id: 'pod-2', label: 'Minimal', kind: 'pod' },
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.queryByText('namespace:')).not.toBeInTheDocument();
    expect(screen.queryByText('app:')).not.toBeInTheDocument();
    expect(screen.queryByText('ipAddress:')).not.toBeInTheDocument();
  });

  it('omits ipAddress for an explicit empty array', () => {
    useHoverElement.mockReturnValue({
      id: 'pod-3',
      group: 'nodes',
      data: { id: 'pod-3', label: 'No IP', kind: 'pod', ipAddress: [] },
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.queryByText('ipAddress:')).not.toBeInTheDocument();
  });

  it('renders edge labels for a service-selects-pod edge', () => {
    useHoverElement.mockReturnValue({
      id: 'e2',
      group: 'edges',
      data: { id: 'e2', source: 'svc', target: 'pod', edgeType: 'service-selects-pod', labels: { namespace: 'shop' } },
      sourceLabel: 'payments',
      targetLabel: 'payments-0',
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.getByText('service-selects-pod')).toBeInTheDocument();
    expect(screen.getByText('namespace:')).toBeInTheDocument();
    expect(screen.getByText('shop')).toBeInTheDocument();
  });

  it('shows the cluster label for a hovered node', () => {
    useHoverElement.mockReturnValue({
      id: 'pod-9',
      group: 'nodes',
      data: { id: 'pod-9', label: 'web', kind: 'pod', labels: { cluster: 'demo' } },
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.getByText('cluster:')).toBeInTheDocument();
    expect(screen.getByText('demo')).toBeInTheDocument();
  });

  it('shows any backend label without a whitelist (e.g. node, zone)', () => {
    useHoverElement.mockReturnValue({
      id: 'pod-7',
      group: 'nodes',
      data: {
        id: 'pod-7',
        label: 'mongodb-0',
        kind: 'pod',
        labels: { cluster: 'prod', node: 'prod/prod-1' },
      },
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    // `node` was never whitelisted; it must now appear since the panel shows all.
    expect(screen.getByText('node:')).toBeInTheDocument();
    expect(screen.getByText('prod/prod-1')).toBeInTheDocument();
  });

  it('renders a "labels" divider only when labels are present', () => {
    useHoverElement.mockReturnValue({
      id: 'pod-8',
      group: 'nodes',
      data: { id: 'pod-8', label: 'web', kind: 'pod', labels: { cluster: 'prod' } },
    });
    const { rerender } = render(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.getByTestId('hover-tooltip-labels-divider')).toBeInTheDocument();

    useHoverElement.mockReturnValue({
      id: 'pod-bare',
      group: 'nodes',
      data: { id: 'pod-bare', label: 'bare', kind: 'others' },
    });
    rerender(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.queryByTestId('hover-tooltip-labels-divider')).not.toBeInTheDocument();
  });

  it('does not duplicate namespace in the labels block', () => {
    useHoverElement.mockReturnValue({
      id: 'pod-ns',
      group: 'nodes',
      data: {
        id: 'pod-ns',
        label: 'gateway',
        kind: 'pod',
        namespace: 'apps',
        labels: { cluster: 'prod', namespace: 'apps', node: 'prod/prod-1' },
      },
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    // namespace is promoted to the attributes block, so it appears exactly once.
    expect(screen.getAllByText('namespace:')).toHaveLength(1);
    expect(screen.getByText('apps')).toBeInTheDocument();
  });

  it('renders the cluster label for a pod-calls-pod edge', () => {
    useHoverElement.mockReturnValue({
      id: 'e3',
      group: 'edges',
      data: { id: 'e3', source: 'a', target: 'b', edgeType: 'pod-calls-pod', labels: { cluster: 'cluster-alpha' } },
      sourceLabel: 'checkout',
      targetLabel: 'payments',
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.getByText('pod-calls-pod')).toBeInTheDocument();
    expect(screen.getByText('cluster:')).toBeInTheDocument();
    expect(screen.getByText('cluster-alpha')).toBeInTheDocument();
  });
});
