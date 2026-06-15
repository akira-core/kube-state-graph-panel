import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { Icon, Spinner, useStyles2 } from '@grafana/ui';
import React from 'react';

import { themeColors } from '../../../../shared/theme/themeColors';

import type { ChangeReportCellProps } from './ChangeReportCell.types';

function getStyles(theme: GrafanaTheme2): { urlCell: string; pending: string; link: string; unavailable: string } {
  const colors = themeColors(theme);
  return {
    // flex-end pins the content to the column's right edge so the Application and
    // Containers sections' Change Report columns line up — and stay put across the
    // loading / ready / unavailable states (spinner, anchor, hint of differing widths).
    urlCell: css({ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }),
    pending: css({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      color: colors.text.secondary,
      fontSize: theme.typography.bodySmall.fontSize,
      whiteSpace: 'nowrap',
    }),
    // The success state is a REAL anchor (URL pre-resolved by the eager prefetch): a
    // normal user-gesture navigation — no window.open, so no blank-tab/popup issues,
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
    // reads as "no change report", not "broken". Long messages truncate with the full
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

// The Change Report cell shared by ApplicationTable and ContainerTable (D8 keeps both
// sections' columns identical). Renders one eager-prefetched DetailLookup as exactly
// one of three states, pinned to the column's right edge: loading (Spinner), ready (a
// real <a href> anchor), or unavailable (a muted "No change report" hint with the full
// error in title). testids are `${idPrefix}-url-pending|link|unavailable`.
export function ChangeReportCell({ state, idPrefix }: Readonly<ChangeReportCellProps>): React.JSX.Element {
  const styles = useStyles2(getStyles);
  return (
    <div className={styles.urlCell}>
      {state.status === 'loading' && (
        <span className={styles.pending} data-testid={`${idPrefix}-url-pending`}>
          <Spinner inline size="sm" /> Looking up…
        </span>
      )}
      {state.status === 'ready' && (
        <a
          className={styles.link}
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`${idPrefix}-url-link`}
        >
          <Icon name="external-link-alt" /> URL
        </a>
      )}
      {state.status === 'unavailable' && (
        <span
          className={styles.unavailable}
          data-testid={`${idPrefix}-url-unavailable`}
          {...(state.error !== undefined ? { title: state.error } : {})}
        >
          No change report
        </span>
      )}
    </div>
  );
}
