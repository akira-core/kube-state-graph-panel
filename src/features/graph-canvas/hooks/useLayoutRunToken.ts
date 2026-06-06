import { useState } from 'react';

import type { PodParentMode } from '../../../shared/constants/types';

export interface UseLayoutRunTokenInput {
  // Collapsed parent-container ids. Re-layout when the SET CONTENT changes
  // (size + sorted membership), not on every parent render.
  collapsedIds?: Set<string> | undefined;
  // Pod-parent mode. Switching it re-parents pods and adds/removes edges (a
  // structural change), so it must also trigger a single re-layout.
  podParentMode?: PodParentMode | undefined;
}

function tokenKey({ collapsedIds, podParentMode }: UseLayoutRunTokenInput): string {
  const ids = collapsedIds === undefined ? '' : [...collapsedIds].sort().join('|');
  return `${podParentMode ?? 'node'}||${ids}`;
}

// A stable numeric token that increments only when a layout-affecting input
// changes content: the collapsed-id set or the pod-parent mode. useGraphLayout
// (the single source of cy.layout() execution) reruns once per real change
// rather than on every parent render.
//
// Uses the React render-phase state update idiom: calling setState during render
// is permitted and tells React to re-render once immediately with the updated
// state. The useState initializer seeds the stored key from the first render so
// mount yields token 0 (mount-only layout) with no spurious bump.
export function useLayoutRunToken(input: UseLayoutRunTokenInput): number {
  const key = tokenKey(input);
  const [stored, setStored] = useState<{ key: string; token: number }>(() => ({ key, token: 0 }));
  if (key !== stored.key) {
    const next = { key, token: stored.token + 1 };
    setStored(next);
    return next.token;
  }
  return stored.token;
}
