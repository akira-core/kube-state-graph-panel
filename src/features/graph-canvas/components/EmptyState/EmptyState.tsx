import { EmptyState as GrafanaEmptyState } from '@grafana/ui';
import React from 'react';

export interface EmptyStateProps {
  message?: string;
}

export function EmptyState(props: Readonly<EmptyStateProps>): React.JSX.Element {
  const { message = 'No graph data' } = props;
  return (
    <div data-testid="empty-state">
      <GrafanaEmptyState variant="not-found" message={message} hideImage />
    </div>
  );
}
