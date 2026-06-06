import { css } from '@emotion/css';
import { dateTimeFormat, type GrafanaTheme2 } from '@grafana/data';
import { type CellProps, type Column, InteractiveTable, useStyles2 } from '@grafana/ui';
import React, { useMemo } from 'react';

import { severityColor } from '../../../../shared/constants/colorBySeverity';
import type { NodeAlert } from '../../../../shared/constants/types';

import type { AlertTableProps } from './AlertTable.types';

const PLACEHOLDER = '—';

function getStyles(theme: GrafanaTheme2): {
  empty: string;
  severityBadge: string;
  timeButton: string;
} {
  const colors = theme.colors as unknown as {
    text: { secondary: string; link: string };
  };
  return {
    empty: css({ color: colors.text.secondary, fontStyle: 'italic', padding: '4px 0' }),
    severityBadge: css({
      display: 'inline-block',
      fontSize: 10,
      fontWeight: 600,
      padding: '1px 6px',
      borderRadius: 10,
      color: '#000',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    }),
    // Time renders as a link-styled button so the rewind affordance is obvious
    // and keyboard-accessible (not a bare clickable cell).
    timeButton: css({
      background: 'none',
      border: 'none',
      padding: 0,
      margin: 0,
      cursor: 'pointer',
      color: colors.text.link,
      font: 'inherit',
      textDecoration: 'underline',
      '&:hover': { textDecoration: 'none' },
    }),
  };
}

// Stable id per alert row so InteractiveTable (react-table) does not thrash.
function rowId(alert: NodeAlert, index: number): string {
  return alert.id ?? `${alert.name}-${String(alert.time)}-${String(index)}`;
}

export function AlertTable({ alerts, onAlertTimeClick, timeZone }: Readonly<AlertTableProps>): React.JSX.Element {
  const styles = useStyles2(getStyles);

  // columns + data must be memoized (InteractiveTable / react-table requirement).
  const data = useMemo(() => alerts, [alerts]);

  const columns = useMemo<Array<Column<NodeAlert>>>(
    () => [
      { id: 'pod', header: 'Pod', cell: ({ row }: CellProps<NodeAlert>) => row.original.pod ?? PLACEHOLDER },
      {
        id: 'service',
        header: 'Service',
        cell: ({ row }: CellProps<NodeAlert>) => row.original.service ?? PLACEHOLDER,
      },
      { id: 'name', header: 'Alert', cell: ({ row }: CellProps<NodeAlert>) => row.original.name },
      {
        id: 'severity',
        header: 'Severity',
        cell: ({ row }: CellProps<NodeAlert>) => {
          const { severity } = row.original;
          // Known tier → its colour; any custom label → critical fallback (never blank).
          const color = severityColor(severity);
          return (
            <span className={styles.severityBadge} style={{ backgroundColor: color }} data-testid="alert-severity">
              {severity}
            </span>
          );
        },
      },
      {
        id: 'time',
        header: 'Time',
        cell: ({ row }: CellProps<NodeAlert>) => {
          const { time } = row.original;
          const label = dateTimeFormat(time * 1000, timeZone !== undefined ? { timeZone } : {});
          return (
            <button
              type="button"
              className={styles.timeButton}
              data-testid="alert-time"
              onClick={() => {
                onAlertTimeClick(time);
              }}
            >
              {label}
            </button>
          );
        },
      },
    ],
    [styles.severityBadge, styles.timeButton, timeZone, onAlertTimeClick]
  );

  if (data.length === 0) {
    return (
      <div className={styles.empty} data-testid="alert-table-empty">
        No alerts
      </div>
    );
  }

  return <InteractiveTable columns={columns} data={data} getRowId={rowId} />;
}
