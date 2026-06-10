import { render, screen } from '@testing-library/react';
import React from 'react';

import { ContainerTable } from './ContainerTable';

const containers = [
  { name: 'app', image: 'repo/app:1.2' },
  { name: 'sidecar', image: 'repo/sc:0.9' },
];

describe('ContainerTable', () => {
  it('renders one row per container with name and image', () => {
    render(<ContainerTable containers={containers} urlByContainer={undefined} loading={false} error={undefined} />);
    const rows = screen.getAllByTestId('container-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('app')).toBeInTheDocument();
    expect(screen.getByText('repo/app:1.2')).toBeInTheDocument();
    expect(screen.getByText('sidecar')).toBeInTheDocument();
    expect(screen.getByText('repo/sc:0.9')).toBeInTheDocument();
  });

  it('shows a loading indicator while the lookup is in flight (rows still listed)', () => {
    render(<ContainerTable containers={containers} urlByContainer={undefined} loading={true} error={undefined} />);
    expect(screen.getByTestId('container-table-loading')).toBeInTheDocument();
    expect(screen.getAllByTestId('container-row')).toHaveLength(2);
  });

  it('binds each row button to its mapped URL as a new-tab noopener link, without auto-navigation', () => {
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
    // Pre-resolved links only — the lookup result must never auto-open a tab.
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('disables only the row whose container name is missing from the map (name/image still shown)', () => {
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
    expect(screen.getByText('sidecar')).toBeInTheDocument();
    expect(screen.getByText('repo/sc:0.9')).toBeInTheDocument();
  });

  it('disables every button when no lookup ran (left-click / endpoint unset)', () => {
    render(<ContainerTable containers={containers} urlByContainer={undefined} loading={false} error={undefined} />);
    for (const b of screen.getAllByTestId('container-url-button')) {
      expect(b).not.toHaveAttribute('href');
      expect(b).toHaveAttribute('aria-disabled', 'true');
    }
  });

  it('shows the error state while keeping rows visible', () => {
    render(<ContainerTable containers={containers} urlByContainer={undefined} loading={false} error="boom" />);
    expect(screen.getByTestId('container-table-error')).toHaveTextContent('boom');
    expect(screen.getAllByTestId('container-row')).toHaveLength(2);
  });
});
