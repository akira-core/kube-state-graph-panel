import type cytoscape from 'cytoscape';
import { useEffect, useMemo } from 'react';

import { extractPodNames } from './extractPodNames';
import { writeDashboardVariable } from './writeDashboardVariable';

/**
 * Export the graph's pod names into the dashboard variable named by the panel
 * option, every time the (normalized, pre-view-transform) elements change.
 *
 * `enabled` is the error/first-load gate: a failed query or a not-yet-loaded
 * panel must NOT be written out as "no pods" — only a successfully loaded
 * graph speaks for the variable (an actually empty one writes the $__empty
 * sentinel via writeDashboardVariable). An empty/whitespace variable name
 * disables the feature entirely; the variable itself must already exist on
 * the dashboard (panels cannot create variables).
 */
export function useVariableExport(
  elements: readonly cytoscape.ElementDefinition[],
  variableName: string,
  enabled: boolean
): void {
  const podNames = useMemo(() => extractPodNames(elements), [elements]);
  const name = variableName.trim();
  useEffect(() => {
    if (!enabled || name === '') {
      return;
    }
    writeDashboardVariable(name, podNames);
  }, [enabled, name, podNames]);
}
