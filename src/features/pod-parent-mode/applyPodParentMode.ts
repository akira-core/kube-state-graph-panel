import type cytoscape from 'cytoscape';

import type { PodParentMode } from '../../shared/constants/types';

const SYNTHETIC_EDGE_PREFIX = 'ppm:pod-runs-on-node:';

/**
 * Re-shape the normalized graph for the given pod-parent mode.
 *
 * `node` mode is the backend's native view (returned unchanged): pods nest in
 * their K8s node, `controller-owns-pod` is a drawn edge, `pod-runs-on-node` is
 * nesting.
 *
 * `controller` mode makes the graph controller-centric: every pod that is the
 * target of a `controller-owns-pod` edge is re-parented under the
 * lexicographically smallest owning controller; all `controller-owns-pod` edges
 * are dropped (that relationship is now nesting); and a `pod-runs-on-node` edge
 * is synthesised from the pod to its ORIGINAL K8s `node` parent — but only when
 * that original parent is a `node`-kind node present in elements (a pod parented
 * to a cluster, or to nothing, gets re-parented to the controller with no edge).
 * Service edges (`service-selects-pod` / `pod-calls-service`) are kept in both
 * modes.
 *
 * Pure and immutable: input is never mutated; changed nodes are fresh objects.
 */
export function applyPodParentMode(
  elements: cytoscape.ElementDefinition[],
  mode: PodParentMode
): cytoscape.ElementDefinition[] {
  if (mode === 'node') {
    return elements;
  }

  const nodeKindIds = new Set<string>();
  const controllersByPod = new Map<string, string[]>();
  for (const el of elements) {
    if (el.group === 'nodes') {
      const data = el.data as Record<string, unknown>;
      if (typeof data.id === 'string' && data.kind === 'node') {
        nodeKindIds.add(data.id);
      }
      continue;
    }
    const data = el.data as Record<string, unknown>;
    if (data.edgeType !== 'controller-owns-pod') {
      continue;
    }
    const controller = data.source;
    const pod = data.target;
    if (typeof controller !== 'string' || typeof pod !== 'string') {
      continue;
    }
    const existing = controllersByPod.get(pod);
    if (existing) {
      existing.push(controller);
    } else {
      controllersByPod.set(pod, [controller]);
    }
  }

  const chosenControllerByPod = new Map<string, string>();
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
    const controllers = controllersByPod.get(id);
    if (controllers === undefined || controllers.length === 0) {
      continue;
    }
    const chosen = [...controllers].sort()[0];
    if (chosen === undefined) {
      continue;
    }
    chosenControllerByPod.set(id, chosen);
    if (typeof data.parent === 'string' && nodeKindIds.has(data.parent)) {
      originalNodeByPod.set(id, data.parent);
    }
  }

  const result: cytoscape.ElementDefinition[] = [];
  for (const el of elements) {
    if (el.group === 'edges') {
      const data = el.data as Record<string, unknown>;
      if (data.edgeType === 'controller-owns-pod') {
        continue;
      }
      result.push(el);
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    const chosen = typeof id === 'string' ? chosenControllerByPod.get(id) : undefined;
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
