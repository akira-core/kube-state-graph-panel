import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { type CellProps, type Column, Icon, InteractiveTable, Spinner, useStyles2 } from '@grafana/ui';
import React, { useMemo } from 'react';

import { themeColors } from '../../../../shared/theme/themeColors';
import type { DetailLookup } from '../../hooks/useNodeDetailUrls';

import type { ContainerTableProps } from './ContainerTable.types';

interface ContainerRow {
  name: string;
  image: string;
}

function getStyles(theme: GrafanaTheme2): {
  name: string;
  image: string;
  tableWrap: string;
  urlCell: string;
  pending: string;
  link: string;
  unavailable: string;
} {
  const colors = themeColors(theme);
  return {
    // A plain-string header (required for Grafana 11.4, whose InteractiveTable types
    // `Column.header` as `string`, not a renderer) can't carry a className, so the
    // "Change Report" header — always the last column — is right-aligned by targeting
    // its <th> from the table wrapper. Keeps the label on the same right edge the
    // anchors pin to, lined up with the Application section's, even when a hint widens
    // this column leftward.
    tableWrap: css({ '& th:last-child': { textAlign: 'right' } }),
    // nowrap: a container name is an identifier. disableGrow shrinks this column to
    // its min-content width, and without nowrap the browser breaks the name at its
    // hyphens (e.g. `nats-server-config-reloader`), wrapping it across lines. Pin it
    // to one line so it stays readable; the Image column (break-all) still soaks up
    // the remaining width.
    name: css({ fontWeight: 600, whiteSpace: 'nowrap' }),
    // break-all instead of ellipsis: registry/repo@tag strings have no spaces, so
    // an unwrapped image would stretch its column and push the table past the
    // panel edge; wrapping keeps the columns aligned and the full image readable.
    image: css({
      color: colors.text.secondary,
      fontFamily: theme.typography.fontFamilyMonospace,
      fontSize: theme.typography.bodySmall.fontSize,
      wordBreak: 'break-all',
    }),
    // flex-end pins the Change Report content to the column's right edge so every
    // row's content — and the Application section's — line up vertically, and stay
    // put across the loading / ready / unavailable states (spinner, anchor, hint).
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
    // The unavailable hint (failed / map-miss / no URL) is MUTED, not error-red: it
    // reads as "no change report", not "broken". Long messages truncate with the
    // full value in title to keep error detail recoverable.
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

// Stable id per row so InteractiveTable (react-table) does not thrash; the index
// suffix mirrors AlertTable's convention (duplicate name+image pairs cannot
// collide as React keys).
function rowId(row: ContainerRow, index: number): string {
  return `${row.name}/${row.image}-${String(index)}`;
}

// The containers table: a headered InteractiveTable (same component and column
// layout as the Alerts table — D8) with Name / Image / Change Report columns, one
// row per container. Each Change Report is EAGER-prefetched (the shared code_changes
// map resolves when the panel opens): while loading every row shows a spinner; a row
// whose container is in the map renders a real `<a href target="_blank"
// rel="noopener noreferrer">` anchor (no window.open); a row absent from the settled
// map shows a muted "No change report" hint. The header and rows always render; each
// row's state is independent.
export function ContainerTable({ containers, lookups }: Readonly<ContainerTableProps>): React.JSX.Element {
  const styles = useStyles2(getStyles);

  // columns + data must be memoized (InteractiveTable / react-table requirement).
  const data = useMemo<ContainerRow[]>(() => containers.map((c) => ({ name: c.name, image: c.image })), [containers]);

  const columns = useMemo<Array<Column<ContainerRow>>>(
    () => [
      {
        id: 'name',
        header: 'Name',
        // disableGrow: the Image column soaks up the remaining width, keeping the
        // Change Report column hugging the right edge (aligned with the
        // Application section's).
        disableGrow: true,
        cell: ({ row }: CellProps<ContainerRow>) => <span className={styles.name}>{row.original.name}</span>,
      },
      {
        id: 'image',
        header: 'Image',
        cell: ({ row }: CellProps<ContainerRow>) => <span className={styles.image}>{row.original.image}</span>,
      },
      {
        id: 'url',
        header: 'Change Report',
        disableGrow: true,
        cell: ({ row }: CellProps<ContainerRow>) => {
          const name = row.original.name;
          // phase 'loading' → spinner on every row; 'settled' → anchor if the map has
          // this container, else the muted hint (the ?? fallback IS the not-found rule).
          const state: DetailLookup =
            lookups.phase === 'loading' ? { status: 'loading' } : (lookups.byName[name] ?? { status: 'unavailable' });
          return (
            <div className={styles.urlCell}>
              {state.status === 'loading' && (
                <span className={styles.pending} data-testid="container-url-pending">
                  <Spinner inline size="sm" /> Looking up…
                </span>
              )}
              {state.status === 'ready' && (
                <a
                  className={styles.link}
                  href={state.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="container-url-link"
                >
                  <Icon name="external-link-alt" /> URL
                </a>
              )}
              {state.status === 'unavailable' && (
                <span
                  className={styles.unavailable}
                  data-testid="container-url-unavailable"
                  {...(state.error !== undefined ? { title: state.error } : {})}
                >
                  No change report
                </span>
              )}
            </div>
          );
        },
      },
    ],
    [styles, lookups]
  );

  return (
    <div data-testid="container-table" className={styles.tableWrap}>
      <InteractiveTable columns={columns} data={data} getRowId={rowId} />
    </div>
  );
}
