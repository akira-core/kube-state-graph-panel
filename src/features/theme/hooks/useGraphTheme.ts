import { useTheme2 } from '@grafana/ui';
import { useMemo } from 'react';

import type { CyStylesheet } from '../../graph-canvas/hooks/useCytoscape';
import { getStylesheet } from '../../graph-canvas/styles/getStylesheet';

export function useGraphTheme(): CyStylesheet[] {
  const theme = useTheme2();
  return useMemo(() => getStylesheet({ theme }), [theme]);
}
