import React from 'react';

export function LoadingOverlay(): React.JSX.Element {
  return (
    <div data-testid="loading-overlay" role="status" aria-live="polite">
      Loading graph…
    </div>
  );
}
