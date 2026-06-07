import type cytoscape from 'cytoscape';

import { colorForCluster } from '../../shared/constants/clusterPalette';
import { FALLBACK_STATUS } from '../../shared/constants/colorByStatus';
import type { EdgeType, NodeAlert, NodeKind, NodeStatus } from '../../shared/constants/types';

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

// A node's panel-side identity, keyed off its upstream `type`:
//   - `cluster`  → a kind-less decorative container (its own palette accent colour).
//   - `storageclass` → a compound GROUP that carries its `kind` (so it can appear in
//     the icon legend when collapsed + be filterable) AND the `isStorageClass` flag
//     (so it gets its own "Storage classes" swatch section + is excluded from the
//     detail panel). It behaves like the K8s `node` container: icon-less while an
//     expanded box, shows its icon when collapsed. It carries NO status (a grouping
//     box has no health).
//   - everything else → a leaf carrying its kind + status.
// One branch, one place.
type NodeIdentity =
  | { isCluster: true; cluster: string; clusterColor: string }
  | { kind: NodeKind; isStorageClass: true }
  | { kind: NodeKind; status: NodeStatus };

function resolveNodeIdentity(type: string, label: string, status: NodeStatus): NodeIdentity {
  if (type === 'cluster') {
    return { isCluster: true, cluster: label, clusterColor: colorForCluster(label) };
  }
  if (type === 'storageclass') {
    return { kind: 'storageclass', isStorageClass: true };
  }
  return { kind: type as NodeKind, status };
}

// Project the optional upstream `alerts` array onto typed NodeAlert[]. Anti-corruption
// boundary: malformed entries (missing/ill-typed name, severity or time) are dropped,
// not thrown — consistent with the partial-parse contract. `severity` is kept as a
// free-form string: any non-empty label survives (custom labels are colour-mapped
// downstream, not dropped), only a missing/non-string/empty severity is rejected.
// Returns undefined when no valid alert survives so the node carries no `alerts` field.
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
      !isString(entry.severity) ||
      entry.severity.length === 0 ||
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

interface PendingOwned {
  podId: string;
  ownerKind: string;
  ownerName: string;
  cluster: string; // '' when absent
  namespace: string; // '' when absent
}

// Read a pod's controller owner from typed `data.owner` (current backend) or the
// legacy `labels.owner_kind` / `labels.owner_name` (pre-f050092). undefined = none.
function parseOwner(
  d: Record<string, unknown>,
  labels: Record<string, string> | undefined
): { kind: string; name: string } | undefined {
  const owner = d.owner;
  if (isPlainObject(owner) && isString(owner.kind) && isString(owner.name)) {
    return { kind: owner.kind.trim(), name: owner.name.trim() };
  }
  if (labels !== undefined && isString(labels.owner_kind) && isString(labels.owner_name)) {
    return { kind: labels.owner_kind.trim(), name: labels.owner_name.trim() };
  }
  return undefined;
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
  const pendingOwned: PendingOwned[] = [];
  const clusterIdByName = new Map<string, string>();
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
    const isStorageClass = d.type === 'storageclass';
    const identity = resolveNodeIdentity(d.type, label, isNodeStatus(d.status) ? d.status : FALLBACK_STATUS);
    // Alerts ride on any leaf node; grouping containers (cluster / storageclass)
    // never carry them (and are excluded from the detail panel that consumes them).
    const alerts = isCluster || isStorageClass ? undefined : parseAlerts(d.alerts);
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
    if (isCluster) {
      clusterIdByName.set(label, d.id);
    } else if (d.type === 'pod') {
      const owner = parseOwner(d, labels);
      if (owner !== undefined) {
        pendingOwned.push({
          podId: d.id,
          ownerKind: owner.kind,
          ownerName: owner.name,
          cluster: labels?.cluster ?? '',
          namespace: namespace ?? '',
        });
      }
    }
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

  // Synthesize controller nodes + controller-owns-pod edges from pod owners. The
  // backend emits owner metadata on pods only; the panel materializes the
  // controller node the contract implies (deduped) and the owns edge. Deterministic.
  const controllerSeen = new Set<string>();
  const ownsEdges: cytoscape.ElementDefinition[] = [];
  const sortedOwned = [...pendingOwned].sort((a, b) => a.podId.localeCompare(b.podId));
  for (const o of sortedOwned) {
    const kindLower = o.ownerKind.toLowerCase();
    // OPAQUE dedup key — K8s names are slash-free (RFC 1123), so the `/`-joined form is unambiguous.
    const controllerId = `ctrl/${o.cluster}/${o.namespace}/${kindLower}/${o.ownerName}`;
    if (!controllerSeen.has(controllerId)) {
      controllerSeen.add(controllerId);
      const parent = o.cluster === '' ? undefined : clusterIdByName.get(o.cluster);
      elements.push({
        group: 'nodes',
        data: {
          id: controllerId,
          kind: kindLower as NodeKind,
          isController: true,
          label: o.ownerName,
          ...(parent !== undefined ? { parent } : {}),
        },
      });
    }
    ownsEdges.push({
      group: 'edges',
      data: {
        id: `syn:controller-owns-pod:${controllerId}:${o.podId}`,
        source: controllerId,
        target: o.podId,
        edgeType: 'controller-owns-pod' as EdgeType,
      },
    });
  }
  elements.push(...ownsEdges);

  return { elements, errors };
}
