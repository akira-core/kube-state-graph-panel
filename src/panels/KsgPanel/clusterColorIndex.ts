import type cytoscape from 'cytoscape';

// Index each backend cluster container's accent colour by its node id, so the node /
// controller / storageclass swatch derivations can tint a contained node from its
// parent cluster. Single source for the `isCluster` → `clusterColor` scan that was
// otherwise duplicated across deriveContainers + deriveStorageClassContainers.
export function buildClusterColorIndex(elements: readonly cytoscape.ElementDefinition[]): Map<string, string> {
  const byId = new Map<string, string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.isCluster === true && typeof d.id === 'string' && typeof d.clusterColor === 'string') {
      byId.set(d.id, d.clusterColor);
    }
  }
  return byId;
}
