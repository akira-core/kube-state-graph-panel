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
    // Floating overlay docked to the bottom of the canvas (mirrors HoverTooltip's
    // absolute placement, but interactive: pointer-events on). The z-index MUST
    // exceed cytoscape's transparent input-catching canvas, which it paints at
    // z-index 999 in the SAME stacking context as this panel (the intervening
    // graph-canvas wrappers create no stacking context of their own). At a lower
    // z-index the 999 canvas sits on top of the (visible-but-transparent-behind)
    // panel and swallows every click as a background tap → the panel deselects
    // and closes the instant you touch it, so alert links can never be reached.
    //
    // The panel is a flex column capped at maxHeight: the header is flex-none and
    // pinned, the body below fills the rest WITHOUT scrolling itself. The Application
    // section is fixed-height (pinned); the Containers/Alerts section fills the
    // remaining space and scrolls INSIDE its own table area, so the Application table
    // never scrolls along with it and the title + close button stay in view.
    root: css({
      position: 'absolute',
      left: 8,
      right: 8,
      bottom: 8,
      // Grow with content; scroll only once the panel would cover half the
      // canvas (capped absolutely for very tall panels).
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
    // The title row (the node / controller name) closes with its own divider —
    // SAME style as the between-sections bar so all major boundaries read alike,
    // with a symmetric 10px above and below the line (matching the section
    // divider's line-to-title gap; both views share this header).
    header: css({
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      paddingBottom: 10,
      marginBottom: 10,
      borderBottom: `2px solid ${colors.border.strong}`,
      flexShrink: 0,
    }),
    // The non-scrolling flex column under the pinned header (flex:1 + minHeight:0 lets
    // it shrink so its filling child can take over the scroll). Itself never scrolls,
    // so the fixed Application section above the Containers list never moves.
    //
    // The divider between stacked sections (Application → Containers) lives HERE as a
    // parent-scoped `& > div + div` rule — a 2px strong-colour bar with breathing room,
    // identical to the header divider, on every section after the first. This mirrors
    // the legend's pattern (KsgPanel) and is self-maintaining for any number of
    // sections. It must NOT live on the section class as `& + &`: `cx(styles.section, …)`
    // composes emotion styles into one merged class, so the literal `section` class the
    // `&` selector targets is gone after composition and the rule never matches (the
    // divider silently never renders). `body` is applied alone (no cx), so `&` resolves.
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
    // Each section is its own flex column (title above its table area). The divider
    // between stacked sections is a parent-scoped rule on `body` (above), not a
    // per-section class — that survives emotion `cx` composition and needs no per-child flag.
    section: css({ display: 'flex', flexDirection: 'column' }),
    // Application: fixed to its content height (always a single row — a pod/controller
    // maps to at most one ArgoCD app), so it stays PINNED and never scrolls with the
    // Containers list below it.
    sectionFixed: css({ flex: '0 0 auto' }),
    // Containers / Alerts: fill the height left under the fixed Application + header,
    // and scroll INSIDE their table area. flex-basis auto (NOT 0) + minHeight:0 is
    // deliberate — basis 0 collapses to nothing under the panel's maxHeight (its
    // height is indefinite until clamped), which made the table vanish; basis auto
    // sizes to content, then shrinks-and-scrolls only once the panel hits its cap.
    sectionFill: css({ flex: '1 1 auto', minHeight: 0 }),
    // Section title: fixed above its table area, so it stays put while the table's
    // rows scroll under it. Capitalised, NOT uppercased: a heading, not a shouty tag.
    sectionTitle: css({
      flexShrink: 0,
      fontSize: 13,
      fontWeight: 600,
      letterSpacing: 0.6,
      color: colors.text.secondary,
      paddingBottom: 6,
    }),
    // The scrolling table area (Containers / Alerts). ONLY the tbody rows scroll:
    //  • flex 1 1 auto + minHeight:0 lets it shrink below content so overflowY here
    //    (not the body) handles the scroll — keeping the Application section pinned.
    //  • `& thead th` sticky pins the InteractiveTable column header to the top of
    //    THIS scroll area so it never scrolls out of view.
    //  • InteractiveTable wraps its <table> in a div with `overflowX: auto`, which
    //    would otherwise be the scroll context that traps the sticky header. We set
    //    that inner container's horizontal overflow back to visible so the sticky
    //    header resolves to this area instead. ContainerTable nests the table one
    //    level deeper than AlertTable, hence both `& > div` and `& > div > div`.
    //    (Image / alert-name columns wrap, so no horizontal scroll is lost.)
    slot: css({
      flex: '1 1 auto',
      minHeight: 24,
      overflowY: 'auto',
      fontSize: theme.typography.bodySmall.fontSize,
      '& > div, & > div > div': { overflowX: 'visible' },
      '& thead th': { position: 'sticky', top: 0, zIndex: 1, background: colors.background.secondary },
    }),
    // The Application table area never scrolls: always a single row (see sectionFixed).
    staticBody: css({ minHeight: 24, fontSize: theme.typography.bodySmall.fontSize }),
  };
}

export function NodeDetailPanel({
  node,
  onClose,
  onAlertTimeClick,
  timeZone,
  lookups,
  view = 'alerts',
}: Readonly<NodeDetailPanelProps>): React.JSX.Element | null {
  const styles = useStyles2(getStyles);
  if (node === null) {
    return null;
  }
  // The two click paths render disjoint sections: 'alerts' (left-click) shows
  // the Alerts table only; 'detail' (right-click) shows Application/Containers
  // only. Within the detail view the sections gate twice, independently: kind ∈
  // DETAIL_URL_KINDS (pod + workload controllers — every other kind never shows
  // them, even with stray data) AND the node actually carrying that field.
  // lookups defaults to idle/disabled: sections render their data with every
  // Change Report target as the muted "No change report" hint (no endpoint /
  // left-click selection — no prefetch fired).
  const lookupsState = lookups ?? IDLE_NODE_DETAIL_LOOKUPS;
  const isDetailUrlKind = node.kind !== undefined && DETAIL_URL_KINDS.has(node.kind);
  const showApplication = view === 'detail' && isDetailUrlKind && node.application !== undefined;
  const showContainers =
    view === 'detail' && isDetailUrlKind && node.containers !== undefined && node.containers.length > 0;
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
      <div className={styles.body} data-testid="node-detail-scroll">
        {showApplication && node.application !== undefined && (
          <div className={cx(styles.section, styles.sectionFixed)} data-testid="node-detail-section-application">
            <div className={styles.sectionTitle}>Application</div>
            <div className={styles.staticBody}>
              <ApplicationTable application={node.application} state={lookupsState.application} />
            </div>
          </div>
        )}
        {showContainers && node.containers !== undefined && (
          <div className={cx(styles.section, styles.sectionFill)} data-testid="node-detail-section-containers">
            <div className={styles.sectionTitle}>Containers</div>
            <div className={styles.slot}>
              <ContainerTable containers={node.containers} lookups={lookupsState.containers} />
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
