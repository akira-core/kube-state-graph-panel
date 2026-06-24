import type { TimeRange } from '@grafana/data';
import type cytoscape from 'cytoscape';

// The per-node Dashboard URL query param map, exactly what getBackendSrv().get takes as
// its `params` argument. A `string[]` value (e.g. `ipaddress`) serializes to REPEATED
// query params (`ipaddress=a&ipaddress=b`), matching the multi-value graph-query style.
export type DashboardParams = Record<string, string | string[]>;

// Panel-internal rendering-only / structural `data` keys that are NOT backend
// attributes and MUST NOT be sent as `/dashboard` query params:
//   - `id`         — a synthesized controller carries a panel-minted `ctrl/…` id, not
//                    a backend attribute; node identity travels as kind + name.
//   - `parent` / `worstStatus` / `is*` flags / `*Color` — pure rendering/structure.
//   - `labels`     — excluded by the param rule (a nested object, not a scalar anyway).
//   - `status`     — health, not identity, and volatile (it would refire the prefetch
//                    key on a refresh); excluded so the request stays stable per open.
const DENYLIST: ReadonlySet<string> = new Set([
  'id',
  'parent',
  'worstStatus',
  'isCluster',
  'isController',
  'isStorageClass',
  'isNamespace',
  'clusterColor',
  'namespaceColor',
  'labels',
  'status',
]);

// True when a node opens the detail panel AND gets the Dashboard button — every node
// EXCEPT the cluster / namespace / storageclass grouping compounds. Shared with
// resolveSelectedNode (KsgPanel) so the two scopes cannot drift.
export function isDashboardEligible(d: cytoscape.NodeDataDefinition): boolean {
  return d.isCluster !== true && d.isStorageClass !== true && d.isNamespace !== true;
}

// Resolve the node's cluster NAME for the `cluster` param. The authoritative source is
// the nearest `isCluster` ANCESTOR's `data.cluster` (every eligible node nests under a
// cluster compound — `cluster > [namespace] > controller > pod`, `cluster > node > pod`,
// `cluster > svc` …), walked via `data.parent`. This is the only uniform source: a
// synthesized controller carries neither `data.cluster` nor `labels`, so an ancestor
// walk is required. Falls back to the node's own `labels.cluster` for a flat /
// cluster-less-but-labelled payload; `undefined` when no cluster is knowable (e.g. a
// top-level external node).
function resolveCluster(
  elements: readonly cytoscape.ElementDefinition[],
  selfData: cytoscape.NodeDataDefinition
): string | undefined {
  const byId = new Map<string, cytoscape.NodeDataDefinition>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (typeof d.id === 'string') {
      byId.set(d.id, d);
    }
  }
  let cur: cytoscape.NodeDataDefinition | undefined = selfData;
  let hops = 0;
  while (cur?.parent !== undefined && hops <= byId.size) {
    const parent = byId.get(cur.parent);
    if (parent === undefined) {
      break;
    }
    if (parent.isCluster === true && typeof parent.cluster === 'string' && parent.cluster.length > 0) {
      return parent.cluster;
    }
    cur = parent;
    hops += 1;
  }
  const labelCluster = selfData.labels?.cluster;
  return typeof labelCluster === 'string' && labelCluster.length > 0 ? labelCluster : undefined;
}

// Project ONE node's `data` onto query params: drop the denylist + non-identity
// arrays/objects (`alerts` / `containers` / `owner`), and rename `label` → `name`
// (normalize stored the upstream `name` as `label`; the backend detail endpoints key on
// `name`). Numbers stringify. EXCEPTION: `ipAddress` (`string[]`) is emitted as the
// `ipaddress` param carrying the array verbatim → repeated `ipaddress=` query params
// (empty/absent → omitted).
function paramsFromData(d: cytoscape.NodeDataDefinition): DashboardParams {
  const out: DashboardParams = {};
  for (const [key, value] of Object.entries(d)) {
    if (DENYLIST.has(key)) {
      continue;
    }
    if (key === 'ipAddress') {
      if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string')) {
        out.ipaddress = value;
      }
      continue;
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
      continue; // non-scalar: not query identity
    }
    const paramKey = key === 'label' ? 'name' : key;
    out[paramKey] = String(value);
  }
  return out;
}

