import type cytoscape from 'cytoscape';

import { colorForCluster } from '../../shared/constants/clusterPalette';
import { FALLBACK_STATUS } from '../../shared/constants/colorByStatus';
import type { EdgeType, NodeAlert, NodeKind, NodeStatus } from '../../shared/constants/types';
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

// A node's panel-side identity, keyed off its upstream `type`:
//   - `cluster`  → a kind-less decorative container (its own palette accent colour).
//   - `storageclass` → a compound GROUP that carries its `kind` (so it can appear in
//     the icon legend when collapsed + be filterable) AND the `isStorageClass` flag
//     (so it gets its own "Storage classes" swatch section + is excluded from the
//     detail panel). It behaves like the K8s `node` container: icon-less while an
//     expanded box, shows its icon when collapsed. It carries NO status (a grouping
//     box has no health).
//   - everything else → a leaf carrying its kind, plus `status` ONLY when the backend
//     actually sent one. Status is data-driven: a kind the backend gives no status to
//     (e.g. service / external) carries no `status` field and therefore renders no
//     status border (the stylesheet borders `node[status]`, not a hardcoded kind list).
// One branch, one place.
type NodeIdentity =
  | { isCluster: true; cluster: string; clusterColor: string }
  | { kind: NodeKind; isStorageClass: true }
  | { kind: NodeKind; status?: NodeStatus };

function resolveNodeIdentity(type: string, label: string, status: NodeStatus | undefined): NodeIdentity {
  if (type === 'cluster') {
    return { isCluster: true, cluster: label, clusterColor: colorForCluster(label) };
  }
  if (type === 'storageclass') {
    return { kind: 'storageclass', isStorageClass: true };
  }
  return { kind: type as NodeKind, ...(status !== undefined ? { status } : {}) };
}

// A single Unix-seconds value is valid iff finite and non-negative: NaN/±Infinity
// would render "Invalid date" and yield a {from:NaN,to:NaN} rewind; a negative epoch
// would rewind to a bogus pre-1970 window. Reject all of them.
function isValidEpochSeconds(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

// Resolve an alert's occurrence times to an ASCENDING `timeRecords` list. Primary
// source is the upstream `time_records` array (kept = valid epoch seconds, sorted
// ascending). When that yields nothing, fall back to the legacy single `time` scalar
// as a one-occurrence list. Returns undefined when no valid occurrence time exists.
function parseTimeRecords(entry: Record<string, unknown>): number[] | undefined {
  if (Array.isArray(entry.time_records)) {
    const valid = entry.time_records.filter(isValidEpochSeconds);
    if (valid.length > 0) {
      return valid.sort((a, b) => a - b);
    }
  }
  return isValidEpochSeconds(entry.time) ? [entry.time] : undefined;
}

// Project the optional upstream `alerts` array onto typed NodeAlert[]. Anti-corruption
// boundary: malformed entries (missing/ill-typed name or severity, or no valid
// occurrence time) are dropped, not thrown — consistent with the partial-parse
// contract. `severity` is kept as a free-form string: any non-empty label survives
// (custom labels are colour-mapped downstream, not dropped). Returns undefined when no
// valid alert survives so the node carries no `alerts` field.
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

// Project the optional upstream pod `containers` array onto typed ContainerSpec[].
// Anti-corruption boundary: entries whose `name` or `image` is missing, empty, or
// not a string are dropped, not thrown. Returns undefined when nothing valid
// survives so the node carries no `containers` field (exactOptionalPropertyTypes).
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

// Node-STATUS ranking for the collapsed-container tint: higher = worse. A COLLAPSED
// container (controller / k8s node) borders by the worst status it HIDES, so its child
// pods' problems still read once their boxes are folded away. STATUS — not alert
// severity — is the signal: every node carries a status (default normal), a uniform
// normal/warning/critical scale, whereas alerts add an 'info' tier status never has and
// a pod can be warning/critical WITHOUT an alert.
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
  podStatusRank: number; // the pod's status rank (0 = normal); aggregated onto the controller as its worst child status
  podAlerts: NodeAlert[] | undefined; // the pod's parsed alerts; aggregated onto the controller for its detail-panel alert table
  podApplication: string | undefined; // the pod's ArgoCD application; the first valued pod (stable order) names the controller's
  podContainers: ContainerSpec[] | undefined; // the pod's containers; union-aggregated onto the controller, deduped by (name, image)
}

