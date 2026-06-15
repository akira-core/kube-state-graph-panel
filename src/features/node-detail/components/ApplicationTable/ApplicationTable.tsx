import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { type CellProps, type Column, Icon, InteractiveTable, Spinner, useStyles2 } from '@grafana/ui';
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
  link: string;
  unavailable: string;
} {
  const colors = themeColors(theme);
  return {
    name: css({ fontWeight: 600 }),
    // A plain-string header (required for Grafana 11.4, whose InteractiveTable types
    // `Column.header` as `string`, not a renderer) can't carry a className, so the
    // "Change Report" header — always the last column — is right-aligned by targeting
    // its <th> from the table wrapper. Keeps the label on the same right edge the
    // anchors pin to, lined up with the Containers section's, even when a hint widens
    // this column leftward.
    tableWrap: css({ '& th:last-child': { textAlign: 'right' } }),
    // flex-end pins the Change Report content to the column's right edge so it lines up
    // with the Containers section's — and stays put across the loading / ready /
    // unavailable states (a spinner, an anchor, or a hint of differing widths).
    urlCell: css({ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }),
    pending: css({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      color: colors.text.secondary,
      fontSize: theme.typography.bodySmall.fontSize,
      whiteSpace: 'nowrap',
    }),
    // The success state is a REAL anchor (URL pre-resolved by the eager prefetch):
    // a normal user-gesture navigation — no window.open, so no blank-tab/popup issues,
    // and middle/Ctrl-click + copy-link work.
    link: css({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      whiteSpace: 'nowrap',
      color: colors.text.link,
      '&:hover': { textDecoration: 'underline' },
    }),
    // The unavailable hint (failed / no URL) is MUTED, not error-red: it reads as
    // "no change report yet", not "broken". Long messages truncate with the full
    // value in title to keep error detail recoverable.
    unavailable: css({
      maxWidth: '40ch',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      color: colors.text.secondary,
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
// Report column. The Change Report is EAGER-prefetched: the URL is resolved when the
// panel opens, so success renders a real `<a href target="_blank" rel="noopener
// noreferrer">` anchor (no window.open); while the lookup is in flight a spinner
// shows; on failure / no URL a muted "No change report" hint shows. The header and
// row always render.
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
        cell: () => (
          <div className={styles.urlCell}>
            {state.status === 'loading' && (
              <span className={styles.pending} data-testid="application-url-pending">
                <Spinner inline size="sm" /> Looking up…
              </span>
            )}
            {state.status === 'ready' && (
              <a
                className={styles.link}
                href={state.url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="application-url-link"
              >
                <Icon name="external-link-alt" /> URL
              </a>
            )}
            {state.status === 'unavailable' && (
              <span
                className={styles.unavailable}
                data-testid="application-url-unavailable"
                {...(state.error !== undefined ? { title: state.error } : {})}
              >
                No change report
              </span>
            )}
          </div>
        ),
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
