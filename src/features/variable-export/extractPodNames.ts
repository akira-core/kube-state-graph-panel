import type cytoscape from 'cytoscape';

/**
 * Collect the display names of every pod node in the normalized element list —
 * the data-layer answer to "which pods are in the graph". Input must be the
 * normalize output BEFORE the pod-parent-mode view transform: collapse state,
 * filter visibility and view mode never change what the consuming variable
 * (e.g. an ES logs query) should see. Deduped (same-named pods across clusters
 * collapse to one entry) and sorted for a stable, order-insensitive value.
 */
export function extractPodNames(elements: readonly cytoscape.ElementDefinition[]): string[] {
  const names = new Set<string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.kind !== 'pod') {
      continue;
    }
    const label = typeof d.label === 'string' && d.label !== '' ? d.label : d.id;
    if (typeof label === 'string' && label !== '') {
      names.add(label);
    }
  }
  return [...names].sort();
}
