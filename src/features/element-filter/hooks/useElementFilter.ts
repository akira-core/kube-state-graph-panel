import type cytoscape from 'cytoscape';
import { useEffect, useMemo } from 'react';

import type { EdgeType, K8sResourceKind } from '../../../shared/constants/types';
import { computeVisibility } from '../computeVisibility';

export interface UseElementFilterProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  elements: cytoscape.ElementDefinition[];
  visibleKinds: K8sResourceKind[];
  visibleEdgeTypes: EdgeType[];
}

export function useElementFilter({ cyRef, elements, visibleKinds, visibleEdgeTypes }: UseElementFilterProps): void {
  const sets = useMemo(
    () => computeVisibility(elements, visibleKinds, visibleEdgeTypes),
    [elements, visibleKinds, visibleEdgeTypes],
  );

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
    });
  }, [cyRef, sets]);
}
