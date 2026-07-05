import type cytoscape from 'cytoscape';

/**
 * Collect the display names of every pod node that carries at least one alert
 * in the normalized element list — the data-layer answer to "which pods have
 * an active alert". Input must be the normalize output BEFORE the
 * pod-parent-mode view transform: collapse state, filter visibility and view
 * mode never change what the consuming variable (e.g. a VictoriaMetrics
 * query) should see. Alert `severity` never affects inclusion — any severity
 * counts as "has an alert". Non-pod nodes are excluded even when they carry
 * alerts of their own (see extractAlertNames for the cross-kind collector).
 * Deduped (same-named pods across clusters collapse to one entry) and sorted
 * for a stable, order-insensitive value.
 */
export function extractAlertPodNames(elements: readonly cytoscape.ElementDefinition[]): string[] {
  const names = new Set<string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.kind !== 'pod') {
      continue;
    }
    if (d.alerts === undefined || d.alerts.length === 0) {
      continue;
    }
    const label = typeof d.label === 'string' && d.label !== '' ? d.label : d.id;
    if (label !== undefined && label !== '') {
      names.add(label);
    }
  }
  return [...names].sort();
}
