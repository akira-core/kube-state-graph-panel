import type { DashboardLookup } from '../../hooks/useNodeDashboardUrl';

export interface DashboardButtonProps {
  // The eager-prefetched Dashboard URL lookup. The button renders ONLY when this is
  // 'ready' (200 + non-empty url); 'loading' / 'unavailable' render nothing.
  state: DashboardLookup;
}
