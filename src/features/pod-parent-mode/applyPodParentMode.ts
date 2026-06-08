import type cytoscape from 'cytoscape';

import type { PodParentMode } from '../../shared/constants/types';

const SYNTHETIC_EDGE_PREFIX = 'ppm:pod-runs-on-node:';

// Return an element with its own fresh `data` object. Load-bearing: cytoscape
// ALIASES the `data` object we hand it (it does not deep-copy on `cy.add`), and
// the expand-collapse extension re-routes a collapsed controller's edges by
// mutating `data.source`/`data.target` in place. If we passed through the
// normalized `baseElements` objects by reference, that mutation would corrupt
// baseElements — so toggling back to node mode would see `controller→pvc` edges
// (controller filtered out → the whole workload orphans). Cloning keeps the
// normalized input pristine across mode switches.
function cloneElement(el: cytoscape.ElementDefinition): cytoscape.ElementDefinition {
  return { ...el, data: { ...el.data } };
}

/**
 * Re-shape the normalized graph for the given pod-parent mode.
 *
 * `node` mode is the infrastructure view (clean cluster > node > pod): pods nest
 * in their K8s node, `pod-runs-on-node` is nesting. The synthesized controllers
 * (`data.isController`) and their `controller-owns-pod` edges belong to the
 * controller view only, so they are dropped here (node mode is no longer a
 * referential passthrough — it returns a filtered copy).
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
 * Pure and immutable: input is never mutated, and EVERY returned element is a
 * fresh object (data shallow-cloned via cloneElement) — not just the changed
 * ones — so cytoscape's in-place edge re-routing can never corrupt baseElements.
 */
export function applyPodParentMode(
  elements: cytoscape.ElementDefinition[],
  mode: PodParentMode
): cytoscape.ElementDefinition[] {
  if (mode === 'node') {
    // Node mode is the infrastructure view (cluster > node > pod). The synthesized
    // controllers + their controller-owns-pod edges belong to the controller view
    // only, so drop them here — node mode stays a clean backend topology.
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
    // Pass through with fresh data (same as cloneElement); a pod with a chosen
    // owner additionally gets its parent re-pointed to that controller.
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
