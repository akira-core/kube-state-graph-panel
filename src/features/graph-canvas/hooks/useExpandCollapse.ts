import type cytoscape from 'cytoscape';
import { useEffect } from 'react';

const CUE_EVENTS = 'expandcollapse.aftercollapse expandcollapse.afterexpand';
const COLLAPSED_NODE_CLASS = '.cy-expand-collapse-collapsed-node';

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
}

export function useExpandCollapse({
  cyRef,
  enabled,
  isReady,
  apiRef,
  suppressRef,
  onCollapsedChange,
}: UseExpandCollapseProps): void {
  useEffect(() => {
    const cy = cyRef.current;
    if (!enabled || !isReady || cy === null) {
      return;
    }
    apiRef.current = cy.expandCollapse({
      layoutBy: null,
      fisheye: false,
      animate: false,
      undoable: false,
      cueEnabled: true,
    });
    const handleCue = (): void => {
      // Programmatic apply in progress (useCytoscape) — ignore the echoed event.
      if (suppressRef.current) {
        return;
      }
      const next = new Set(cy.nodes(COLLAPSED_NODE_CLASS).map((n) => n.id()));
      onCollapsedChange(next);
    };
    cy.on(CUE_EVENTS, handleCue);
    return (): void => {
      cy.off(CUE_EVENTS, handleCue);
      apiRef.current = null;
    };
    // collapsedIdsRef/suppressRef are stable refs; re-bind only on instance swap
    // or when the enabled gate flips.
  }, [cyRef, enabled, isReady, apiRef, suppressRef, onCollapsedChange]);
}
