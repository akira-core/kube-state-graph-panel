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
  // jsdom does no layout (offsetWidth/Height === 0), which would make the
  // width/height-dependent flip + clamp math vacuous. Stub a realistic box size
  // (280×80) so the positioning assertions actually exercise the w/h terms.
  let owSpy: jest.SpyInstance;
  let ohSpy: jest.SpyInstance;
  beforeEach(() => {
    useHoverElement.mockReset();
    owSpy = jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(280);
    ohSpy = jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(80);
  });
  afterEach(() => {
    owSpy.mockRestore();
    ohSpy.mockRestore();
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

  it('shows a storageclass leaf via the normal node path (own kind + provisioner, no synthesized PVC list)', () => {
    useHoverElement.mockReturnValue({
      id: 'prod/storageclass/fast-ssd',
      group: 'nodes',
      data: {
        id: 'prod/storageclass/fast-ssd',
        label: 'fast-ssd',
        kind: 'storageclass',
        provisioner: 'rook-ceph.rbd.csi.ceph.com',
        labels: { cluster: 'prod' },
      },
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.getByText('fast-ssd')).toBeInTheDocument(); // title (name)
    expect(screen.getByText('storageclass')).toBeInTheDocument(); // its own kind
    expect(screen.getByText('provisioner:')).toBeInTheDocument(); // MAY surface provisioner
    expect(screen.getByText('rook-ceph.rbd.csi.ceph.com')).toBeInTheDocument();
    // No synthesized "PVCs (N)" list (that path was removed when storageclass became a leaf).
    expect(screen.queryByText(/^PVCs/)).toBeNull();
  });

  it('promotes a storageclass leaf backing-storage parameters (D6) as rows', () => {
    useHoverElement.mockReturnValue({
      id: 'prod/storageclass/fast-ssd',
      group: 'nodes',
      data: {
        id: 'prod/storageclass/fast-ssd',
        label: 'fast-ssd',
        kind: 'storageclass',
        provisioner: 'rook-ceph.rbd.csi.ceph.com',
        parameters: { pool: 'kube', selector: 'tier=fast' },
        labels: { cluster: 'prod' },
      },
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.getByText('provisioner:')).toBeInTheDocument();
    expect(screen.getByText('pool:')).toBeInTheDocument();
    expect(screen.getByText('kube')).toBeInTheDocument();
    expect(screen.getByText('selector:')).toBeInTheDocument();
    expect(screen.getByText('tier=fast')).toBeInTheDocument();
  });

  it('shows a synthetic kind for a kind-less application group (so hover is not just the bare name)', () => {
    useHoverElement.mockReturnValue({
      id: 'prod/app/mongodb',
      group: 'nodes',
      data: { id: 'prod/app/mongodb', label: 'mongodb', isApplication: true, applicationColor: '#0ea5e9', labels: {} },
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.getByText('mongodb')).toBeInTheDocument(); // title (name)
    expect(screen.getByText('kind:')).toBeInTheDocument();
    expect(screen.getByText('application')).toBeInTheDocument();
  });

  it('promotes the ArgoCD application of a hovered service leaf (backend D6)', () => {
    useHoverElement.mockReturnValue({
      id: 'service/mongo-svc',
      group: 'nodes',
      data: { id: 'service/mongo-svc', label: 'mongo-svc', kind: 'service', application: 'mongodb', labels: { namespace: 'prod' } },
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.getByText('application:')).toBeInTheDocument();
    expect(screen.getByText('mongodb')).toBeInTheDocument();
  });

  it('promotes the ArgoCD application of a hovered pod too', () => {
    useHoverElement.mockReturnValue({
      id: 'pod/mongo-0',
      group: 'nodes',
      data: { id: 'pod/mongo-0', label: 'mongo-0', kind: 'pod', application: 'mongodb' },
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.getByText('application:')).toBeInTheDocument();
  });

  it('does NOT add a redundant application row for the decorative application group node', () => {
    useHoverElement.mockReturnValue({
      id: 'prod/app/mongodb',
      group: 'nodes',
      data: { id: 'prod/app/mongodb', label: 'mongodb', isApplication: true, application: 'mongodb', applicationColor: '#0ea5e9', labels: {} },
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    // kind: application (synthetic) shows, but no separate "application:" key row.
    expect(screen.getByText('application')).toBeInTheDocument();
    expect(screen.queryByText('application:')).not.toBeInTheDocument();
  });

  it('shows a synthetic kind for a kind-less namespace group', () => {
    useHoverElement.mockReturnValue({
      id: 'prod/ns/shop',
      group: 'nodes',
      data: { id: 'prod/ns/shop', label: 'shop', isNamespace: true, namespaceColor: '#e8833a', labels: {} },
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.getByText('namespace')).toBeInTheDocument();
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
      data: { id: 'pod-bare', label: 'bare', kind: 'external' },
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

  it('positions the tooltip beside the hovered element (anchor + offset), not in a corner', () => {
    useHoverElement.mockReturnValue({
      id: 'pod-1',
      group: 'nodes',
      data: { id: 'pod-1', label: 'web', kind: 'pod' },
      position: { x: 100, y: 50 },
      viewport: { width: 800, height: 600 },
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    // box 280×80 fits with room: left=100+14=114, top=50+14=64 (no flip).
    expect(screen.getByTestId('hover-tooltip')).toHaveStyle({ left: '114px', top: '64px' });
  });

  it('flips to the left/top of the anchor when it would overflow the right/bottom edge', () => {
    useHoverElement.mockReturnValue({
      id: 'pod-edge',
      group: 'nodes',
      data: { id: 'pod-edge', label: 'edge', kind: 'pod' },
      position: { x: 798, y: 598 },
      viewport: { width: 800, height: 600 },
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    // w=280: 798+14+280 > 796 → flip left = 798-14-280 = 504 (clamped within [4,516]).
    // h=80:  598+14+80  > 596 → flip top  = 598-14-80  = 504 (clamped within [4,516]).
    expect(screen.getByTestId('hover-tooltip')).toHaveStyle({ left: '504px', top: '504px' });
  });

  it('pins to the EDGE_MARGIN corner when the box is larger than the viewport', () => {
    useHoverElement.mockReturnValue({
      id: 'pod-big',
      group: 'nodes',
      data: { id: 'pod-big', label: 'big', kind: 'pod' },
      position: { x: 100, y: 60 },
      viewport: { width: 200, height: 120 }, // narrower/shorter than the 280×80 box
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    // w(280)>vw(200) and h(80)<vh — both clamps floor to EDGE_MARGIN(4) without going negative.
    const tip = screen.getByTestId('hover-tooltip');
    expect(tip).toHaveStyle({ left: '4px' });
    // box is also capped to the viewport so it scrolls instead of overflowing.
    expect(tip).toHaveStyle({ maxWidth: '192px', maxHeight: '112px' });
  });

  it('falls back to a safe corner when no rendered position is available', () => {
    useHoverElement.mockReturnValue({
      id: 'pod-nopos',
      group: 'nodes',
      data: { id: 'pod-nopos', label: 'web', kind: 'pod' },
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.getByTestId('hover-tooltip')).toHaveStyle({ left: '4px', top: '4px' });
  });
});

describe('HoverTooltip pinned mode (left-click selection)', () => {
  beforeEach(() => {
    useHoverElement.mockReset();
  });

  it('docks a persistent, scrollable card at the canvas top-right', () => {
    useHoverElement.mockReturnValue(null);
    render(
      <HoverTooltip cyRef={cyRefStub} pinned={{ label: 'web', attributes: [{ key: 'kind', value: 'pod' }] }} />
    );
    const tip = screen.getByTestId('hover-tooltip');
    expect(tip).toHaveAttribute('data-pinned', 'true');
    // top-right, not anchored: left auto + right/top 8, pointer-events auto so it scrolls,
    // and z-index 1000 to clear cytoscape's expand-collapse input canvas (z999).
    expect(tip).toHaveStyle({ left: 'auto', right: '8px', top: '8px', pointerEvents: 'auto', zIndex: 1000 });
  });

  it('renders even when nothing is hovered (useHoverElement returns null)', () => {
    useHoverElement.mockReturnValue(null);
    render(
      <HoverTooltip cyRef={cyRefStub} pinned={{ label: 'mongo-0', attributes: [{ key: 'kind', value: 'pod' }] }} />
    );
    expect(screen.getByText('mongo-0')).toBeInTheDocument();
    expect(screen.getByText('pod')).toBeInTheDocument();
  });

  it('shows the selected node title + promoted attrs (incl kind) + filtered labels', () => {
    useHoverElement.mockReturnValue(null);
    render(
      <HoverTooltip
        cyRef={cyRefStub}
        pinned={{
          label: 'gateway',
          attributes: [
            { key: 'kind', value: 'pod' },
            { key: 'namespace', value: 'apps' },
          ],
          labels: { cluster: 'prod', namespace: 'apps', node: 'prod/prod-1' },
        }}
      />
    );
    expect(screen.getByText('gateway')).toBeInTheDocument(); // title
    expect(screen.getByText('kind:')).toBeInTheDocument(); // pinned shows kind (unlike the old Properties section)
    expect(screen.getByText('pod')).toBeInTheDocument();
    expect(screen.getByText('cluster:')).toBeInTheDocument();
    expect(screen.getByText('node:')).toBeInTheDocument();
    // namespace is a promoted attr → appears exactly once (filtered out of the labels block).
    expect(screen.getAllByText('namespace:')).toHaveLength(1);
  });

  it('suppresses the floating hover tooltip while pinned', () => {
    useHoverElement.mockReturnValue({
      id: 'other',
      group: 'nodes',
      data: { id: 'other', label: 'HoveredNode', kind: 'service' },
    });
    render(
      <HoverTooltip cyRef={cyRefStub} pinned={{ label: 'PinnedNode', attributes: [{ key: 'kind', value: 'pod' }] }} />
    );
    // only the pinned node shows; the hovered element's content is absent.
    expect(screen.getByText('PinnedNode')).toBeInTheDocument();
    expect(screen.queryByText('HoveredNode')).not.toBeInTheDocument();
    expect(screen.getByTestId('hover-tooltip')).toHaveAttribute('data-pinned', 'true');
  });

  it('falls back to floating hover when pinned is null', () => {
    useHoverElement.mockReturnValue({
      id: 'pod-1',
      group: 'nodes',
      data: { id: 'pod-1', label: 'web', kind: 'pod' },
    });
    render(<HoverTooltip cyRef={cyRefStub} pinned={null} />);
    const tip = screen.getByTestId('hover-tooltip');
    expect(tip).not.toHaveAttribute('data-pinned');
    expect(screen.getByText('web')).toBeInTheDocument();
  });
});
