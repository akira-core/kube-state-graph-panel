import type { DataQueryRequest } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';

export interface ResolveDetailEndpointInput {
  // The panel's detailEndpoint option — a non-empty value overrides derivation.
  option: string;
  // The panel's query request (PanelData.request) — the derivation source.
  request: DataQueryRequest | undefined;
}

// The directory the graph query lives in — the shared prefix the detail
// endpoints sit beside. Reads the Infinity query target's `url` (the graph
// query path, e.g. `/api/v1/graph/service_graph?start=…`); `url` is not on
// @grafana/data's DataQuery type, so it is narrowed off `unknown`. Strips the
// query string, then drops the last path segment. '' when the target carries no
// usable url path (a single-segment or pathless url) — then the detail base
// stays the bare proxy mount, the pre-sibling behaviour.
function queryDir(target: unknown): string {
  if (typeof target !== 'object' || target === null) {
    return '';
  }
  const raw = (target as { url?: unknown }).url;
  if (typeof raw !== 'string' || raw === '') {
    return '';
  }
  // An absolute (`scheme://…`) or protocol-relative (`//host/…`) url has no
  // directory that can graft onto the proxy mount — its host is unreachable
  // through the datasource proxy. Fall back to the bare mount (the pre-sibling
  // behaviour) rather than glue a host mid-path.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || raw.startsWith('//')) {
    return '';
  }
  const queryStart = raw.indexOf('?');
  const path = queryStart === -1 ? raw : raw.slice(0, queryStart);
  const lastSlash = path.lastIndexOf('/');
  return lastSlash === -1 ? '' : path.slice(0, lastSlash);
}

/**
 * Resolve the base path of the node-detail URL lookups (design D7):
 *
 *   1. an explicitly configured panel option always wins — the escape hatch for
 *      a detail backend living elsewhere; it is used verbatim;
 *   2. otherwise the endpoint is DERIVED from the dashboard query itself so the
 *      detail endpoints resolve as SIBLINGS of the graph query: the first
 *      non-hidden target carrying a datasource ref resolves through Grafana
 *      runtime to its datasource's proxied base path — for `access: proxy`
 *      datasources the instance settings `url` IS `/api/datasources/proxy/uid/
 *      <uid>` (path-less; the datasource's real base url is opaque) — and the
 *      graph query's own directory is appended to it (`queryDir`). So a graph
 *      query at `.../api/v1/graph/service_graph` yields a detail base of
 *      `<proxy mount>/api/v1/graph`, and useNodeDetailUrls appends
 *      `/config_changes` + `/code_changes` as siblings. The directory is read
 *      from that same first datasource-resolving target — this panel issues a
 *      single graph query, so it IS the graph query. A hidden target, or a ref
 *      that resolves to no usable url (e.g. a Grafana expression's `__expr__`),
 *      is skipped, not a dead end;
 *   3. neither resolvable → '' (useNodeDetailUrls idles: buttons disabled, no
 *      query is ever issued).
 *
 * The derivation only works when the datasource record carries a non-empty
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
      return url + queryDir(target);
    }
  }
  return '';
}
