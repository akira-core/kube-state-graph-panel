import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import React from 'react';

import {
  EDGE_ENDPOINTS_BY_TYPE,
  EDGE_STYLE_BY_TYPE,
  type LineStyle,
} from '../../../../shared/constants/colorByEdgeType';
import { drawnEdgeTypesForMode } from '../../../../shared/constants/drawnEdgeTypesForMode';
import type { EdgeType, NodeKind } from '../../../../shared/constants/types';
import { legendListStyles } from '../../legendStyles';
import { EdgeGlyph } from '../EdgeGlyph';

function getStyles(): { list: string; row: string; glyph: string } {
  return {
    ...legendListStyles(),
    glyph: css({ display: 'inline-flex', width: 30, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }),
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
}

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
}

export function EdgeLegend({ edgeTypes }: Readonly<EdgeLegendProps> = {}): React.JSX.Element | null {
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
  // Mirror ClusterLegend: nothing to show → render nothing.
  if (rows.length === 0) {
    return null;
  }
  return (
    <div data-testid="edge-legend">
      <h4>Edge Types</h4>
      <ul className={styles.list}>
        {rows.map(({ key, color, lineStyle, fromLabel, toLabel, bidirectional }) => (
          <li key={key} className={styles.row} data-testid={`edge-legend-row-${key}`} style={{ color }}>
            <span>{fromLabel}</span>
            <span className={styles.glyph}>
              <EdgeGlyph color={color} lineStyle={lineStyle} bidirectional={bidirectional} />
            </span>
            <span>{toLabel}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
