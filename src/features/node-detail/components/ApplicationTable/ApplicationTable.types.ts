export interface ApplicationTableProps {
  // ArgoCD application name (pod passthrough / controller aggregate). One row
  // today; the row rendering is list-shaped so the table can grow to several.
  application: string;
  // Resolved Argo app detail URL from the application-detail lookup. undefined =
  // no lookup ran (left-click / endpoint unset) or it failed → button disabled.
  url: string | undefined;
  loading: boolean; // lookup in flight → button stays disabled behind an indicator
  error: string | undefined; // application-detail lookup failed; the name still renders
}
