import React from 'react';

import { SwatchLegend } from '../SwatchLegend';

export interface NodeContainerLegendEntry {
  name: string;
  color: string;
}

export interface NodeContainerLegendProps {
  nodes: readonly NodeContainerLegendEntry[];
  onToggleCollapseAll?: () => void;
  allCollapsed?: boolean;
}

// Swatches for the K8s `node` compound containers present in the data. In the
// default `cluster > node > pod` layout a node renders as a labelled container
// box with NO resource icon, so it belongs here (swatched like a cluster) rather
// than in the icon-based Node-kinds legend — see KsgPanel. Each swatch takes its
// parent cluster's accent colour so node and cluster read as the same family. A
// thin wrapper over the shared SwatchLegend; renders nothing when empty (e.g. in
// the drawn-node mode where node is a leaf and appears in Node kinds instead).
export function NodeContainerLegend({
  nodes,
  onToggleCollapseAll,
  allCollapsed = false,
}: Readonly<NodeContainerLegendProps>): React.JSX.Element | null {
  return (
    <SwatchLegend
      title="Nodes"
      testId="node-container-legend"
      rowTestIdPrefix="node-container-legend-row-"
      entries={nodes}
      collapseToggleTestId="node-collapse-toggle"
      collapseNoun="nodes"
      allCollapsed={allCollapsed}
      {...(onToggleCollapseAll !== undefined ? { onToggleCollapseAll } : {})}
    />
  );
}
