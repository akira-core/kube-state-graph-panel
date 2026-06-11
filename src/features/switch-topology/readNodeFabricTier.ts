import type cytoscape from 'cytoscape';

import type { PodParentMode } from '../../shared/constants/types';

interface ElementDataView {
  id?: string;
  kind?: string;
  source?: string;
  target?: string;
  edgeType?: string;
}

// Merge a derived K8s-node tier into the switch level map for controller mode.
// Every `node` that is the source of a `node-to-switch` edge is placed one tier
// BELOW the bottommost switch row (min level - 1), so the fabric reads
// `switch -> switch -> node -> pod` top-to-bottom (higher levels on top).
// Switches keep their own levels. In node mode, or with no levelled switch, the
// switch map is returned unchanged (no node pinned). Pure; does NOT extend
// readSwitchLevels (which stays switch-only / non-negative) — negative levels are
// produced here and consumed by buildSwitchConstraints (y = -level * TIER_GAP
// supports the -1 tier, y = +180). ALL fabric-connected nodes share the single
// min-1 tier regardless of which switch each connects to (uplinks to deeper
// switches may cross rows — accepted).
export function readNodeFabricTier(
  elements: readonly cytoscape.ElementDefinition[],
  mode: PodParentMode,
  switchLevels: ReadonlyMap<string, number>
): Map<string, number> {
  const merged = new Map<string, number>(switchLevels);
  if (mode !== 'controller' || switchLevels.size === 0) {
    return merged;
  }
  let minLevel = Infinity;
  for (const level of switchLevels.values()) {
    if (level < minLevel) {
      minLevel = level;
    }
  }
  const fabricNodeIds = new Set<string>();
  for (const el of elements) {
    const data = el.data as ElementDataView;
    const isEdge =
      el.group === 'edges' || (el.group === undefined && data.source !== undefined && data.target !== undefined);
    if (isEdge && data.edgeType === 'node-to-switch' && typeof data.source === 'string') {
      fabricNodeIds.add(data.source);
    }
  }
  const nodeTier = minLevel - 1;
  for (const el of elements) {
    const data = el.data as ElementDataView;
    const isNode =
      el.group === 'nodes' || (el.group === undefined && data.source === undefined && data.target === undefined);
    if (isNode && data.kind === 'node' && typeof data.id === 'string' && fabricNodeIds.has(data.id)) {
      merged.set(data.id, nodeTier);
    }
  }
  return merged;
}
