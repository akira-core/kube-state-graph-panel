import type cytoscape from 'cytoscape';

import { colorForCluster } from '../../shared/constants/clusterPalette';
import { FALLBACK_STATUS } from '../../shared/constants/colorByStatus';
import type { GraphNodeKind, NodeAlert, NodeKind, NodeStatus } from '../../shared/constants/types';
import type { ContainerSpec } from '../../shared/types/containerSpec';

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

// Panel-side identity keyed off upstream `type`: `cluster` → kind-less decorative
// container; `storageclass` → compound group carrying `kind` + `isStorageClass`, no
// status; everything else → leaf carrying its kind plus `status` ONLY when the backend
// sent one (data-driven — stylesheet borders `node[status]`, not a hardcoded kind list).
type NodeIdentity =
  | { isCluster: true; cluster: string; clusterColor: string }
  | { kind: NodeKind; isStorageClass: true }
  | { kind: GraphNodeKind; status?: NodeStatus };

function resolveNodeIdentity(type: string, label: string, status: NodeStatus | undefined): NodeIdentity {
  if (type === 'cluster') {
    return { isCluster: true, cluster: label, clusterColor: colorForCluster(label) };
  }
  if (type === 'storageclass') {
    return { kind: 'storageclass', isStorageClass: true };
  }
  return { kind: type, ...(status !== undefined ? { status } : {}) };
}

