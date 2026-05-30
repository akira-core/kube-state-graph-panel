import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import React from 'react';

import { useHoverElement, type HoveredElement } from '../../hooks/useHoverElement';

import { HOVER_LABEL_WHITELIST, type HoverTooltipProps } from './HoverTooltip.types';

interface TooltipRow {
  key: string;
  value: string;
}

function getStyles(theme: GrafanaTheme2): { root: string; title: string; row: string; rowKey: string } {
  const colors = theme.colors as unknown as {
    text: { primary: string; secondary: string };
    background: { secondary: string };
    border: { weak: string };
  };
  return {
    root: css({
      position: 'absolute',
      top: 8,
      right: 8,
      width: 280,
      pointerEvents: 'none',
      background: colors.background.secondary,
      color: colors.text.primary,
      border: `1px solid ${colors.border.weak}`,
      borderRadius: 4,
      padding: '8px 10px',
      opacity: 0.92,
      fontSize: 12,
      lineHeight: 1.4,
      boxShadow: theme.shadows.z2,
      transition: 'opacity 150ms ease-in-out',
      zIndex: 10,
      overflow: 'hidden',
    }),
    title: css({
      fontWeight: 600,
      marginBottom: 4,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }),
    row: css({
      display: 'flex',
      gap: 4,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }),
    rowKey: css({
      color: colors.text.secondary,
      flexShrink: 0,
    }),
  };
}

function buildContent(hovered: HoveredElement): { title: string; rows: TooltipRow[] } {
  const { data, group } = hovered;
  if (group === 'nodes') {
    const labelRaw = data.label;
    const idRaw = data.id;
    const label = typeof labelRaw === 'string' ? labelRaw : typeof idRaw === 'string' ? idRaw : '';
    const rows: TooltipRow[] = [];
    if (typeof data.kind === 'string') {
      rows.push({ key: 'kind', value: data.kind });
    }
    if (typeof data.namespace === 'string') {
      rows.push({ key: 'namespace', value: data.namespace });
    }
    if (Array.isArray(data.ipAddress) && data.ipAddress.length > 0) {
      rows.push({ key: 'ipAddress', value: data.ipAddress.filter((ip) => typeof ip === 'string').join(', ') });
    }
    const labels = data.labels;
    if (labels !== null && typeof labels === 'object') {
      const labelMap = labels as Record<string, unknown>;
      for (const key of HOVER_LABEL_WHITELIST) {
        const value = labelMap[key];
        if (typeof value === 'string') {
          rows.push({ key, value });
        }
      }
    }
    return { title: label, rows };
  }

  const title = `${hovered.sourceLabel ?? ''} → ${hovered.targetLabel ?? ''}`;
  const rows: TooltipRow[] = [];
  if (typeof data.edgeType === 'string') {
    rows.push({ key: 'edgeType', value: data.edgeType });
  }
  const labels = data.labels;
  if (labels !== null && typeof labels === 'object') {
    for (const [key, value] of Object.entries(labels as Record<string, unknown>)) {
      if (typeof value === 'string') {
        rows.push({ key, value });
      }
    }
  }
  return { title, rows };
}

export function HoverTooltip(props: Readonly<HoverTooltipProps>): React.JSX.Element | null {
  const { cyRef, ready = false } = props;
  const styles = useStyles2(getStyles);
  const hovered = useHoverElement({ cyRef, ready });

  if (hovered === null) {
    return null;
  }

  const { title, rows } = buildContent(hovered);

  return (
    <div className={styles.root} data-testid="hover-tooltip" role="tooltip">
      <div className={styles.title}>{title}</div>
      {rows.map((row) => (
        <div key={row.key} className={styles.row}>
          <span className={styles.rowKey}>{row.key}:</span>
          <span>{row.value}</span>
        </div>
      ))}
    </div>
  );
}
