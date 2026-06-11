import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { IconButton, useStyles2 } from '@grafana/ui';
import React from 'react';

import { STATUS_COLOR } from '../../../../shared/constants/colorByStatus';
import { themeColors } from '../../../../shared/theme/themeColors';
import { DETAIL_URL_KINDS } from '../../detailUrlKinds';
import { IDLE_NODE_DETAIL_URLS } from '../../hooks/useNodeDetailUrls';
import { AlertTable } from '../AlertTable';
import { ApplicationTable } from '../ApplicationTable';
import { ContainerTable } from '../ContainerTable';

import type { NodeDetailPanelProps } from './NodeDetailPanel.types';

function getStyles(theme: GrafanaTheme2): {
  root: string;
  header: string;
  scroll: string;
  title: string;
  badges: string;
  badge: string;
  statusBadge: string;
  section: string;
  sectionTitle: string;
  sectionBody: string;
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
    // pinned, only the inner `scroll` body overflows. So a long alert list scrolls
    // WITHOUT carrying the title + close button out of view.
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
    // The only scrolling region: takes the remaining height under the pinned header
    // (flex:1 + minHeight:0 lets it shrink below content size so overflow kicks in).
    scroll: css({ flex: 1, minHeight: 0, overflowY: 'auto' }),
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
    // Adjacent sections separate with a divider DISTINCT from the header's thin
    // rule: a thicker strong-colour bar plus breathing room on both sides, so
    // the boundary between two tables cannot be mistaken for a table row line.
    section: css({
      '& + &': {
        marginTop: 12,
        paddingTop: 10,
        borderTop: `2px solid ${colors.border.strong}`,
      },
    }),
    // Section titles stick to the top of the scroll body, so the "Alerts" label
    // stays visible while its rows scroll under it (the opaque background hides the
    // rows passing behind). With multiple sections each title pins in turn.
    // Titles outrank the table text below them: 13px uppercase vs the body's
    // bodySmall (set on sectionBody) — the old 10px label read SMALLER than the
    // table content, inverting the visual hierarchy.
    sectionTitle: css({
      position: 'sticky',
      top: 0,
      zIndex: 1,
      background: colors.background.secondary,
      fontSize: 13,
      fontWeight: 600,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.text.secondary,
      paddingBottom: 6,
    }),
    // Table content renders one step below the section titles (bodySmall —
    // InteractiveTable cells inherit), keeping the title > body size hierarchy.
    sectionBody: css({ minHeight: 24, fontSize: theme.typography.bodySmall.fontSize }),
  };
}

export function NodeDetailPanel({
  node,
  onClose,
  onAlertTimeClick,
  timeZone,
  urls,
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
  // them, even with stray data) AND the node actually carrying that field. urls
  // defaults to idle: sections render their data with the URL buttons disabled
  // (design D5).
  const urlsState = urls ?? IDLE_NODE_DETAIL_URLS;
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
      <div className={styles.scroll} data-testid="node-detail-scroll">
        {showApplication && node.application !== undefined && (
          <div className={styles.section} data-testid="node-detail-section-application">
            <div className={styles.sectionTitle}>Application</div>
            <div className={styles.sectionBody}>
              <ApplicationTable
                application={node.application}
                url={urlsState.applicationUrl}
                loading={urlsState.loading}
                error={urlsState.applicationError}
              />
            </div>
          </div>
        )}
        {showContainers && node.containers !== undefined && (
          <div className={styles.section} data-testid="node-detail-section-containers">
            <div className={styles.sectionTitle}>Containers</div>
            <div className={styles.sectionBody}>
              <ContainerTable
                containers={node.containers}
                urlByContainer={urlsState.urlByContainer}
                loading={urlsState.loading}
                error={urlsState.containersError}
              />
            </div>
          </div>
        )}
        {view === 'alerts' && (
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
        )}
      </div>
    </div>
  );
}
