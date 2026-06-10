import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { LinkButton, Spinner, useStyles2 } from '@grafana/ui';
import React from 'react';

import { themeColors } from '../../../../shared/theme/themeColors';

import type { ContainerTableProps } from './ContainerTable.types';

function getStyles(theme: GrafanaTheme2): {
  row: string;
  name: string;
  image: string;
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
    name: css({ fontWeight: 600, flexShrink: 0 }),
    image: css({
      flex: 1,
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      color: colors.text.secondary,
      fontFamily: theme.typography.fontFamilyMonospace,
      fontSize: theme.typography.bodySmall.fontSize,
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

// One row per container: name + image, plus a URL button to that image's external
// detail page. The button is a plain pre-resolved link (right-click fired the lookup
// up front — D5): new tab via target=_blank + rel=noopener, never window.open, and
// it renders DISABLED (no href) while no URL is known — idle (no lookup ran),
// loading, lookup failed, or the container name missing from the returned map.
export function ContainerTable({
  containers,
  urlByContainer,
  loading,
  error,
}: Readonly<ContainerTableProps>): React.JSX.Element {
  const styles = useStyles2(getStyles);
  return (
    <div data-testid="container-table">
      {loading && (
        <div className={styles.status} data-testid="container-table-loading">
          <Spinner inline size="sm" /> Looking up image URLs…
        </div>
      )}
      {!loading && error !== undefined && (
        <div className={styles.error} data-testid="container-table-error">
          {error}
        </div>
      )}
      {containers.map((c) => {
        const url = urlByContainer?.[c.name];
        return (
          <div className={styles.row} key={`${c.name}/${c.image}`} data-testid="container-row">
            <span className={styles.name}>{c.name}</span>
            <span className={styles.image} title={c.image}>
              {c.image}
            </span>
            {url !== undefined ? (
              <LinkButton
                size="sm"
                fill="outline"
                variant="secondary"
                icon="external-link-alt"
                href={url}
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
          </div>
        );
      })}
    </div>
  );
}
