import type cytoscape from 'cytoscape';

import { APPLICATION_BEARING_KINDS } from '../../shared/constants/applicationBearingKinds';
import { colorForApplication } from '../../shared/constants/applicationPalette';
import { colorForCluster } from '../../shared/constants/clusterPalette';
import { FALLBACK_STATUS } from '../../shared/constants/colorByStatus';
import { colorForNamespace } from '../../shared/constants/namespacePalette';
import type { GraphNodeKind, NodeAlert, NodeStatus } from '../../shared/constants/types';
import { isPlainObject } from '../../shared/guards/isPlainObject';
import type { ContainerSpec } from '../../shared/types/containerSpec';

export interface NormalizeResult {
  elements: cytoscape.ElementDefinition[];
  errors: string[];
}

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

// Re-exported so existing intra-feature importers (useGraphData) keep working after
// the guard moved to shared/.
export { isPlainObject };

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

// Backend D6 compound group `data.type` literals — all are kind-less at parse time and
// carry no own alerts (a controller's alerts come from enrichControllers). `controller` is
// later ENRICHED with a real `kind` from its child pods so its detail panel keeps working.
function isGroupType(type: string): boolean {
  return type === 'cluster' || type === 'namespace' || type === 'application' || type === 'controller';
}

// Panel-side identity keyed off upstream `type` (backend D6):
//   `cluster` / `namespace` / `application` → kind-less decorative accent group;
//   `controller` → kind-less group flagged isController (kind added in enrichControllers);
//   everything else → leaf carrying its kind plus `status` ONLY when the backend sent one
//   (data-driven — stylesheet borders `node[status]`, not a hardcoded kind list). storageclass
//   is now an ordinary leaf (D3) and falls through this last branch.
type NodeIdentity =
  | { isCluster: true; cluster: string; clusterColor: string }
  | { isNamespace: true; namespace: string; namespaceColor: string }
  | { isApplication: true; application: string; applicationColor: string }
  | { isController: true }
  | { kind: GraphNodeKind; status?: NodeStatus };

