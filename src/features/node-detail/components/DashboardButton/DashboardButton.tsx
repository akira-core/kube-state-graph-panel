import { LinkButton } from '@grafana/ui';
import React from 'react';

import type { DashboardButtonProps } from './DashboardButton.types';

// The per-node Dashboard URL button shown beside the node name in the detail panel
// header (both the alert and detail views). Strictly 200-gated: renders an
// `@grafana/ui` LinkButton (a real <a>, opening in a new tab) ONLY when the lookup is
// 'ready'; while loading or unavailable it renders nothing — no spinner, no error
// (the absence of a URL is simply an absent button). testid: node-detail-dashboard-button.
export function DashboardButton({ state }: Readonly<DashboardButtonProps>): React.JSX.Element | null {
  if (state.status !== 'ready') {
    return null;
  }
  return (
    <LinkButton
      href={state.url}
      target="_blank"
      rel="noopener noreferrer"
      icon="external-link-alt"
      size="sm"
      variant="secondary"
      fill="outline"
      tooltip="Open node dashboard"
      data-testid="node-detail-dashboard-button"
    >
      Dashboard
    </LinkButton>
  );
}
