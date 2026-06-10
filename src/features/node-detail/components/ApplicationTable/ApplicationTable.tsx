import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { LinkButton, Spinner, useStyles2 } from '@grafana/ui';
import React from 'react';

import { themeColors } from '../../../../shared/theme/themeColors';

import type { ApplicationTableProps } from './ApplicationTable.types';

function getStyles(theme: GrafanaTheme2): {
  row: string;
  name: string;
  status: string;
  error: string;
} {
  const colors = themeColors(theme);
  return {
    row: css({
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '2px 0',
    }),
    name: css({
      flex: 1,
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      fontWeight: 600,
    }),
    status: css({
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      color: colors.text.secondary,
      padding: '2px 0',
    }),
    error: css({ color: theme.colors.error.text, padding: '2px 0' }),
  };
}

// The ArgoCD application row: name + a single URL button to the Argo app detail
// page (same row shape and button semantics as ContainerTable — D8). The button is
// a pre-resolved link (right-click fired the lookup — D5): new tab via
// target=_blank + rel=noopener, never window.open, DISABLED while no URL is known
// (idle, loading, or the lookup failed).
export function ApplicationTable({ application, url, loading, error }: Readonly<ApplicationTableProps>): React.JSX.Element {
  const styles = useStyles2(getStyles);
  // List-shaped on purpose: today the panel resolves a single application, but the
  // row rendering already iterates so this can grow to several without re-plumbing.
  const rows = [{ application, url }];
  return (
    <div data-testid="application-table">
      {loading && (
        <div className={styles.status} data-testid="application-table-loading">
          <Spinner inline size="sm" /> Looking up application URL…
        </div>
      )}
      {!loading && error !== undefined && (
        <div className={styles.error} data-testid="application-table-error">
          {error}
        </div>
      )}
      {rows.map((row) => (
        <div className={styles.row} key={row.application} data-testid="application-row">
          <span className={styles.name}>{row.application}</span>
          {row.url !== undefined ? (
            <LinkButton
              size="sm"
              fill="outline"
              variant="secondary"
              icon="external-link-alt"
              href={row.url}
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
        </div>
      ))}
    </div>
  );
}
