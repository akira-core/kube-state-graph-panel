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
// abbreviated; every other kind reads fine at full length. Accepts `'controller'`
// as a display-only marker (passes through unchanged).
function kindLabel(kind: NodeKind | 'controller'): string {
  return kind === 'service' ? 'svc' : kind;
}

// A pod↔service relationship is conceptually still pod-to-pod: a pod calls a Service
// which selects pods — an extra hop, not a distinct relationship. On canvas both its
// edges (pod→service calls, service→pod selects) share the pod-calls-pod colour; in
// the legend they are OMITTED entirely (the single `pod → pod` row covers them), so
// the legend doesn't present Service as its own relationship colour. (Service edges
// are still drawn on canvas in both pod-parent modes.)
const SVC_OMITTED_FROM_LEGEND: ReadonlySet<EdgeType> = new Set(['pod-calls-service', 'service-selects-pod']);

interface EdgeRow {
  key: string;
  color: string;
  lineStyle: LineStyle;
  from: NodeKind | 'controller';
  to: NodeKind | 'controller';
}

function buildRows(types: readonly EdgeType[]): EdgeRow[] {
  return types.map((edgeType) => {
    const style = EDGE_STYLE_BY_TYPE[edgeType];
    const { from, to } = EDGE_ENDPOINTS_BY_TYPE[edgeType];
    return { key: edgeType, color: style.color, lineStyle: style.lineStyle, from, to };
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
  // but omitted from the legend. The pod↔service pair is also omitted (it is the
  // pod-to-pod relationship via a Service — covered by the `pod → pod` row).
  const types = (edgeTypes ?? drawnEdgeTypesForMode('node')).filter(
    (t) => t in EDGE_STYLE_BY_TYPE && !SVC_OMITTED_FROM_LEGEND.has(t)
  );
  const rows = buildRows(types);
  // Mirror ClusterLegend: nothing to show → render nothing.
  if (rows.length === 0) {
    return null;
  }
  return (
    <div data-testid="edge-legend">
      <h4>Edge types</h4>
      <ul className={styles.list}>
        {rows.map(({ key, color, lineStyle, from, to }) => (
          <li key={key} className={styles.row} data-testid={`edge-legend-row-${key}`} style={{ color }}>
            <span>{kindLabel(from)}</span>
            <span className={styles.glyph}>
              <EdgeGlyph color={color} lineStyle={lineStyle} />
            </span>
            <span>{kindLabel(to)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
