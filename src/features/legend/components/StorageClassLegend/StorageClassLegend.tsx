import React from 'react';

import { SwatchLegend } from '../SwatchLegend';

export interface StorageClassLegendEntry {
  name: string;
  color: string;
}

export interface StorageClassLegendProps {
  storageClasses: readonly StorageClassLegendEntry[];
  onToggleCollapseAll?: () => void;
  allCollapsed?: boolean;
}

// Swatches for the StorageClass compound groups present in the data (backend
// `type: "storageclass"` → isStorageClass). Each renders on-canvas as a labelled
// container box nested in its cluster (`cluster > storageclass > pvc`), tinted with
// that cluster's accent. It gets its own swatch section (like Clusters / Nodes)
// because it is a mode-independent grouping container; when COLLAPSED it ALSO shows
// its `storageclass` kind glyph in the icon Node-kinds legend (deriveLegendKinds) —
// exactly like a collapsed K8s-node container. UNLIKE the node-container legend this
// is mode-independent (a StorageClass groups its PVCs in both pod-parent modes). A
// thin wrapper over the shared SwatchLegend; renders nothing when empty.
export function StorageClassLegend({
  storageClasses,
  onToggleCollapseAll,
  allCollapsed = false,
}: Readonly<StorageClassLegendProps>): React.JSX.Element | null {
  return (
    <SwatchLegend
      title="Storage classes"
      testId="storageclass-legend"
      rowTestIdPrefix="storageclass-legend-row-"
      entries={storageClasses}
      collapseToggleTestId="storageclass-collapse-toggle"
      collapseNoun="storage classes"
      allCollapsed={allCollapsed}
      {...(onToggleCollapseAll !== undefined ? { onToggleCollapseAll } : {})}
    />
  );
}
