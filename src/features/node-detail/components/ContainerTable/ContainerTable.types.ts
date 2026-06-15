import type { ContainerSpec } from '../../../../shared/types/containerSpec';
import type { NodeDetailLookups } from '../../hooks/useNodeDetailUrls';

export interface ContainerTableProps {
  // The node's containers (pod passthrough / controller aggregate) — one row each.
  containers: ContainerSpec[];
  // Eager-prefetched Change Report state for the containers: the shared code_changes
  // phase + the per-name resolved map. phase 'loading' → every row shows a spinner;
  // 'settled' → a name in byName is ready (a real <a href> anchor) and a name ABSENT
  // is unavailable (muted "No change report"). The container LIST is `containers`
  // above, not byName. See useNodeDetailUrls.
  lookups: NodeDetailLookups['containers'];
}
