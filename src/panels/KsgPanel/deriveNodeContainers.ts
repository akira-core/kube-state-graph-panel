import type cytoscape from 'cytoscape';

import type { PodParentMode } from '../../shared/constants/types';

import { buildClusterColorIndex } from './clusterColorIndex';

export interface NodeContainerEntry {
  name: string;
  color: string;
}

export interface ContainerDerivation {
  containerEntries: NodeContainerEntry[]; // name-deduped, cluster-coloured swatches
  containerIds: string[]; // every container id (not name-deduped) for the collapse toggle
  title: string; // 'Nodes' (node mode) | 'Controllers' (controller mode)
  collapseNoun: string; // 'nodes' | 'controllers'
}

// A container in `node` mode is a K8s `node` that boxes pods; in `controller` mode
// it is a synthesized controller (isController) that boxes pods. Childless candidates
// are drawn leaves, not containers, and are skipped. Whether a container's kind also
// shows in the icon Node-kinds legend is decided separately (deriveLegendKinds, which
// is collapse-aware). Pure + deterministic.
export function deriveContainers(
  elements: readonly cytoscape.ElementDefinition[],
  fallbackColor: string,
  mode: PodParentMode
): ContainerDerivation {
  const parentIds = new Set<string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (typeof d.parent === 'string') {
      parentIds.add(d.parent);
    }
  }
  const clusterColorById = buildClusterColorIndex(elements);

  const isContainerKind = (d: cytoscape.NodeDataDefinition): boolean =>
    mode === 'controller' ? d.isController === true : d.kind === 'node';

  const containerEntries: NodeContainerEntry[] = [];
  const containerIds: string[] = [];
  const seenNames = new Set<string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (!isContainerKind(d) || typeof d.id !== 'string' || !parentIds.has(d.id)) {
      continue; // not a container in this mode, or a childless drawn leaf
    }
    containerIds.push(d.id);
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
  };
}
