import { css } from '@emotion/css';
import { type CellProps, type Column, InteractiveTable, useStyles2 } from '@grafana/ui';
import React, { useMemo } from 'react';

import { formatChangeTime } from '../../formatChangeTime';
import { ChangeReportCell } from '../ChangeReportCell';
import { ChangeTimeCell } from '../ChangeTimeCell';

import type { ApplicationTableProps } from './ApplicationTable.types';

interface ApplicationRow {
  application: string;
}

function getStyles(): { name: string; tableWrap: string } {
  return {
    name: css({ fontWeight: 600 }),
    // A plain-string header (required for Grafana 11.4, whose InteractiveTable types
    // `Column.header` as `string`, not a renderer) can't carry a className, so the
    // "Change Report" header — always the last column — is right-aligned by targeting
    // its <th> from the table wrapper. Keeps the label on the same right edge the
    // anchors pin to, lined up with the Containers section's, even when a hint widens
    // this column leftward.
    tableWrap: css({ '& th:last-child': { textAlign: 'right' } }),
  };
}

// Stable id per row. The index suffix mirrors AlertTable's convention so future
// multi-row growth with duplicate application names cannot collide as React keys.
function rowId(row: ApplicationRow, index: number): string {
  return `${row.application}-${String(index)}`;
}

// The ArgoCD application table: a headered InteractiveTable (same component and
// column layout as the Alerts table — D8) with Name / Current / Previous / Deployment
// Changes columns. The Deployment Changes (link) column is EAGER-prefetched: the
// shared ChangeReportCell renders its DetailLookup as a Spinner / `<a href>` anchor /
// muted "No change report" hint (no window.open). Current / Previous render the diff
// timestamps off the ready lookup (localized via the panel timeZone, muted "—" when
// absent). The header and row always render.
export function ApplicationTable({ application, state, timeZone }: Readonly<ApplicationTableProps>): React.JSX.Element {
  const styles = useStyles2(getStyles);

  // Always exactly one row: a pod/controller maps to at most ONE ArgoCD app, so this
  // never grows beyond a single application (and never needs to scroll). It stays a
  // headered InteractiveTable purely to match the Containers section's column layout
  // (D8). columns + data must be memoized (InteractiveTable / react-table requirement).
  const data = useMemo<ApplicationRow[]>(() => [{ application }], [application]);

  const columns = useMemo<Array<Column<ApplicationRow>>>(
    () => [
      {
        id: 'application',
        header: 'Name',
        cell: ({ row }: CellProps<ApplicationRow>) => <span className={styles.name}>{row.original.application}</span>,
      },
      {
        id: 'current',
        header: 'Current',
        disableGrow: true,
        cell: () => {
          const iso = state.status === 'ready' ? state.currentTime : undefined;
          return (
            <ChangeTimeCell
              formatted={formatChangeTime(iso, timeZone)}
              {...(iso !== undefined ? { title: iso } : {})}
              testId="application-current"
            />
          );
        },
      },
      {
        id: 'previous',
        header: 'Previous',
        disableGrow: true,
        cell: () => {
          const iso = state.status === 'ready' ? state.previousTime : undefined;
          return (
            <ChangeTimeCell
              formatted={formatChangeTime(iso, timeZone)}
              {...(iso !== undefined ? { title: iso } : {})}
              testId="application-previous"
            />
          );
        },
      },
      {
        id: 'url',
        header: 'Deployment Changes',
        // disableGrow: the Name column takes the remaining width, so this (last) column
        // hugs the right edge at the same position as ContainerTable's link column (the
        // two stacked sections' link columns align). It stays last so the wrapper's
        // `th:last-child` right-align rule keeps targeting the link header.
        disableGrow: true,
        cell: () => <ChangeReportCell state={state} idPrefix="application" />,
      },
    ],
    [styles, state, timeZone]
  );

  return (
    <div data-testid="application-table" className={styles.tableWrap}>
      <InteractiveTable columns={columns} data={data} getRowId={rowId} />
    </div>
  );
}
