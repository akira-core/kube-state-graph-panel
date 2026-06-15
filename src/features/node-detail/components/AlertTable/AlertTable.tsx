import { css } from '@emotion/css';
import { dateTimeFormat, type GrafanaTheme2 } from '@grafana/data';
import { type CellProps, type Column, InteractiveTable, Tooltip, useStyles2 } from '@grafana/ui';
import React, { useMemo } from 'react';

import { severityColor } from '../../../../shared/constants/colorBySeverity';
import type { NodeAlert } from '../../../../shared/constants/types';
import { themeColors } from '../../../../shared/theme/themeColors';

import type { AlertTableProps } from './AlertTable.types';

const PLACEHOLDER = '—';

function getStyles(theme: GrafanaTheme2): {
  empty: string;
  severityBadge: string;
  countBadge: string;
  occurrenceList: string;
  timeButton: string;
} {
  const colors = themeColors(theme);
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
    // Count renders as a tabbable pill so its occurrence-time tooltip is reachable by
    // both hover and keyboard.
    countBadge: css({
      display: 'inline-block',
      minWidth: 18,
      textAlign: 'center',
      fontSize: 11,
      fontWeight: 600,
      padding: '1px 6px',
      borderRadius: 10,
      cursor: 'default',
      color: colors.text.secondary,
      border: `1px solid ${colors.text.secondary}`,
    }),
    occurrenceList: css({ display: 'flex', flexDirection: 'column', gap: 2, fontVariantNumeric: 'tabular-nums' }),
    // Last occurred renders as a link-styled button so the rewind affordance is obvious
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

// Stable id per alert row so InteractiveTable (react-table) does not thrash. The
// index suffix applies to the id path too: normalize does not dedupe a single
// pod's alerts, so two entries sharing a backend id must not collide as React keys.
function rowId(alert: NodeAlert, index: number): string {
  return `${alert.id ?? `${alert.name}-${alert.timeRecords.join(',')}`}-${String(index)}`;
}

// Last occurrence = max. timeRecords is ascending (normalize sorts it), so it is the
// final element. Guard the empty case defensively (normalize never emits an empty list)
// so the cell never formats NaN.
function lastSeen(alert: NodeAlert): number {
  return alert.timeRecords.length > 0 ? alert.timeRecords[alert.timeRecords.length - 1]! : 0;
}

export function AlertTable({ alerts, onAlertTimeClick, timeZone }: Readonly<AlertTableProps>): React.JSX.Element {
  const styles = useStyles2(getStyles);

  const fmt = useMemo(
    () =>
      (timeSec: number): string =>
        dateTimeFormat(timeSec * 1000, timeZone !== undefined ? { timeZone } : {}),
    [timeZone]
  );

  // columns + data must be memoized (InteractiveTable / react-table requirement).
  const data = useMemo(() => alerts, [alerts]);

  // Column growth mirrors the detail tables' alignment rhythm (D8): identifier
  // columns hug their content, the main text column (Alert) soaks up the
  // remaining width, and the trailing status/action columns disableGrow so they
  // sit flush right — vertically aligned with the detail view's Change Report
  // column.
  const columns = useMemo<Array<Column<NodeAlert>>>(
    () => [
      {
        id: 'pod',
        header: 'Pod',
        disableGrow: true,
        cell: ({ row }: CellProps<NodeAlert>) => row.original.pod ?? PLACEHOLDER,
      },
      {
        id: 'service',
        header: 'Service',
        disableGrow: true,
        cell: ({ row }: CellProps<NodeAlert>) => row.original.service ?? PLACEHOLDER,
      },
      { id: 'name', header: 'Alert', cell: ({ row }: CellProps<NodeAlert>) => row.original.name },
      {
        id: 'severity',
        header: 'Severity',
        disableGrow: true,
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
        id: 'count',
        header: 'Count',
        disableGrow: true,
        cell: ({ row }: CellProps<NodeAlert>) => {
          const { timeRecords } = row.original;
          // The badge shows the occurrence count; its tooltip enumerates every
          // occurrence time (the full "occur time" list).
          return (
            <Tooltip
              content={
                <div className={styles.occurrenceList} data-testid="alert-occurrences">
                  {timeRecords.map((t, i) => (
                    <span key={`${String(t)}-${String(i)}`}>{fmt(t)}</span>
                  ))}
                </div>
              }
            >
              <span className={styles.countBadge} data-testid="alert-count" tabIndex={0}>
                {timeRecords.length}
              </span>
            </Tooltip>
          );
        },
      },
      {
        id: 'lastSeen',
        header: 'Last occurred',
        disableGrow: true,
        cell: ({ row }: CellProps<NodeAlert>) => {
          const t = lastSeen(row.original);
          return (
            <button
              type="button"
              className={styles.timeButton}
              data-testid="alert-time"
              onClick={() => {
                onAlertTimeClick(t);
              }}
            >
              {fmt(t)}
            </button>
          );
        },
      },
    ],
    [styles, fmt, onAlertTimeClick]
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
