import { css, cx } from '@emotion/css';
import { IconButton, useStyles2 } from '@grafana/ui';
import React from 'react';

import { CATEGORY_ORDER, categoryForKind, type NodeCategory } from '../../../../shared/constants/categoryByKind';
import { ICON_SVG_BY_KIND } from '../../../../shared/constants/iconSvgByKind';
import { legendListStyles } from '../../legendStyles';
import { IconGlyph } from '../IconGlyph';

function getStyles(): {
  list: string;
  row: string;
  glyph: string;
  group: string;
  groupTitle: string;
  dimmed: string;
  toggle: string;
} {
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
    // A filtered-out kind keeps its row (so it can be restored) but fades its
    // glyph + label; the toggle button itself stays full-strength for affordance.
    dimmed: css({ opacity: 0.4 }),
    toggle: css({ marginLeft: 'auto' }),
  };
}

// Group the given entries by super-category (colour never encodes category — this
// is purely a legend grouping aid). Unknown kinds fall into 'Other' via
// categoryForKind, so a kind the backend sends that has no icon still appears.
function entriesByCategory(entries: readonly NodeLegendKindEntry[]): Map<NodeCategory, NodeLegendKindEntry[]> {
  const grouped = new Map<NodeCategory, NodeLegendKindEntry[]>();
  for (const entry of entries) {
    const category = categoryForKind(entry.kind);
    const existing = grouped.get(category);
    if (existing) {
      existing.push(entry);
    } else {
      grouped.set(category, [entry]);
    }
  }
  return grouped;
}

// Display-name overrides for kinds whose raw id reads poorly as a legend label.
const LABEL_BY_KIND: Record<string, string> = {
  network: 'physical network',
};

// One legend row: the kind to draw plus its display flags. `hidden` fades the
// row and flips the eye to "Show"; rows with `togglable: false` render no eye
// button at all — the producer decides which kinds are filterable.
export interface NodeLegendKindEntry {
  kind: string;
  hidden: boolean;
  togglable: boolean;
}

// Every known kind as a plain visible row — the no-props fallback (isolated
// rendering/tests). Static input, so built once.
const DEFAULT_ENTRIES: readonly NodeLegendKindEntry[] = Object.keys(ICON_SVG_BY_KIND).map((kind) => ({
  kind,
  hidden: false,
  togglable: false,
}));

export interface NodeLegendProps {
  // The rows to list. Pass the entries derived from the graph to show the live
  // filter state; omit to list every known kind as a plain visible row.
  entries?: readonly NodeLegendKindEntry[];
  // Show/hide toggle callback, invoked with the row's kind. Omit for a
  // read-only legend (no buttons render). Buttons also need togglable entries:
  // the no-`entries` fallback rows are all non-togglable, so passing only this
  // prop still renders a read-only legend.
  onToggleKind?: (kind: string) => void;
}

export function NodeLegend({ entries, onToggleKind }: Readonly<NodeLegendProps> = {}): React.JSX.Element | null {
  const styles = useStyles2(getStyles);
  const presentEntries = entries ?? DEFAULT_ENTRIES;
  const grouped = entriesByCategory(presentEntries);
  // Mirror ClusterLegend: nothing to show → render nothing.
  if (presentEntries.length === 0) {
    return null;
  }
  return (
    <div data-testid="node-legend">
      <h4>Node Kinds</h4>
      {CATEGORY_ORDER.filter((category) => (grouped.get(category)?.length ?? 0) > 0).map((category) => (
        <div key={category} className={styles.group} data-testid={`node-legend-group-${category}`}>
          <div className={styles.groupTitle}>{category}</div>
          <ul className={styles.list}>
            {(grouped.get(category) ?? []).map((entry) => {
              const label = LABEL_BY_KIND[entry.kind] ?? entry.kind;
              return (
                <li key={entry.kind} className={styles.row} data-testid={`node-legend-row-${entry.kind}`}>
                  <span className={cx(styles.glyph, entry.hidden && styles.dimmed)}>
                    <IconGlyph kind={entry.kind} />
                  </span>
                  <span className={cx(entry.hidden && styles.dimmed)}>{label}</span>
                  {onToggleKind !== undefined && entry.togglable && (
                    <IconButton
                      className={styles.toggle}
                      name={entry.hidden ? 'eye-slash' : 'eye'}
                      size="lg"
                      tooltip={`${entry.hidden ? 'Show' : 'Hide'} ${label}`}
                      onClick={() => onToggleKind(entry.kind)}
                      data-testid={`node-legend-toggle-${entry.kind}`}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
