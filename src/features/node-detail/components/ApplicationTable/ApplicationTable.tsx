import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { type CellProps, type Column, InteractiveTable, LinkButton, Spinner, useStyles2 } from '@grafana/ui';
import React, { useMemo } from 'react';

import { themeColors } from '../../../../shared/theme/themeColors';

import type { ApplicationTableProps } from './ApplicationTable.types';

interface ApplicationRow {
  application: string;
  url: string | undefined;
}

interface ResultSlotStyles {
  pending: string;
  result: string;
  resultError: string;
}

function getStyles(theme: GrafanaTheme2): ResultSlotStyles & {
  name: string;
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
    name: css({ fontWeight: 600 }),
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

// Stable id per row. The index suffix mirrors AlertTable's convention so future
// multi-row growth with duplicate application names cannot collide as React keys.
function rowId(row: ApplicationRow, index: number): string {
  return `${row.application}-${String(index)}`;
}

// The lookup-state slot rendered to the RIGHT of a row's URL button: in flight →
// spinner hint; resolved → the URL itself. Idle (no lookup ran) and a missing
// URL leave the slot empty — the disabled button is the signal. A FAILED lookup
// never reaches this slot: the cell renders the error hint alone, without a
// button (a dead button next to "Not Found" reads as broken UI). Long values
// truncate with the full text in title.
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

// The ArgoCD application table: a headered InteractiveTable (same component and
// column layout as the Alerts table — D8) with an Application column and a URL
// column. The button is a pre-resolved link (right-click fired the lookup — D5):
// new tab via target=_blank + rel=noopener, never window.open, DISABLED while no
// URL is known (idle, loading, or the lookup failed). The lookup state renders
// in the result slot to the button's right; the header and row always render.
export function ApplicationTable({
  application,
  url,
  loading,
  error,
}: Readonly<ApplicationTableProps>): React.JSX.Element {
  const styles = useStyles2(getStyles);

  // List-shaped on purpose: today the panel resolves a single application, but the
  // table already iterates so this can grow to several without re-plumbing.
  // columns + data must be memoized (InteractiveTable / react-table requirement).
  const data = useMemo<ApplicationRow[]>(() => [{ application, url }], [application, url]);

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
        cell: ({ row }: CellProps<ApplicationRow>) => {
          if (!loading && error !== undefined) {
            // Failed lookup: the hint alone — no dead disabled button next to it.
            return (
              <span className={styles.resultError} title={error} data-testid="application-url-error">
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
                  data-testid="application-url-button"
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
                  data-testid="application-url-button"
                >
                  URL
                </LinkButton>
              )}
              {resultSlot(styles, loading, row.original.url, 'application-url')}
            </div>
          );
        },
      },
    ],
    [styles, loading, error]
  );

  return (
    <div data-testid="application-table">
      <InteractiveTable columns={columns} data={data} getRowId={rowId} />
    </div>
  );
}
