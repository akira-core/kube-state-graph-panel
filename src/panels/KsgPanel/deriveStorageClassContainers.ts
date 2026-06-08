import type cytoscape from 'cytoscape';

import { buildClusterColorIndex } from './clusterColorIndex';

export interface StorageClassContainerEntry {
  name: string;
  color: string;
}

export interface StorageClassDerivation {
  // Field names mirror the sibling ContainerDerivation (deriveNodeContainers) so the
  // two read the same at the call site.
  containerEntries: StorageClassContainerEntry[]; // name-deduped, parent-cluster-coloured swatches
  containerIds: string[]; // every storageclass container id (not name-deduped) for the collapse toggle
}

// StorageClass compound groups (data.type === 'storageclass' → isStorageClass in
// normalize), which box their PVCs as `cluster > storageclass > pvc`. UNLIKE the
// node / controller containers (deriveNodeContainers) these are mode-INDEPENDENT —
// a StorageClass always groups its PVCs in both pod-parent modes — so they get
// their own derivation + legend section. Each swatch takes its parent cluster's
// accent colour so the group reads as part of that cluster's family (mirrors the
// on-canvas tint). A storageclass with NO children is a drawn leaf (not a
// container) and is skipped here — parity with deriveContainers. Pure +
// deterministic: name-deduped entries (first-seen colour wins on a shared name),
// all container ids for the collapse toggle.
export function deriveStorageClassContainers(
  elements: readonly cytoscape.ElementDefinition[],
  fallbackColor: string
): StorageClassDerivation {
  const clusterColorById = buildClusterColorIndex(elements);
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

  const containerEntries: StorageClassContainerEntry[] = [];
  const containerIds: string[] = [];
  const seenNames = new Set<string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.isStorageClass !== true || typeof d.id !== 'string' || !parentIds.has(d.id)) {
      continue;
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