// Unix seconds: must be finite and non-negative — NaN/±Infinity → "Invalid date" +
// {from:NaN,to:NaN} rewind; a negative epoch → bogus pre-1970 window.
function isValidEpochSeconds(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

// Ascending `timeRecords` from upstream `time_records` (valid epoch seconds, sorted);
// falls back to the legacy single `time` scalar. undefined = no valid occurrence time.
function parseTimeRecords(entry: Record<string, unknown>): number[] | undefined {
  if (Array.isArray(entry.time_records)) {
    const valid = entry.time_records.filter(isValidEpochSeconds);
    if (valid.length > 0) {
      return valid.sort((a, b) => a - b);
    }
  }
  return isValidEpochSeconds(entry.time) ? [entry.time] : undefined;
}

// Project upstream `alerts` onto typed NodeAlert[]. Anti-corruption: malformed entries
// dropped, not thrown (partial-parse contract). `severity` kept as free-form string —
// custom labels survive and are colour-mapped downstream. undefined = no alerts field.
function parseAlerts(v: unknown): NodeAlert[] | undefined {
  if (!Array.isArray(v)) {
    return undefined;
  }
  const alerts: NodeAlert[] = [];
  for (const entry of v) {
    if (!isPlainObject(entry)) {
      continue;
    }
    if (!isString(entry.name) || !isString(entry.severity)) {
      continue;
    }
    const timeRecords = parseTimeRecords(entry);
    if (timeRecords === undefined) {
      continue;
    }
    alerts.push({
      name: entry.name,
      severity: entry.severity,
      timeRecords,
      ...(isString(entry.pod) ? { pod: entry.pod } : {}),
      ...(isString(entry.service) ? { service: entry.service } : {}),
      ...(isString(entry.id) ? { id: entry.id } : {}),
    });
  }
  return alerts.length > 0 ? alerts : undefined;
}

// Project upstream pod `containers` onto typed ContainerSpec[]. Anti-corruption:
// entries with missing/empty/non-string name or image dropped, not thrown.
// undefined = no containers field (exactOptionalPropertyTypes).
function parseContainers(v: unknown): ContainerSpec[] | undefined {
  if (!Array.isArray(v)) {
    return undefined;
  }
  const containers: ContainerSpec[] = [];
  for (const entry of v) {
    if (isPlainObject(entry) && isString(entry.name) && isString(entry.image)) {
      containers.push({ name: entry.name, image: entry.image });
    }
  }
  return containers.length > 0 ? containers : undefined;
}

// Node-STATUS rank for the collapsed-container tint (higher = worse): a collapsed
// container borders by the worst status it HIDES. STATUS, not alert severity, is the
// signal — every node has a status (default normal) on a uniform scale, and a pod can
// be warning/critical without any alert.
const STATUS_RANK: Record<NodeStatus, number> = { normal: 0, warning: 1, critical: 2 };
function rankToStatus(rank: number): NodeStatus {
  return rank >= 2 ? 'critical' : rank === 1 ? 'warning' : 'normal';
}

interface PendingOwned {
  podId: string;
  podLabel: string;
  ownerKind: string;
  ownerName: string;
  cluster: string; // '' when absent
  namespace: string; // '' when absent
  podStatusRank: number; // aggregated onto the controller as its worst child status
  podAlerts: NodeAlert[] | undefined; // aggregated onto the controller's detail-panel alert table
  podApplication: string | undefined; // first valued pod (stable order) names the controller's
  podContainers: ContainerSpec[] | undefined; // union-aggregated onto the controller, deduped by (name, image)
}

// OPAQUE dedup key — K8s names are slash-free (RFC 1123), so the `/`-joined form is unambiguous.
function controllerIdFor(o: PendingOwned): string {
  return `ctrl/${o.cluster}/${o.namespace}/${o.ownerKind.toLowerCase()}/${o.ownerName}`;
}

// Pod controller owner from typed `data.owner` or legacy `labels.owner_kind/_name`
// (pre-f050092). undefined = none.
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

// Locate the { nodes, edges } container: full response ({ elements: {...} }) or already-unwrapped.
function resolveContainer(raw: Record<string, unknown>): Record<string, unknown> {
  if (isPlainObject(raw.elements)) {
    return raw.elements;
  }
  return raw;
}

// Pre-pass: worst child-pod STATUS rank per parent container id (keyed by the pod's raw
// `parent`), so a collapsed k8s node borders by the worst status it hides. Every parented
// pod records an entry — including rank 0 — so map membership doubles as "has child pods"
// (D10: write worstStatus only when there is status info at all).
function computeChildWorstStatus(rawNodes: unknown[]): Map<string, number> {
  const childWorstStatusRank = new Map<string, number>();
  for (const entry of rawNodes) {
    if (!isPlainObject(entry)) {
      continue;
    }
    const d = unwrapData(entry);
    if (d.type !== 'pod' || !isString(d.parent)) {
      continue;
    }
    const status: NodeStatus = isNodeStatus(d.status) ? d.status : FALLBACK_STATUS;
    const r = STATUS_RANK[status];
    const prev = childWorstStatusRank.get(d.parent);
    if (prev === undefined || r > prev) {
      childWorstStatusRank.set(d.parent, r);
    }
  }
  return childWorstStatusRank;
}

interface ParsedNodes {
  elements: cytoscape.ElementDefinition[];
  // Accumulators for controller synthesis: owned pods + cluster-name → container-id map
  // (a synthesized controller nests under its cluster). `nodeIds` is the edge-endpoint dedup set.
  pendingOwned: PendingOwned[];
  clusterIdByName: Map<string, string>;
  nodeIds: Set<string>;
  errors: string[];
}

interface ParsedEdges {
  elements: cytoscape.ElementDefinition[];
  errors: string[];
}

// Stage 1 — project raw nodes onto cytoscape node elements (payload order) + collect what
// controller synthesis needs. Compound grouping STRUCTURE is the backend's: `parent` is
// passed through untouched (panel is structure-agnostic). The one frontend concern kept
// here is the cluster accent COLOUR (single source: data.clusterColor, read by legend swatches).
function parseNodes(rawNodes: unknown[], childWorstStatusRank: ReadonlyMap<string, number>): ParsedNodes {
  const elements: cytoscape.ElementDefinition[] = [];
  const errors: string[] = [];
  const nodeIds = new Set<string>();
  const pendingOwned: PendingOwned[] = [];
  const clusterIdByName = new Map<string, string>();
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
    // Duplicate ids → partial-parse channel: cytoscape silently first-wins-dedupes the
    // copy, and differing copies would flip-flop into toUpdate on every refresh.
    if (nodeIds.has(d.id)) {
      errors.push(`nodes[${String(index)}] duplicate id "${d.id}"`);
      continue;
    }
    const labels = isStringRecord(d.labels) ? d.labels : undefined;
    const namespace = labels?.namespace;
    const label = isString(d.name) ? d.name : d.id;
    const isCluster = d.type === 'cluster';
    const isStorageClass = d.type === 'storageclass';
    // Data-driven status: keep only a valid backend status on the element (absent → no
    // `status` field → no border via `node[status]`). For worstStatus aggregation, an
    // absent status counts as FALLBACK_STATUS (normal).
    const rawStatus: NodeStatus | undefined = isNodeStatus(d.status) ? d.status : undefined;
    const ownStatusRank = STATUS_RANK[rawStatus ?? FALLBACK_STATUS];
    const identity = resolveNodeIdentity(d.type, label, rawStatus);
    // Alerts ride on leaf nodes only; grouping containers (cluster / storageclass) never carry them.
    const alerts = isCluster || isStorageClass ? undefined : parseAlerts(d.alerts);
    // A collapsed k8s `node` borders by the worst of its own + child-pod statuses, incl.
    // normal (D10). Set only when status info exists (own status or ≥1 child pod) — a bare
    // node with neither must not pass "no data" off as normal.
    const nodeChildRank = d.type === 'node' ? childWorstStatusRank.get(d.id) : undefined;
    const nodeHasStatusInfo = d.type === 'node' && (rawStatus !== undefined || nodeChildRank !== undefined);
    const nodeWorstRank = Math.max(ownStatusRank, nodeChildRank ?? 0);
    // ArgoCD application + containers + typed owner ride on POD nodes only (backend
    // contract); the synthesized controller aggregates application+containers from its pods.
    const isPod = d.type === 'pod';
    const application = isPod && isString(d.application) ? d.application : undefined;
    const containers = isPod ? parseContainers(d.containers) : undefined;
    const owner = isPod ? parseOwner(d, labels) : undefined;
    nodeIds.add(d.id);
    elements.push({
      group: 'nodes',
      // Cluster boxes stay grabbable (draggable) but NOT selectable — a tap can't latch a
      // selection ring or open the detail panel. Single source for "clusters aren't
      // selectable": the canvas tap handler reads node.selectable(), not isCluster.
      ...(isCluster ? { selectable: false } : {}),
      data: {
        id: d.id,
        ...identity,
        label,
        ...(isString(d.parent) ? { parent: d.parent } : {}),
        ...(isString(namespace) ? { namespace } : {}),
        ...(isNonEmptyStringArray(d.ipaddress) ? { ipAddress: d.ipaddress } : {}),
        ...(alerts !== undefined ? { alerts } : {}),
        ...(application !== undefined ? { application } : {}),
        ...(containers !== undefined ? { containers } : {}),
        ...(owner !== undefined ? { owner } : {}),
        ...(nodeHasStatusInfo ? { worstStatus: rankToStatus(nodeWorstRank) } : {}),
        ...(labels !== undefined ? { labels } : {}),
      },
    });
    if (isCluster) {
      clusterIdByName.set(label, d.id);
    } else if (isPod && owner !== undefined) {
      pendingOwned.push({
        podId: d.id,
        podLabel: label,
        ownerKind: owner.kind,
        ownerName: owner.name,
        cluster: labels?.cluster ?? '',
        namespace: namespace ?? '',
        podStatusRank: ownStatusRank,
        podAlerts: alerts,
        podApplication: application,
        podContainers: containers,
      });
    }
  }
  return { elements, pendingOwned, clusterIdByName, nodeIds, errors };
}

