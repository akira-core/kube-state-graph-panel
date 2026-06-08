import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import React from 'react';

import { CATEGORY_ORDER, categoryForKind, type NodeCategory } from '../../../../shared/constants/categoryByKind';
import { ICON_SVG_BY_KIND } from '../../../../shared/constants/iconSvgByKind';
import { legendListStyles } from '../../legendStyles';
import { IconGlyph } from '../IconGlyph';

function getStyles(): { list: string; row: string; glyph: string; group: string; groupTitle: string } {
  return {
    ...legendListStyles(),
    // Fixed square box keeps every icon glyph equal width and height.
    glyph: css({
      display: 'inline-flex',
      width: 30,
      height: 30,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    }),
    group: css({ marginBottom: 6 }),
    groupTitle: css({
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      opacity: 0.6,
      margin: '6px 0 2px',
    }),
  };
}

// Group the given kinds by super-category (colour never encodes category — this
// is purely a legend grouping aid). Unknown kinds fall into 'Other' via
// categoryForKind, so a kind the backend sends that has no icon still appears.
function kindsByCategory(kinds: readonly string[]): Map<NodeCategory, string[]> {
  const grouped = new Map<NodeCategory, string[]>();
  for (const kind of kinds) {
    const category = categoryForKind(kind);
    const existing = grouped.get(category);
    if (existing) {
      existing.push(kind);
    } else {
      grouped.set(category, [kind]);
    }
  }
  return grouped;
}

export interface NodeLegendProps {
  // The kinds to list. Pass the kinds actually present in the graph (like the
  // cluster legend) to show only what's on screen. Omit to list every known
  // kind (the full key set), e.g. in isolated rendering/tests.
  kinds?: readonly string[];
}

export function NodeLegend({ kinds }: Readonly<NodeLegendProps> = {}): React.JSX.Element | null {
  const styles = useStyles2(getStyles);
  const presentKinds = kinds ?? Object.keys(ICON_SVG_BY_KIND);
  const grouped = kindsByCategory(presentKinds);
  // Mirror ClusterLegend: nothing to show → render nothing.
  if (presentKinds.length === 0) {
    return null;
  }
  return (
    <div data-testid="node-legend">
      <h4>Node Kinds</h4>
      {CATEGORY_ORDER.filter((category) => (grouped.get(category)?.length ?? 0) > 0).map((category) => (
        <div key={category} className={styles.group} data-testid={`node-legend-group-${category}`}>
          <div className={styles.groupTitle}>{category}</div>
          <ul className={styles.list}>
            {(grouped.get(category) ?? []).map((kind) => (
              <li key={kind} className={styles.row} data-testid={`node-legend-row-${kind}`}>
                <span className={styles.glyph}>
                  <IconGlyph kind={kind} />
                </span>
                <span>{kind}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
