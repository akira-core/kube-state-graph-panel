import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { Icon, Input, useStyles2 } from '@grafana/ui';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { themeColors } from '../../../../shared/theme/themeColors';
import { nextNavigableIndex } from '../../keyboardNav';
import type { SearchResult } from '../../types';
import { DEFAULT_RESULT_CAP, ResultList } from '../ResultList';

import type { SearchBarProps } from './SearchBar.types';

// Debounce for fit-to-all-hits after typing pauses (design D5 / graph-search "Viewport fit").
export const SEARCH_FIT_DEBOUNCE_MS = 300;

// Canvas overlay layout (design D7) — keep in sync with HoverTooltip PINNED_STYLE.
// Same right inset as the pinned attributes card; pinned card docks below the bar.
export const SEARCH_BAR_TOP_PX = 8;
export const SEARCH_BAR_RIGHT_PX = 8;
/** Outer height of the search input chrome (Grafana Input + prefix). */
export const SEARCH_BAR_HEIGHT_PX = 36;
export const SEARCH_PINNED_STACK_GAP_PX = 8;
/** `top` for the pinned hover card so it sits under the always-visible SearchBar. */
export const PINNED_TOOLTIP_TOP_BELOW_SEARCH_PX =
  SEARCH_BAR_TOP_PX + SEARCH_BAR_HEIGHT_PX + SEARCH_PINNED_STACK_GAP_PX;

function getStyles(theme: GrafanaTheme2): { root: string; inputWrap: string } {
  const colors = themeColors(theme);
  return {
    // Top-right of the canvas (design D7) — same right inset as pinned hover attributes;
    // stacked above that card. zIndex clears expand-collapse overlay (999) and stays in
    // the same band as the legend expand button / pinned tooltip (1000), slightly above
    // pinned so the input stays clickable at the shared corner.
    root: css({
      position: 'absolute',
      top: SEARCH_BAR_TOP_PX,
      right: SEARCH_BAR_RIGHT_PX,
      left: 'auto',
      width: 'min(360px, calc(100% - 16px))',
      zIndex: 1001,
      pointerEvents: 'auto',
      display: 'flex',
      flexDirection: 'column',
    }),
    inputWrap: css({
      // Solid surface so the canvas doesn't show through the input.
      background: colors.background.secondary,
      borderRadius: theme.shape.radius.default,
      boxShadow: theme.shadows.z1,
    }),
  };
}

export function SearchBar({
  query,
  onQueryChange,
  results,
  fitNodeIds,
  labelById,
  onLocate,
  onFitToIds,
}: Readonly<SearchBarProps>): React.JSX.Element {
  const styles = useStyles2(getStyles);
  const inputRef = useRef<HTMLInputElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  // List visibility is independent of the query string (design D7 / graph-search "Result list").
  const [listOpen, setListOpen] = useState(false);
  // Track the result list we're highlighting against so a new list (query / data refresh)
  // resets the cursor without a setState-in-effect (React "adjust state when props change").
  const [highlightedForResults, setHighlightedForResults] = useState<readonly SearchResult[]>(results);
  if (results !== highlightedForResults) {
    setHighlightedForResults(results);
    setHighlightedIndex(-1);
  }

  // Latest fit targets / callback for the debounce timer + Enter flush. Updated in an
  // effect (not during render) so react-hooks/refs stays happy.
  const fitNodeIdsRef = useRef(fitNodeIds);
  const onFitToIdsRef = useRef(onFitToIds);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    fitNodeIdsRef.current = fitNodeIds;
    onFitToIdsRef.current = onFitToIds;
  }, [fitNodeIds, onFitToIds]);

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const flushFitAll = useCallback(() => {
    clearDebounce();
    const ids = fitNodeIdsRef.current;
    if (ids.length > 0) {
      onFitToIdsRef.current(ids);
    }
  }, [clearDebounce]);

  // Debounced fit-to-all-hits on query change (design D5). Clearing the query cancels any
  // pending fit and leaves the viewport in place — no snapshot/restore. fitNodeIds is a
  // dep so a collapse/visibility flip while typing re-aims the pending fit; the timer
  // itself always reads the latest set via the ref.
  useEffect(() => {
    clearDebounce();
    if (query.trim().length === 0) {
      return;
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const ids = fitNodeIdsRef.current;
      if (ids.length > 0) {
        onFitToIdsRef.current(ids);
      }
    }, SEARCH_FIT_DEBOUNCE_MS);
    return clearDebounce;
  }, [query, fitNodeIds, clearDebounce]);

  const handleQueryChange = (value: string): void => {
    setHighlightedIndex(-1);
    // User typing opens the list when non-empty; empty query always closes it.
    setListOpen(value.trim().length > 0);
    onQueryChange(value);
  };

  // Locate + commit result label into the field + dismiss the list (does not re-open list
  // on the committed label — call onQueryChange directly, not handleQueryChange).
  const activateLocate = (result: SearchResult): void => {
    if (result.filterHidden === true) {
      return;
    }
    onLocate(result);
    setListOpen(false);
    setHighlightedIndex(-1);
    onQueryChange(result.label);
  };

  const handleFocus = (): void => {
    if (query.trim().length > 0) {
      setListOpen(true);
    }
  };

  const handleBlur = (): void => {
    setListOpen(false);
  };

  const handleKeyDown = (evt: React.KeyboardEvent<HTMLInputElement>): void => {
    // Keep Grafana's global Esc / shortcut handling out of the picture while focused.
    evt.stopPropagation();

    if (evt.key === 'ArrowDown') {
      evt.preventDefault();
      if (query.trim().length > 0) {
        setListOpen(true);
      }
      setHighlightedIndex((prev) => {
        const next = nextNavigableIndex(results, prev, 1);
        // Cap highlight to the visible window (result list only renders ≤50 rows).
        if (next >= DEFAULT_RESULT_CAP) {
          return prev;
        }
        return next >= 0 ? next : prev;
      });
      return;
    }
    if (evt.key === 'ArrowUp') {
      evt.preventDefault();
      if (query.trim().length > 0) {
        setListOpen(true);
      }
      setHighlightedIndex((prev) => {
        const next = nextNavigableIndex(results, prev, -1);
        return next >= 0 ? next : prev;
      });
      return;
    }
    if (evt.key === 'Enter') {
      evt.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < results.length) {
        const result = results[highlightedIndex];
        if (result !== undefined) {
          activateLocate(result);
        }
        return;
      }
      // No highlighted row → flush fit-to-all immediately (skip remaining debounce).
      flushFitAll();
      return;
    }
    if (evt.key === 'Escape') {
      evt.preventDefault();
      if (query.length > 0) {
        handleQueryChange('');
        // Input keeps focus (two-stage Esc: clear → blur).
        return;
      }
      inputRef.current?.blur();
    }
  };

  const showList = query.trim().length > 0 && listOpen;

  return (
    <div className={styles.root} data-testid="graph-search-bar">
      <div className={styles.inputWrap}>
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => handleQueryChange(e.currentTarget.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Search nodes…"
          prefix={<Icon name="search" />}
          aria-label="Search nodes"
          data-testid="graph-search-input"
        />
      </div>
      {showList && (
        <ResultList
          results={results}
          highlightedIndex={highlightedIndex}
          labelById={labelById}
          onLocate={activateLocate}
        />
      )}
    </div>
  );
}
