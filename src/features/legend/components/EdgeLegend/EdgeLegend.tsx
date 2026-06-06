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

// The pod↔service relationship is drawn on canvas as two opposite-direction edges
// of the SAME colour (pod→service calls, service→pod selects). In the legend that
// reads as redundant, so when BOTH are present they collapse to a single
// bidirectional `pod ↔ svc` row. When only one is drawn it renders normally as a
// single-direction row. (Service edges are drawn in both pod-parent modes.)
const SVC_PAIR = ['pod-calls-service', 'service-selects-pod'] as const;

interface EdgeRow {
  key: string;
  color: string;
  lineStyle: LineStyle;
  from: NodeKind;
  to: NodeKind;
  bidirectional: boolean;
}

function buildRows(types: readonly EdgeType[]): EdgeRow[] {
  const mergeSvc = SVC_PAIR.every((t) => types.includes(t));
  const rows: EdgeRow[] = [];
  let mergedEmitted = false;
  for (const edgeType of types) {
    if (mergeSvc && (SVC_PAIR as readonly string[]).includes(edgeType)) {
      if (mergedEmitted) {
        continue;
      }
      mergedEmitted = true;
      const style = EDGE_STYLE_BY_TYPE['pod-calls-service'];
      rows.push({
        key: 'pod-svc',
        color: style.color,
        lineStyle: style.lineStyle,
        from: 'pod',
        to: 'service',
        bidirectional: true,
      });
      continue;
    }
    const style = EDGE_STYLE_BY_TYPE[edgeType];
    const { from, to } = EDGE_ENDPOINTS_BY_TYPE[edgeType];
    rows.push({ key: edgeType, color: style.color, lineStyle: style.lineStyle, from, to, bidirectional: false });
  }
  return rows;
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
  // but omitted from the legend.
  const types = (edgeTypes ?? drawnEdgeTypesForMode('node')).filter((t) => t in EDGE_STYLE_BY_TYPE);
  const rows = buildRows(types);
  // Mirror ClusterLegend: nothing to show → render nothing.
  if (rows.length === 0) {
    return null;
  }
  return (
    <div data-testid="edge-legend">
      <h4>Edge types</h4>
      <ul className={styles.list}>
        {rows.map(({ key, color, lineStyle, from, to, bidirectional }) => (
          <li key={key} className={styles.row} data-testid={`edge-legend-row-${key}`} style={{ color }}>
            <span>{key === 'controller-owns-pod' ? 'controller' : kindLabel(from)}</span>
            <span className={styles.glyph}>
              <EdgeGlyph color={color} lineStyle={lineStyle} bidirectional={bidirectional} />
            </span>
            <span>{kindLabel(to)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
