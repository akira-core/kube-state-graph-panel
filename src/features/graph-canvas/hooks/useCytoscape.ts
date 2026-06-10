import cytoscape from 'cytoscape';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';

import type { PodParentMode } from '../../../shared/constants/types';
import { diffElements } from '../sync/diffElements';
import { reconcileCollapse } from '../sync/reconcileCollapse';
import { seedAddedNodePositions } from '../sync/seedAddedNodePositions';

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
  // Current pod-parent mode. Toggling it re-parents pods between node/controller
  // containers — a compound-hierarchy change that cytoscape applies reliably only
  // at add() time (dynamic move() is unreliable under batch + expand-collapse), so
  // a mode change triggers a full element rebuild rather than a diff-patch.
  podParentMode?: PodParentMode | undefined;
  // Called when a data refresh adds a wholly-new compound family with no existing
  // anchor (e.g. a controller synthesized this refresh): such nodes cannot be
  // seeded and would stack at the origin, so GraphCanvas relayouts once. Anchored
  // adds (a pod under an existing container) do NOT call this — D7 preserved.
  onStructuralRelayout?: () => void;
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

// Data keys the update patch must never drop: id/parent/source/target are immutable
// through data() (parent re-nesting goes through move(), edge rewires through the
// remove/add path), and the rest is cytoscape-expand-collapse bookkeeping parked on
// data — normalize never emits those, so "absent from the incoming definition" must
// not delete them.
const PRESERVED_DATA_KEYS = new Set([
  'id',
  'parent',
  'source',
  'target',
  'collapsedChildren',
  'collapsedEdges',
  'originalEnds',
  'position-before-collapse',
  'size-before-collapse',
]);
function isPreservedDataKey(key: string): boolean {
  return PRESERVED_DATA_KEYS.has(key) || key.startsWith('expandcollapse');
}

export function useCytoscape({
  elements,
  stylesheet,
  apiRef,
  collapsedIdsRef,
  suppressRef,
  onCollapsedChange,
  collapseKey,
  podParentMode,
  onStructuralRelayout,
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

    // Set when this patch adds a wholly-new compound family with no existing
    // anchor (seedAddedNodePositions cannot place it) — triggers one relayout.
    let addedUnanchored = false;

    const existing = cy.elements();
    if (modeChanged && existing.length > 0) {
      // Pod-parent mode flip restructures the compound hierarchy (pods move
      // between node and controller containers). cytoscape only nests reliably at
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
            // Seed new nodes inside their parent's cluster (not the origin) so a
            // refresh that adds a pod under a COLLAPSED controller does not drag
            // that controller's collapsed-box toward (0,0). expandAll() above has
            // already restored the parents, so their positions are valid here. A
            // wholly-new family with no present anchor is flagged for one relayout.
            const seeded = seedAddedNodePositions(cy, diff.toAdd);
            cy.add(seeded.elements);
            if (seeded.unanchored > 0) {
              addedUnanchored = true;
            }
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
            // data(obj) is extend-only: a key the incoming definition OMITS (e.g. a
            // controller whose last alerting pod recovered no longer carries
            // `alerts`) would survive the patch forever — and keep re-flagging this
            // element as changed on every diff cycle. Drop the diffed-away keys first.
            const staleKeys = Object.keys(target.data() as Record<string, unknown>).filter(
              (k) => !(k in el.data) && !isPreservedDataKey(k)
            );
            if (staleKeys.length > 0) {
              target.removeData(staleKeys.join(' '));
            }
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

    // 5) A new unanchorable family was added — request one relayout so it does not
    //    stay stacked at the origin (anchored adds skip this, preserving D7).
    if (addedUnanchored) {
      onStructuralRelayout?.();
    }
  }, [elements, collapseKey, podParentMode]); // eslint-disable-line react-hooks/exhaustive-deps -- refs/callbacks are stable. collapseKey (undefined on no-collapse path) re-runs the expandAll→diff→reconcile→collapse cycle when the collapsed-set changes without a data refresh; podParentMode is a dep so a mode flip drives the rebuild branch directly rather than relying on elements/collapseKey changing in lockstep

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
