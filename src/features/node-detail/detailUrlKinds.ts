import { CATEGORY_BY_KIND } from '../../shared/constants/categoryByKind';
import type { NodeKind } from '../../shared/constants/types';

// The kinds whose node-detail panel carries the Application / Containers sections
// and whose right-click fires the detail-URL queries — exactly the Workloads
// category (pod + the five workload controllers). Derived from the single-source
// CATEGORY_BY_KIND (a compiler-exhaustive Record<NodeKind, …>) instead of a
// hand-maintained parallel list, so a future workload kind cannot silently miss
// this gate. The panel-rendering spec pins the same membership.
export const DETAIL_URL_KINDS: ReadonlySet<NodeKind> = new Set(
  (Object.keys(CATEGORY_BY_KIND) as NodeKind[]).filter((kind) => CATEGORY_BY_KIND[kind] === 'Workloads')
);
