import type { DataQueryRequest } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';

export interface ResolveDetailEndpointInput {
  // The panel's detailEndpoint option — a non-empty value overrides derivation.
  option: string;
  // The panel's query request (PanelData.request) — the derivation source.
  request: DataQueryRequest | undefined;
}

/**
 * Resolve the base path of the node-detail URL lookups (design D7):
 *
 *   1. an explicitly configured panel option always wins — the escape hatch for
 *      a datasource without a `url`, or a detail backend living elsewhere;
 *   2. otherwise the endpoint is DERIVED from the dashboard query itself: the
 *      non-hidden targets carrying a datasource ref resolve in order through
 *      Grafana runtime to their datasource's proxied base path — for
 *      `access: proxy` datasources the instance settings `url` IS
 *      `/api/datasources/proxy/uid/<uid>` — and the first non-empty path wins
 *      (a hidden target, or a ref that resolves to no usable url, e.g. a
 *      Grafana expression's `__expr__`, is skipped, not a dead end);
 *   3. neither resolvable → '' (useNodeDetailUrls idles: buttons disabled, no
 *      query is ever issued).
 *
 * The derived path only works when the datasource record carries a non-empty
 * `url` (the demo provisions one). A url-less datasource 502s at query time and
 * surfaces as the sections' error states — the client cannot pre-check it,
 * because the instance settings `url` is always rewritten to the proxy path.
 */
export function resolveDetailEndpoint({ option, request }: Readonly<ResolveDetailEndpointInput>): string {
  const explicit = option.trim();
  if (explicit !== '') {
    return explicit;
  }
  // Touch getDataSourceSrv() only once a ref is in hand: option-only callers
  // (and request-less test fixtures) never need the runtime service to exist.
  for (const target of request?.targets ?? []) {
    const ref = target.datasource;
    if (target.hide === true || ref === undefined || ref === null) {
      continue;
    }
    const url = getDataSourceSrv().getInstanceSettings(ref)?.url;
    if (typeof url === 'string' && url !== '') {
      return url;
    }
  }
  return '';
}