// Resolve the node's controller NAME for the `controller` param — symmetric with
// resolveCluster. Authoritative source: the nearest `isController` ANCESTOR's name
// (`data.label`); in controller mode a pod's direct parent IS its controller compound.
// Falls back to the node's own `data.owner.name` (the same source useNodeDetailUrls
// reads a pod's controller from) when no controller compound is an ancestor (e.g. node
// mode). `undefined` when neither exists — a controller compound itself (no parent
// controller, no owner), or a bare service/pvc/external. Self is NOT counted; only
// ancestors are walked.
function resolveController(
  elements: readonly cytoscape.ElementDefinition[],
  selfData: cytoscape.NodeDataDefinition
): string | undefined {
  const byId = new Map<string, cytoscape.NodeDataDefinition>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (typeof d.id === 'string') {
      byId.set(d.id, d);
    }
  }
  let cur: cytoscape.NodeDataDefinition | undefined = selfData;
  let hops = 0;
  while (cur?.parent !== undefined && hops <= byId.size) {
    const parent = byId.get(cur.parent);
    if (parent === undefined) {
      break;
    }
    if (parent.isController === true && typeof parent.label === 'string' && parent.label.length > 0) {
      return parent.label;
    }
    cur = parent;
    hops += 1;
  }
  const ownerName = selfData.owner?.name;
  return typeof ownerName === 'string' && ownerName.length > 0 ? ownerName : undefined;
}

/**
 * Assemble the `/dashboard` query params for the selected node, or `undefined` when
 * the node is missing or not dashboard-eligible (cluster / namespace / storageclass) —
 * the defensive gate that keeps useNodeDashboardUrl idle for those.
 *
 * Leaf node → its own scalar attributes (denylist + non-scalars dropped, `label`→`name`).
 * Compound node (k8s-node / controller) → its OWN attributes PLUS every attribute that
 * is present with an IDENTICAL value across ALL direct children (`data.parent === id`),
 * added only when the compound does not already carry that key (own-wins); attributes
 * that differ across children are skipped. No direct children → own attributes only.
 *
 * The `cluster` param is resolved separately (resolveCluster): the nearest isCluster
 * ancestor's name, else the node's own `labels.cluster`. The `controller` param is
 * resolved the same way (resolveController): the nearest isController ancestor's name,
 * else the node's own `data.owner.name`. Both ride on every eligible node even though
 * neither is a first-class leaf data field (and `labels` is denied).
 *
 * When `timeRange` is supplied, `from_time` / `to_time` carry its bounds as Unix seconds
 * (the dashboard URL is time-windowed) — only on the eligible branch, so an ineligible
 * node (which returns `undefined` above) never carries time.
 */
export function assembleDashboardParams(
  elements: readonly cytoscape.ElementDefinition[],
  nodeId: string | null,
  timeRange?: TimeRange
): DashboardParams | undefined {
  if (nodeId === null) {
    return undefined;
  }
  let selfData: cytoscape.NodeDataDefinition | undefined;
  const childData: cytoscape.NodeDataDefinition[] = [];
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.id === nodeId) {
      selfData = d;
    } else if (d.parent === nodeId) {
      childData.push(d);
    }
  }
  if (selfData === undefined || !isDashboardEligible(selfData)) {
    return undefined;
  }

  const params = paramsFromData(selfData);

  // Compound merge: add child-shared attributes the compound itself lacks.
  if (childData.length > 0) {
    const childParams = childData.map(paramsFromData);
    const [first, ...rest] = childParams;
    if (first !== undefined) {
      for (const [key, value] of Object.entries(first)) {
        if (key in params) {
          continue; // own-wins
        }
        if (rest.every((m) => m[key] === value)) {
          params[key] = value; // identical across ALL children
        }
      }
    }
  }

  // cluster: resolved from the compound nesting (or labels fallback), own-wins.
  if (!('cluster' in params)) {
    const cluster = resolveCluster(elements, selfData);
    if (cluster !== undefined) {
      params.cluster = cluster;
    }
  }

  // controller: nearest isController ancestor (or own owner.name fallback), own-wins.
  if (!('controller' in params)) {
    const controller = resolveController(elements, selfData);
    if (controller !== undefined) {
      params.controller = controller;
    }
  }

  // from_time / to_time: the dashboard's current range as Unix seconds. Eligible branch
  // only (we are past the undefined gate), so ineligible nodes never carry time.
  if (timeRange !== undefined) {
    params.from_time = String(timeRange.from.unix());
    params.to_time = String(timeRange.to.unix());
  }

  return params;
}
