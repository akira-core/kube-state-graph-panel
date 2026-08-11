import { css, cx } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { Badge, Icon, useStyles2 } from '@grafana/ui';
import React, { useEffect, useRef } from 'react';

import { themeColors } from '../../../../shared/theme/themeColors';
import type { SearchResult } from '../../types';

import type { ResultListProps } from './ResultList.types';

export const DEFAULT_RESULT_CAP = 50;

function getStyles(theme: GrafanaTheme2): {
  root: string;
  list: string;
  row: string;
  rowHighlighted: string;
  rowDisabled: string;
  primary: string;
  label: string;
  subline: string;
  more: string;
  empty: string;
  eye: string;
} {
  const colors = themeColors(theme);
  return {
    root: css({
      maxHeight: '40%',
      overflowY: 'auto',
      background: colors.background.secondary,
      border: `1px solid ${colors.border.weak}`,
      borderRadius: 4,
      boxShadow: theme.shadows.z2,
      marginTop: 4,
    }),
    list: css({
      listStyle: 'none',
      margin: 0,
      padding: 0,
    }),
    row: css({
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      padding: '6px 10px',
      cursor: 'pointer',
      borderBottom: `1px solid ${colors.border.weak}`,
      '&:last-child': { borderBottom: 'none' },
      // themeColors only exposes background.secondary — hover/highlight use a weak border
      // wash so we never cast Grafana's optional colour fields here.
      '&:hover': { background: colors.border.weak },
    }),
    rowHighlighted: css({
      background: colors.border.weak,
    }),
    rowDisabled: css({
      cursor: 'default',
      opacity: 0.55,
      '&:hover': { background: 'transparent' },
    }),
    primary: css({
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      minWidth: 0,
    }),
    label: css({
      fontSize: theme.typography.bodySmall.fontSize,
      fontWeight: theme.typography.fontWeightMedium,
      color: colors.text.primary,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      flex: 1,
      minWidth: 0,
    }),
    subline: css({
      fontSize: 11,
      color: colors.text.secondary,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }),
    more: css({
      padding: '6px 10px',
      fontSize: 11,
      color: colors.text.secondary,
      fontStyle: 'italic',
    }),
    empty: css({
      padding: '8px 10px',
      fontSize: theme.typography.bodySmall.fontSize,
      color: colors.text.secondary,
    }),
    eye: css({
      flexShrink: 0,
      opacity: 0.8,
    }),
  };
}

function buildSubline(result: SearchResult, labelById: ReadonlyMap<string, string>): string {
  const parts: string[] = [];
  if (result.context?.namespace !== undefined) {
    parts.push(result.context.namespace);
  }
  if (result.context?.cluster !== undefined) {
    parts.push(result.context.cluster);
  }
  if (result.matchedField !== undefined) {
    parts.push(`${result.matchedField.field}: ${result.matchedField.value}`);
  }
  if (result.collapsedUnder !== undefined) {
    const containerLabel = labelById.get(result.collapsedUnder) ?? result.collapsedUnder;
    parts.push(`in ${containerLabel} (collapsed)`);
  }
  return parts.join(' · ');
}

export function ResultList({
  results,
  highlightedIndex,
  labelById,
  onLocate,
  maxVisible = DEFAULT_RESULT_CAP,
}: Readonly<ResultListProps>): React.JSX.Element {
  const styles = useStyles2(getStyles);
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);

  // Keep the keyboard-highlighted row in view when arrowing through a long list.
  // scrollIntoView is absent under jsdom — guard so keyboard tests don't throw.
  useEffect(() => {
    if (highlightedIndex < 0) {
      return;
    }
    const row = rowRefs.current[highlightedIndex];
    if (row !== null && row !== undefined && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  if (results.length === 0) {
    return (
      <div className={styles.root} data-testid="search-result-list" role="listbox" aria-label="Search results">
        <div className={styles.empty} data-testid="search-no-results">
          No matching nodes
        </div>
      </div>
    );
  }

  const visible = results.slice(0, maxVisible);
  const overflow = results.length - visible.length;

  return (
    <div className={styles.root} data-testid="search-result-list">
      <ul className={styles.list} role="listbox" aria-label="Search results">
        {visible.map((result, index) => {
          const disabled = result.filterHidden === true;
          const highlighted = index === highlightedIndex;
          const subline = buildSubline(result, labelById);
          return (
            <li
              key={result.id}
              ref={(el) => {
                rowRefs.current[index] = el;
              }}
              role="option"
              aria-selected={highlighted}
              aria-disabled={disabled || undefined}
              data-testid={`search-result-${result.id}`}
              data-disabled={disabled ? 'true' : undefined}
              className={cx(styles.row, highlighted && styles.rowHighlighted, disabled && styles.rowDisabled)}
              onMouseDown={(evt) => {
                // Prevent the input from blurring before click handlers fire.
                evt.preventDefault();
              }}
              onClick={() => {
                if (!disabled) {
                  onLocate(result);
                }
              }}
            >
              <div className={styles.primary}>
                <span className={styles.label}>{result.label}</span>
                {result.kind !== undefined && <Badge text={result.kind} color="blue" />}
                {disabled && (
                  <Icon name="eye-slash" size="sm" className={styles.eye} aria-label="Hidden by filter" />
                )}
              </div>
              {subline.length > 0 && <div className={styles.subline}>{subline}</div>}
            </li>
          );
        })}
      </ul>
      {overflow > 0 && (
        <div className={styles.more} data-testid="search-result-more">
          {overflow} more
        </div>
      )}
    </div>
  );
}
