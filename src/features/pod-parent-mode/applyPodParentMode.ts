import type cytoscape from 'cytoscape';

import type { PodParentMode } from '../../shared/constants/types';

const SYNTHETIC_EDGE_PREFIX = 'ppm:pod-runs-on-node:';

/**
 * Re-shape the normalized graph for the given pod-parent mode.
 *
 * `node` mode is the backend's native view and returns the input unchanged.
 *
 * `service` mode makes the graph service-centric: every pod that is the target
 * of a `service-selects-pod` edge is re-parented under the lexicographically
 * smallest selecting service (so the pod nests inside the Service box), all
 * `service-selects-pod` edges are dropped (that relationship is now nesting, not
 * a drawn edge), and a `pod-runs-on-node` edge is synthesised from the pod to its
 * original K8s node (so the pod↔node relationship — previously expressed as
 * nesting — becomes the drawn edge). Pods with no selecting service (e.g. behind
 * a headless Service that emits no Service node) are left untouched.
 *
 * Pure and immutable: input elements are never mutated; changed nodes are emitted
 * as fresh objects.
 */
export function applyPodParentMode(
  elements: cytoscape.ElementDefinition[],
  mode: PodParentMode
): cytoscape.ElementDefinition[] {
  if (mode === 'node') {
    return elements;
  }

  // Collect every node id (to guard synthetic-edge targets) and, from
  // service-selects-pod edges, the selecting service ids per pod.
  const nodeIds = new Set<string>();
  const servicesByPod = new Map<string, string[]>();
  for (const el of elements) {
    if (el.group === 'nodes') {
      const id = (el.data as Record<string, unknown>).id;
      if (typeof id === 'string') {
        nodeIds.add(id);
      }
      continue;
    }
    const data = el.data as Record<string, unknown>;
    if (data.edgeType !== 'service-selects-pod') {
      continue;
    }
    const service = data.source;
    const pod = data.target;
    if (typeof service !== 'string' || typeof pod !== 'string') {
      continue;
    }
    const existing = servicesByPod.get(pod);
    if (existing) {
      existing.push(service);
    } else {
      servicesByPod.set(pod, [service]);
    }
  }

  // Resolve each re-parented pod's chosen service + original node parent.
  const chosenServiceByPod = new Map<string, string>();
  const originalNodeByPod = new Map<string, string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    if (typeof id !== 'string' || data.kind !== 'pod') {
      continue;
    }
    const services = servicesByPod.get(id);
    if (services === undefined || services.length === 0) {
      continue;
    }
    const chosen = [...services].sort()[0];
    if (chosen === undefined) {
      continue;
    }
    chosenServiceByPod.set(id, chosen);
    // Only record the original node when it actually exists as a node, so the
    // synthesised pod-runs-on-node edge can never dangle. A pod with no parent,
    // or a parent that the backend never emitted as a node, simply gets no edge.
    if (typeof data.parent === 'string' && nodeIds.has(data.parent)) {
      originalNodeByPod.set(id, data.parent);
    }
  }

  const result: cytoscape.ElementDefinition[] = [];
  for (const el of elements) {
    if (el.group === 'edges') {
      const data = el.data as Record<string, unknown>;
      // service-selects-pod is nesting in service mode — never drawn.
      if (data.edgeType === 'service-selects-pod') {
        continue;
      }
      result.push(el);
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    const chosen = typeof id === 'string' ? chosenServiceByPod.get(id) : undefined;
    if (chosen !== undefined) {
      result.push({ ...el, data: { ...data, parent: chosen } });
    } else {
      result.push(el);
    }
  }

  for (const [podId, nodeId] of originalNodeByPod) {
    result.push({
      group: 'edges',
      data: {
        id: `${SYNTHETIC_EDGE_PREFIX}${podId}`,
        source: podId,
        target: nodeId,
        edgeType: 'pod-runs-on-node',
      },
    } as unknown as cytoscape.ElementDefinition);
  }

  return result;
}
