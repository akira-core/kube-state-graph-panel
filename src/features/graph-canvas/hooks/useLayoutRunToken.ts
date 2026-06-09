import { useCallback, useState } from 'react';

import type { PodParentMode } from '../../../shared/constants/types';

export interface UseLayoutRunTokenInput {
  // Collapsed parent-container ids. Re-layout when the SET CONTENT changes
  // (size + sorted membership), not on every parent render.
  collapsedIds?: Set<string> | undefined;
  // Pod-parent mode. Switching it re-parents pods and adds/removes edges (a
  // structural change), so it must also trigger a single re-layout.
  podParentMode?: PodParentMode | undefined;
}

export interface LayoutRunTokens {
  // Bumps ONLY when layout-affecting CONTENT changes (collapsed-set / pod-parent
  // mode). Gate the diff-patch / re-collapse cycle on this (it must NOT re-run on a
  // bare relayout request).
  contentToken: number;
  // Bumps on a content change OR an imperative requestRelayout(). Gate the single
  // cy.layout() source (useGraphLayout) on this so it also reruns for structural
  // changes that leave the content key untouched (see requestRelayout).
  layoutToken: number;
  // One-shot relayout request for changes that do NOT alter the content key and so
  // would otherwise never relayout: the mount-time default-collapse (applied after
  // the layout pass) and a refresh that adds a wholly-new, unanchorable family.
  // Stable identity — safe in effect deps; does not re-trigger callers' effects.
  requestRelayout: () => void;
}

interface Stored {
  key: string;
  contentToken: number;
  layoutToken: number;
}

function tokenKey({ collapsedIds, podParentMode }: UseLayoutRunTokenInput): string {
  const ids = collapsedIds === undefined ? '' : [...collapsedIds].sort().join('|');
  return `${podParentMode ?? 'node'}||${ids}`;
}

// Owns every layout-rerun trigger so callers never hand-merge counters. Two
// monotonic counters, each with a single meaning (no summing): `contentToken`
// bumps when a layout-affecting input changes content; `layoutToken` bumps on that
// OR an imperative `requestRelayout()`. useGraphLayout (the single source of
// cy.layout() execution) reruns once per real change rather than on every render.
//
// Uses the React render-phase state update idiom: calling setState during render is
// permitted and tells React to re-render once immediately with the updated state.
// The useState initializer seeds the stored key from the first render so mount
// yields token 0 (mount-only layout) with no spurious bump.
export function useLayoutRunToken(input: UseLayoutRunTokenInput): LayoutRunTokens {
  const key = tokenKey(input);
  const [stored, setStored] = useState<Stored>(() => ({ key, contentToken: 0, layoutToken: 0 }));

  const requestRelayout = useCallback(() => {
    setStored((s) => ({ ...s, layoutToken: s.layoutToken + 1 }));
  }, []);

  // A content-key change bumps BOTH counters (new content always needs a layout).
  if (key !== stored.key) {
    const next: Stored = { key, contentToken: stored.contentToken + 1, layoutToken: stored.layoutToken + 1 };
    setStored(next);
    return { contentToken: next.contentToken, layoutToken: next.layoutToken, requestRelayout };
  }
  return { contentToken: stored.contentToken, layoutToken: stored.layoutToken, requestRelayout };
}
