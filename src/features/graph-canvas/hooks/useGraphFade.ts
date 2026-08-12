import type cytoscape from 'cytoscape';
import { useEffect } from 'react';

import { FADED_CLASS } from '../styles/getStylesheet';

export interface GraphFadeInput {
  // Current selection (canvas tap or locate). Drives FOCUS fade while no query is active.
  selectedId: string | null;
  // True while the search query is non-empty (design D3) — distinct from an empty
  // `searchLitNodeIds`, which under an active zero-hit query fades the WHOLE graph.
  searchActive: boolean;
  // Hit nodes with proxy-hit substitution already applied (resolveSearchHits). Only read
  // while `searchActive`; this hook adds their incident edges + ancestors.
  searchLitNodeIds: ReadonlySet<string>;
  // The node the user LOCATED from the result list for the current query — NOT simply
  // "the selection while searching". A selection carried in from before the query (the
  // detail panel's × leaves it set) must not light an unrelated island next to the hits.
  searchFocusNodeId: string | null;
}

export interface UseGraphFadeProps extends GraphFadeInput {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  // Gates the first apply until the instance exists, and re-applies after a rebuild
  // (mode flip / data refresh) drops the imperative classes.
  isReady: boolean;
  elements: cytoscape.ElementDefinition[];
  // Dep-only: re-runs the pass when the filter changes, since the visibility of the
  // selected / located node decides whether a fade is applied at all and hiding it changes
  // no other input here. Never read — useElementFilter owns applying these sets.
  visibility?: unknown;
}

// The focus set of a node: the node itself, its incident edges and neighbour nodes
// (closedNeighborhood), its own descendants (so a selected container keeps its children
// lit), and the ancestor containers of all of those (so a lit node never sits inside a
// dimmed box).
//
// Returns null when the node is not on canvas — REMOVED (empty) or merely HIDDEN by the
// kind / edge-type / ingress filter. `.visible()` (not `.style(...)`) is the right
// predicate: cytoscape's effective visibility ANDs a node with its ancestors, so this also
// covers a node whose container was filtered out. Fading around an invisible node would
// dim the whole graph with nothing lit to explain why.
export function focusSetFor(cy: cytoscape.Core, nodeId: string): cytoscape.Collection | null {
  const node = cy.getElementById(nodeId);
  if (node.empty() || !node.visible()) {
    return null;
  }
  const core = node.closedNeighborhood().union(node.descendants());
  return core.union(core.ancestors());
}

// The elements that stay lit, or null when nothing fades at all (no selection, or a
// selection that is off canvas).
function litSet(cy: cytoscape.Core, input: GraphFadeInput): cytoscape.Collection | null {
  const { selectedId, searchActive, searchLitNodeIds, searchFocusNodeId } = input;

  // Focus fade — no query: dim everything outside the selected node's focus set.
  if (!searchActive) {
    return selectedId === null ? null : focusSetFor(cy, selectedId);
  }

  // Miss fade — query active: hits ∪ their incident edges ∪ their ancestors. An empty hit
  // set yields an empty (not absent) lit set, so a zero-hit query fades the whole graph.
  const hits = cy.nodes().filter((node) => searchLitNodeIds.has(node.id()));
  const lit = hits.union(hits.connectedEdges()).union(hits.ancestors());
  if (hits.empty() || searchFocusNodeId === null) {
    return lit;
  }
  // A LOCATED node also lights its focus neighborhood, so locating reads like a canvas
  // left-click on that node. Skipped for a zero-hit query, which must fade everything.
  const focus = focusSetFor(cy, searchFocusNodeId);
  return focus === null ? lit : lit.union(focus);
}

// One fade, two mutually exclusive reasons (CONTEXT.md "focus fade" / "miss fade"): dim
// every element outside the lit set via FADED_CLASS. Class-toggle only — no removal, no
// layout run, no computeVisibility involvement. Computing both reasons here is what makes
// their mutual exclusivity structural rather than a flag two hooks have to honour.
export function applyGraphFade(cy: cytoscape.Core, input: GraphFadeInput): void {
  // Resolve the lit set BEFORE opening the batch. `focusSetFor` reads `.visible()`, and
  // cy.batch() defers style application: an element whose style has not been computed yet
  // reads back as invisible inside a batch — and cytoscape caches that answer for the
  // current style version. Batch the class mutations only.
  const lit = litSet(cy, input);
  cy.batch(() => {
    cy.elements().removeClass(FADED_CLASS);
    if (lit === null) {
      return;
    }
    cy.elements().difference(lit).addClass(FADED_CLASS);
  });
}

// MUST be declared after useElementFilter in GraphCanvas: `focusSetFor` reads `.visible()`,
// which is only current once that commit's filter styles have been applied.
export function useGraphFade({
  cyRef,
  isReady,
  elements,
  visibility,
  selectedId,
  searchActive,
  searchLitNodeIds,
  searchFocusNodeId,
}: UseGraphFadeProps): void {
  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }
    applyGraphFade(cy, { selectedId, searchActive, searchLitNodeIds, searchFocusNodeId });
    // isReady/elements re-run this once the instance exists and after rebuilds; `visibility`
    // re-runs it when a filter hides or restores the selected / located node.
  }, [cyRef, isReady, elements, visibility, selectedId, searchActive, searchLitNodeIds, searchFocusNodeId]);
}
