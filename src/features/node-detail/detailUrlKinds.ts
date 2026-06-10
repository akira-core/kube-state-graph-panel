import type { NodeKind } from '../../shared/constants/types';

// The kinds whose node-detail panel carries the Application / Containers sections
// and whose right-click fires the detail-URL queries: pod + the five workload
// controllers. Pinned by the panel-rendering spec — every OTHER kind never renders
// the sections nor queries, even if it happens to carry application/containers data.
export const DETAIL_URL_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>([
  'pod',
  'deployment',
  'statefulset',
  'daemonset',
  'job',
  'cronjob',
]);
