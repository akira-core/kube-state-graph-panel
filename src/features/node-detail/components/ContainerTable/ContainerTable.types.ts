import type { ContainerSpec } from '../../../../shared/types/containerSpec';
import type { ChangeReportState } from '../../hooks/useNodeDetailUrls';

export interface ContainerTableProps {
  // The node's containers (pod passthrough / controller aggregate) — one row each.
  containers: ContainerSpec[];
  // Per-container lazy Change Report state, keyed by container name. A missing key
  // reads as idle (noUncheckedIndexedAccess) — the button waits to be clicked.
  stateByContainer: Record<string, ChangeReportState>;
  // false when no endpoint is configured → every row's button renders disabled.
  enabled: boolean;
  // Click handler for a row: fires that container's image-detail lookup and opens
  // its report.
  onOpen: (container: string) => void;
}
