import type cytoscape from 'cytoscape';

import type { SwitchTierResult } from './types';

// Minimal read view over a cytoscape ElementDefinition's data. The node/edge data
// union does not expose source/target/kind together, so we narrow at this boundary
// (the values originate from the normalize anti-corruption layer upstream).
interface ElementDataView {
  id?: string;
  kind?: string;
  tier?: number;
  labels?: Record<string, string>;
  source?: string;
  target?: string;
  edgeType?: string;
}

const SWITCH_KIND = 'switch';
const NODE_TO_SWITCH = 'node-to-switch';
const SWITCH_TO_SWITCH = 'switch-to-switch';

// A backend-supplied tier wins over the structurally-derived one (hybrid source).
// Accepts either a typed numeric `tier` field or a numeric string under labels.tier,
// covering both a future typed backend field and the string-only labels map.
function readBackendTier(data: ElementDataView): number | undefined {
  if (typeof data.tier === 'number' && Number.isInteger(data.tier) && data.tier >= 0) {
    return data.tier;
  }
  const raw = data.labels?.tier;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return undefined;
}

function addAdjacency(adjacency: Map<string, Set<string>>, from: string, to: string): void {
  const existing = adjacency.get(from);
  if (existing === undefined) {
    adjacency.set(from, new Set([to]));
    return;
  }
  existing.add(to);
}

function isNodeElement(element: cytoscape.ElementDefinition, data: ElementDataView): boolean {
  if (element.group === 'nodes') {
    return true;
  }
  if (element.group === 'edges') {
    return false;
  }
  // group omitted: infer — an edge always carries source + target.
  return data.source === undefined && data.target === undefined;
}

/**
 * Derive a network tier for every `switch` node from graph structure.
 *
 * - A switch with at least one incident `node-to-switch` edge is tier 0 (access).
 * - Other switches receive their shortest `switch-to-switch` BFS distance to the
 *   access set.
 * - A switch unreachable from any access switch (including a fully isolated one)
 *   defaults to tier 0.
 * - A backend-supplied tier (numeric `data.tier` or numeric `labels.tier`) wins
 *   over the derived value.
 *
 * Pure and deterministic for identical input.
 */
export function computeSwitchTiers(elements: readonly cytoscape.ElementDefinition[]): SwitchTierResult {
  const switchIds = new Set<string>();
  const overrides = new Map<string, number>();

  for (const element of elements) {
    const data = element.data as ElementDataView;
    if (!isNodeElement(element, data) || typeof data.id !== 'string') {
      continue;
    }
    if (data.kind === SWITCH_KIND) {
      switchIds.add(data.id);
      const override = readBackendTier(data);
      if (override !== undefined) {
        overrides.set(data.id, override);
      }
    }
  }

  if (switchIds.size === 0) {
    return { tierById: new Map(), maxTier: -1 };
  }

  const accessIds = new Set<string>();
  const adjacency = new Map<string, Set<string>>();

  for (const element of elements) {
    const data = element.data as ElementDataView;
    const { source, target, edgeType } = data;
    if (typeof source !== 'string' || typeof target !== 'string') {
      continue;
    }
    if (edgeType === NODE_TO_SWITCH) {
      if (switchIds.has(source)) {
        accessIds.add(source);
      }
      if (switchIds.has(target)) {
        accessIds.add(target);
      }
    } else if (edgeType === SWITCH_TO_SWITCH && switchIds.has(source) && switchIds.has(target)) {
      addAdjacency(adjacency, source, target);
      addAdjacency(adjacency, target, source);
    }
  }

  // BFS from the access set; tier = hop distance.
  const tierById = new Map<string, number>();
  const queue: string[] = [];
  for (const id of accessIds) {
    tierById.set(id, 0);
    queue.push(id);
  }
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    if (current === undefined) {
      continue;
    }
    const currentTier = tierById.get(current) ?? 0;
    const neighbours = adjacency.get(current);
    if (neighbours === undefined) {
      continue;
    }
    for (const neighbour of neighbours) {
      if (!tierById.has(neighbour)) {
        tierById.set(neighbour, currentTier + 1);
        queue.push(neighbour);
      }
    }
  }

  // Switches with no path to access (incl. fully isolated) settle at tier 0.
  for (const id of switchIds) {
    if (!tierById.has(id)) {
      tierById.set(id, 0);
    }
  }

  // Backend tier wins over the derived value.
  for (const [id, tier] of overrides) {
    tierById.set(id, tier);
  }

  let maxTier = 0;
  for (const tier of tierById.values()) {
    if (tier > maxTier) {
      maxTier = tier;
    }
  }

  return { tierById, maxTier };
}
