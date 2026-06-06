import type cytoscape from 'cytoscape';
import { useEffect, useMemo, useRef } from 'react';

import type { SwitchConstraints } from '../../switch-topology';

export type LayoutName = 'fcose' | 'dagre';

export interface UseGraphLayoutProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  name: LayoutName;
  // Bumped by the consumer (GraphCanvas) when collapse state changes content, so
  // layout reruns. Defaults to 0 so existing callers keep mount-only behaviour.
  // useGraphLayout remains the SINGLE source of cy.layout() execution (rule 2).
  runToken?: number;
  // Native fcose constraints (from features/switch-topology) that pull `switch`
  // nodes into stacked tiers. Applied at layout-run time only — see below: a
  // change here does NOT itself trigger a relayout, so a data refresh preserves
  // positions (consistent with the rest of the panel). Ignored under dagre.
  switchConstraints?: SwitchConstraints | null;
}

export function useGraphLayout({ cyRef, name, runToken = 0, switchConstraints = null }: UseGraphLayoutProps): void {
  const baseOptions = useMemo<cytoscape.LayoutOptions>(() => {
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

  // Keep the latest constraints in a ref so their object-identity churn (a new
  // object each data refresh) never re-triggers the layout effect. The fresh
  // constraints are read when a real layout run happens (mount / name change /
  // runToken bump), preserving the panel's no-relayout-on-data-refresh behaviour
  // (design D7). useRef's initialiser covers mount; this effect (declared before
  // the layout effect, so it runs first) syncs later changes without writing the
  // ref during render.
  const constraintsRef = useRef<SwitchConstraints | null>(switchConstraints);
  useEffect(() => {
    constraintsRef.current = switchConstraints;
  }, [switchConstraints]);

  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }
    cy.stop();
    const constraints = constraintsRef.current;
    const options =
      name === 'fcose' && constraints !== null
        ? ({ ...(baseOptions as object), ...constraints } as unknown as cytoscape.LayoutOptions)
        : baseOptions;
    cy.layout(options).run();
  }, [cyRef, baseOptions, name, runToken]);
}
