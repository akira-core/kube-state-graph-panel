import type cytoscape from 'cytoscape';

import { ICON_SVG_BY_KIND } from '../../shared/constants/iconSvgByKind';
import type { EdgeType, NodeKind } from '../../shared/constants/types';

export interface VisibilitySets {
  visibleNodeIds: Set<string>;
  visibleEdgeIds: Set<string>;
}

const KNOWN_KINDS = new Set<string>(Object.keys(ICON_SVG_BY_KIND));

function nodeIsVisible(kind: unknown, visibleKinds: Set<NodeKind>): boolean {
  if (typeof kind !== 'string') {
    return true;
  }
  if (!KNOWN_KINDS.has(kind)) {
    return true;
  }
  return visibleKinds.has(kind as NodeKind);
}

export function computeVisibility(
  elements: cytoscape.ElementDefinition[],
  visibleKinds: NodeKind[],
  visibleEdgeTypes: EdgeType[]
): VisibilitySets {
  const kindSet = new Set<NodeKind>(visibleKinds);
  const edgeTypeSet = new Set<EdgeType>(visibleEdgeTypes);
  const visibleNodeIds = new Set<string>();
  const visibleEdgeIds = new Set<string>();

  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    if (typeof id !== 'string') {
      continue;
    }
    if (nodeIsVisible(data.kind, kindSet)) {
      visibleNodeIds.add(id);
    }
  }

  for (const el of elements) {
    if (el.group !== 'edges') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    const source = data.source;
    const target = data.target;
    if (typeof id !== 'string' || typeof source !== 'string' || typeof target !== 'string') {
      continue;
    }
    if (!visibleNodeIds.has(source) || !visibleNodeIds.has(target)) {
      continue;
    }
    const edgeType = data.edgeType;
    if (typeof edgeType !== 'string' || edgeTypeSet.has(edgeType as EdgeType)) {
      visibleEdgeIds.add(id);
    }
  }

  hideOrphans(elements, visibleNodeIds, visibleEdgeIds);

  return { visibleNodeIds, visibleEdgeIds };
}

/**
 * Cascade-hide orphan nodes: any node with no visible incident edge AND no visible child is
 * removed from the visible set, together with its incident edges. Iterated to a fixed point so
 * that emptying a compound parent (K8s node, cluster container) recursively hides it too.
 */
function hideOrphans(
  elements: cytoscape.ElementDefinition[],
  visibleNodeIds: Set<string>,
  visibleEdgeIds: Set<string>
): void {
  const childrenByParent = new Map<string, string[]>();
  const incidentEdges = new Map<string, Set<string>>();

  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    const parent = data.parent;
    if (typeof id === 'string' && typeof parent === 'string') {
      const siblings = childrenByParent.get(parent);
      if (siblings) {
        siblings.push(id);
      } else {
        childrenByParent.set(parent, [id]);
      }
    }
  }

  for (const el of elements) {
    if (el.group !== 'edges') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    const source = data.source;
    const target = data.target;
    if (typeof id !== 'string' || !visibleEdgeIds.has(id)) {
      continue;
    }
    if (typeof source === 'string') {
      addIncident(incidentEdges, source, id);
    }
    if (typeof target === 'string') {
      addIncident(incidentEdges, target, id);
    }
  }

  let removedAny = true;
  while (removedAny) {
    removedAny = false;
    for (const nodeId of [...visibleNodeIds]) {
      const incident = incidentEdges.get(nodeId);
      const hasVisibleEdge = incident !== undefined && [...incident].some((eid) => visibleEdgeIds.has(eid));
      if (hasVisibleEdge) {
        continue;
      }
      const children = childrenByParent.get(nodeId);
      const hasVisibleChild = children !== undefined && children.some((cid) => visibleNodeIds.has(cid));
      if (hasVisibleChild) {
        continue;
      }
      visibleNodeIds.delete(nodeId);
      if (incident) {
        for (const eid of incident) {
          visibleEdgeIds.delete(eid);
        }
      }
      removedAny = true;
    }
  }
}

function addIncident(incidentEdges: Map<string, Set<string>>, nodeId: string, edgeId: string): void {
  const existing = incidentEdges.get(nodeId);
  if (existing) {
    existing.add(edgeId);
  } else {
    incidentEdges.set(nodeId, new Set([edgeId]));
  }
}
