import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { FALLBACK_SEVERITY_COLOR, SEVERITY_COLOR } from '../../../../shared/constants/colorBySeverity';
import type { NodeAlert } from '../../../../shared/constants/types';

import { AlertTable } from './AlertTable';

const alerts: NodeAlert[] = [
  { pod: 'mongo-0', service: 'mongo', name: 'HighMemory', severity: 'critical', time: 1717500000, id: 'a1' },
  { name: 'PodRestart', severity: 'warning', time: 1717500300, id: 'a2' }, // no pod/service
];

describe('AlertTable', () => {
  it('renders a row per alert with the five columns', () => {
    render(<AlertTable alerts={alerts} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    for (const header of ['Pod', 'Service', 'Alert', 'Severity', 'Time']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    expect(screen.getByText('HighMemory')).toBeInTheDocument();
    expect(screen.getByText('PodRestart')).toBeInTheDocument();
    expect(screen.getByText('mongo-0')).toBeInTheDocument();
  });

  it('shows — for missing pod/service', () => {
    render(<AlertTable alerts={[alerts[1]!]} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    expect(screen.getAllByText('—')).toHaveLength(2); // pod + service
  });

  it('colours the severity badge from SEVERITY_COLOR', () => {
    render(<AlertTable alerts={alerts} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    const badges = screen.getAllByTestId('alert-severity');
    expect(badges[0]).toHaveStyle({ backgroundColor: SEVERITY_COLOR.critical });
    expect(badges[1]).toHaveStyle({ backgroundColor: SEVERITY_COLOR.warning });
  });

  it('colours an info severity badge from SEVERITY_COLOR', () => {
    const info: NodeAlert[] = [{ name: 'Rollout', severity: 'info', time: 1717500000 }];
    render(<AlertTable alerts={info} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    expect(screen.getByTestId('alert-severity')).toHaveStyle({ backgroundColor: SEVERITY_COLOR.info });
  });

  it('renders an unknown/custom severity with its literal label in the critical fallback colour', () => {
    const custom: NodeAlert[] = [{ name: 'X', severity: 'fatal', time: 1717500000 }];
    render(<AlertTable alerts={custom} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    const badge = screen.getByTestId('alert-severity');
    expect(badge).toHaveStyle({ backgroundColor: FALLBACK_SEVERITY_COLOR });
    expect(badge).toHaveTextContent('fatal');
  });

  it('calls onAlertTimeClick with the alert time in SECONDS when a time cell is clicked', () => {
    const onAlertTimeClick = jest.fn();
    render(<AlertTable alerts={alerts} onAlertTimeClick={onAlertTimeClick} timeZone="utc" />);
    const times = screen.getAllByTestId('alert-time');
    fireEvent.click(times[0]!);
    expect(onAlertTimeClick).toHaveBeenCalledWith(1717500000);
    fireEvent.click(times[1]!);
    expect(onAlertTimeClick).toHaveBeenCalledWith(1717500300);
  });

  it('renders "No alerts" when the list is empty', () => {
    render(<AlertTable alerts={[]} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    expect(screen.getByTestId('alert-table-empty')).toHaveTextContent('No alerts');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('formats the time label with the provided time zone', () => {
    render(<AlertTable alerts={[alerts[0]!]} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    // 1717500000s = 2024-06-04 11:20:00 UTC
    expect(screen.getByTestId('alert-time')).toHaveTextContent(/2024-06-04/);
  });
});
