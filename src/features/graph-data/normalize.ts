import type cytoscape from 'cytoscape';

import { colorForCluster } from '../../shared/constants/clusterPalette';
import { FALLBACK_STATUS } from '../../shared/constants/colorByStatus';
import type { AlertSeverity, EdgeType, NodeAlert, NodeKind, NodeStatus } from '../../shared/constants/types';

export interface NormalizeResult {
  elements: cytoscape.ElementDefinition[];
  errors: string[];
}

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
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

function isNonEmptyStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string');
}

function isNodeStatus(v: unknown): v is NodeStatus {
  return v === 'normal' || v === 'warning' || v === 'critical';
}

// Alert severity is a separate scale from node status: 'info'/'warning'/'critical'
// (no 'normal'). Backend sends node.status and alert.severity independently.
function isAlertSeverity(v: unknown): v is AlertSeverity {
  return v === 'info' || v === 'warning' || v === 'critical';
}

// Project the optional upstream `alerts` array onto typed NodeAlert[]. Anti-corruption
// boundary: malformed entries (missing/ill-typed name, severity or time) are dropped,
// not thrown — consistent with the partial-parse contract. Returns undefined when no
// valid alert survives so the node carries no `alerts` field at all.
function parseAlerts(v: unknown): NodeAlert[] | undefined {
  if (!Array.isArray(v)) {
    return undefined;
  }
  const alerts: NodeAlert[] = [];
  for (const entry of v) {
    if (!isPlainObject(entry)) {
      continue;
    }
    // `time` must be a finite, non-negative Unix-seconds value: NaN/±Infinity
    // would render "Invalid date" and yield a {from:NaN,to:NaN} rewind; a
    // negative epoch would rewind to a bogus pre-1970 window. Drop all of them.
    if (
      !isString(entry.name) ||
      !isAlertSeverity(entry.severity) ||
      typeof entry.time !== 'number' ||
      !Number.isFinite(entry.time) ||
      entry.time < 0
    ) {
      continue;
    }
    alerts.push({
      name: entry.name,
      severity: entry.severity,
      time: entry.time,
      ...(isString(entry.pod) ? { pod: entry.pod } : {}),
      ...(isString(entry.service) ? { service: entry.service } : {}),
      ...(isString(entry.id) ? { id: entry.id } : {}),
    });
  }
  return alerts.length > 0 ? alerts : undefined;
}

// Upstream entries are cytoscape-shaped ({ data: {...} }); tolerate flat objects too.
function unwrapData(entry: Record<string, unknown>): Record<string, unknown> {
  return isPlainObject(entry.data) ? entry.data : entry;
}

// Locate the { nodes, edges } container: accept the full response ({ elements: {...} })
// or an already-unwrapped object.
function resolveContainer(raw: Record<string, unknown>): Record<string, unknown> {
  if (isPlainObject(raw.elements)) {
    return raw.elements;
  }
  return raw;
}

export function normalizeGraph(raw: unknown): NormalizeResult {
  const errors: string[] = [];
  const elements: cytoscape.ElementDefinition[] = [];

  if (!isPlainObject(raw)) {
    return { elements, errors: ['payload is not an object'] };
  }

  const container = resolveContainer(raw);
  const rawNodes = Array.isArray(container.nodes) ? (container.nodes as unknown[]) : [];
  const rawEdges = Array.isArray(container.edges) ? (container.edges as unknown[]) : [];

  if (!Array.isArray(container.nodes)) {
    errors.push('payload.nodes is missing or not an array');
  }
  if (!Array.isArray(container.edges)) {
    errors.push('payload.edges is missing or not an array');
  }

  const nodeIds = new Set<string>();
  // The compound (cluster/node) grouping STRUCTURE is owned by the backend: we
  // pass its `parent` field through untouched. A flat payload renders flat; a
  // nested one (cluster > node > pod, cluster > svc) renders boxes — the panel
  // is structure-agnostic. The one presentation concern that stays here is the
  // cluster accent COLOUR (theme/palette is a frontend decision), assigned to
  // each `type: "cluster"` container from a stable palette (single source:
  // data.clusterColor, which the legend swatches read back).
  for (const [index, entry] of rawNodes.entries()) {
    if (!isPlainObject(entry)) {
      errors.push(`nodes[${String(index)}] is not an object`);
      continue;
    }
    const d = unwrapData(entry);
    if (!isString(d.id)) {
      errors.push(`nodes[${String(index)}] missing id`);
      continue;
    }
    if (!isString(d.type)) {
      errors.push(`nodes[${String(index)}] missing type`);
      continue;
    }
    const labels = isStringRecord(d.labels) ? d.labels : undefined;
    const namespace = labels?.namespace;
    const label = isString(d.name) ? d.name : d.id;
    const isCluster = d.type === 'cluster';
    // A cluster container carries no kind (it is not a NodeKind — identified by
    // isCluster, kept out of the kind filter / shapes) and gets a palette colour;
    // every other node carries its kind. One branch, one place.
    const identity = isCluster
      ? { isCluster: true, cluster: label, clusterColor: colorForCluster(label) }
      : { kind: d.type as NodeKind, status: isNodeStatus(d.status) ? d.status : FALLBACK_STATUS };
    // Alerts ride on any non-cluster node; cluster containers never carry them
    // (and are excluded from the detail panel that consumes them).
    const alerts = isCluster ? undefined : parseAlerts(d.alerts);
    nodeIds.add(d.id);
    elements.push({
      group: 'nodes',
      data: {
        id: d.id,
        ...identity,
        label,
        ...(isString(d.parent) ? { parent: d.parent } : {}),
        ...(isString(namespace) ? { namespace } : {}),
        ...(isNonEmptyStringArray(d.ipaddress) ? { ipAddress: d.ipaddress } : {}),
        ...(alerts !== undefined ? { alerts } : {}),
        ...(labels !== undefined ? { labels } : {}),
      },
    });
  }

  for (const [index, entry] of rawEdges.entries()) {
    if (!isPlainObject(entry)) {
      errors.push(`edges[${String(index)}] is not an object`);
      continue;
    }
    const d = unwrapData(entry);
    if (!isString(d.id) || !isString(d.source) || !isString(d.target) || !isString(d.type)) {
      errors.push(`edges[${String(index)}] missing required fields`);
      continue;
    }
    if (!nodeIds.has(d.source) || !nodeIds.has(d.target)) {
      errors.push(`edges[${String(index)}] references unknown node id`);
      continue;
    }
    const labels = isStringRecord(d.labels) ? d.labels : undefined;
    elements.push({
      group: 'edges',
      data: {
        id: d.id,
        source: d.source,
        target: d.target,
        edgeType: d.type as EdgeType,
        ...(labels !== undefined ? { labels } : {}),
      },
    });
  }

  return { elements, errors };
}
