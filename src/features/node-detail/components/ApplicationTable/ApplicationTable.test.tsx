import { render, screen, within } from '@testing-library/react';
import React from 'react';

import { ApplicationTable } from './ApplicationTable';

// The single data row of the table (row 0 is the header row).
function dataRow(): HTMLElement {
  const rows = screen.getAllByRole('row');
  expect(rows).toHaveLength(2);
  return rows[1]!;
}

describe('ApplicationTable', () => {
  it('renders a headered table (Name / Change Report) with the name and button in their columns', () => {
    render(<ApplicationTable application="checkout" url={undefined} loading={false} error={undefined} />);
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Change Report' })).toBeInTheDocument();
    const cells = within(dataRow()).getAllByRole('cell');
    // Exact match: substring matching would let a layout that pollutes the
    // Application column with extra content pass.
    expect(cells[0]).toHaveTextContent(/^checkout$/);
    expect(within(cells[1]!).getByTestId('application-url-button')).toBeInTheDocument();
  });

  it('shows a pending hint to the right of the disabled button while the lookup is in flight', () => {
    render(<ApplicationTable application="checkout" url={undefined} loading={true} error={undefined} />);
    const cells = within(dataRow()).getAllByRole('cell');
    const pending = within(cells[1]!).getByTestId('application-url-pending');
    expect(pending).toHaveTextContent('Looking up…');
    expect(within(cells[1]!).getByTestId('application-url-button')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('checkout')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
  });

  it('binds the button to the resolved URL and shows the URL to its right, without auto-navigation', () => {
    const openSpy = jest.spyOn(window, 'open');
    render(
      <ApplicationTable application="checkout" url="https://argo/app/checkout" loading={false} error={undefined} />
    );
    const button = screen.getByTestId('application-url-button');
    expect(button).toHaveAttribute('href', 'https://argo/app/checkout');
    expect(button).toHaveAttribute('target', '_blank');
    expect(button).toHaveAttribute('rel', 'noopener');
    const cells = within(dataRow()).getAllByRole('cell');
    const result = within(cells[1]!).getByTestId('application-url-result');
    expect(result).toHaveTextContent('https://argo/app/checkout');
    expect(result).toHaveAttribute('title', 'https://argo/app/checkout');
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('disables the button with an empty result slot when no URL is known (idle)', () => {
    render(<ApplicationTable application="checkout" url={undefined} loading={false} error={undefined} />);
    const button = screen.getByTestId('application-url-button');
    expect(button).not.toHaveAttribute('href');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByTestId('application-url-pending')).not.toBeInTheDocument();
    expect(screen.queryByTestId('application-url-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('application-url-result')).not.toBeInTheDocument();
  });

  it('shows only the error hint (no button) in the Change Report cell when the lookup failed', () => {
    render(<ApplicationTable application="checkout" url={undefined} loading={false} error="boom" />);
    const cells = within(dataRow()).getAllByRole('cell');
    const error = within(cells[1]!).getByTestId('application-url-error');
    expect(error).toHaveTextContent('boom');
    expect(error).toHaveAttribute('title', 'boom');
    expect(screen.queryByTestId('application-url-button')).not.toBeInTheDocument();
    expect(screen.getByText('checkout')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
  });
});
