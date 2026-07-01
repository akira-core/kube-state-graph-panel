import type cytoscape from 'cytoscape';

// Toggle a decorative `cluster` group's collapse/expand through the expand-collapse
// api. Clusters are NON-selectable (so the selection-driven `+/-` cue never surfaces on
// them); double-tap is their collapse gesture instead. Gated on `isCluster` so a dbltap
// on any other element is a no-op — the guard lives here (not the event handler) so the
// whole decision is unit-testable without a live cytoscape instance.
//
// A currently-collapsed parent reports `isExpandable` → expand it; an expanded parent
// reports `isCollapsible` → collapse it. Both paths fire the same
// `expandcollapse.aftercollapse`/`afterexpand` events the cue would, so `collapsedIds`
// updates through the existing useExpandCollapse plumbing (no new state path).
export function clusterCollapseToggle(node: cytoscape.NodeSingular, api: cytoscape.ExpandCollapseApi): void {
  if (node.data('isCluster') !== true) {
    return;
  }
  if (api.isExpandable(node)) {
    api.expand(node);
    return;
  }
  if (api.isCollapsible(node)) {
    api.collapse(node);
  }
}