// Stage 2 — project raw edges onto cytoscape edge elements (payload order). An edge whose
// endpoints aren't both known node ids → partial-parse channel (cytoscape throws otherwise).
function parseEdges(rawEdges: unknown[], nodeIds: ReadonlySet<string>): ParsedEdges {
  const elements: cytoscape.ElementDefinition[] = [];
  const errors: string[] = [];
  const edgeIds = new Set<string>();
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
    if (edgeIds.has(d.id)) {
      errors.push(`edges[${String(index)}] duplicate id "${d.id}"`);
      continue;
    }
    edgeIds.add(d.id);
    const labels = isStringRecord(d.labels) ? d.labels : undefined;
    elements.push({
      group: 'edges',
      data: {
        id: d.id,
        source: d.source,
        target: d.target,
        edgeType: d.type,
        ...(labels !== undefined ? { labels } : {}),
      },
    });
  }
  return { elements, errors };
}

// Stage 3 — synthesize deduped controller nodes + controller-owns-pod edges from pod owner
// metadata (backend emits owners on pods only). Deterministic. Returns controller NODES
// first, then owns EDGES — the order the prior single-pass version appended them.
function synthesizeControllers(
  pendingOwned: PendingOwned[],
  clusterIdByName: ReadonlyMap<string, string>
): cytoscape.ElementDefinition[] {
  const controllerNodes: cytoscape.ElementDefinition[] = [];
  const controllerSeen = new Set<string>();
  const ownsEdges: cytoscape.ElementDefinition[] = [];
  const sortedOwned = [...pendingOwned].sort((a, b) => a.podId.localeCompare(b.podId));
  // Pre-pass: worst child-pod STATUS per controller (a controller has no status of its
  // own — purely child-driven), so a collapsed controller borders in that colour.
  const controllerWorstRank = new Map<string, number>();
  for (const o of sortedOwned) {
    const id = controllerIdFor(o);
    if (o.podStatusRank > (controllerWorstRank.get(id) ?? 0)) {
      controllerWorstRank.set(id, o.podStatusRank);
    }
  }
  // Pre-pass: aggregate child-pod ALERTS per controller (stable podId order) for its
  // detail-panel alert table. An entry missing `pod` is attributed to its source pod's
  // label on a NEW object (the pod's own alerts stay untouched); entries with an `id`
  // dedupe across pods (first wins).
  const controllerAlerts = new Map<string, NodeAlert[]>();
  const controllerAlertIds = new Map<string, Set<string>>();
  for (const o of sortedOwned) {
    if (o.podAlerts === undefined) {
      continue;
    }
    const id = controllerIdFor(o);
    const agg = controllerAlerts.get(id) ?? [];
    const seenIds = controllerAlertIds.get(id) ?? new Set<string>();
    for (const alert of o.podAlerts) {
      if (alert.id !== undefined) {
        if (seenIds.has(alert.id)) {
          continue;
        }
        seenIds.add(alert.id);
      }
      agg.push(alert.pod === undefined ? { ...alert, pod: o.podLabel } : alert);
    }
    controllerAlerts.set(id, agg);
    controllerAlertIds.set(id, seenIds);
  }
  // Pre-pass: aggregate ArgoCD application + containers per controller. application =
  // first valued pod in stable podId order; containers = union across owned pods deduped
  // by (name, image), sorted at materialization for stable output.
  const controllerApplication = new Map<string, string>();
  const controllerContainers = new Map<string, Map<string, ContainerSpec>>();
  for (const o of sortedOwned) {
    const id = controllerIdFor(o);
    if (o.podApplication !== undefined && !controllerApplication.has(id)) {
      controllerApplication.set(id, o.podApplication);
    }
    if (o.podContainers !== undefined) {
      const byKey = controllerContainers.get(id) ?? new Map<string, ContainerSpec>();
      for (const c of o.podContainers) {
        byKey.set(`${c.name}/${c.image}`, c);
      }
      controllerContainers.set(id, byKey);
    }
  }
  for (const o of sortedOwned) {
    const kindLower = o.ownerKind.toLowerCase();
    const controllerId = controllerIdFor(o);
    if (!controllerSeen.has(controllerId)) {
      controllerSeen.add(controllerId);
      const parent = o.cluster === '' ? undefined : clusterIdByName.get(o.cluster);
      const worstRank = controllerWorstRank.get(controllerId) ?? 0;
      const aggregatedAlerts = controllerAlerts.get(controllerId);
      const aggregatedApplication = controllerApplication.get(controllerId);
      const containersByKey = controllerContainers.get(controllerId);
      const aggregatedContainers =
        containersByKey === undefined
          ? undefined
          : [...containersByKey.values()].sort(
              (a, b) => a.name.localeCompare(b.name) || a.image.localeCompare(b.image)
            );
      controllerNodes.push({
        group: 'nodes',
        data: {
          id: controllerId,
          kind: kindLower,
          isController: true,
          label: o.ownerName,
          // Written so applyNamespaceGrouping (controller mode) can box the controller
          // under its namespace. Omitted when owned pods carry no namespace.
          ...(o.namespace !== '' ? { namespace: o.namespace } : {}),
          ...(parent !== undefined ? { parent } : {}),
          // Always written — a controller owns ≥1 pod, so an all-normal brood still
          // collapses to an explicit green border (normal is drawn, D10).
          worstStatus: rankToStatus(worstRank),
          ...(aggregatedAlerts !== undefined ? { alerts: aggregatedAlerts } : {}),
          ...(aggregatedApplication !== undefined ? { application: aggregatedApplication } : {}),
          ...(aggregatedContainers !== undefined ? { containers: aggregatedContainers } : {}),
        },
      });
    }
    ownsEdges.push({
      group: 'edges',
      data: {
        id: `syn:controller-owns-pod:${controllerId}:${o.podId}`,
        source: controllerId,
        target: o.podId,
        edgeType: 'controller-owns-pod',
      },
    });
  }
  return [...controllerNodes, ...ownsEdges];
}

