import type cytoscape from 'cytoscape';
import { useEffect, useMemo, useRef } from 'react';

import type { SwitchConstraints } from '../../switch-topology';

export type LayoutName = 'fcose' | 'dagre';

// Constraints are derived from the full React-side element model, but the layout
// runs on the live graph where expand-collapse may have removed pinned switches
// (e.g. inside a collapsed network/cluster compound). fcose NaN-poisons EVERY node
// position when a fixedNodeConstraint references a missing node (cose-base indexes
// the absent id into undefined coordinates), so keep only the constraints whose
// nodes are actually in the graph at run time.
function presentConstraints(cy: cytoscape.Core, constraints: SwitchConstraints): SwitchConstraints {
  const fixed = constraints.fixedNodeConstraint?.filter((c) => cy.getElementById(c.nodeId).length > 0);
  return fixed !== undefined && fixed.length > 0 ? { fixedNodeConstraint: fixed } : {};
}

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
      // animate: false runs fcose SYNCHRONOUSLY. A pod-parent mode switch rebuilds the
      // element set (useCytoscape remove+add) and bumps runToken in the same cycle, so the
      // layout re-runs from scratch on freshly-origin-stacked nodes. With animate:true that
      // pass was getting interrupted mid-convergence by the next render, leaving clusters and
      // internal nodes overlapping (the "switch Node→Controller degrades the layout" bug).
      // Synchronous convergence can't be interrupted, so a mode toggle never degrades it.
      animate: false,
      // randomize: true seeds random initial positions before fcose runs. Required:
      // a pod-parent mode flip REBUILDS the element set (useCytoscape remove+add), so
      // every node starts at the origin — without randomize they would collapse into a
      // pile. The tuning below is what keeps each from-scratch run converging to a
      // non-overlapping, short-edge layout (so a mode toggle never degrades it).
      randomize: true,
      // 'proof' runs the most iterations → reliable convergence (no luck-dependent
      // overlaps / long edges on a re-run). The graph is small, so the cost is fine.
      quality: 'proof',
      numIter: 4000,
      // Count labels in node dimensions so fcose spreads nodes enough that their
      // labels (rendered below each 40px node) don't overlap either.
      nodeDimensionsIncludeLabels: true,
      // Short ideal edge keeps connected nodes close (edges ≈ a few node widths);
      // nodeSeparation enforces a MINIMUM gap so nodes don't overlap WITHOUT a big
      // global repulsion (which would both lengthen edges and let the free cluster
      // compounds drift far from the pinned switch fabric). Strong gravity pulls the
      // clusters up toward the fabric so the node→switch uplinks stay short too.
      idealEdgeLength: 55,
      nodeRepulsion: 8000,
      nodeSeparation: 80,
      gravity: 0.7,
      gravityRange: 4.0,
      // Strong compound gravity pulls each cluster/controller compound's children
      // tightly toward its centre so a child never bleeds into another cluster's box;
      // packComponents arranges any disconnected component without overlap.
      gravityCompound: 2.0,
      packComponents: true,
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

  // Handle of the previous run: cy.stop() only halts core (viewport) animations,
  // NOT a still-animating layout pass — without layout.stop() back-to-back runs
  // (the mount pass + the default-collapse relayout bump) fight over positions.
  const layoutRef = useRef<cytoscape.Layouts | null>(null);

  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }
    layoutRef.current?.stop();
    cy.stop();
    const constraints = constraintsRef.current;
    const options =
      name === 'fcose' && constraints !== null
        ? ({ ...(baseOptions as object), ...presentConstraints(cy, constraints) } as unknown as cytoscape.LayoutOptions)
        : baseOptions;
    const layout = cy.layout(options);
    layoutRef.current = layout;
    layout.run();
  }, [cyRef, baseOptions, name, runToken]);
}
