import { css, cx } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { IconButton, useStyles2 } from '@grafana/ui';
import React from 'react';

import { STATUS_COLOR } from '../../../../shared/constants/colorByStatus';
import { themeColors } from '../../../../shared/theme/themeColors';
import { DETAIL_URL_KINDS } from '../../detailUrlKinds';
import { IDLE_NODE_DETAIL_LOOKUPS } from '../../hooks/useNodeDetailUrls';
import { AlertTable } from '../AlertTable';
import { ApplicationTable } from '../ApplicationTable';
import { ContainerTable } from '../ContainerTable';
import { DashboardButton } from '../DashboardButton';

import type { NodeDetailPanelProps } from './NodeDetailPanel.types';

function getStyles(theme: GrafanaTheme2): {
  root: string;
  header: string;
  body: string;
  title: string;
  badges: string;
  badge: string;
  statusBadge: string;
  section: string;
  sectionFixed: string;
  sectionFill: string;
  sectionTitle: string;
  slot: string;
  staticBody: string;
  kvRow: string;
  kvKey: string;
  kvVal: string;
} {
  const colors = themeColors(theme);
  return {
    // Interactive bottom-docked overlay. z-index MUST exceed cytoscape's transparent
    // input-catching canvas (painted at 999 in this SAME stacking context — the
    // graph-canvas wrappers create none) or the canvas swallows every click as a
    // background tap and the panel deselects/closes before any link is reachable.
    root: css({
      position: 'absolute',
      left: 8,
      right: 8,
      bottom: 8,
      maxHeight: 'min(50%, 380px)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: colors.background.secondary,
      color: colors.text.primary,
      border: `1px solid ${colors.border.weak}`,
      borderRadius: 4,
      padding: '8px 10px',
      boxShadow: theme.shadows.z2,
      pointerEvents: 'auto',
      zIndex: 1000,
    }),
    // Title row divider matches the between-sections bar so all boundaries read alike.
    header: css({
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      paddingBottom: 10,
      marginBottom: 10,
      borderBottom: `2px solid ${colors.border.strong}`,
      flexShrink: 0,
    }),
    // Non-scrolling flex column under the pinned header (flex:1 + minHeight:0 so its
    // filling child takes over the scroll). The section divider lives HERE as a
    // parent-scoped `& > div + div` rule, NOT on the section class as `& + &`:
    // `cx(styles.section, …)` merges the emotion classes, so the `section` class the
    // `&` selector targets is gone after composition and the rule never matches.
    // `body` is applied alone (no cx), so `&` resolves.
    body: css({
      flex: '1 1 auto',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      '& > div + div': {
        marginTop: 12,
        paddingTop: 10,
        borderTop: `2px solid ${colors.border.strong}`,
      },
    }),
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
    section: css({ display: 'flex', flexDirection: 'column' }),
    // Application: pinned at content height (always a single row — at most one ArgoCD app).
    sectionFixed: css({ flex: '0 0 auto' }),
    // Containers / Alerts: fill remaining height and scroll inside their table area.
    // flex-basis auto (NOT 0) is deliberate — basis 0 collapses to nothing under the
    // panel's indefinite maxHeight and the table vanishes; auto sizes to content then
    // shrinks-and-scrolls only once the panel hits its cap.
    sectionFill: css({ flex: '1 1 auto', minHeight: 0 }),
    sectionTitle: css({
      flexShrink: 0,
      fontSize: 13,
      fontWeight: 600,
      letterSpacing: 0.6,
      color: colors.text.secondary,
      paddingBottom: 6,
    }),
    // Scrolling table area (Containers / Alerts) — only the tbody rows scroll. Sticky
    // thead pins the column header here. InteractiveTable wraps its <table> in a div
    // with `overflowX: auto` that would trap the sticky header; we reset that inner
    // overflow to visible so the header resolves to this area. ContainerTable nests one
    // level deeper than AlertTable, hence both `& > div` and `& > div > div`.
    slot: css({
      flex: '1 1 auto',
      minHeight: 24,
      overflowY: 'auto',
      fontSize: theme.typography.bodySmall.fontSize,
      '& > div, & > div > div': { overflowX: 'visible' },
      '& thead th': { position: 'sticky', top: 0, zIndex: 1, background: colors.background.secondary },
    }),
    staticBody: css({ minHeight: 24, fontSize: theme.typography.bodySmall.fontSize }),
    // Storage Class key/value rows: a label column + a value that wraps (provisioner
    // strings and selector parameters can be long).
    kvRow: css({
      display: 'flex',
      gap: 8,
      padding: '2px 0',
      fontSize: theme.typography.bodySmall.fontSize,
    }),
    kvKey: css({
      flex: '0 0 38%',
      color: colors.text.secondary,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }),
    kvVal: css({ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }),
  };
}