export function normalizeGraph(raw: unknown): NormalizeResult {
  if (!isPlainObject(raw)) {
    return { elements: [], errors: ['payload is not an object'] };
  }

  const errors: string[] = [];
  const container = resolveContainer(raw);
  const rawNodes = Array.isArray(container.nodes) ? (container.nodes as unknown[]) : [];
  const rawEdges = Array.isArray(container.edges) ? (container.edges as unknown[]) : [];

  if (!Array.isArray(container.nodes)) {
    errors.push('payload.nodes is missing or not an array');
  }
  if (!Array.isArray(container.edges)) {
    errors.push('payload.edges is missing or not an array');
  }

  // Pure-function pipeline: child-status pre-pass → nodes → edges (validated against node
  // ids) → synthesized controllers. Element order (nodes, edges, controllers) and error
  // order (container-shape, node-parse, edge-parse) preserved from the prior single-pass version.
  const childWorstStatusRank = computeChildWorstStatus(rawNodes);
  const nodes = parseNodes(rawNodes, childWorstStatusRank);
  const edges = parseEdges(rawEdges, nodes.nodeIds);
  const controllers = synthesizeControllers(nodes.pendingOwned, nodes.clusterIdByName);

  return {
    elements: [...nodes.elements, ...edges.elements, ...controllers],
    errors: [...errors, ...nodes.errors, ...edges.errors],
  };
}
