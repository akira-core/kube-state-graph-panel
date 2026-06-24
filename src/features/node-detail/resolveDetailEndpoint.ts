import type { DataQueryRequest } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';

export interface ResolveDetailEndpointInput {
  // non-empty value overrides derivation
  option: string;
  // PanelData.request — the derivation source
  request: DataQueryRequest | undefined;
}

// Directory the graph query lives in — shared prefix the detail endpoints sit
// beside. `url` is not on @grafana/data's DataQuery type, so it is narrowed off
// `unknown`. '' (bare proxy mount, pre-sibling behaviour) when no usable path.
function queryDir(target: unknown): string {
  if (typeof target !== 'object' || target === null) {
    return '';
  }
  const raw = (target as { url?: unknown }).url;
  if (typeof raw !== 'string' || raw === '') {
    return '';
  }
  // Absolute (`scheme://…`) / protocol-relative (`//host/…`) urls are
  // unreachable through the datasource proxy — fall back to bare mount.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || raw.startsWith('//')) {
    return '';
  }
  const queryStart = raw.indexOf('?');
  const path = queryStart === -1 ? raw : raw.slice(0, queryStart);
  const lastSlash = path.lastIndexOf('/');
  return lastSlash === -1 ? '' : path.slice(0, lastSlash);
}

/**
 * Base path for node-detail URL lookups (design D7). Explicit option wins
 * verbatim; else DERIVED so detail endpoints resolve as SIBLINGS of the graph
 * query: first non-hidden datasource-ref target → proxied base path + queryDir.
 * For `access: proxy` datasources instance settings `url` is the opaque path-
 * less proxy mount (`/api/datasources/proxy/uid/<uid>`), so a url-less
 * datasource cannot be pre-checked (it 502s at query time). '' → idle.
 */
export function resolveDetailEndpoint({ option, request }: Readonly<ResolveDetailEndpointInput>): string {
  const explicit = option.trim();
  if (explicit !== '') {
    return explicit;
  }
  // Touch getDataSourceSrv() only once a ref is in hand — option-only/request-
  // less callers never need the runtime service to exist.
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
