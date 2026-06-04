// Pure data shapes for switch-fabric tiering. The switch-topology feature derives
// a network tier per `switch` node from graph structure and turns it into native
// fcose layout constraints (see computeSwitchTiers / buildSwitchConstraints).

export interface SwitchTierResult {
  // tier (>= 0) per switch node id. Empty when the graph has no switch nodes.
  tierById: Map<string, number>;
  // Highest tier present, or -1 when there are no switch nodes.
  maxTier: number;
}

// fcose `alignmentConstraint` subset we use: each inner array is one tier of
// switch ids aligned onto a common horizontal row.
export interface SwitchAlignmentConstraint {
  horizontal: string[][];
}

// fcose `relativePlacementConstraint` entry: keep `top` above `bottom` by >= gap.
export interface SwitchRelativePlacement {
  top: string;
  bottom: string;
  gap: number;
}

// The fcose-constraint bundle merged into the layout options. Either field may be
// absent (e.g. a single aligned row has no relative placement; a pure chain has
// no multi-member alignment group).
export interface SwitchConstraints {
  alignmentConstraint?: SwitchAlignmentConstraint;
  relativePlacementConstraint?: SwitchRelativePlacement[];
}
