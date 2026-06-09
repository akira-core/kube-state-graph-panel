import { useCallback, useState } from 'react';

import type { PodParentMode } from '../../../shared/constants/types';

export interface UseLayoutRunTokenInput {
  // Collapsed parent-container ids. A fold/unfold must be APPLIED (diff-patch
  // re-collapse) but must NOT relayout — the extension preserves positions, so
  // toggling one container no longer reshuffles the whole graph.
  collapsedIds?: Set<string> | undefined;
  // Pod-parent mode. Switching it re-parents pods and adds/removes edges (a real
  // structural rebuild), so it DOES trigger a re-layout.
  podParentMode?: PodParentMode | undefined;
}

export interface LayoutRunTokens {
  // Bumps when the collapsed-set CONTENT changes. Gate the diff-patch / re-collapse
  // cycle on this (collapseKey) so legend + cue toggles are APPLIED — but it is
  // deliberately decoupled from layoutToken, so a fold/unfold does NOT relayout.
  collapseApplyToken: number;
  // Bumps on a pod-parent-mode flip (structural rebuild) OR an imperative
  // requestRelayout(). Gate the single cy.layout() source (useGraphLayout) on this.
  // NOT bumped by a collapse toggle — that is the whole point of the split.
  layoutToken: number;
  // One-shot relayout request for the cases that change the graph without changing
  // the collapsed-set content or the mode: the mount-time default-collapse (applied
  // after the layout pass) and a refresh that adds a wholly-new, unanchorable
  // family. Stable identity — safe in effect deps; does not re-trigger effects.
  requestRelayout: () => void;
}

interface Counter {
  key: string;
  token: number;
}

// Key that drives a LAYOUT: only the pod-parent mode (a fold/unfold must not relayout).
function layoutKeyOf({ podParentMode }: UseLayoutRunTokenInput): string {
  return podParentMode ?? 'node';
}

// Key that drives APPLYING the collapse (diff-patch): the collapsed-set content.
function applyKeyOf({ collapsedIds }: UseLayoutRunTokenInput): string {
  return collapsedIds === undefined ? '' : [...collapsedIds].sort().join('|');
}

// Owns the layout-rerun + collapse-apply triggers as two INDEPENDENT monotonic
// counters, each with a single meaning: `collapseApplyToken` bumps on a collapsed-set
// content change (drives diff-patch); `layoutToken` bumps on a pod-parent-mode flip OR
// requestRelayout() (drives the single cy.layout() source). A fold/unfold bumps ONLY
// collapseApplyToken, so the extension applies it in place and the graph does not
// reshuffle.
//
// Uses the React render-phase state update idiom: calling setState during render is
// permitted and tells React to re-render once immediately with the updated state. Each
// counter is seeded from the first render so mount yields token 0 (mount-only layout)
// with no spurious bump.
export function useLayoutRunToken(input: UseLayoutRunTokenInput): LayoutRunTokens {
  const layoutKey = layoutKeyOf(input);
  const applyKey = applyKeyOf(input);
  const [layout, setLayout] = useState<Counter>(() => ({ key: layoutKey, token: 0 }));
  const [apply, setApply] = useState<Counter>(() => ({ key: applyKey, token: 0 }));

  const requestRelayout = useCallback(() => {
    setLayout((s) => ({ key: s.key, token: s.token + 1 }));
  }, []);

  let layoutToken = layout.token;
  if (layoutKey !== layout.key) {
    layoutToken = layout.token + 1;
    setLayout({ key: layoutKey, token: layoutToken });
  }
  let collapseApplyToken = apply.token;
  if (applyKey !== apply.key) {
    collapseApplyToken = apply.token + 1;
    setApply({ key: applyKey, token: collapseApplyToken });
  }
  return { collapseApplyToken, layoutToken, requestRelayout };
}
