import cytoscape from 'cytoscape';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';

import type { PodParentMode } from '../../../shared/constants/types';
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
  // Current pod-parent mode. Toggling it re-parents pods between node/service
  // containers — a compound-hierarchy change that cytoscape applies reliably only
  // at add() time (dynamic move() is unreliable under batch + expand-collapse), so
  // a mode change triggers a full element rebuild rather than a diff-patch.
  podParentMode?: PodParentMode | undefined;
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
  podParentMode,
}: UseCytoscapeProps): UseCytoscapeReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const prevModeRef = useRef(podParentMode);
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

    // 2) Apply the incoming elements.
    const modeChanged = prevModeRef.current !== podParentMode;
    prevModeRef.current = podParentMode;

    const existing = cy.elements();
    if (modeChanged && existing.length > 0) {
      // Pod-parent mode flip restructures the compound hierarchy (pods move
      // between node and service containers). cytoscape only nests reliably at
      // add() time — dynamic data('parent')/move() is unreliable under batch +
      // the expand-collapse extension — so rebuild the element set wholesale. The
      // co-incident run-token bump re-runs the layout, so reset positions are fine.
      cy.batch(() => {
        existing.remove();
        cy.add(elements);
      });
    } else {
      // Diff real-vs-incoming and patch (remove → add → update).
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
            if (target.length === 0) {
              continue;
            }
            // Same-mode incremental parent change (e.g. backend reassigns a pod's
            // node across a data refresh): capture the model parent BEFORE data()
            // (which carries data.parent and could mask the change), then re-nest
            // via move() — cytoscape does not relocate a compound node when only
            // data('parent') is set. (Mode flips take the rebuild branch above.)
            const isNode = target.isNode();
            const parent = target.parent();
            const nextParent = isNode && typeof el.data.parent === 'string' ? el.data.parent : null;
            const currentParent = isNode && parent.length > 0 ? parent.first().id() : null;
            target.data(el.data);
            if (isNode && nextParent !== currentParent) {
              target.move({ parent: nextParent });
            }
          }
        });
      }
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
  }, [elements, collapseKey, podParentMode]); // eslint-disable-line react-hooks/exhaustive-deps -- refs are stable. collapseKey (undefined on no-collapse path) re-runs the expandAll→diff→reconcile→collapse cycle when the collapsed-set changes without a data refresh; podParentMode is a dep so a mode flip drives the rebuild branch directly rather than relying on elements/collapseKey changing in lockstep

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
