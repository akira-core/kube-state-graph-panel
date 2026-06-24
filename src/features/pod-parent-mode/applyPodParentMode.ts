import type cytoscape from 'cytoscape';

import type { PodParentMode } from '../../shared/constants/types';

const SYNTHETIC_EDGE_PREFIX = 'ppm:pod-runs-on-node:';

// Fresh `data` per element: cytoscape ALIASES the `data` we hand `cy.add` (no
// deep-copy) and expand-collapse mutates `data.source`/`target` in place when a
// controller collapses — passing baseElements by reference would corrupt them.
// See pod-parent-mode spec ("每個 元素 MUST 為全新且彼此獨立的物件").
function cloneElement(el: cytoscape.ElementDefinition): cytoscape.ElementDefinition {
  return { ...el, data: { ...el.data } };
}

/**
 * Re-shape the normalized graph for the given pod-parent mode (pure, immutable —
 * every returned element is a fresh object, see cloneElement). `node` = infra
 * view (cluster > node > pod), drops synthesized controllers + `controller-owns-pod`.
 * `controller` = re-parent each owned pod under its lexicographically smallest
 * owner, synthesise `pod-runs-on-node` to the pod's ORIGINAL K8s `node` parent
 * (only when that parent is a present `node`-kind node), drop `controller-owns-pod`.
 * Full rules in pod-parent-mode spec.
 */
export function applyPodParentMode(
  elements: cytoscape.ElementDefinition[],
  mode: PodParentMode
): cytoscape.ElementDefinition[] {
  if (mode === 'node') {
    // Drop synthesized controllers + their owns edges (controller-view only).
    return elements
      .filter((el) => {
        const data = el.data as Record<string, unknown>;
        if (el.group === 'nodes' && data.isController === true) {
          return false;
        }
        if (el.group === 'edges' && data.edgeType === 'controller-owns-pod') {
          return false;
        }
        return true;
      })
      .map(cloneElement);
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
    const chosen = controllers.reduce((a, b) => (a < b ? a : b));
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
      result.push(cloneElement(el));
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    const chosen = typeof id === 'string' ? chosenControllerByPod.get(id) : undefined;
    // Fresh data; a pod with a chosen owner gets its parent re-pointed to it.
    const nextData = chosen === undefined ? { ...data } : { ...data, parent: chosen };
    result.push({ ...el, data: nextData });
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
