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
        kind: 'Pod',
        namespace: 'default',
        labels: { app: 'web', version: '1.2.3' },
      },
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.getByText('My Pod')).toBeInTheDocument();
    expect(screen.getByText('Pod')).toBeInTheDocument();
    expect(screen.getByText('default')).toBeInTheDocument();
    expect(screen.getByText('web')).toBeInTheDocument();
    expect(screen.getByText('1.2.3')).toBeInTheDocument();
  });

  it('shows edge metadata when hovering an edge', () => {
    useHoverElement.mockReturnValue({
      id: 'e1',
      group: 'edges',
      data: { id: 'e1', source: 'a', target: 'b', edgeType: 'serviceSelector', weight: 5 },
      sourceLabel: 'A',
      targetLabel: 'B',
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.getByText('A → B')).toBeInTheDocument();
    expect(screen.getByText('serviceSelector')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('omits missing optional fields', () => {
    useHoverElement.mockReturnValue({
      id: 'pod-2',
      group: 'nodes',
      data: { id: 'pod-2', label: 'Minimal', kind: 'Pod' },
    });
    render(<HoverTooltip cyRef={cyRefStub} />);
    expect(screen.queryByText('namespace:')).not.toBeInTheDocument();
    expect(screen.queryByText('app:')).not.toBeInTheDocument();
  });
});
