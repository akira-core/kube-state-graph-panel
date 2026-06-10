import type { ContainerSpec } from '../../../../shared/types/containerSpec';

export interface ContainerTableProps {
  // The node's containers (pod passthrough / controller aggregate) — one row each.
  containers: ContainerSpec[];
  // container name → resolved external URL, flattened by useNodeDetailUrls.
  // undefined = no lookup ran (left-click selection / endpoint unset); a missing
  // key disables only that row's button (noUncheckedIndexedAccess).
  urlByContainer: Record<string, string> | undefined;
  loading: boolean; // lookup in flight → row buttons stay disabled behind an indicator
  error: string | undefined; // image-detail lookup failed; rows keep name/image
}
