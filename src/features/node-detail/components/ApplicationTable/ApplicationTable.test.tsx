import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import type { ChangeReportState } from '../../hooks/useNodeDetailUrls';

import { ApplicationTable } from './ApplicationTable';

const idle: ChangeReportState = { status: 'idle' };

describe('ApplicationTable (lazy Change Report)', () => {
  it('renders a headered table (Name / Change Report) with the application name and a clickable button', () => {
    render(<ApplicationTable application="checkout" state={idle} enabled onOpen={jest.fn()} />);
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Change Report' })).toBeInTheDocument();
    expect(screen.getByText('checkout')).toBeInTheDocument();
    const button = screen.getByTestId('application-url-button');
    expect(button).toBeEnabled();
    // Idle: no error, no loading, no pre-resolved href (lazy — fetch on click).
    expect(button).not.toHaveAttribute('href');
    expect(screen.queryByTestId('application-url-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('application-url-pending')).not.toBeInTheDocument();
  });

  it('fires onOpen when the button is clicked', () => {
    const onOpen = jest.fn();
    render(<ApplicationTable application="checkout" state={idle} enabled onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId('application-url-button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('disables the button when no endpoint is configured (enabled=false)', () => {
    render(<ApplicationTable application="checkout" state={idle} enabled={false} onOpen={jest.fn()} />);
    expect(screen.getByTestId('application-url-button')).toBeDisabled();
  });

  it('shows a pending hint and disables the button while the lookup is in flight', () => {
    render(<ApplicationTable application="checkout" state={{ status: 'loading' }} enabled onOpen={jest.fn()} />);
    expect(screen.getByTestId('application-url-pending')).toHaveTextContent('Looking up…');
    expect(screen.getByTestId('application-url-button')).toBeDisabled();
  });

  it('shows the failure message beside the still-clickable button (retryable)', () => {
    const onOpen = jest.fn();
    render(
      <ApplicationTable
        application="checkout"
        state={{ status: 'error', error: 'Not Found' }}
        enabled
        onOpen={onOpen}
      />
    );
    const error = screen.getByTestId('application-url-error');
    expect(error).toHaveTextContent('Not Found');
    expect(error).toHaveAttribute('title', 'Not Found');
    // The button is NOT removed — it stays live so the user can retry.
    const button = screen.getByTestId('application-url-button');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
    // The hint renders BEFORE the button so the button stays pinned to the column's
    // right edge (flex-end) — keeping it aligned with the Containers section.
    expect(error.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
