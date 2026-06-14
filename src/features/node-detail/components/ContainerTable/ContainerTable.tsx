import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { Button, type CellProps, type Column, InteractiveTable, Spinner, useStyles2 } from '@grafana/ui';
import React, { useMemo } from 'react';

import { themeColors } from '../../../../shared/theme/themeColors';

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
  resultError: string;
} {
  const colors = themeColors(theme);
  return {
    // A plain-string header (required for Grafana 11.4, whose InteractiveTable types
    // `Column.header` as `string`, not a renderer) can't carry a className, so the
    // "Change Report" header — always the last column — is right-aligned by targeting
    // its <th> from the table wrapper. Keeps the label on the same right edge the
    // buttons pin to, lined up with the Application section's, even when a hint widens
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
    // flex-end pins the button to the column's right edge so every row's button —
    // and the Application section's — line up vertically, and stay put when a
    // loading/error hint (rendered to its LEFT) widens the cell. A left-anchored
    // button would drift per-row as hints appear, breaking the alignment.
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

// Stable id per row so InteractiveTable (react-table) does not thrash; the index
// suffix mirrors AlertTable's convention (duplicate name+image pairs cannot
// collide as React keys).
function rowId(row: ContainerRow, index: number): string {
  return `${row.name}/${row.image}-${String(index)}`;
}

// The containers table: a headered InteractiveTable (same component and column
// layout as the Alerts table — D8) with Name / Image / Change Report columns, one
// row per container. Each Change Report button is LAZY: a click fires that
// container's image-detail lookup and (on HTTP 200) opens its report in a NEW TAB
// via window.open — no URL is pre-resolved, so there is no href. A button renders
// disabled when no endpoint is known (`enabled` false) or while its own click is in
// flight; on failure / map-miss a retryable error shows beside it. The header and
// rows always render; each row's state is independent.
export function ContainerTable({
  containers,
  stateByContainer,
  enabled,
  onOpen,
}: Readonly<ContainerTableProps>): React.JSX.Element {
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
          const state = stateByContainer[name];
          return (
            <div className={styles.urlCell}>
              {state?.status === 'loading' && (
                <span className={styles.pending} data-testid="container-url-pending">
                  <Spinner inline size="sm" /> Looking up…
                </span>
              )}
              {state?.status === 'error' && state.error !== undefined && (
                <span className={styles.resultError} title={state.error} data-testid="container-url-error">
                  {state.error}
                </span>
              )}
              <Button
                size="sm"
                fill="outline"
                variant="secondary"
                icon="external-link-alt"
                onClick={() => {
                  onOpen(name);
                }}
                disabled={!enabled || state?.status === 'loading'}
                data-testid="container-url-button"
              >
                URL
              </Button>
            </div>
          );
        },
      },
    ],
    [styles, stateByContainer, enabled, onOpen]
  );

  return (
    <div data-testid="container-table" className={styles.tableWrap}>
      <InteractiveTable columns={columns} data={data} getRowId={rowId} />
    </div>
  );
}
