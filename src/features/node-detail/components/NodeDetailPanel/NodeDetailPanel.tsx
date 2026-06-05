import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { IconButton, useStyles2 } from '@grafana/ui';
import React from 'react';

import { STATUS_COLOR } from '../../../../shared/constants/colorByStatus';
import { AlertTable } from '../AlertTable';

import type { NodeDetailPanelProps } from './NodeDetailPanel.types';

function getStyles(theme: GrafanaTheme2): {
  root: string;
  header: string;
  title: string;
  badges: string;
  badge: string;
  statusBadge: string;
  section: string;
  sectionTitle: string;
  sectionBody: string;
} {
  const colors = theme.colors as unknown as {
    text: { primary: string; secondary: string };
    background: { secondary: string };
    border: { weak: string };
  };
  return {
    // Floating overlay docked to the bottom of the canvas (mirrors HoverTooltip's
    // absolute placement, but interactive: pointer-events on). The z-index MUST
    // exceed cytoscape's transparent input-catching canvas, which it paints at
    // z-index 999 in the SAME stacking context as this panel (the intervening
    // graph-canvas wrappers create no stacking context of their own). At a lower
    // z-index the 999 canvas sits on top of the (visible-but-transparent-behind)
    // panel and swallows every click as a background tap → the panel deselects
    // and closes the instant you touch it, so alert links can never be reached.
    root: css({
      position: 'absolute',
      left: 8,
      right: 8,
      bottom: 8,
      maxHeight: 220,
      overflowY: 'auto',
      background: colors.background.secondary,
      color: colors.text.primary,
      border: `1px solid ${colors.border.weak}`,
      borderRadius: 4,
      padding: '8px 10px',
      boxShadow: theme.shadows.z2,
      pointerEvents: 'auto',
      zIndex: 1000,
    }),
    header: css({ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }),
    title: css({
      fontWeight: 600,
      flex: 1,
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }),
    badges: css({ display: 'flex', gap: 4, flexShrink: 0 }),
    badge: css({
      fontSize: 10,
      fontWeight: 600,
      padding: '1px 6px',
      borderRadius: 10,
      background: colors.border.weak,
      color: colors.text.secondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    }),
    statusBadge: css({
      fontSize: 10,
      fontWeight: 600,
      padding: '1px 6px',
      borderRadius: 10,
      color: '#000',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    }),
    // Adjacent sections get a hairline divider above (matches the legend/tooltip).
    section: css({
      '& + &': {
        marginTop: 6,
        paddingTop: 6,
        borderTop: `1px solid ${colors.border.weak}`,
      },
    }),
    sectionTitle: css({
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.text.secondary,
      marginBottom: 2,
    }),
    // Empty for now — content is filled in later.
    sectionBody: css({ minHeight: 24 }),
  };
}

export function NodeDetailPanel({
  node,
  onClose,
  onAlertTimeClick,
  timeZone,
}: Readonly<NodeDetailPanelProps>): React.JSX.Element | null {
  const styles = useStyles2(getStyles);
  if (node === null) {
    return null;
  }
  return (
    <div className={styles.root} data-testid="node-detail-panel">
      <div className={styles.header}>
        <span className={styles.title}>{node.label}</span>
        <span className={styles.badges}>
          {node.kind !== undefined && (
            <span className={styles.badge} data-testid="node-detail-kind">
              {node.kind}
            </span>
          )}
          {node.status !== undefined && (
            <span
              className={styles.statusBadge}
              data-testid="node-detail-status"
              style={{ backgroundColor: STATUS_COLOR[node.status] }}
            >
              {node.status}
            </span>
          )}
        </span>
        <IconButton name="times" aria-label="Close detail panel" tooltip="Close detail panel" onClick={onClose} />
      </div>
      <div className={styles.section} data-testid="node-detail-section-alerts">
        <div className={styles.sectionTitle}>Alerts</div>
        <div className={styles.sectionBody}>
          <AlertTable
            alerts={node.alerts ?? []}
            onAlertTimeClick={onAlertTimeClick}
            {...(timeZone !== undefined ? { timeZone } : {})}
          />
        </div>
      </div>
    </div>
  );
}
