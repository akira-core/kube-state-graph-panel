import { css } from '@emotion/css';
import { type CellProps, type Column, InteractiveTable, useStyles2 } from '@grafana/ui';
import React, { useMemo } from 'react';

import { ChangeReportCell } from '../ChangeReportCell';

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
// column layout as the Alerts table — D8) with an Application column and a Change
// Report column. The Change Report is EAGER-prefetched: the shared ChangeReportCell
// renders its DetailLookup as a Spinner / `<a href>` anchor / muted "No change report"
// hint (no window.open). The header and row always render.
export function ApplicationTable({ application, state }: Readonly<ApplicationTableProps>): React.JSX.Element {
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
        id: 'url',
        header: 'Change Report',
        // disableGrow: the Name column takes the remaining width, so this column
        // hugs the right edge at the same position as ContainerTable's (the two
        // stacked sections' Change Report columns align).
        disableGrow: true,
        cell: () => <ChangeReportCell state={state} idPrefix="application" />,
      },
    ],
    [styles, state]
  );

  return (
    <div data-testid="application-table" className={styles.tableWrap}>
      <InteractiveTable columns={columns} data={data} getRowId={rowId} />
    </div>
  );
}
