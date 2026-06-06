import type cytoscape from 'cytoscape';

import type { PodParentMode } from '../../shared/constants/types';

export interface NodeContainerEntry {
  name: string;
  color: string;
}

export interface ContainerDerivation {
  containerEntries: NodeContainerEntry[]; // name-deduped, cluster-coloured swatches
  containerIds: string[]; // every container id (not name-deduped) for the collapse toggle
  title: string; // 'Nodes' (node mode) | 'Controllers' (controller mode)
  collapseNoun: string; // 'nodes' | 'controllers'
  // True when `node` should appear in the icon Node-kinds legend: in controller
  // mode K8s nodes are leaves (always true if any node present); in node mode a
  // node earns it only as a drawn leaf OR a collapsed container.
  showNodeKindIcon: boolean;
}

// A container in `node` mode is a K8s `node` that boxes pods; in `controller` mode
// it is a synthesized controller (isController) that boxes pods. Pure + deterministic.
export function deriveContainers(
  elements: readonly cytoscape.ElementDefinition[],
  fallbackColor: string,
  mode: PodParentMode,
  collapsedIds: ReadonlySet<string> = new Set<string>()
): ContainerDerivation {
  const parentIds = new Set<string>();
  const clusterColorById = new Map<string, string>();
  let anyNodeKind = false;
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (typeof d.parent === 'string') {
      parentIds.add(d.parent);
    }
    if (d.kind === 'node') {
      anyNodeKind = true;
    }
    if (d.isCluster === true && typeof d.id === 'string' && typeof d.clusterColor === 'string') {
      clusterColorById.set(d.id, d.clusterColor);
    }
  }

  const isContainerKind = (d: cytoscape.NodeDataDefinition): boolean =>
    mode === 'controller' ? d.isController === true : d.kind === 'node';

  const containerEntries: NodeContainerEntry[] = [];
  const containerIds: string[] = [];
  const seenNames = new Set<string>();
  let showNodeKindIcon = mode === 'controller' && anyNodeKind; // nodes are leaves in controller mode
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (!isContainerKind(d) || typeof d.id !== 'string') {
      // A K8s node that is NOT a container in node mode (drawn leaf) earns its icon.
      if (mode === 'node' && d.kind === 'node' && typeof d.id === 'string' && !parentIds.has(d.id)) {
        showNodeKindIcon = true;
      }
      continue;
    }
    if (!parentIds.has(d.id)) {
      // A container kind with no children → drawn leaf, shows its icon (node mode only).
      if (mode === 'node') {
        showNodeKindIcon = true;
      }
      continue;
    }
    containerIds.push(d.id);
    if (mode === 'node' && collapsedIds.has(d.id)) {
      showNodeKindIcon = true;
    }
    const name = typeof d.label === 'string' ? d.label : d.id;
    if (seenNames.has(name)) {
      continue;
    }
    seenNames.add(name);
    const parentColor = typeof d.parent === 'string' ? clusterColorById.get(d.parent) : undefined;
    containerEntries.push({ name, color: parentColor ?? fallbackColor });
  }

  return {
    containerEntries,
    containerIds,
    title: mode === 'controller' ? 'Controllers' : 'Nodes',
    collapseNoun: mode === 'controller' ? 'controllers' : 'nodes',
    showNodeKindIcon,
  };
}
