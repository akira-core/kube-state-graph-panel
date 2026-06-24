import type cytoscape from 'cytoscape';

import { deriveContainersBy, type ContainerEntry, type ContainerSet } from './deriveContainersBy';

export type StorageClassContainerEntry = ContainerEntry;

export type StorageClassDerivation = ContainerSet;

// StorageClass compound groups (data.type === 'storageclass' → isStorageClass in
// normalize), which box their PVCs as `cluster > storageclass > pvc`. UNLIKE the
// node / controller containers (deriveNodeContainers) these are mode-INDEPENDENT —
// a StorageClass always groups its PVCs in both pod-parent modes — so they get
// their own derivation + legend section. Collection mechanics (childless-leaf
// skip, name dedupe, cluster tint) live in the shared deriveContainersBy core.
export function deriveStorageClassContainers(
  elements: readonly cytoscape.ElementDefinition[],
  fallbackColor: string
): StorageClassDerivation {
  return deriveContainersBy(elements, fallbackColor, (d) => d.isStorageClass === true);
}
