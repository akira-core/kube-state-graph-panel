import type { SwitchConstraints, SwitchRelativePlacement, SwitchTierResult } from './types';

// Vertical separation (px) enforced between adjacent switch tiers. A sensible
// default; tune visually on the demo (see design Open Questions).
const TIER_GAP = 120;

// Group switch ids by tier, with deterministic ordering: ids sorted within a tier
// and tiers ascending. Determinism keeps the constraints (and thus the layout)
// stable for identical input.
function groupByTier(tierById: ReadonlyMap<string, number>): { tierNumbers: number[]; byTier: Map<number, string[]> } {
  const byTier = new Map<number, string[]>();
  for (const [id, tier] of tierById) {
    const group = byTier.get(tier);
    if (group === undefined) {
      byTier.set(tier, [id]);
    } else {
      group.push(id);
    }
  }
  for (const group of byTier.values()) {
    group.sort();
  }
  const tierNumbers = [...byTier.keys()].sort((a, b) => a - b);
  return { tierNumbers, byTier };
}

/**
 * Turn a per-switch tier mapping into native fcose constraints:
 * - `alignmentConstraint.horizontal`: each tier with >= 2 members aligned onto one row.
 * - `relativePlacementConstraint`: adjacent tiers stacked, tier k above tier k+1.
 *
 * Returns null when there are fewer than two switches (nothing to constrain) or
 * when neither an alignment group nor a relative placement results.
 */
export function buildSwitchConstraints(tiers: SwitchTierResult): SwitchConstraints | null {
  const { tierById } = tiers;
  if (tierById.size < 2) {
    return null;
  }

  const { tierNumbers, byTier } = groupByTier(tierById);

  const horizontal: string[][] = [];
  for (const tier of tierNumbers) {
    const group = byTier.get(tier);
    if (group !== undefined && group.length >= 2) {
      horizontal.push([...group]);
    }
  }

  const relativePlacementConstraint: SwitchRelativePlacement[] = [];
  for (let i = 0; i < tierNumbers.length - 1; i += 1) {
    const topTier = tierNumbers[i];
    const bottomTier = tierNumbers[i + 1];
    if (topTier === undefined || bottomTier === undefined) {
      continue;
    }
    const topRep = byTier.get(topTier)?.[0];
    const bottomRep = byTier.get(bottomTier)?.[0];
    if (topRep === undefined || bottomRep === undefined) {
      continue;
    }
    relativePlacementConstraint.push({ top: topRep, bottom: bottomRep, gap: TIER_GAP });
  }

  const result: SwitchConstraints = {};
  if (horizontal.length > 0) {
    result.alignmentConstraint = { horizontal };
  }
  if (relativePlacementConstraint.length > 0) {
    result.relativePlacementConstraint = relativePlacementConstraint;
  }
  return result.alignmentConstraint === undefined && result.relativePlacementConstraint === undefined ? null : result;
}
