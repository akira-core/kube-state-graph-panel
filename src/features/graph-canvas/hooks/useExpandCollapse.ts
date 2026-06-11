import type cytoscape from 'cytoscape';
import { useEffect } from 'react';

const CUE_EVENTS = 'expandcollapse.aftercollapse expandcollapse.afterexpand';
const COLLAPSED_NODE_CLASS = 'cy-expand-collapse-collapsed-node';
// Re-init guard key (cy.scratch): a second cy.expandCollapse(options) call on the
// SAME instance performs a full re-init — it appends another cue canvas and binds
// a duplicate internal listener set that can never be unbound (the extension
// overwrites its scratch event registry). Init once per instance, 'get' afterwards.
const SCRATCH_INIT_KEY = '_ksgExpandCollapseInit';

export interface UseExpandCollapseProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  // Gate: only init the extension when collapse is actually wired (GraphCanvas
  // sets this from collapseEnabled). When false the effect early-returns and
  // NEVER calls cy.expandCollapse — the backward-compatible no-collapse path
  // must never touch the (potentially unregistered) extension.
  enabled: boolean;
  isReady: boolean;
  // Owned by GraphCanvas. This hook WRITES the api; useCytoscape READS it.
  apiRef: React.MutableRefObject<cytoscape.ExpandCollapseApi | null>;
  // Mirror of KsgPanel.collapsedIds; read by useCytoscape, not by this hook.
  collapsedIdsRef: React.MutableRefObject<ReadonlySet<string>>;
  // Set true by useCytoscape during programmatic expand/collapse so cue events
  // fired by those operations do not loop back as user actions.
  suppressRef: React.MutableRefObject<boolean>;
  onCollapsedChange: (next: Set<string>) => void;
  // Called once after the mount-time default-collapse is applied below. The
  // collapse here runs with layoutBy:null AFTER useGraphLayout's mount pass (this
  // hook is declared last in GraphCanvas), so the only layout ran on the EXPANDED
  // graph and the collapsed parents are left stacked at the origin. This callback
  // lets GraphCanvas bump the layout token so useGraphLayout reruns ON the
  // collapsed graph (it stays the single source of cy.layout(), rule 2).
  onMountCollapseApplied?: () => void;
}

export function useExpandCollapse({
  cyRef,
  enabled,
  isReady,
  apiRef,
  collapsedIdsRef,
  suppressRef,
  onCollapsedChange,
  onMountCollapseApplied,
}: UseExpandCollapseProps): void {
  useEffect(() => {
    const cy = cyRef.current;
    if (!enabled || !isReady || cy === null) {
      return;
    }
    const api =
      cy.scratch(SCRATCH_INIT_KEY) === true
        ? cy.expandCollapse('get')
        : cy.expandCollapse({
            layoutBy: null,
            fisheye: false,
            animate: false,
            undoable: false,
            cueEnabled: true,
          });
    cy.scratch(SCRATCH_INIT_KEY, true);
    apiRef.current = api;
    // Apply any collapse that was desired BEFORE the extension existed.
    // useCytoscape's diff-patch effect also reconciles collapse, but it is declared
    // ahead of this hook in GraphCanvas, so on the render where the api first
    // initialises it has already run with a null api and skipped. Without this, a
    // collapse set on mount (controller mode's default-collapse) would never apply.
    const toCollapse = cy.nodes(':parent').filter((n) => collapsedIdsRef.current.has(n.id()));
    if (toCollapse.length > 0) {
      suppressRef.current = true;
      api.collapse(toCollapse);
      suppressRef.current = false;
      // Force one layout pass on the now-collapsed graph; otherwise the only
      // layout ran while expanded and these parents stay coincident at origin.
      onMountCollapseApplied?.();
    }
    const handleCue = (evt: cytoscape.EventObject): void => {
      // Programmatic apply in progress (useCytoscape) — ignore the echoed event.
      if (suppressRef.current) {
        return;
      }
      // Incremental merge with the DESIRED set, never a rebuild from the canvas:
      // collapsing an ancestor physically removes already-collapsed descendants
      // from the graph, so a `cy.nodes('.collapsed')` rebuild would silently drop
      // their ids and the next reconcile would permanently expand them (e.g.
      // default-collapsed storage classes inside a cue-collapsed cluster).
      const target = evt.target as cytoscape.NodeSingular;
      const next = new Set(collapsedIdsRef.current);
      if (target.hasClass(COLLAPSED_NODE_CLASS)) {
        next.add(target.id());
      } else {
        next.delete(target.id());
      }
      onCollapsedChange(next);
    };
    cy.on(CUE_EVENTS, handleCue);
    return (): void => {
      cy.off(CUE_EVENTS, handleCue);
      apiRef.current = null;
    };
    // collapsedIdsRef/suppressRef are stable refs; re-bind only on instance swap
    // or when the enabled gate flips. onMountCollapseApplied is a stable useCallback
    // (GraphCanvas), so it does not re-trigger this effect.
  }, [cyRef, enabled, isReady, apiRef, collapsedIdsRef, suppressRef, onCollapsedChange, onMountCollapseApplied]);
}
