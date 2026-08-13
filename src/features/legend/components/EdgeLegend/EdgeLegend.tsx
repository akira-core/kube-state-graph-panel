import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import React from 'react';

import {
  EDGE_ENDPOINTS_BY_TYPE,
  EDGE_STYLE_BY_TYPE,
  NETWORK_HOP_LEGEND_DASH_PATTERN,
  type LineStyle,
} from '../../../../shared/constants/colorByEdgeType';
import { drawnEdgeTypesForMode } from '../../../../shared/constants/drawnEdgeTypesForMode';
import type { EdgeType, NodeKind } from '../../../../shared/constants/types';
import { legendListStyles } from '../../legendStyles';
import { EdgeGlyph } from '../EdgeGlyph';

function getStyles(): { list: string; row: string; glyph: string; noteRow: string; note: string } {
  const { list, row } = legendListStyles();
  return {
    list,
    row,
    glyph: css({ display: 'inline-flex', width: 30, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }),
    // A qualified row stacks: the usual `<from> glyph <to>` line, then its qualifier
    // underneath. Inline would not fit — `pod ↔ pod/service` already fills the rail's
    // width, so the note wrapped to three clipped lines.
    noteRow: css({ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, padding: '2px 0' }),
    note: css({ fontSize: 11, opacity: 0.7 }),
  };
}

// Short display labels for the edge-legend endpoints. Only `service` is
// abbreviated; every other kind reads fine at full length.
function kindLabel(kind: NodeKind): string {
  return kind === 'service' ? 'svc' : kind;
}

// Edge types OMITTED from the legend because another row stands in for them (same
// canvas colour, not a distinct relationship):
//  - pod↔service (pod-calls-service / service-selects-pod): a pod calls a Service which
//    selects pods — an extra hop, covered by the single `pod ↔ pod/service` row.
//  - node-to-switch: a sibling fabric edge (same colour as switch-to-switch), folded
//    into the merged `switch/node → switch` row.
// (All are still drawn on canvas in both pod-parent modes.)
const OMITTED_FROM_LEGEND: ReadonlySet<EdgeType> = new Set([
  'pod-calls-service',
  'service-selects-pod',
  'node-to-switch',
]);

interface EdgeRow {
  key: string;
  color: string;
  lineStyle: LineStyle;
  fromLabel: string;
  toLabel: string;
  bidirectional: boolean;
  // Set only on the network-hop variant row (see NETWORK_HOP_ROW).
  dashPattern?: string;
  note?: string;
}

// The dashed VARIANT of the `pod ↔ pod/service` row. Dashing is a per-edge overlay, not a
// property of any edge type — but every edge that can carry it (ingressPath requires
// isTrafficEdgeType; the backend only labels service-graph edges with `relation`) is one of
// the three traffic types this single row already stands in for. So it belongs here, one
// line under its solid sibling: the reader gets the solid/dashed contrast structurally
// instead of having to be told it in prose. Colour is read from the same source the canvas
// rules use, so the key cannot describe a stroke that never appears; the dash rhythm is the
// legend-scaled one (NETWORK_HOP_LEGEND_DASH_PATTERN) because the canvas rhythm fits barely
// one dash inside this row's 14-unit bidirectional glyph.
const NETWORK_HOP_ROW: EdgeRow = {
  key: 'network-hop',
  color: EDGE_STYLE_BY_TYPE['pod-calls-pod'].color,
  lineStyle: 'dashed',
  dashPattern: NETWORK_HOP_LEGEND_DASH_PATTERN.join(' '),
  fromLabel: 'pod',
  toLabel: 'pod/service',
  bidirectional: true,
  note: 'via gateway / broker',
};

function buildRows(types: readonly EdgeType[]): EdgeRow[] {
  return types.map((edgeType) => {
    const style = EDGE_STYLE_BY_TYPE[edgeType];
    const { from, to } = EDGE_ENDPOINTS_BY_TYPE[edgeType];
    // The single pod-calls-pod row stands in for the omitted pod↔service pair
    // (same colour on canvas), so it reads `pod ↔ pod/service` with a bidirectional
    // glyph rather than a one-way `pod → pod`.
    const merged = edgeType === 'pod-calls-pod';
    // switch-to-switch stands in for the omitted node-to-switch too (same fabric colour),
    // so it reads `switch/node → switch` rather than `switch → switch`.
    const fabricMerged = edgeType === 'switch-to-switch';
    return {
      key: edgeType,
      color: style.color,
      lineStyle: style.lineStyle,
      fromLabel: fabricMerged ? 'switch/node' : kindLabel(from),
      toLabel: merged ? 'pod/service' : kindLabel(to),
      bidirectional: merged,
    };
  });
}

export interface EdgeLegendProps {
  // The edge types to list. Pass the types actually present in the graph (like
  // the cluster legend) to show only what's drawn. Omit to list every edge type
  // drawn in the default (node) mode (e.g. in isolated rendering/tests).
  edgeTypes?: readonly EdgeType[];
  // Whether the graph actually contains a dashed edge (an ingress-path hop or a
  // `relation: transport` edge). Gated like edgeTypes: a key for a stroke that does not
  // appear on this graph explains nothing. Cannot be derived from edgeTypes — dashing is
  // per-edge, so the caller has to look at the elements (see KsgPanel).
  hasNetworkHop?: boolean;
}

export function EdgeLegend({
  edgeTypes,
  hasNetworkHop = false,
}: Readonly<EdgeLegendProps> = {}): React.JSX.Element | null {
  const styles = useStyles2(getStyles);
  // Only known edge types can be rendered (the endpoint/style maps key off them);
  // an unknown type present in the data is drawn on-canvas via the fallback style
  // but omitted from the legend. OMITTED_FROM_LEGEND types are also dropped — each is
  // folded into another row (pod↔service → `pod ↔ pod/service`; node-to-switch →
  // the merged `switch/node → switch` row).
  const types = (edgeTypes ?? drawnEdgeTypesForMode('node')).filter(
    (t) => t in EDGE_STYLE_BY_TYPE && !OMITTED_FROM_LEGEND.has(t)
  );
  const rows = buildRows(types);
  if (hasNetworkHop) {
    // Directly under the solid row it varies, so the contrast reads without prose. If that
    // row is absent (only the omitted pod↔svc types are present), fall back to appending —
    // an unanchored key still beats an unexplained stroke.
    const anchor = rows.findIndex((r) => r.key === 'pod-calls-pod');
    rows.splice(anchor === -1 ? rows.length : anchor + 1, 0, NETWORK_HOP_ROW);
  }
  // Mirror ClusterLegend: nothing to show → render nothing.
  if (rows.length === 0) {
    return null;
  }
  return (
    <div data-testid="edge-legend">
      <h4>Edge Types</h4>
      <ul className={styles.list}>
        {rows.map(({ key, color, lineStyle, fromLabel, toLabel, bidirectional, dashPattern, note }) => {
          const endpoints = (
            <>
              <span>{fromLabel}</span>
              <span className={styles.glyph}>
                <EdgeGlyph
                  color={color}
                  lineStyle={lineStyle}
                  bidirectional={bidirectional}
                  {...(dashPattern !== undefined ? { dashPattern } : {})}
                />
              </span>
              <span>{toLabel}</span>
            </>
          );
          return note === undefined ? (
            <li key={key} className={styles.row} data-testid={`edge-legend-row-${key}`} style={{ color }}>
              {endpoints}
            </li>
          ) : (
            <li key={key} className={styles.noteRow} data-testid={`edge-legend-row-${key}`} style={{ color }}>
              <span className={styles.row}>{endpoints}</span>
              <span className={styles.note}>{note}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
