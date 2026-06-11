import type cytoscape from 'cytoscape';

import { buildClusterColorIndex } from './clusterColorIndex';

export interface ContainerEntry {
  name: string;
  color: string;
}

export interface ContainerSet {
  containerEntries: ContainerEntry[]; // name-deduped, parent-cluster-coloured swatches
  containerIds: string[]; // every container id (not name-deduped) for the collapse toggle
}

// Shared core of the swatch-section derivations (Nodes/Controllers and Storage
// Classes — deriveNodeContainers / deriveStorageClassContainers are thin wrappers
// differing only in their container predicate): collect the compound containers
// matching `isContainer`, skipping childless candidates (drawn leaves, not
// containers). Entries are name-deduped (first-seen colour wins on a shared name)
// and tinted with the parent cluster's accent colour so each group reads as part
// of that cluster's family. Pure + deterministic.
export function deriveContainersBy(
  elements: readonly cytoscape.ElementDefinition[],
  fallbackColor: string,
  isContainer: (d: cytoscape.NodeDataDefinition) => boolean
): ContainerSet {
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

  const containerEntries: ContainerEntry[] = [];
  const containerIds: string[] = [];
  const seenNames = new Set<string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (!isContainer(d) || typeof d.id !== 'string' || !parentIds.has(d.id)) {
      continue; // not a container, or a childless drawn leaf
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

  return { containerEntries, containerIds };
}
