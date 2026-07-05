import { useEffect } from 'react';

import { writeDashboardVariable } from './writeDashboardVariable';

// JSON.stringify is a collision-free content fingerprint for a string list —
// every value is delimited and escaped, so no crafted names (spaces, NULs,
// quotes) can alias two different lists, and [] vs [''] stay distinct. Values
// here are tiny (pod names / alertnames), so the cost is negligible.
function fingerprint(values: readonly string[]): string {
  return JSON.stringify(values);
}

/**
 * Export an arbitrary name list into the dashboard variable named by the
 * panel option, every time `values` changes by content.
 *
 * The feature's single write-gating primitive (alert-variable-exports design
 * D3): `useNodeClickExport` drives its two click-driven variables through it,
 * and KsgPanel drives the two data-driven alert lists through it — extraction
 * stays the caller's job (e.g. `extractAlertPodNames`, `extractAlertNames`).
 *
 * `enabled` is the error/first-load gate and MUST be kept: it carries data
 * state the hook cannot know on its own (`hasPayload && seriesError ===
 * undefined && !isFatalNormalizeError` in KsgPanel). A failed query or a
 * not-yet-loaded panel must NOT be written out as "empty" — only a
 * successfully loaded graph speaks for the variable (an actually empty list,
 * once loaded, still writes the `$__empty` sentinel via
 * writeDashboardVariable). An empty/whitespace variable name disables the
 * export entirely; the variable itself must already exist on the dashboard
 * (panels cannot create variables).
 */
export function useListVariableExport(
  values: readonly string[],
  variableName: string,
  enabled: boolean
): void {
  const name = variableName.trim();
  const valuesKey = fingerprint(values);
  useEffect(() => {
    if (!enabled || name === '') {
      return;
    }
    writeDashboardVariable(name, values);
    // valuesKey fingerprints values (by content); keying the effect on it
    // instead of the values reference avoids refiring on a same-content
    // re-render when a caller hands in a fresh-but-equal array each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, name, valuesKey]);
}
