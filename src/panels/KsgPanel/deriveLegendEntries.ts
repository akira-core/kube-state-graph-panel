import type cytoscape from 'cytoscape';

import { isFilterableKind } from '../../features/element-filter';
import type { NodeLegendKindEntry } from '../../features/legend';
import type { NodeKind } from '../../shared/constants/types';

import { deriveLegendKindSets } from './deriveLegendKinds';

// Rows for the icon Node-kinds legend = the collapse-aware glyph kinds
// UNIONED with kinds present in the (mode-transformed) elements that the
// visibleKinds filter currently hides. The union is what keeps a hidden kind's
// row on screen: its nodes are gone from the canvas, so without it the
// eye-slash row would vanish with them and the kind could never be restored
// from the legend. Kinds the glyph derivation dropped for collapse/container
// reasons while still VISIBLE keep the existing swap semantics (e.g. pvc gives
// way to its collapsed storageclass) — only filtered-out kinds re-enter.
// Non-filterable kinds (see isFilterableKind) list as plain rows with no
// toggle. Both kind sets come from deriveLegendKindSets' single walk.
export function deriveLegendEntries(
  elements: readonly cytoscape.ElementDefinition[],
  collapsedIds: ReadonlySet<string>,
  visibleKinds: readonly NodeKind[]
): NodeLegendKindEntry[] {
  const visible = new Set<string>(visibleKinds);
  const { glyphKinds, presentKinds } = deriveLegendKindSets(elements, collapsedIds);
  const kinds = [...glyphKinds];
  const seen = new Set<string>(glyphKinds);
  for (const kind of presentKinds) {
    if (!seen.has(kind) && isFilterableKind(kind) && !visible.has(kind)) {
      seen.add(kind);
      kinds.push(kind);
    }
  }
  return kinds.map((kind) => {
    const togglable = isFilterableKind(kind);
    return { kind, togglable, hidden: togglable && !visible.has(kind) };
  });
}
