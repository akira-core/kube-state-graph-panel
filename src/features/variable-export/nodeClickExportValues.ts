import type cytoscape from 'cytoscape';

// The value pair to write into the two variable-export options. `[]` on either
// field is the "clear" signal for writeDashboardVariable (turned into the
// `$__empty` sentinel there) — see node-click-export-vars design D2.
export interface NodeClickExportValues {
  podNames: string[];
  clusterName: string[];
}

const EMPTY: NodeClickExportValues = { podNames: [], clusterName: [] };

function buildByIdMap(elements: readonly cytoscape.ElementDefinition[]): Map<string, cytoscape.NodeDataDefinition> {
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
  return byId;
}

// Nearest `isCluster` ancestor's `data.cluster` (walked via `data.parent`), else the
// node's own `labels.cluster`, else `undefined`. Same algorithm shape as the private
// `resolveCluster` in node-detail's assembleDashboardParams.ts — reimplemented locally
// so variable-export stays decoupled from node-detail (design D4). The hop guard is
// bounded by the map size so a pathological `parent` cycle cannot infinite-loop.
function resolveCluster(
  byId: ReadonlyMap<string, cytoscape.NodeDataDefinition>,
  selfData: cytoscape.NodeDataDefinition
): string | undefined {
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

// Direct child pods of a controller: `data.parent === controllerId && kind === 'pod'`,
// labels deduped and sorted lexicographically (plain code-unit sort, locale-independent —
// same convention as the extractAlert* collectors) for a stable multi-value fingerprint
// (design D2/D3 — collected from the current view elements, not an owner reverse-lookup).
function collectChildPodLabels(elements: readonly cytoscape.ElementDefinition[], controllerId: string): string[] {
  const labels = new Set<string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.parent === controllerId && d.kind === 'pod' && typeof d.label === 'string' && d.label.length > 0) {
      labels.add(d.label);
    }
  }
  return Array.from(labels).sort();
}

/**
 * The pod-name(s) + cluster-name to export for the currently left-clicked node — the
 * pure decision behind `useNodeClickExport`. `selectedNodeId === null` or an id not
 * present in `elements` clears both. A `kind === 'pod'` node exports `[label]`
 * regardless of `status` (no status gating — node-click-export-vars design D1/D2). An
 * `isController === true` compound exports every direct child pod's label (deduped +
 * sorted). Any other node kind exports `[]` for both. Cluster resolution follows the
 * `isCluster` ancestor walk in both the pod and controller branches; see resolveCluster.
 */
export function nodeClickExportValues(
  elements: readonly cytoscape.ElementDefinition[],
  selectedNodeId: string | null
): NodeClickExportValues {
  if (selectedNodeId === null) {
    return EMPTY;
  }
  const byId = buildByIdMap(elements);
  const selfData = byId.get(selectedNodeId);
  if (selfData === undefined) {
    return EMPTY;
  }

  let podNames: string[];
  if (selfData.kind === 'pod') {
    podNames = typeof selfData.label === 'string' && selfData.label.length > 0 ? [selfData.label] : [];
  } else if (selfData.isController === true) {
    podNames = collectChildPodLabels(elements, selectedNodeId);
  } else {
    return EMPTY;
  }

  const cluster = resolveCluster(byId, selfData);
  return { podNames, clusterName: cluster !== undefined ? [cluster] : [] };
}
