import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

import type { ChangeReportState } from '../../hooks/useNodeDetailUrls';

import { ContainerTable } from './ContainerTable';

const containers = [
  { name: 'app', image: 'repo/app:1.2' },
  { name: 'sidecar', image: 'repo/sc:0.9' },
];

// The table's data rows (row 0 is the header row).
function dataRows(): HTMLElement[] {
  return screen.getAllByRole('row').slice(1);
}

describe('ContainerTable (lazy Change Report)', () => {
  it('renders a headered table (Name / Image / Change Report), one clickable button per container', () => {
    render(<ContainerTable containers={containers} stateByContainer={{}} enabled onOpen={jest.fn()} />);
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
    expect(within(first[2]!).getByTestId('container-url-button')).toBeEnabled();
    // Idle by default: no error / pending anywhere.
    expect(screen.queryByTestId('container-url-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('container-url-pending')).not.toBeInTheDocument();
  });

  it('fires onOpen with the row’s container name when its button is clicked', () => {
    const onOpen = jest.fn();
    render(<ContainerTable containers={containers} stateByContainer={{}} enabled onOpen={onOpen} />);
    const buttons = screen.getAllByTestId('container-url-button');
    fireEvent.click(buttons[1]!);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('sidecar');
  });

  it('disables every button when no endpoint is configured (enabled=false)', () => {
    render(<ContainerTable containers={containers} stateByContainer={{}} enabled={false} onOpen={jest.fn()} />);
    for (const b of screen.getAllByTestId('container-url-button')) {
      expect(b).toBeDisabled();
    }
  });

  it('shows the per-row state independently: one loading, one error, one idle', () => {
    const stateByContainer: Record<string, ChangeReportState> = {
      app: { status: 'loading' },
      sidecar: { status: 'error', error: 'Not Found' },
    };
    render(<ContainerTable containers={containers} stateByContainer={stateByContainer} enabled onOpen={jest.fn()} />);
    const rows = dataRows();
    // Row 0 (app): loading hint + disabled button.
    expect(within(rows[0]!).getByTestId('container-url-pending')).toHaveTextContent('Looking up…');
    expect(within(rows[0]!).getByTestId('container-url-button')).toBeDisabled();
    // Row 1 (sidecar): error beside a still-clickable button (retryable).
    const error = within(rows[1]!).getByTestId('container-url-error');
    expect(error).toHaveTextContent('Not Found');
    expect(error).toHaveAttribute('title', 'Not Found');
    const errBtn = within(rows[1]!).getByTestId('container-url-button');
    expect(errBtn).toBeEnabled();
    // The hint renders BEFORE the button so the button stays pinned right (flex-end),
    // keeping every row's button aligned with the others and the Application section.
    expect(error.compareDocumentPosition(errBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps a failed row’s button clickable for retry', () => {
    const onOpen = jest.fn();
    render(
      <ContainerTable
        containers={containers}
        stateByContainer={{ app: { status: 'error', error: 'Not Found' } }}
        enabled
        onOpen={onOpen}
      />
    );
    const buttons = screen.getAllByTestId('container-url-button');
    fireEvent.click(buttons[0]!);
    expect(onOpen).toHaveBeenCalledWith('app');
  });
});
