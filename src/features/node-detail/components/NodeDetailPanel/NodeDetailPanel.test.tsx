import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { NodeDetailPanel } from './NodeDetailPanel';
import type { NodeDetailData } from './NodeDetailPanel.types';

const sample: NodeDetailData = { id: 'p1', label: 'mongo-0', kind: 'pod', status: 'critical' };

describe('NodeDetailPanel', () => {
  it('renders nothing when node is null', () => {
    render(<NodeDetailPanel node={null} onClose={jest.fn()} />);
    expect(screen.queryByTestId('node-detail-panel')).not.toBeInTheDocument();
  });

  it('renders title, kind/status badges and both empty sections', () => {
    render(<NodeDetailPanel node={sample} onClose={jest.fn()} />);
    expect(screen.getByTestId('node-detail-panel')).toBeInTheDocument();
    expect(screen.getByText('mongo-0')).toBeInTheDocument();
    expect(screen.getByTestId('node-detail-kind')).toHaveTextContent('pod');
    expect(screen.getByTestId('node-detail-status')).toHaveTextContent('critical');
    expect(screen.getByText('Alert Name')).toBeInTheDocument();
    expect(screen.getByText('Alert Content')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = jest.fn();
    render(<NodeDetailPanel node={sample} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close detail panel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
