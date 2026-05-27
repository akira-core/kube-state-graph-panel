import type cytoscape from 'cytoscape';

import type { EdgeType, K8sResourceKind } from '../../shared/constants/types';

export interface NormalizeResult {
  elements: cytoscape.ElementDefinition[];
  errors: string[];
}

interface RawNode {
  id?: unknown;
  kind?: unknown;
  label?: unknown;
  namespace?: unknown;
  labels?: unknown;
}

interface RawEdge {
  id?: unknown;
  source?: unknown;
  target?: unknown;
  edgeType?: unknown;
  weight?: unknown;
}

interface RawPayload {
  nodes?: unknown;
  edges?: unknown;
}

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringRecord(v: unknown): v is Record<string, string> {
  if (!isPlainObject(v)) {
    return false;
  }
  for (const val of Object.values(v)) {
    if (typeof val !== 'string') {
      return false;
    }
  }
  return true;
}

export function normalizeGraph(raw: unknown): NormalizeResult {
  const errors: string[] = [];
  const elements: cytoscape.ElementDefinition[] = [];

  if (!isPlainObject(raw)) {
    return { elements, errors: ['payload is not an object'] };
  }

  const payload = raw as RawPayload;
  const rawNodes = Array.isArray(payload.nodes) ? (payload.nodes as RawNode[]) : [];
  const rawEdges = Array.isArray(payload.edges) ? (payload.edges as RawEdge[]) : [];

  if (!Array.isArray(payload.nodes)) {
    errors.push('payload.nodes is missing or not an array');
  }
  if (!Array.isArray(payload.edges)) {
    errors.push('payload.edges is missing or not an array');
  }

  const nodeIds = new Set<string>();

  for (const [index, n] of rawNodes.entries()) {
    if (!isPlainObject(n)) {
      errors.push(`nodes[${String(index)}] is not an object`);
      continue;
    }
    if (!isString(n.id)) {
      errors.push(`nodes[${String(index)}] missing id`);
      continue;
    }
    if (!isString(n.kind)) {
      errors.push(`nodes[${String(index)}] missing kind`);
      continue;
    }
    nodeIds.add(n.id);
    elements.push({
      group: 'nodes',
      data: {
        id: n.id,
        kind: n.kind as K8sResourceKind,
        label: isString(n.label) ? n.label : n.id,
        ...(isString(n.namespace) ? { namespace: n.namespace } : {}),
        ...(isStringRecord(n.labels) ? { labels: n.labels } : {}),
      },
    });
  }

  for (const [index, e] of rawEdges.entries()) {
    if (!isPlainObject(e)) {
      errors.push(`edges[${String(index)}] is not an object`);
      continue;
    }
    if (!isString(e.id) || !isString(e.source) || !isString(e.target) || !isString(e.edgeType)) {
      errors.push(`edges[${String(index)}] missing required fields`);
      continue;
    }
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
      errors.push(`edges[${String(index)}] references unknown node id`);
      continue;
    }
    elements.push({
      group: 'edges',
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
        edgeType: e.edgeType as EdgeType,
        ...(isNumber(e.weight) ? { weight: e.weight } : {}),
      },
    });
  }

  return { elements, errors };
}
