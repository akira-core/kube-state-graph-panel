import type cytoscape from 'cytoscape';

import { INGRESS_LABEL_KEY, INGRESS_LABEL_VALUE } from '../constants/ingressGateway';

// The ingress-gateway node set: (a) every node whose labels carry the
// backend-guaranteed ingress marker (any kind), plus (b) the target pods those
// marked nodes select via `service-selects-pod` (source ∈ set) — one derivation
// level only, NO transitive closure: a target added here must never itself seed
// further expansion. Pods selected by an UNMARKED service are untouched.
//
// Single source of truth for "what counts as an ingress node", shared by the
// element-filter (hides this set when the toggle is off) and the graph-data
// normalize pass (marks edges touching this set as the dashed ingress path).
export function collectIngressNodeIds(elements: cytoscape.ElementDefinition[]): Set<string> {
  const ids = new Set<string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    const labels = data.labels;
    if (
      typeof id === 'string' &&
      typeof labels === 'object' &&
      labels !== null &&
      (labels as Record<string, unknown>)[INGRESS_LABEL_KEY] === INGRESS_LABEL_VALUE
    ) {
      ids.add(id);
    }
  }
  if (ids.size === 0) {
    return ids;
  }
  // Expand from a snapshot of the labeled set — a target added here must never
  // itself seed further expansion (single level, not a closure).
  const labeled = new Set(ids);
  for (const el of elements) {
    if (el.group !== 'edges') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    if (data.edgeType !== 'service-selects-pod') {
      continue;
    }
    const source = data.source;
    const target = data.target;
    if (typeof source === 'string' && typeof target === 'string' && labeled.has(source)) {
      ids.add(target);
    }
  }
  return ids;
}
