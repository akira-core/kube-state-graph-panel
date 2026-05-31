import cytoscape from 'cytoscape';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';

import { diffElements } from '../sync/diffElements';
import { reconcileCollapse } from '../sync/reconcileCollapse';

export type CyStylesheet = cytoscape.StylesheetStyle | cytoscape.StylesheetCSS;

export interface UseCytoscapeProps {
  elements: cytoscape.ElementDefinition[];
  stylesheet: CyStylesheet[];
  // Optional collapse integration (injected by GraphCanvas). When all undefined,
  // the diff-patch effect behaves exactly as before (backward compatible).
  apiRef?: MutableRefObject<cytoscape.ExpandCollapseApi | null>;
  collapsedIdsRef?: MutableRefObject<ReadonlySet<string>>;
  suppressRef?: MutableRefObject<boolean>;
  onCollapsedChange?: (next: Set<string>) => void;
  // Bumped by GraphCanvas when the collapsed-set CONTENT changes, so the
  // diff-patch effect re-applies collapse without waiting for a data refresh.
  // This keeps api.collapse calls in a single place (one update cycle).
  // When undefined (no-collapse path), the effect deps are effectively [elements].
  collapseKey?: number;
}

export interface UseCytoscapeReturn {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  cyRef: MutableRefObject<cytoscape.Core | null>;
  // Flips to true once the instance exists. cyRef is a ref (no re-render on set),
  // so a child effect that binds cy listeners (e.g. hover) would run before the
  // instance is created — children's effects fire before the parent's init
  // effect — and never re-run. Consumers depend on isReady to (re)bind correctly.
  isReady: boolean;
}

// Use 'preset' on init so cytoscape does not auto-run a layout.
// useGraphLayout is the single source of layout execution.
const INIT_LAYOUT: cytoscape.LayoutOptions = { name: 'preset' };

export function useCytoscape({
  elements,
  stylesheet,
  apiRef,
  collapsedIdsRef,
  suppressRef,
  onCollapsedChange,
  collapseKey,
}: UseCytoscapeProps): UseCytoscapeReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Init / destroy
  useEffect(() => {
    if (containerRef.current === null) {
      return;
    }
    cyRef.current = cytoscape({
      container: containerRef.current,
      elements,
      style: stylesheet,
      layout: INIT_LAYOUT,
    });
    setIsReady(true);
    return (): void => {
      setIsReady(false);
      if (cyRef.current !== null) {
        cyRef.current.removeAllListeners();
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
    // Init effect intentionally runs once — element/style/layout updates handled by dedicated effects below.
    // oxlint-disable-next-line react-doctor/exhaustive-deps -- single-shot init; subsequent updates handled by other effects
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- single-shot init; subsequent updates handled by other effects

  // Elements diff-and-patch (collapse-aware when refs are injected).
  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }
    const api = apiRef?.current ?? null;

    // 1) Restore the real (fully expanded) graph so the diff compares against the
    //    true topology, not the collapsed view. No api / no collapse → no-op.
    if (api) {
      if (suppressRef) {
        suppressRef.current = true;
      }
      api.expandAll();
    }

    // 2) Diff real-vs-incoming and patch (remove → add → update), as before.
    const current = cy.elements().jsons() as cytoscape.ElementDefinition[];
    const diff = diffElements(current, elements);
    if (diff.toAdd.length > 0 || diff.toRemove.length > 0 || diff.toUpdate.length > 0) {
      cy.batch(() => {
        if (diff.toRemove.length > 0) {
          cy.remove(diff.toRemove.map((id) => `#${id}`).join(', '));
        }
        if (diff.toAdd.length > 0) {
          cy.add(diff.toAdd);
        }
        for (const el of diff.toUpdate) {
          const target = cy.getElementById(el.data.id ?? '');
          if (target.length > 0) {
            target.data(el.data);
          }
        }
      });
    }

    // 3) Re-apply collapse to the parents that still exist after the patch.
    if (api) {
      const present = new Set(cy.nodes(':parent').map((n) => n.id()));
      const desired = collapsedIdsRef?.current ?? new Set<string>();
      const recollapse = reconcileCollapse(desired, present);
      if (recollapse.length > 0) {
        const recollapseSet = new Set(recollapse);
        api.collapse(cy.nodes().filter((n) => recollapseSet.has(n.id())));
      }
      if (suppressRef) {
        suppressRef.current = false;
      }
      // 4) Prune: parents removed by this update drop out of the reported set.
      if (recollapse.length !== desired.size) {
        onCollapsedChange?.(new Set(recollapse));
      }
    }
  }, [elements, collapseKey]); // eslint-disable-line react-hooks/exhaustive-deps -- refs are stable; deps are [elements, collapseKey]: collapseKey (undefined on no-collapse path) re-runs the same expandAll→diff→reconcile→collapse cycle when the collapsed-set changes without a data refresh, keeping api.collapse in one place

  // Stylesheet swap (no instance rebuild)
  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }
    cy.style(stylesheet).update();
  }, [stylesheet]);

  return useMemo(() => ({ containerRef, cyRef, isReady }), [containerRef, cyRef, isReady]);
}
