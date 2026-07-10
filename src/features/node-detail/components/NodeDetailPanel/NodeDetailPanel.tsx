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
      maxHeight: '50%',
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
    // THE single scroll authority under the pinned header. flex:1 + minHeight:0 give it a
    // definite height capped by root's 50%; overflowY:auto then scrolls the WHOLE
    // section stack once content exceeds the cap (≤cap → no scrollbar). overflowX is hidden
    // so a wide table never slides the panel sideways. The unified panel stacks several
    // content-height sections (Application + Containers + Alerts); a per-section
    // internal scroll would create competing scroll regions that overlap and clip — one body
    // scroller is the only model that composes. The section divider lives HERE as a
    // parent-scoped `& > div + div` rule, NOT on the section class as `& + &`:
    // `cx(styles.section, …)` merges the emotion classes, so the `section` class the
    // `&` selector targets is gone after composition and the rule never matches.
    // `body` is applied alone (no cx), so `&` resolves.
    body: css({
      flex: '1 1 auto',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflowX: 'hidden',
      overflowY: 'auto',
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
    // Containers / Alerts: content-height blocks, like every other section. They MUST NOT
    // fill/own-scroll — the body (overflowY:auto) is the single scroll authority, so two
    // tall sections simply stack and the body scrolls their sum. (Pre-unification this was
    // `flex:1 1 auto` + an inner slot scroll, safe only because the old view split rendered
    // at most one fill section; two such siblings overlapped and neither scrolled.)
    sectionFill: css({ flex: '0 0 auto' }),
    sectionTitle: css({
      flexShrink: 0,
      fontSize: 13,
      fontWeight: 600,
      letterSpacing: 0.6,
      color: colors.text.secondary,
      paddingBottom: 6,
    }),
    // Table area (Containers / Alerts) — a plain content-height wrapper now. The body is the
    // single scroll authority, so this neither fills nor owns a scroll. No sticky thead (per-
    // table sticky cannot compose under one shared scroller — every thead would resolve to the
    // body and pin at top:0, overlapping). InteractiveTable keeps its own `overflowX:auto`
    // wrapper, so a wide table scrolls horizontally inside its own row (body overflowX:hidden
    // stops the whole panel sliding).
    slot: css({
      minHeight: 24,
      fontSize: theme.typography.bodySmall.fontSize,
    }),
    staticBody: css({ minHeight: 24, fontSize: theme.typography.bodySmall.fontSize }),
  };
}

export function NodeDetailPanel({
  node,
  onClose,
  onAlertTimeClick,
  timeZone,
  lookups,
  dashboard,
}: Readonly<NodeDetailPanelProps>): React.JSX.Element | null {
  const styles = useStyles2(getStyles);
  if (node === null) {
    return null;
  }
  // Single unified panel (no view split): every section is data-gated. lookups defaults
  // to idle/disabled (every Change Report target shows the muted "Not found" hint, no
  // prefetch). Change-report Application/Containers stay gated on workload kind + data.
  const lookupsState = lookups ?? IDLE_NODE_DETAIL_LOOKUPS;
  const isDetailUrlKind = node.kind !== undefined && DETAIL_URL_KINDS.has(node.kind);
  // Application change-report shows for ANY node carrying an ArgoCD application — including
  // service / pvc leaves that belong to an app (their config_changes / Deployment Changes).
  // Containers stay workload-only (a service / pvc has no containers).
  const showApplication = node.application !== undefined;
  const showContainers = isDetailUrlKind && node.containers !== undefined && node.containers.length > 0;
  // Alerts: data-gated. Empty / absent → the section is not rendered at all (no "No alerts").
  const alerts = node.alerts ?? [];
  const showAlerts = alerts.length > 0;
  // The panel ALWAYS renders for a selected (detail-eligible) node: the header — node name,
  // kind / status badges, and the Dashboard button when the backend returns a URL — is the
  // minimum. Body sections (Application / Containers / Alerts) are data-gated; the node's
  // promoted attributes live in the pinned top-right tooltip, not here.
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
        {showAlerts && (
          <div className={cx(styles.section, styles.sectionFill)} data-testid="node-detail-section-alerts">
            <div className={styles.sectionTitle}>Alerts</div>
            <div className={styles.slot}>
              <AlertTable
                alerts={alerts}
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
