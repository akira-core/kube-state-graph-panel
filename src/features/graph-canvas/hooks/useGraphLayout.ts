import type cytoscape from 'cytoscape';
import { useEffect, useMemo } from 'react';

export type LayoutName = 'fcose' | 'dagre';

export interface UseGraphLayoutProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  name: LayoutName;
  // Bumped by the consumer (GraphCanvas) when collapse state changes content, so
  // layout reruns. Defaults to 0 so existing callers keep mount-only behaviour.
  // useGraphLayout remains the SINGLE source of cy.layout() execution (rule 2).
  runToken?: number;
}

export function useGraphLayout({ cyRef, name, runToken = 0 }: UseGraphLayoutProps): void {
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
  }, [cyRef, options, runToken]);
}