export function NodeDetailPanel({
  node,
  onClose,
  onAlertTimeClick,
  timeZone,
  lookups,
  dashboard,
  view = 'alerts',
}: Readonly<NodeDetailPanelProps>): React.JSX.Element | null {
  const styles = useStyles2(getStyles);
  if (node === null) {
    return null;
  }
  // Disjoint views: 'alerts' (left-click) shows Alerts only; 'detail' (right-click)
  // shows Application/Containers, each gated on kind ∈ DETAIL_URL_KINDS AND the field
  // being present. lookups defaults to idle/disabled (every Change Report target shows
  // the muted "Not found" hint, no prefetch).
  const lookupsState = lookups ?? IDLE_NODE_DETAIL_LOOKUPS;
  const isDetailUrlKind = node.kind !== undefined && DETAIL_URL_KINDS.has(node.kind);
  const showApplication = view === 'detail' && isDetailUrlKind && node.application !== undefined;
  const showContainers =
    view === 'detail' && isDetailUrlKind && node.containers !== undefined && node.containers.length > 0;
  // Storage Class section (backend D6 storageclass leaf): provisioner row + the
  // provisioner-dependent parameters map rendered generically (keys never hard-coded).
  // Shown in BOTH views (it is intrinsic node info), only when kind === 'storageclass'
  // AND there is at least one value to show — a bare storageclass shows no empty section.
  const parameterEntries = node.kind === 'storageclass' && node.parameters !== undefined ? Object.entries(node.parameters) : [];
  const showStorageClass =
    node.kind === 'storageclass' && (node.provisioner !== undefined || parameterEntries.length > 0);
  return (
    <div className={styles.root} data-testid="node-detail-panel">
      <div className={styles.header}>
        <span className={styles.title}>{node.label}</span>
        {dashboard !== undefined && <DashboardButton state={dashboard} />}
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
      <div className={styles.body} data-testid="node-detail-scroll">
        {showStorageClass && (
          <div className={cx(styles.section, styles.sectionFixed)} data-testid="node-detail-section-storageclass">
            <div className={styles.sectionTitle}>Storage Class</div>
            <div className={styles.staticBody}>
              {node.provisioner !== undefined && (
                <div className={styles.kvRow} data-testid="node-detail-sc-provisioner">
                  <span className={styles.kvKey}>provisioner</span>
                  <span className={styles.kvVal}>{node.provisioner}</span>
                </div>
              )}
              {parameterEntries.map(([k, v]) => (
                <div key={k} className={styles.kvRow} data-testid={`node-detail-sc-param-${k}`}>
                  <span className={styles.kvKey}>{k}</span>
                  <span className={styles.kvVal}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {showApplication && node.application !== undefined && (
          <div className={cx(styles.section, styles.sectionFixed)} data-testid="node-detail-section-application">
            <div className={styles.sectionTitle}>Application</div>
            <div className={styles.staticBody}>
              <ApplicationTable
                application={node.application}
                state={lookupsState.application}
                {...(timeZone !== undefined ? { timeZone } : {})}
              />
            </div>
          </div>
        )}
        {showContainers && node.containers !== undefined && (
          <div className={cx(styles.section, styles.sectionFill)} data-testid="node-detail-section-containers">
            <div className={styles.sectionTitle}>Containers</div>
            <div className={styles.slot}>
              <ContainerTable
                containers={node.containers}
                lookups={lookupsState.containers}
                {...(timeZone !== undefined ? { timeZone } : {})}
              />
            </div>
          </div>
        )}
        {view === 'alerts' && (
          <div className={cx(styles.section, styles.sectionFill)} data-testid="node-detail-section-alerts">
            <div className={styles.sectionTitle}>Alerts</div>
            <div className={styles.slot}>
              <AlertTable
                alerts={node.alerts ?? []}
                onAlertTimeClick={onAlertTimeClick}
                {...(timeZone !== undefined ? { timeZone } : {})}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
