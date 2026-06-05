import type cytoscape from 'cytoscape';

export interface NodeContainerEntry {
  name: string;
  color: string;
}

export interface NodeContainerDerivation {
  // K8s `node` compound containers present in the graph, each coloured by its
  // parent cluster's accent (falls back to a neutral colour when the node has no
  // cluster parent). Rendered as swatches in the "Nodes" legend section.
  nodeEntries: NodeContainerEntry[];
  // True when at least one `node`-kind element is a DRAWN LEAF (not a compound
  // container) — i.e. the drawn-node mode (service / controller) where the node
  // is an icon node with `pod-runs-on-node` edges and so belongs in the icon
  // Node-kinds legend. Drives whether `node` is listed there.
  nodeKindLeafExists: boolean;
}

// Mode-agnostic split of `node`-kind elements into compound containers vs drawn
// leaves, based purely on whether each is some other element's parent. A node
// that boxes pods (cluster > node > pod) is a container; a node that pods point
// at via a drawn `pod-runs-on-node` edge is a leaf. Pure + deterministic.
export function deriveNodeContainers(
  elements: readonly cytoscape.ElementDefinition[],
  fallbackColor: string
): NodeContainerDerivation {
  const parentIds = new Set<string>();
  const clusterColorById = new Map<string, string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as Record<string, unknown>;
    if (typeof d.parent === 'string') {
      parentIds.add(d.parent);
    }
    if (d.isCluster === true && typeof d.id === 'string' && typeof d.clusterColor === 'string') {
      clusterColorById.set(d.id, d.clusterColor);
    }
  }

  const nodeEntries: NodeContainerEntry[] = [];
  const seenNames = new Set<string>();
  let nodeKindLeafExists = false;
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as Record<string, unknown>;
    if (d.kind !== 'node' || typeof d.id !== 'string') {
      continue;
    }
    if (!parentIds.has(d.id)) {
      nodeKindLeafExists = true;
      continue;
    }
    const name = typeof d.label === 'string' ? d.label : d.id;
    if (seenNames.has(name)) {
      continue;
    }
    seenNames.add(name);
    const parentColor = typeof d.parent === 'string' ? clusterColorById.get(d.parent) : undefined;
    nodeEntries.push({ name, color: parentColor ?? fallbackColor });
  }

  return { nodeEntries, nodeKindLeafExists };
}
