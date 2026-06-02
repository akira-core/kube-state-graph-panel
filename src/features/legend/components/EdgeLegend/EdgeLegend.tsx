import { css } from '@emotion/css';
import { IconButton, useStyles2 } from '@grafana/ui';
import React from 'react';

import { EDGE_STYLE_BY_TYPE } from '../../../../shared/constants/colorByEdgeType';
import { drawnEdgeTypesForMode } from '../../../../shared/constants/drawnEdgeTypesForMode';
import type { PodParentMode } from '../../../../shared/constants/types';
import { legendListStyles } from '../../legendStyles';
import { EdgeGlyph } from '../EdgeGlyph';

function getStyles(): { list: string; row: string; glyph: string; note: string; header: string } {
  return {
    ...legendListStyles(),
    glyph: css({ display: 'inline-flex', width: 30, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }),
    note: css({ marginTop: 4, fontSize: 11, opacity: 0.7, lineHeight: 1.3 }),
    header: css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }),
  };
}

export interface EdgeLegendProps {
  // Current pod-parent mode; selects which edge types are drawn (and listed).
  mode?: PodParentMode;
  // When provided, renders a toggle button that flips node ⇄ service mode.
  onToggleMode?: () => void;
}

// In `node` mode the pod↔node relationship is nesting; in `service` mode the
// pod↔service relationship (service-selects-pod) becomes nesting instead.
function nestingNote(mode: PodParentMode): string {
  return mode === 'service'
    ? 'Nesting: a pod sits inside its service box (service-selects-pod); nodes, services and PVCs sit inside their cluster box.'
    : 'Nesting: a pod sits inside its node box (pod-runs-on-node); nodes, services and PVCs sit inside their cluster box.';
}

export function EdgeLegend({ mode = 'node', onToggleMode }: Readonly<EdgeLegendProps> = {}): React.JSX.Element {
  const styles = useStyles2(getStyles);
  const entries = drawnEdgeTypesForMode(mode).map((edgeType) => [edgeType, EDGE_STYLE_BY_TYPE[edgeType]] as const);
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
        {entries.map(([edgeType, { color, lineStyle }]) => (
          <li key={edgeType} className={styles.row} data-testid={`edge-legend-row-${edgeType}`}>
            <span className={styles.glyph}>
              <EdgeGlyph color={color} lineStyle={lineStyle} />
            </span>
            <span style={{ color }}>{edgeType}</span>
          </li>
        ))}
      </ul>
      {/* The relationship that is currently nesting (not a drawn edge) has no
          glyph; explain it so the absent edge type does not read as missing data. */}
      <p className={styles.note} data-testid="edge-legend-nesting-note">
        {nestingNote(mode)}
      </p>
    </div>
  );
}
