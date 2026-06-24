import { locationService } from '@grafana/runtime';

// The explicit "no value" sentinel (Volkov Labs convention). An empty pod list
// must clear the variable — deleting the var- key instead would only unpin the
// URL and leave the variable's previous pod list active for its consumers.
export const EMPTY_VALUE_SENTINEL = '$__empty';

/**
 * Write a value list into an EXISTING dashboard variable through Grafana's
 * var-<name> URL sync — the only supported panel→variable write path (panels
 * cannot create variables or inject options; getTemplateSrv is read-only).
 * The array form serializes to repeated params (var-x=a&var-x=b), Grafana's
 * documented multi-value contract, so consumers compose freely via format
 * specifiers (${pod_list:lucene}, :pipe, …).
 *
 * Guards: an order-insensitive equality check against the current URL value
 * skips redundant writes (re-render / refresh loops), and `replace: true`
 * keeps dashboard refresh ticks out of the browser history stack.
 *
 * This module is the feature's single @grafana/runtime touchpoint.
 */
export function writeDashboardVariable(name: string, values: readonly string[]): void {
  const next: readonly string[] = values.length === 0 ? [EMPTY_VALUE_SENTINEL] : values;
  const key = `var-${name}`;
  if (sameValueSet(locationService.getSearch().getAll(key), next)) {
    return;
  }
  locationService.partial({ [key]: next }, true);
}

function sameValueSet(a: readonly string[], b: readonly string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) {
    return false;
  }
  for (const value of setA) {
    if (!setB.has(value)) {
      return false;
    }
  }
  return true;
}
