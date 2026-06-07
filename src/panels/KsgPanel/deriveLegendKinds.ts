import type cytoscape from 'cytoscape';

// The kinds shown in the icon "Node kinds" legend — collapse- and container-aware,
// so the legend lists exactly what renders as a GLYPH on the canvas right now:
//
//   - a drawn LEAF (no children) contributes its kind;
//   - a COLLAPSED container contributes its kind (it renders as a single glyph box);
//   - an EXPANDED container does NOT (it renders as a labelled box with no icon — it
//     lives in its own swatch section: Clusters / Nodes|Controllers / Storage classes);
//   - a node hidden inside a collapsed ancestor contributes nothing.
//
// This is why collapsing a storageclass swaps `pvc` → `storageclass` in the legend
// (the PVCs are aggregated away, the collapsed group shows its disk glyph); the same
// holds for node⇄pod and controller⇄pod. `cluster` containers carry no kind and
// never appear here. First-seen order, deduped — a pure function of (elements,
// collapsedIds), mirroring how the cluster legend is derived from the data.
export function deriveLegendKinds(
  elements: readonly cytoscape.ElementDefinition[],
  collapsedIds: ReadonlySet<string>
): string[] {
  const parentById = new Map<string, string>();
  const parentIds = new Set<string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (typeof d.id === 'string' && typeof d.parent === 'string') {
      parentById.set(d.id, d.parent);
      parentIds.add(d.parent);
    }
  }

  const hasCollapsedAncestor = (id: string): boolean => {
    const guard = new Set<string>();
    let parent = parentById.get(id);
    while (parent !== undefined && !guard.has(parent)) {
      if (collapsedIds.has(parent)) {
        return true;
      }
      guard.add(parent);
      parent = parentById.get(parent);
    }
    return false;
  };

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (typeof d.id !== 'string' || typeof d.kind !== 'string' || d.isCluster === true) {
      continue;
    }
    if (hasCollapsedAncestor(d.id)) {
      continue; // hidden inside a collapsed box — no glyph on canvas
    }
    if (parentIds.has(d.id) && !collapsedIds.has(d.id)) {
      continue; // expanded container — renders as a labelled box, not a glyph
    }
    if (seen.has(d.kind)) {
      continue;
    }
    seen.add(d.kind);
    ordered.push(d.kind);
  }
  return ordered;
}
