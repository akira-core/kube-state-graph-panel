import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import React, { useLayoutEffect, useRef, useState } from 'react';

import { themeColors } from '../../../../shared/theme/themeColors';
import { useHoverElement, type HoveredElement } from '../../hooks/useHoverElement';

import { type HoverTooltipProps } from './HoverTooltip.types';

interface TooltipRow {
  key: string;
  value: string;
}

// title + the structured attributes (kind/namespace/ipAddress, or edgeType) we
// promote, then the raw backend `labels` map below a divider. We do NOT filter
// labels here — the backend decides what to send (no panel-side whitelist).
interface TooltipContent {
  title: string;
  attrs: TooltipRow[];
  labels: TooltipRow[];
}

function getStyles(theme: GrafanaTheme2): {
  root: string;
  title: string;
  row: string;
  rowKey: string;
  labelRow: string;
  labelsHint: string;
} {
  const colors = themeColors(theme);
  return {
    // Floats next to the hovered element; left/top are set inline from the
    // element's rendered position (see HoverTooltip), clamped within the canvas.
    root: css({
      position: 'absolute',
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
      // Long label lists scroll within the box instead of overflowing the panel;
      // max-width/height are set inline from the viewport (see HoverTooltip).
      overflowY: 'auto',
      overflowX: 'hidden',
    }),
    title: css({
      fontWeight: 600,
      marginBottom: 4,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }),
    // Promoted attributes stay single-line (they are short and structured).
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
    // Label values can be long (k8s labels), so let them wrap instead of clip.
    labelRow: css({
      display: 'flex',
      gap: 4,
      overflowWrap: 'anywhere',
    }),
    // Hinted divider: a hairline + the word "labels" introducing the raw map.
    labelsHint: css({
      marginTop: 6,
      paddingTop: 6,
      borderTop: `1px solid ${colors.border.weak}`,
      color: colors.text.secondary,
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    }),
  };
}

// Every string entry of a labels map as rows, skipping keys already promoted to
// the attributes section (only `namespace` overlaps today).
function toLabelRows(labels: unknown, promoted: ReadonlySet<string>): TooltipRow[] {
  if (labels === null || typeof labels !== 'object') {
    return [];
  }
  const rows: TooltipRow[] = [];
  for (const [key, value] of Object.entries(labels as Record<string, unknown>)) {
    if (promoted.has(key)) {
      continue;
    }
    if (typeof value === 'string') {
      rows.push({ key, value });
    }
  }
  return rows;
}

const NODE_PROMOTED_LABELS: ReadonlySet<string> = new Set(['namespace']);
const EDGE_PROMOTED_LABELS: ReadonlySet<string> = new Set<string>();

function buildContent(hovered: HoveredElement): TooltipContent {
  const { data, group } = hovered;
  if (group === 'nodes') {
    const labelRaw = data.label;
    const idRaw = data.id;
    const title = typeof labelRaw === 'string' ? labelRaw : typeof idRaw === 'string' ? idRaw : '';
    const attrs: TooltipRow[] = [];
    if (typeof data.kind === 'string') {
      attrs.push({ key: 'kind', value: data.kind });
    }
    if (typeof data.namespace === 'string') {
      attrs.push({ key: 'namespace', value: data.namespace });
    }
    if (Array.isArray(data.ipAddress) && data.ipAddress.length > 0) {
      attrs.push({ key: 'ipAddress', value: data.ipAddress.filter((ip) => typeof ip === 'string').join(', ') });
    }
    return { title, attrs, labels: toLabelRows(data.labels, NODE_PROMOTED_LABELS) };
  }

  const title = `${hovered.sourceLabel ?? ''} → ${hovered.targetLabel ?? ''}`;
  const attrs: TooltipRow[] = [];
  if (typeof data.edgeType === 'string') {
    attrs.push({ key: 'edgeType', value: data.edgeType });
  }
  return { title, attrs, labels: toLabelRows(data.labels, EDGE_PROMOTED_LABELS) };
}

// Gap between the hovered element's anchor and the tooltip box, and the minimum
// distance kept from the canvas edges when clamping.
const TOOLTIP_OFFSET = 14;
const EDGE_MARGIN = 4;
// Safe fallback (top-left-ish) when no rendered position is available.
const FALLBACK_COORDS = { left: EDGE_MARGIN, top: EDGE_MARGIN };

export function HoverTooltip(props: Readonly<HoverTooltipProps>): React.JSX.Element | null {
  const { cyRef, ready = false } = props;
  const styles = useStyles2(getStyles);
  const hovered = useHoverElement({ cyRef, ready });
  const ref = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number }>(FALLBACK_COORDS);

  // After layout, place the box beside the anchor and clamp/flip it inside the
  // canvas. useLayoutEffect runs before paint, so the corrected position shows
  // on the first visible frame (no flash at the fallback corner).
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null || hovered === null || hovered.position === undefined) {
      setCoords(FALLBACK_COORDS);
      return;
    }
    const { position } = hovered;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = hovered.viewport?.width ?? position.x + w + TOOLTIP_OFFSET + EDGE_MARGIN;
    const vh = hovered.viewport?.height ?? position.y + h + TOOLTIP_OFFSET + EDGE_MARGIN;

    let left = position.x + TOOLTIP_OFFSET;
    if (left + w > vw - EDGE_MARGIN) {
      left = position.x - TOOLTIP_OFFSET - w; // flip to the element's left
    }
    left = Math.max(EDGE_MARGIN, Math.min(left, vw - w - EDGE_MARGIN));

    let top = position.y + TOOLTIP_OFFSET;
    if (top + h > vh - EDGE_MARGIN) {
      top = position.y - TOOLTIP_OFFSET - h; // flip above the element
    }
    top = Math.max(EDGE_MARGIN, Math.min(top, vh - h - EDGE_MARGIN));

    setCoords({ left, top });
  }, [hovered]);

  if (hovered === null) {
    return null;
  }

  const { title, attrs, labels } = buildContent(hovered);

  // Cap the box to the canvas so an oversized tooltip (many label rows, or a
  // panel narrower/shorter than the box) scrolls within bounds instead of
  // spilling over the panel edge.
  const vp = hovered.viewport;
  const sizeStyle =
    vp !== undefined
      ? { maxWidth: Math.max(0, vp.width - 2 * EDGE_MARGIN), maxHeight: Math.max(0, vp.height - 2 * EDGE_MARGIN) }
      : {};

  return (
    <div
      ref={ref}
      className={styles.root}
      style={{ left: coords.left, top: coords.top, ...sizeStyle }}
      data-testid="hover-tooltip"
      role="tooltip"
    >
      <div className={styles.title}>{title}</div>
      {attrs.map((row) => (
        <div key={row.key} className={styles.row}>
          <span className={styles.rowKey}>{row.key}:</span>
          <span>{row.value}</span>
        </div>
      ))}
      {labels.length > 0 && (
        <div className={styles.labelsHint} data-testid="hover-tooltip-labels-divider">
          labels
        </div>
      )}
      {labels.map((row) => (
        <div key={row.key} className={styles.labelRow}>
          <span className={styles.rowKey}>{row.key}:</span>
          <span>{row.value}</span>
        </div>
      ))}
    </div>
  );
}
