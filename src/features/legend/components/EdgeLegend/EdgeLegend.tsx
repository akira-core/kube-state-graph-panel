import { css } from '@emotion/css';
import { IconButton, useStyles2 } from '@grafana/ui';
import React from 'react';

import { EDGE_ENDPOINTS_BY_TYPE, EDGE_STYLE_BY_TYPE } from '../../../../shared/constants/colorByEdgeType';
import { drawnEdgeTypesForMode } from '../../../../shared/constants/drawnEdgeTypesForMode';
import type { EdgeType, NodeKind, PodParentMode } from '../../../../shared/constants/types';
import { legendListStyles } from '../../legendStyles';
import { EdgeGlyph } from '../EdgeGlyph';

function getStyles(): { list: string; row: string; glyph: string; header: string } {
  return {
    ...legendListStyles(),
    glyph: css({ display: 'inline-flex', width: 30, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }),
    header: css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }),
  };
}

// Short display labels for the edge-legend endpoints. Only `service` is
// abbreviated; every other kind reads fine at full length.
function kindLabel(kind: NodeKind): string {
  return kind === 'service' ? 'svc' : kind;
}

export interface EdgeLegendProps {
  // The edge types to list. Pass the types actually present in the graph (like
  // the cluster legend) to show only what's drawn. Omit to list every edge type
  // drawn in the current mode (e.g. in isolated rendering/tests).
  edgeTypes?: readonly EdgeType[];
  // Current pod-parent mode; selects the default edge-type set and the toggle label.
  mode?: PodParentMode;
  // When provided, renders a toggle button that flips node ⇄ service mode.
  onToggleMode?: () => void;
}

export function EdgeLegend({
  edgeTypes,
  mode = 'node',
  onToggleMode,
}: Readonly<EdgeLegendProps> = {}): React.JSX.Element | null {
  const styles = useStyles2(getStyles);
  // Only known edge types can be rendered (the endpoint/style maps key off them);
  // an unknown type present in the data is drawn on-canvas via the fallback style
  // but omitted from the legend.
  const types = (edgeTypes ?? drawnEdgeTypesForMode(mode)).filter((t) => t in EDGE_STYLE_BY_TYPE);
  const entries = types.map(
    (edgeType) => [edgeType, EDGE_STYLE_BY_TYPE[edgeType], EDGE_ENDPOINTS_BY_TYPE[edgeType]] as const
  );
  // Mirror ClusterLegend: nothing to show → render nothing.
  if (entries.length === 0) {
    return null;
  }
  const toggleLabel = mode === 'node' ? 'Nest pods under services' : 'Nest pods under nodes';
  return (
    <div data-testid="edge-legend">
      <div className={styles.header}>
        <h4>Edge types</h4>
        {onToggleMode !== undefined && (
          <IconButton
            data-testid="pod-parent-mode-toggle"
            name="exchange-alt"
            aria-label={toggleLabel}
            tooltip={toggleLabel}
            size="sm"
            onClick={onToggleMode}
          />
        )}
      </div>
      <ul className={styles.list}>
        {entries.map(([edgeType, { color, lineStyle }, { from, to }]) => (
          <li key={edgeType} className={styles.row} data-testid={`edge-legend-row-${edgeType}`} style={{ color }}>
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
