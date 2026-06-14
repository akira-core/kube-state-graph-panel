import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { Button, type CellProps, type Column, InteractiveTable, Spinner, useStyles2 } from '@grafana/ui';
import React, { useMemo } from 'react';

import { themeColors } from '../../../../shared/theme/themeColors';

import type { ApplicationTableProps } from './ApplicationTable.types';

interface ApplicationRow {
  application: string;
}

function getStyles(theme: GrafanaTheme2): {
  name: string;
  tableWrap: string;
  urlCell: string;
  pending: string;
  resultError: string;
} {
  const colors = themeColors(theme);
  return {
    name: css({ fontWeight: 600 }),
    // A plain-string header (required for Grafana 11.4, whose InteractiveTable types
    // `Column.header` as `string`, not a renderer) can't carry a className, so the
    // "Change Report" header — always the last column — is right-aligned by targeting
    // its <th> from the table wrapper. Keeps the label on the same right edge the
    // buttons pin to, lined up with the Containers section's, even when a hint widens
    // this column leftward.
    tableWrap: css({ '& th:last-child': { textAlign: 'right' } }),
    // flex-end pins the button to the column's right edge so it lines up with the
    // Containers section's button column — and stays put when a loading/error hint
    // (rendered to its LEFT) widens the cell. A left-anchored button would drift as
    // the hint grows, breaking the two sections' vertical alignment.
    urlCell: css({ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }),
    pending: css({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      color: colors.text.secondary,
      fontSize: theme.typography.bodySmall.fontSize,
      whiteSpace: 'nowrap',
    }),
    // The failure hint sits BESIDE the (still clickable) button — the lazy button
    // is a live retry trigger, not a dead disabled control. Long messages truncate
    // with the full value in title.
    resultError: css({
      maxWidth: '40ch',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      color: theme.colors.error.text,
      fontSize: theme.typography.bodySmall.fontSize,
    }),
  };
}

// Stable id per row. The index suffix mirrors AlertTable's convention so future
// multi-row growth with duplicate application names cannot collide as React keys.
function rowId(row: ApplicationRow, index: number): string {
  return `${row.application}-${String(index)}`;
}

// The ArgoCD application table: a headered InteractiveTable (same component and
// column layout as the Alerts table — D8) with an Application column and a Change
// Report column. The button is LAZY: a click fires the application-detail lookup
// and (on HTTP 200) opens the report in a NEW TAB via window.open — no URL is
// pre-resolved, so there is no href. It renders disabled when no endpoint is known
// (`enabled` false) or while a click is in flight; on failure a retryable error
// shows beside it. The header and row always render.
export function ApplicationTable({
  application,
  state,
  enabled,
  onOpen,
}: Readonly<ApplicationTableProps>): React.JSX.Element {
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
        // stacked sections' button columns align).
        disableGrow: true,
        cell: () => (
          <div className={styles.urlCell}>
            {state.status === 'loading' && (
              <span className={styles.pending} data-testid="application-url-pending">
                <Spinner inline size="sm" /> Looking up…
              </span>
            )}
            {state.status === 'error' && state.error !== undefined && (
              <span className={styles.resultError} title={state.error} data-testid="application-url-error">
                {state.error}
              </span>
            )}
            <Button
              size="sm"
              fill="outline"
              variant="secondary"
              icon="external-link-alt"
              onClick={onOpen}
              disabled={!enabled || state.status === 'loading'}
              data-testid="application-url-button"
            >
              URL
            </Button>
          </div>
        ),
      },
    ],
    [styles, state, enabled, onOpen]
  );

  return (
    <div data-testid="application-table" className={styles.tableWrap}>
      <InteractiveTable columns={columns} data={data} getRowId={rowId} />
    </div>
  );
}