function resolveNodeIdentity(type: string, label: string, status: NodeStatus | undefined): NodeIdentity {
  if (type === 'cluster') {
    return { isCluster: true, cluster: label, clusterColor: colorForCluster(label) };
  }
  if (type === 'namespace') {
    return { isNamespace: true, namespace: label, namespaceColor: colorForNamespace(label) };
  }
  if (type === 'application') {
    return { isApplication: true, application: label, applicationColor: colorForApplication(label) };
  }
  if (type === 'controller') {
    return { isController: true };
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

// Pod controller owner from typed `data.owner` or legacy `labels.owner_kind/_name`
// (pre-f050092). undefined = none. Passed through on pod nodes; enrichControllers reads
// it from a controller's child pods to derive the controller's Workloads `kind`.
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

// Pre-pass (D8): worst pod STATUS rank reachable from each k8s `node` via `pod-to-node`
// edges — pods no longer nest under their node in the backend D6 (controller) payload, so
// a collapsed node can no longer border from its children. Every node with ≥1 incident
// `pod-to-node` edge records an entry (incl. rank 0) so map membership doubles as "has a
// reachable pod" (write worstStatus only when there is status info at all). The `node`
// pod-parent view re-nests pods under their node, where the same set of pods yields the
// same worst — so this single normalize-time computation holds in both views.
function computeNodeWorstViaPodToNode(rawNodes: unknown[], rawEdges: unknown[]): Map<string, number> {
  const podStatusRank = new Map<string, number>();
  for (const entry of rawNodes) {
    if (!isPlainObject(entry)) {
      continue;
    }
    const d = unwrapData(entry);
    if (d.type !== 'pod' || !isString(d.id)) {
      continue;
    }
    const status: NodeStatus = isNodeStatus(d.status) ? d.status : FALLBACK_STATUS;
    podStatusRank.set(d.id, STATUS_RANK[status]);
  }
  const nodeWorst = new Map<string, number>();
  for (const entry of rawEdges) {
    if (!isPlainObject(entry)) {
      continue;
    }
    const d = unwrapData(entry);
    if (d.type !== 'pod-to-node' || !isString(d.source) || !isString(d.target)) {
      continue;
    }
    const r = podStatusRank.get(d.source);
    if (r === undefined) {
      continue; // source is not a known pod
    }
    const prev = nodeWorst.get(d.target);
    if (prev === undefined || r > prev) {
      nodeWorst.set(d.target, r);
    }
  }
  return nodeWorst;
}

interface ParsedNodes {
  elements: cytoscape.ElementDefinition[];
  nodeIds: Set<string>; // the edge-endpoint dedup set
  errors: string[];
}

interface ParsedEdges {
  elements: cytoscape.ElementDefinition[];
  errors: string[];
}

// Stage 1 — project raw nodes onto cytoscape node elements (payload order). Compound
// grouping STRUCTURE is the backend's: `parent` is passed through untouched (panel is
// structure-agnostic). The frontend concerns kept here are the accent COLOUR for the
// cluster / namespace / application decorative groups (single source: data.*Color, read by
// legend swatches) and per-node `worstStatus` for the collapsed-container border tint.
function parseNodes(rawNodes: unknown[], nodeWorstFromPods: ReadonlyMap<string, number>): ParsedNodes {
  const elements: cytoscape.ElementDefinition[] = [];
  const errors: string[] = [];
  const nodeIds = new Set<string>();
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
    const isGroup = isGroupType(d.type);
    // Data-driven status: keep only a valid backend status on the element (absent → no
    // `status` field → no border via `node[status]`). For worstStatus aggregation, an
    // absent status counts as FALLBACK_STATUS (normal).
    const rawStatus: NodeStatus | undefined = isNodeStatus(d.status) ? d.status : undefined;
    const ownStatusRank = STATUS_RANK[rawStatus ?? FALLBACK_STATUS];
    const identity = resolveNodeIdentity(d.type, label, rawStatus);
    // Alerts ride on leaf nodes only; group nodes never carry their own (a backend
    // controller's alerts are aggregated from its child pods in enrichControllers).
    const alerts = isGroup ? undefined : parseAlerts(d.alerts);
    // A collapsed k8s `node` borders by the worst of its own + reachable-pod statuses,
    // incl. normal (D8/D10). Set only when status info exists (own status or ≥1 reachable
    // pod) — a bare node with neither must not pass "no data" off as normal.
    const nodeChildRank = d.type === 'node' ? nodeWorstFromPods.get(d.id) : undefined;
    const nodeHasStatusInfo = d.type === 'node' && (rawStatus !== undefined || nodeChildRank !== undefined);
    const nodeWorstRank = Math.max(ownStatusRank, nodeChildRank ?? 0);
    // ArgoCD application rides on the APPLICATION_BEARING_KINDS leaves (pod / service / pvc
    // per backend D6 — service & pvc resolve it from their annotation tracking-id and nest
    // under the application group, like pods); containers + typed owner stay POD-only.
    // enrichControllers aggregates the pod application onto the backend controller group.
    const isPod = d.type === 'pod';
    const carriesApplication = isString(d.type) && APPLICATION_BEARING_KINDS.has(d.type);
    const application = carriesApplication && isString(d.application) ? d.application : undefined;
    const containers = isPod ? parseContainers(d.containers) : undefined;
    const owner = isPod ? parseOwner(d, labels) : undefined;
    // storageclass leaf structural fields (D3); omitempty — passed through when present.
    const provisioner = isString(d.provisioner) ? d.provisioner : undefined;
    const parameters = isStringRecord(d.parameters) ? d.parameters : undefined;
    nodeIds.add(d.id);
    elements.push({
      group: 'nodes',
      // Every node — including the decorative cluster / namespace / application groups —
      // is selectable (cytoscape default), so the built-in expand-collapse +/- cue can
      // surface on the selected compound parent. Selecting a decorative group latches the
      // selection ring but opens NO detail panel: resolveSelectedNode / isDashboardEligible
      // returns null for isCluster / isNamespace / isApplication. See compound-parent-collapse-cue.
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
        ...(provisioner !== undefined ? { provisioner } : {}),
        ...(parameters !== undefined ? { parameters } : {}),
        ...(nodeHasStatusInfo ? { worstStatus: rankToStatus(nodeWorstRank) } : {}),
        ...(labels !== undefined ? { labels } : {}),
      },
    });
  }
  return { elements, nodeIds, errors };
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

// Stage 3 (D5) — enrich the backend's `controller` group nodes from their child pods so the
// right-click detail panel (ApplicationTable / ContainerTable / dashboard URL) and the
// collapsed-border tint keep working. The backend emits the controller group + its parent
// chain directly (D1, no client synthesis); the panel only decorates it. Deterministic,
// immutable: a NEW element is produced for each controller; child pod elements and the input
// array are never mutated (alert pod-backfill copies the alert). Children = pods whose
// `data.parent` is the controller id, taken in stable podId order.
function enrichControllers(nodeElements: cytoscape.ElementDefinition[]): cytoscape.ElementDefinition[] {
  const podsByParent = new Map<string, cytoscape.ElementDefinition[]>();
  for (const el of nodeElements) {
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.kind === 'pod' && typeof d.parent === 'string') {
      const arr = podsByParent.get(d.parent) ?? [];
      arr.push(el);
      podsByParent.set(d.parent, arr);
    }
  }
  return nodeElements.map((el) => {
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.isController !== true || typeof d.id !== 'string') {
      return el;
    }
    const children = [...(podsByParent.get(d.id) ?? [])].sort((a, b) =>
      String((a.data as cytoscape.NodeDataDefinition).id ?? '').localeCompare(
        String((b.data as cytoscape.NodeDataDefinition).id ?? '')
      )
    );

    let kind: string | undefined;
    let worstRank: number | undefined; // undefined = no child pods (omit worstStatus)
    let application: string | undefined;
    const containersByKey = new Map<string, ContainerSpec>();
    const alerts: NodeAlert[] = [];
    const seenAlertIds = new Set<string>();

    for (const child of children) {
      const cd = child.data as cytoscape.NodeDataDefinition;
      // kind: lowercased owner.kind of the first child pod that has one (stable order).
      if (kind === undefined && cd.owner !== undefined && cd.owner.kind.length > 0) {
        kind = cd.owner.kind.toLowerCase();
      }
      // worstStatus: worst child-pod status (always written once there is ≥1 child).
      const r = STATUS_RANK[cd.status ?? FALLBACK_STATUS];
      worstRank = worstRank === undefined ? r : Math.max(worstRank, r);
      // application: first valued child pod in stable order.
      if (application === undefined && cd.application !== undefined) {
        application = cd.application;
      }
      // containers: union across child pods, deduped by (name, image).
      if (cd.containers !== undefined) {
        for (const c of cd.containers) {
          containersByKey.set(`${c.name}/${c.image}`, c);
        }
      }
      // alerts: concat in stable order; backfill missing pod from the source pod's label
      // on a COPY (the pod element stays untouched); dedupe by id across pods (first wins).
      if (cd.alerts !== undefined) {
        const podLabel = typeof cd.label === 'string' ? cd.label : typeof cd.id === 'string' ? cd.id : '';
        for (const alert of cd.alerts) {
          if (alert.id !== undefined) {
            if (seenAlertIds.has(alert.id)) {
              continue;
            }
            seenAlertIds.add(alert.id);
          }
          alerts.push(alert.pod === undefined ? { ...alert, pod: podLabel } : alert);
        }
      }
    }

    const containers =
      containersByKey.size > 0
        ? [...containersByKey.values()].sort((a, b) => a.name.localeCompare(b.name) || a.image.localeCompare(b.image))
        : undefined;

    return {
      ...el,
      data: {
        ...d,
        ...(kind !== undefined ? { kind } : {}),
        ...(worstRank !== undefined ? { worstStatus: rankToStatus(worstRank) } : {}),
        ...(application !== undefined ? { application } : {}),
        ...(containers !== undefined ? { containers } : {}),
        ...(alerts.length > 0 ? { alerts } : {}),
      },
    };
  });
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

  // Pure-function pipeline (D2): node-worst pre-pass (pod-to-node edges) → nodes → edges
  // (validated against node ids) → controller enrichment (decorate backend controllers from
  // child pods). Element order = backend payload order (nodes then edges); error order
  // (container-shape, node-parse, edge-parse) preserved.
  const nodeWorstFromPods = computeNodeWorstViaPodToNode(rawNodes, rawEdges);
  const nodes = parseNodes(rawNodes, nodeWorstFromPods);
  const edges = parseEdges(rawEdges, nodes.nodeIds);
  const enrichedNodes = enrichControllers(nodes.elements);

  return {
    elements: [...enrichedNodes, ...edges.elements],
    errors: [...errors, ...nodes.errors, ...edges.errors],
  };
}
