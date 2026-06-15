import { render, screen, within } from '@testing-library/react';
import React from 'react';

import type { DetailLookup } from '../../hooks/useNodeDetailUrls';

import { ContainerTable } from './ContainerTable';

const containers = [
  { name: 'app', image: 'repo/app:1.2' },
  { name: 'sidecar', image: 'repo/sc:0.9' },
];

// The table's data rows (row 0 is the header row).
function dataRows(): HTMLElement[] {
  return screen.getAllByRole('row').slice(1);
}

describe('ContainerTable (eager-prefetch Change Report)', () => {
  it('renders a headered table (Name / Image / Change Report); a ready container links, a missing one is unavailable', () => {
    const byName: Record<string, DetailLookup> = { app: { status: 'ready', url: 'https://x/app' } };
    render(<ContainerTable containers={containers} lookups={{ phase: 'settled', byName }} />);

    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Image' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Change Report' })).toBeInTheDocument();

    const rows = dataRows();
    expect(rows).toHaveLength(2);

    // Exact matches: substring matching would let a layout that pollutes the Name
    // column with the image (or vice versa) pass.
    const first = within(rows[0]!).getAllByRole('cell');
    expect(first[0]).toHaveTextContent(/^app$/);
    expect(first[1]).toHaveTextContent(/^repo\/app:1\.2$/);

    // app row (present in byName) → a real anchor with the resolved URL.
    const appLink = within(rows[0]!).getByTestId('container-url-link');
    expect(appLink.getAttribute('href')).toBe('https://x/app');
    expect(appLink.getAttribute('target')).toBe('_blank');
    expect(appLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(within(rows[0]!).queryByTestId('container-url-unavailable')).not.toBeInTheDocument();

    // sidecar row (absent from byName) → muted "No change report" hint, no link.
    expect(within(rows[1]!).getByTestId('container-url-unavailable')).toHaveTextContent('No change report');
    expect(within(rows[1]!).queryByTestId('container-url-link')).not.toBeInTheDocument();

    // settled, so nothing is still loading anywhere.
    expect(screen.queryByTestId('container-url-pending')).not.toBeInTheDocument();
  });

  it('marks every row unavailable when the settled map is empty (no links, no spinners)', () => {
    render(<ContainerTable containers={containers} lookups={{ phase: 'settled', byName: {} }} />);

    const rows = dataRows();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(within(row).getByTestId('container-url-unavailable')).toHaveTextContent('No change report');
      expect(within(row).queryByTestId('container-url-link')).not.toBeInTheDocument();
      expect(within(row).queryByTestId('container-url-pending')).not.toBeInTheDocument();
    }
  });

  it('shows a spinner on every row while the map is loading (no links, no unavailable hints)', () => {
    render(<ContainerTable containers={containers} lookups={{ phase: 'loading', byName: {} }} />);

    const rows = dataRows();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(within(row).getByTestId('container-url-pending')).toHaveTextContent('Looking up…');
      expect(within(row).queryByTestId('container-url-link')).not.toBeInTheDocument();
      expect(within(row).queryByTestId('container-url-unavailable')).not.toBeInTheDocument();
    }
  });

  it('resolves each row independently: a ready container links while a missing one stays unavailable', () => {
    const byName: Record<string, DetailLookup> = { app: { status: 'ready', url: 'https://x/app' } };
    render(<ContainerTable containers={containers} lookups={{ phase: 'settled', byName }} />);

    const rows = dataRows();
    // Row 0 (app): a real anchor with the resolved URL — never clicked (jsdom does
    // not navigate); the attributes are the contract.
    const appLink = within(rows[0]!).getByTestId('container-url-link');
    expect(appLink.getAttribute('href')).toBe('https://x/app');
    expect(within(rows[0]!).queryByTestId('container-url-unavailable')).not.toBeInTheDocument();
    expect(within(rows[0]!).queryByTestId('container-url-pending')).not.toBeInTheDocument();

    // Row 1 (sidecar): absent from byName → the muted "No change report" hint, no link.
    expect(within(rows[1]!).getByTestId('container-url-unavailable')).toHaveTextContent('No change report');
    expect(within(rows[1]!).queryByTestId('container-url-link')).not.toBeInTheDocument();
    expect(within(rows[1]!).queryByTestId('container-url-pending')).not.toBeInTheDocument();
  });
});