// OPAQUE dedup key — K8s names are slash-free (RFC 1123), so the `/`-joined form is unambiguous.
function controllerIdFor(o: PendingOwned): string {
  return `ctrl/${o.cluster}/${o.namespace}/${o.ownerKind.toLowerCase()}/${o.ownerName}`;
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
  const edgeIds = new Set<string>();
  const pendingOwned: PendingOwned[] = [];
  const clusterIdByName = new Map<string, string>();
  // Pre-pass: worst child-pod STATUS rank per parent container id, so a COLLAPSED k8s
  // node can border by the worst status among the pods it hides (getStylesheet). Keyed
  // by the pod's raw `parent` (its k8s node id in cluster > node > pod nesting).
  // Every parented pod records an entry — including rank 0 (normal) — so map
  // membership doubles as "this container HAS child pods" (D10: a node writes
  // worstStatus only when it has status information at all).
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
    // Duplicate ids are rejected into the partial-parse channel: cytoscape would
    // silently first-wins-dedupe the second copy, and when the copies differ in
    // data the differ would flip-flop them into toUpdate on every refresh.
    if (nodeIds.has(d.id)) {
      errors.push(`nodes[${String(index)}] duplicate id "${d.id}"`);
      continue;
    }
    const labels = isStringRecord(d.labels) ? d.labels : undefined;
    const namespace = labels?.namespace;
    const label = isString(d.name) ? d.name : d.id;
    const isCluster = d.type === 'cluster';
    const isStorageClass = d.type === 'storageclass';
    // Status is DATA-DRIVEN: keep ONLY a valid backend status on the element (absent →
    // no `status` field → the stylesheet's `node[status]` selector renders no border).
    // For aggregating a parent's worst child status (worstStatus), an absent status
    // still counts as `normal` (FALLBACK_STATUS).
    const rawStatus: NodeStatus | undefined = isNodeStatus(d.status) ? d.status : undefined;
    const ownStatusRank = STATUS_RANK[rawStatus ?? FALLBACK_STATUS];
    const identity = resolveNodeIdentity(d.type, label, rawStatus);
    // Alerts ride on any leaf node; grouping containers (cluster / storageclass)
    // never carry them (and are excluded from the detail panel that consumes them).
    const alerts = isCluster || isStorageClass ? undefined : parseAlerts(d.alerts);
    // A k8s `node` container surfaces the worst status it would HIDE once collapsed: the
    // worst of its OWN status and its child pods' statuses (worst-wins) — INCLUDING
    // `normal`, so an all-healthy box collapses to an explicit green border (D10). Set
    // only when there IS status information (own status or ≥1 child pod): a bare node
    // with neither must not dress "no data" up as normal.
    const nodeChildRank = d.type === 'node' ? childWorstStatusRank.get(d.id) : undefined;
    const nodeHasStatusInfo = d.type === 'node' && (rawStatus !== undefined || nodeChildRank !== undefined);
    const nodeWorstRank = Math.max(ownStatusRank, nodeChildRank ?? 0);
    // ArgoCD application + container specs + the typed owner ride on POD nodes only
    // (backend contract); a synthesized controller aggregates the first two from its
    // owned pods below, and the detail-URL queries read a pod's controller from owner.
    const isPod = d.type === 'pod';
    const application = isPod && isString(d.application) ? d.application : undefined;
    const containers = isPod ? parseContainers(d.containers) : undefined;
    const owner = isPod ? parseOwner(d, labels) : undefined;
    nodeIds.add(d.id);
    elements.push({
      group: 'nodes',
      // Cluster boxes are decorative grouping backplates: keep them GRABBABLE
      // (draggable, cytoscape default) but NOT selectable, so a tap can never latch
      // a selection ring or open the detail panel on them. This is the single source
      // for "clusters aren't selectable" — the canvas tap handler reads node.selectable()
      // rather than re-deriving isCluster.
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
  // Pre-pass: worst child-pod STATUS per controller, so a COLLAPSED controller can
  // border in that colour (getStylesheet). Computed across all owned pods before the
  // node is materialized. (A controller has no status of its own — purely child-driven.)
  const controllerWorstRank = new Map<string, number>();
  for (const o of sortedOwned) {
    const id = controllerIdFor(o);
    if (o.podStatusRank > (controllerWorstRank.get(id) ?? 0)) {
      controllerWorstRank.set(id, o.podStatusRank);
    }
  }
  // Pre-pass: aggregate child-pod ALERTS per controller, so the detail panel's alert
  // table on a controller lists every owned pod's alerts. Pods concatenate in the
  // stable podId order; an entry missing `pod` is attributed to its source pod's
  // label on a NEW object (the pod element's own alerts stay untouched); entries
  // carrying an `id` dedupe across pods (first in stable order wins). STATUS — not
  // alerts — still drives the collapsed-container tint (controllerWorstRank above).
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
  // Pre-pass: aggregate ArgoCD application + container specs per controller from its
  // owned pods (the backend emits both on pods only). application = the FIRST valued
  // pod in stable podId order (deterministic pick); containers = the union across all
  // owned pods, deduped by (name, image) — insertion order is the stable pod order,
  // sorted by (name, image) at materialization for a stable output.
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
      elements.push({
        group: 'nodes',
        data: {
          id: controllerId,
          kind: kindLower as NodeKind,
          isController: true,
          label: o.ownerName,
          ...(parent !== undefined ? { parent } : {}),
          // Always written — a controller always owns ≥1 pod, so an all-normal
          // brood collapses to an explicit green border (normal is drawn too, D10).
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
        edgeType: 'controller-owns-pod' as EdgeType,
      },
    });
  }
  elements.push(...ownsEdges);

  return { elements, errors };
}
