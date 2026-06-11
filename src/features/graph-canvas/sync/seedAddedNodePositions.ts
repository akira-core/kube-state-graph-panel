import type cytoscape from 'cytoscape';

export interface SeedResult {
  // Input elements, each anchorable node carrying a seeded `position`.
  elements: cytoscape.ElementDefinition[];
  // Count of added nodes with no already-present ancestor — caller should relayout
  // once rather than let them stack at the origin (see the function doc).
  unanchored: number;
}

function dataParent(el: cytoscape.ElementDefinition): string | null {
  // el.data.parent is `any` via ElementDataDefinition's index signature; widen to
  // unknown so the typeof guard narrows it safely (no-unsafe-assignment).
  const parent: unknown = el.data.parent;
  return typeof parent === 'string' && parent.length > 0 ? parent : null;
}

/**
 * Seed an initial position for nodes about to be added to `cy`, placing each child
 * near its nearest ALREADY-PRESENT ancestor's position instead of cytoscape's
 * default (0,0).
 *
 * Why: `normalizeGraph`/`diffElements` never carry a `position`, so `cy.add` drops
 * new nodes at the origin. On a pure data refresh the layout does NOT rerun (it is
 * gated on collapsed-set content, design D7), so a pod added under a COLLAPSED
 * controller would sit at (0,0) and drag that controller's collapsed-box toward the
 * origin when the extension re-pins it — every such controller then clumps at one
 * point. Seeding the newcomer inside its parent's cluster keeps the parent's
 * bounding box (and therefore its collapsed-box position) stable, fixing the
 * "controllers stack on refresh" case without a disruptive full relayout.
 *
 * The parent may itself be new in the same batch (normalize emits pods before their
 * synthesized controller, so a child precedes its new parent in `toAdd`). We walk
 * the parent chain through the incoming batch until we reach a node already in `cy`
 * and anchor to it. A node with nothing to anchor to — a family whose ancestor
 * chain has no present node, OR a parentless newcomer (a top-level external/others
 * leaf) — is reported via `unanchored` so the caller can relayout once rather than
 * let it sit at the origin.
 *
 * Input elements are never mutated — a shallow clone carries the seeded position so
 * the upstream `elements` array (and its memoization) is preserved.
 */
export function seedAddedNodePositions(cy: cytoscape.Core, toAdd: cytoscape.ElementDefinition[]): SeedResult {
  const addedById = new Map<string, cytoscape.ElementDefinition>();
  for (const el of toAdd) {
    const id = el.data.id;
    if (el.group === 'nodes' && typeof id === 'string') {
      addedById.set(id, el);
    }
  }

  // Resolve the position of the nearest ancestor that already exists in cy, walking
  // up through parents that are themselves new in this batch. Returns null when the
  // chain reaches the top (or a dangling ref) without hitting a present node.
  const anchorPosition = (startParentId: string): cytoscape.Position | null => {
    const seen = new Set<string>();
    let pid: string | null = startParentId;
    while (pid !== null && !seen.has(pid)) {
      seen.add(pid);
      const present = cy.getElementById(pid);
      if (present.length > 0) {
        const { x, y } = present.position();
        return { x, y };
      }
      const pendingParent = addedById.get(pid);
      pid = pendingParent !== undefined ? dataParent(pendingParent) : null;
    }
    return null;
  };

  let unanchored = 0;
  const elements = toAdd.map((el) => {
    if (el.group !== 'nodes' || el.position !== undefined) {
      return el;
    }
    const parentId = dataParent(el);
    // A parentless newcomer has no anchor either — without the unanchored count
    // it would be cy.add-ed at (0,0) and stay there (no layout runs on a pure
    // data refresh), stacking with any other parentless newcomer.
    const anchor = parentId === null ? null : anchorPosition(parentId);
    if (anchor === null) {
      unanchored += 1;
      return el;
    }
    return { ...el, position: anchor };
  });

  return { elements, unanchored };
}
