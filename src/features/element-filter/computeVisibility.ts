import type cytoscape from 'cytoscape';

import { SHAPE_BY_KIND } from '../../shared/constants/shapeByKind';
import type { EdgeType, NodeKind } from '../../shared/constants/types';

export interface VisibilitySets {
  visibleNodeIds: Set<string>;
  visibleEdgeIds: Set<string>;
}

const KNOWN_KINDS = new Set<string>(Object.keys(SHAPE_BY_KIND));

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

  return { visibleNodeIds, visibleEdgeIds };
}
