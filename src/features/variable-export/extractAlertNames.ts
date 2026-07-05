import type cytoscape from 'cytoscape';

/**
 * Collect every alert name carried anywhere in the normalized element list —
 * the data-layer answer to "which alertnames are active in this graph", for a
 * consumer (e.g. a VictoriaMetrics alert query) that queries by alertname
 * regardless of which kind of node raised it. Unlike extractAlertPodNames,
 * this walks ALL node elements: pod, node, pvc, service and controller kinds
 * all carry their own `alerts` (normalize.ts also aggregates a controller's
 * child-pod alerts onto the controller node — the Set below absorbs that
 * duplication). Input must be the normalize output BEFORE the
 * pod-parent-mode view transform: collapse state, filter visibility and view
 * mode never change what the consuming variable should see. Deduped and
 * sorted for a stable, order-insensitive value.
 */
export function extractAlertNames(elements: readonly cytoscape.ElementDefinition[]): string[] {
  const names = new Set<string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.alerts === undefined) {
      continue;
    }
    for (const a of d.alerts) {
      names.add(a.name);
    }
  }
  return [...names].sort();
}
