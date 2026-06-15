import { render, screen } from '@testing-library/react';
import React from 'react';

import type { DetailLookup } from '../../hooks/useNodeDetailUrls';

import { ApplicationTable } from './ApplicationTable';

describe('ApplicationTable (eager-prefetch Change Report)', () => {
  it('renders a headered table (Name / Change Report) with the application name', () => {
    const state: DetailLookup = { status: 'ready', url: 'https://x' };
    render(<ApplicationTable application="checkout" state={state} />);
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Change Report' })).toBeInTheDocument();
    expect(screen.getByText('checkout')).toBeInTheDocument();
  });

  it('renders a real anchor (href / target / rel) on a ready URL — never a button', () => {
    const state: DetailLookup = { status: 'ready', url: 'https://x' };
    render(<ApplicationTable application="checkout" state={state} />);
    // Assert anchor ATTRIBUTES — do NOT click it (jsdom does not navigate).
    const link = screen.getByTestId('application-url-link');
    expect(link).toHaveAttribute('href', 'https://x');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // Exactly one of the three states renders — no pending, no unavailable.
    expect(screen.queryByTestId('application-url-pending')).not.toBeInTheDocument();
    expect(screen.queryByTestId('application-url-unavailable')).not.toBeInTheDocument();
  });

  it('shows the muted "No change report" hint when unavailable (no link)', () => {
    const state: DetailLookup = { status: 'unavailable' };
    render(<ApplicationTable application="checkout" state={state} />);
    const unavailable = screen.getByTestId('application-url-unavailable');
    expect(unavailable).toHaveTextContent('No change report');
    expect(screen.queryByTestId('application-url-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('application-url-pending')).not.toBeInTheDocument();
  });

  it('shows a spinner hint while the lookup is in flight (no link, no unavailable)', () => {
    const state: DetailLookup = { status: 'loading' };
    render(<ApplicationTable application="checkout" state={state} />);
    expect(screen.getByTestId('application-url-pending')).toHaveTextContent('Looking up…');
    expect(screen.queryByTestId('application-url-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('application-url-unavailable')).not.toBeInTheDocument();
  });

  it('carries the full error message in title on an unavailable lookup (no link)', () => {
    const state: DetailLookup = { status: 'unavailable', error: 'Not Found' };
    render(<ApplicationTable application="checkout" state={state} />);
    const unavailable = screen.getByTestId('application-url-unavailable');
    expect(unavailable).toHaveAttribute('title', 'Not Found');
    expect(screen.queryByTestId('application-url-link')).not.toBeInTheDocument();
  });
});
