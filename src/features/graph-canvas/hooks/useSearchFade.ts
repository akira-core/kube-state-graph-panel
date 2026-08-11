import type cytoscape from 'cytoscape';
import { useEffect } from 'react';

import { SEARCH_FADE_CLASS } from '../styles/getStylesheet';

export interface UseSearchFadeProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  isReady: boolean;
  elements: cytoscape.ElementDefinition[];
  // True while the search query is non-empty (design D3) — distinct from an empty
  // `litNodeIds`, which under an active zero-hit query must fade the WHOLE graph rather
  // than fading nothing.
  active: boolean;
  // Hit nodes with proxy-hit substitution already applied (resolveSearchHits) — this hook
  // adds their incident edges + ancestors, mirroring applySelectionFocus's focus set.
  litNodeIds: ReadonlySet<string>;
}

// Miss fade (CONTEXT.md): while a search query is active, dim every element outside the
// lit set (hit/proxy nodes ∪ their incident edges ∪ their ancestors) via SEARCH_FADE_CLASS
// — class-toggle only, no removal, no layout run, no computeVisibility involvement.
export function applySearchFade(cy: cytoscape.Core, litNodeIds: ReadonlySet<string>, active: boolean): void {
  cy.batch(() => {
    cy.elements().removeClass(SEARCH_FADE_CLASS);
    if (!active) {
      return;
    }
    let litNodes = cy.collection();
    for (const id of litNodeIds) {
      const ele = cy.getElementById(id);
      if (!ele.empty()) {
        litNodes = litNodes.union(ele);
      }
    }
    const lit = litNodes.union(litNodes.connectedEdges()).union(litNodes.ancestors());
    cy.elements().difference(lit).addClass(SEARCH_FADE_CLASS);
  });
}

export function useSearchFade({ cyRef, isReady, elements, active, litNodeIds }: UseSearchFadeProps): void {
  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }
    applySearchFade(cy, litNodeIds, active);
    // isReady/elements re-run this once the instance exists and after rebuilds.
  }, [cyRef, isReady, elements, active, litNodeIds]);
}
