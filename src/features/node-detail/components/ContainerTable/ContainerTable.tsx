import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { type CellProps, type Column, InteractiveTable, LinkButton, Spinner, useStyles2 } from '@grafana/ui';
import React, { useMemo } from 'react';

import { themeColors } from '../../../../shared/theme/themeColors';

import type { ContainerTableProps } from './ContainerTable.types';

interface ContainerRow {
  name: string;
  image: string;
  url: string | undefined;
}

interface ResultSlotStyles {
  pending: string;
  result: string;
  resultError: string;
}

function getStyles(theme: GrafanaTheme2): ResultSlotStyles & {
  name: string;
  image: string;
  urlCell: string;
} {
  const colors = themeColors(theme);
  // The truncation cap keeps a long URL / error message from stretching the URL
  // column past the panel edge; the full value stays reachable via title.
  const truncated = {
    maxWidth: '40ch',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as const;
  return {
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
    urlCell: css({ display: 'flex', alignItems: 'center', gap: 8 }),
    pending: css({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      color: colors.text.secondary,
      fontSize: theme.typography.bodySmall.fontSize,
      whiteSpace: 'nowrap',
    }),
    result: css({
      ...truncated,
      color: colors.text.secondary,
      fontFamily: theme.typography.fontFamilyMonospace,
      fontSize: theme.typography.bodySmall.fontSize,
    }),
    resultError: css({
      ...truncated,
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

// The lookup-state slot rendered to the RIGHT of a row's URL button: in flight →
// spinner hint; resolved → the URL itself. Idle (no lookup ran) and a
// map-missing container leave the slot empty — the disabled button is the
// signal. A FAILED lookup never reaches this slot: the cell renders the error
// hint alone, without a button (a dead button next to "Not Found" reads as
// broken UI). Long values truncate with the full text in title.
function resultSlot(
  styles: ResultSlotStyles,
  loading: boolean,
  url: string | undefined,
  testIdPrefix: string
): React.JSX.Element | null {
  if (loading) {
    return (
      <span className={styles.pending} data-testid={`${testIdPrefix}-pending`}>
        <Spinner inline size="sm" /> Looking up…
      </span>
    );
  }
  if (url !== undefined) {
    return (
      <span className={styles.result} title={url} data-testid={`${testIdPrefix}-result`}>
        {url}
      </span>
    );
  }
  return null;
}

// The containers table: a headered InteractiveTable (same component and column
// layout as the Alerts table — D8) with Name / Image / URL columns, one row per
// container. Each URL button is a plain pre-resolved link (right-click fired the
// lookup up front — D5): new tab via target=_blank + rel=noopener, never
// window.open, and it renders DISABLED (no href) while no URL is known — idle
// (no lookup ran), loading, lookup failed, or the container name missing from
// the returned map. The lookup state renders in the result slot to each row's
// button right; the header and rows always render.
export function ContainerTable({
  containers,
  urlByContainer,
  loading,
  error,
}: Readonly<ContainerTableProps>): React.JSX.Element {
  const styles = useStyles2(getStyles);

  // columns + data must be memoized (InteractiveTable / react-table requirement).
  // The per-row URL is resolved here once so the cell renderers stay lookup-free.
  const data = useMemo<ContainerRow[]>(
    () => containers.map((c) => ({ name: c.name, image: c.image, url: urlByContainer?.[c.name] })),
    [containers, urlByContainer]
  );

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
          if (!loading && error !== undefined) {
            // Failed lookup: the hint alone — no dead disabled button next to it.
            return (
              <span className={styles.resultError} title={error} data-testid="container-url-error">
                {error}
              </span>
            );
          }
          return (
            <div className={styles.urlCell}>
              {row.original.url !== undefined ? (
                <LinkButton
                  size="sm"
                  fill="outline"
                  variant="secondary"
                  icon="external-link-alt"
                  href={row.original.url}
                  target="_blank"
                  rel="noopener"
                  data-testid="container-url-button"
                >
                  URL
                </LinkButton>
              ) : (
                <LinkButton
                  size="sm"
                  fill="outline"
                  variant="secondary"
                  icon="external-link-alt"
                  disabled
                  data-testid="container-url-button"
                >
                  URL
                </LinkButton>
              )}
              {resultSlot(styles, loading, row.original.url, 'container-url')}
            </div>
          );
        },
      },
    ],
    [styles, loading, error]
  );

  return (
    <div data-testid="container-table">
      <InteractiveTable columns={columns} data={data} getRowId={rowId} />
    </div>
  );
}
