import type cytoscape from 'cytoscape';
import { useEffect } from 'react';

import type { VisibilitySets } from '../computeVisibility';

export interface UseElementFilterProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  // Precomputed by the panel (single computeVisibility call shared with the
  // detail-panel gating) — this hook only applies the sets to the live graph.
  sets: VisibilitySets;
}

export function useElementFilter({ cyRef, sets }: UseElementFilterProps): void {
  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }
    const { visibleNodeIds, visibleEdgeIds } = sets;
    cy.batch(() => {
      cy.nodes().forEach((node) => {
        node.style('visibility', visibleNodeIds.has(node.id()) ? 'visible' : 'hidden');
      });
      cy.edges().forEach((edge) => {
        edge.style('visibility', visibleEdgeIds.has(edge.id()) ? 'visible' : 'hidden');
      });
      // Meta-edges (synthesised by expand-collapse) are not in `elements`, so they
      // are absent from visibleEdgeIds and would be wrongly hidden above. They
      // aggregate multiple edge types, so they are exempt from edge-type filtering;
      // visibility follows their endpoints only. Run AFTER the node pass so the
      // endpoint visibility we read is already up to date.
      cy.edges('.cy-expand-collapse-meta-edge').forEach((edge) => {
        const visible =
          edge.source().style('visibility') === 'visible' && edge.target().style('visibility') === 'visible';
        edge.style('visibility', visible ? 'visible' : 'hidden');
      });
    });
  }, [cyRef, sets]);
}
