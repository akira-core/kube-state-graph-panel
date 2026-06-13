import type { ChangeReportState } from '../../hooks/useNodeDetailUrls';

export interface ApplicationTableProps {
  // ArgoCD application name (pod passthrough / controller aggregate). One row
  // today; the row rendering is list-shaped so the table can grow to several.
  application: string;
  // Lazy Change Report state for the (single) application button: idle until
  // clicked, then loading → success opens a new tab (back to idle) / error.
  state: ChangeReportState;
  // false when no endpoint is configured → the button renders disabled (no lookup
  // can fire). See useNodeDetailUrls `enabled`.
  enabled: boolean;
  // Click handler: fires the application-detail lookup and opens the report.
  onOpen: () => void;
}
