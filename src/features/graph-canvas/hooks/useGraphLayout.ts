import type cytoscape from 'cytoscape';
import { useEffect, useMemo } from 'react';

export type LayoutName = 'fcose' | 'dagre';

export interface UseGraphLayoutProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  name: LayoutName;
}

export function useGraphLayout({ cyRef, name }: UseGraphLayoutProps): void {
  const options = useMemo<cytoscape.LayoutOptions>(() => {
    if (name === 'dagre') {
      return { name: 'dagre', rankDir: 'TB', nodeSep: 50, rankSep: 80 } as unknown as cytoscape.LayoutOptions;
    }
    return {
      name: 'fcose',
      animate: true,
      // randomize: true seeds initial positions before fcose runs, avoiding the
      // "explosion from origin" flash that happens when preset init layout
      // leaves every node at (0,0).
      randomize: true,
      idealEdgeLength: 100,
      nodeRepulsion: 5000,
    } as unknown as cytoscape.LayoutOptions;
  }, [name]);

  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }
    cy.stop();
    cy.layout(options).run();
  }, [cyRef, options]);
}
