import type cytoscape from 'cytoscape';
import { useEffect } from 'react';

import { FADED_CLASS } from '../styles/getStylesheet';

export interface UseSelectionFocusProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  selectedId: string | null;
  // Gates binding until the instance exists, and re-applies after a rebuild
  // (mode flip / data refresh) drops the imperative classes.
  isReady: boolean;
  elements: cytoscape.ElementDefinition[];
  // Dep-only: re-runs the focus pass when the filter changes, since the visibility of the
  // SELECTED node decides whether a focus is applied at all and hiding it changes no other
  // input here. Never read — useElementFilter owns applying these sets.
  visibility?: unknown;
}

// Dim everything outside the selected node's focus set so the selection reads
// clearly on a dense graph. Focus = the selected node, its incident edges and
// neighbour nodes (closedNeighborhood), its own descendants (so selecting a
// container keeps its children lit), and the ancestor containers of all of those
// (so a lit node never sits inside a dimmed box). Selecting nothing clears it.
export function applySelectionFocus(cy: cytoscape.Core, selectedId: string | null): void {
  cy.batch(() => {
    cy.elements().removeClass(FADED_CLASS);
    if (selectedId === null) {
      return;
    }
    const selected = cy.getElementById(selectedId);
    // Bail on a selection that is not on canvas — REMOVED (empty) or merely HIDDEN by the
    // kind / edge-type / ingress filter. Fading around an invisible node would dim the
    // entire graph with nothing lit to explain why. `.visible()` (not `.style(...)`) is the
    // right predicate: cytoscape's effective visibility ANDs a node with its ancestors, so
    // this also covers a node whose container was filtered out. Runs after useElementFilter
    // (declared earlier in GraphCanvas), so the styles it reads are already current.
    if (selected.empty() || !selected.visible()) {
      return;
    }
    const core = selected.closedNeighborhood().union(selected.descendants());
    const focus = core.union(core.ancestors());
    cy.elements().difference(focus).addClass(FADED_CLASS);
  });
}

export function useSelectionFocus({
  cyRef,
  selectedId,
  isReady,
  elements,
  visibility,
}: UseSelectionFocusProps): void {
  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }
    applySelectionFocus(cy, selectedId);
    // isReady/elements re-run this once the instance exists and after rebuilds; `visibility`
    // re-runs it when a filter hides or restores the selected node.
  }, [cyRef, selectedId, isReady, elements, visibility]);
}
