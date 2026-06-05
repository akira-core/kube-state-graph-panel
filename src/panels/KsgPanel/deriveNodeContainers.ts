import type cytoscape from 'cytoscape';

export interface NodeContainerEntry {
  name: string;
  color: string;
}

export interface NodeContainerDerivation {
  // K8s `node` compound containers present in the graph, each coloured by its
  // parent cluster's accent (falls back to a neutral colour when the node has no
  // cluster parent). Rendered as swatches in the "Nodes" legend section. Includes
  // COLLAPSED containers too — the swatch + its collapse toggle stay available so
  // the node can always be expanded again.
  nodeEntries: NodeContainerEntry[];
  // True when `node` should appear in the icon Node-kinds legend — i.e. it renders
  // as an actual glyph somewhere: either a DRAWN LEAF (service / controller mode,
  // with pod-runs-on-node edges) OR a COLLAPSED container (which shows its kind
  // icon on canvas once expand-collapse removes its children). An expanded
  // container shows no icon, so it alone does not earn the icon slot.
  showNodeKindIcon: boolean;
}

// Mode-agnostic split of `node`-kind elements into compound containers vs glyphs.
// A node that boxes pods (cluster > node > pod) is an (expanded) container; a node
// that pods point at via a drawn `pod-runs-on-node` edge is a leaf; a collapsed
// container renders as a glyph too. Pure + deterministic.
export function deriveNodeContainers(
  elements: readonly cytoscape.ElementDefinition[],
  fallbackColor: string,
  collapsedIds: ReadonlySet<string> = new Set<string>()
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
  let showNodeKindIcon = false;
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as Record<string, unknown>;
    if (d.kind !== 'node' || typeof d.id !== 'string') {
      continue;
    }
    if (!parentIds.has(d.id)) {
      // A drawn leaf node → it shows its icon.
      showNodeKindIcon = true;
      continue;
    }
    // A container. Collapsed containers render as a glyph, so they too put `node`
    // in the icon legend; either way the container keeps its "Nodes" swatch.
    if (collapsedIds.has(d.id)) {
      showNodeKindIcon = true;
    }
    const name = typeof d.label === 'string' ? d.label : d.id;
    if (seenNames.has(name)) {
      continue;
    }
    seenNames.add(name);
    const parentColor = typeof d.parent === 'string' ? clusterColorById.get(d.parent) : undefined;
    nodeEntries.push({ name, color: parentColor ?? fallbackColor });
  }

  return { nodeEntries, showNodeKindIcon };
}
