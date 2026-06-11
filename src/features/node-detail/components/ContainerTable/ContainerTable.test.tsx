import { render, screen, within } from '@testing-library/react';
import React from 'react';

import { ContainerTable } from './ContainerTable';

const containers = [
  { name: 'app', image: 'repo/app:1.2' },
  { name: 'sidecar', image: 'repo/sc:0.9' },
];

// The table's data rows (row 0 is the header row).
function dataRows(): HTMLElement[] {
  return screen.getAllByRole('row').slice(1);
}

describe('ContainerTable', () => {
  it('renders a headered table (Name / Image / Change Report) with one row per container, content in its column', () => {
    render(<ContainerTable containers={containers} urlByContainer={undefined} loading={false} error={undefined} />);
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
    expect(within(first[2]!).getByTestId('container-url-button')).toBeInTheDocument();
    const second = within(rows[1]!).getAllByRole('cell');
    expect(second[0]).toHaveTextContent(/^sidecar$/);
    expect(second[1]).toHaveTextContent(/^repo\/sc:0\.9$/);
    expect(within(second[2]!).getByTestId('container-url-button')).toBeInTheDocument();
  });

  it('shows a per-row pending hint to the right of the disabled buttons while the lookup is in flight', () => {
    render(<ContainerTable containers={containers} urlByContainer={undefined} loading={true} error={undefined} />);
    const pendings = screen.getAllByTestId('container-url-pending');
    expect(pendings).toHaveLength(2);
    for (const p of pendings) {
      expect(p).toHaveTextContent('Looking up…');
    }
    expect(dataRows()).toHaveLength(2);
  });

  it('binds each row button to its mapped URL and shows the URL to its right, without auto-navigation', () => {
    const openSpy = jest.spyOn(window, 'open');
    render(
      <ContainerTable
        containers={containers}
        urlByContainer={{ app: 'https://x/app', sidecar: 'https://x/sc' }}
        loading={false}
        error={undefined}
      />
    );
    const buttons = screen.getAllByTestId('container-url-button');
    expect(buttons[0]).toHaveAttribute('href', 'https://x/app');
    expect(buttons[1]).toHaveAttribute('href', 'https://x/sc');
    for (const b of buttons) {
      expect(b).toHaveAttribute('target', '_blank');
      expect(b).toHaveAttribute('rel', 'noopener');
    }
    const results = screen.getAllByTestId('container-url-result');
    expect(results[0]).toHaveTextContent('https://x/app');
    expect(results[1]).toHaveTextContent('https://x/sc');
    expect(results[0]).toHaveAttribute('title', 'https://x/app');
    // Pre-resolved links only — the lookup result must never auto-open a tab.
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('disables only the row whose container name is missing from the map (empty result slot)', () => {
    render(
      <ContainerTable
        containers={containers}
        urlByContainer={{ app: 'https://x/app' }}
        loading={false}
        error={undefined}
      />
    );
    const buttons = screen.getAllByTestId('container-url-button');
    expect(buttons[0]).toHaveAttribute('href', 'https://x/app');
    expect(buttons[1]).not.toHaveAttribute('href');
    expect(buttons[1]).toHaveAttribute('aria-disabled', 'true');
    // The resolved row shows its URL; the missing-key row's slot stays empty.
    expect(screen.getAllByTestId('container-url-result')).toHaveLength(1);
    expect(screen.getByText('sidecar')).toBeInTheDocument();
    expect(screen.getByText('repo/sc:0.9')).toBeInTheDocument();
  });

  it('disables every button with empty result slots when no lookup ran (idle)', () => {
    render(<ContainerTable containers={containers} urlByContainer={undefined} loading={false} error={undefined} />);
    for (const b of screen.getAllByTestId('container-url-button')) {
      expect(b).not.toHaveAttribute('href');
      expect(b).toHaveAttribute('aria-disabled', 'true');
    }
    expect(screen.queryByTestId('container-url-pending')).not.toBeInTheDocument();
    expect(screen.queryByTestId('container-url-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('container-url-result')).not.toBeInTheDocument();
  });

  it('shows only the error hint per row (no buttons) when the lookup failed, keeping rows visible', () => {
    render(<ContainerTable containers={containers} urlByContainer={undefined} loading={false} error="boom" />);
    const errors = screen.getAllByTestId('container-url-error');
    expect(errors).toHaveLength(2);
    for (const e of errors) {
      expect(e).toHaveTextContent('boom');
      expect(e).toHaveAttribute('title', 'boom');
    }
    expect(screen.queryByTestId('container-url-button')).not.toBeInTheDocument();
    expect(dataRows()).toHaveLength(2);
  });
});
