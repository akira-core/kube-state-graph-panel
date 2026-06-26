import { getBackendSrv } from '@grafana/runtime';
import { useEffect, useMemo, useRef, useState } from 'react';

import { isPlainObject } from '../../../shared/guards/isPlainObject';
import { DETAIL_CODE_CHANGES_PATH, DETAIL_CONFIG_CHANGES_PATH } from '../detailPaths';

// Shared input of both detail-URL queries (D2). `time` is Unix SECONDS, not ms.
// kind/name resolved via resolveSelectedNode; undefined = nothing requested.
export interface NodeDetailQueryInput {
  application: string;
  kind: string;
  name: string;
  time: number;
}

// One successful Change Report lookup. Timestamps are raw RFC 3339 (UTC) strings;
// resultType is containers-only (config_changes never sets it). Extras are best-effort:
// key present ONLY for a non-empty backend string, else absent (exactOptionalPropertyTypes).
export interface ChangeReportDetail {
  url: string;
  currentTime?: string;
  previousTime?: string;
  resultType?: string;
}

// Rendered state per target: loading → ready (anchor + diff columns) | unavailable
// (muted "Not found"). Discriminated union, not optional url?/error?, so a 'ready'
// state cannot exist without a url under exactOptionalPropertyTypes.
export type DetailLookup =
  | { status: 'loading' }
  | { status: 'ready'; url: string; currentTime?: string; previousTime?: string; resultType?: string }
  | { status: 'unavailable'; error?: string };

const LOADING: DetailLookup = { status: 'loading' };
const UNAVAILABLE: DetailLookup = { status: 'unavailable' };

// Null-prototype: a container named `toString`/`constructor` must read back undefined,
// not an inherited Object.prototype member, so the not-found fallback stays honest.
const EMPTY_BY_NAME: Record<string, DetailLookup> = Object.create(null) as Record<string, DetailLookup>;

// Resolved per-target state the panel renders directly (eager prefetch, no click).
// enabled false ⇒ nothing requested or no endpoint ⇒ every target unavailable, no query.
export interface NodeDetailLookups {
  enabled: boolean;
  application: DetailLookup;
  // Container list comes from node.containers, not byName; so a name ABSENT from a
  // 'settled' byName means not-found, and 'loading' (whole-map in flight) is distinct
  // — a flat Record could not tell not-found apart from still-loading.
  containers: {
    phase: 'loading' | 'settled';
    byName: Record<string, DetailLookup>; // only 'ready' entries; null-proto
  };
}

// The no-lookup state: nothing requested / no endpoint. Every target renders "Not found".
export const IDLE_NODE_DETAIL_LOOKUPS: NodeDetailLookups = {
  enabled: false,
  application: UNAVAILABLE,
  containers: { phase: 'settled', byName: EMPTY_BY_NAME },
};

// Space-joined: K8s names and URLs are NUL/space-free, so the key is unambiguous.
function requestKeyFor(base: string, input: NodeDetailQueryInput): string {
  return [base, input.application, input.kind, input.name, String(input.time)].join(' ');
}

// Optional diff timestamps, best-effort: key kept ONLY for a non-empty string, else
// omitted (exactOptionalPropertyTypes — never `undefined`). Raw string unchanged.
function pickTimes(o: Record<string, unknown>): { currentTime?: string; previousTime?: string } {
  return {
    ...(typeof o.current_time === 'string' && o.current_time.length > 0 ? { currentTime: o.current_time } : {}),
    ...(typeof o.previous_time === 'string' && o.previous_time.length > 0 ? { previousTime: o.previous_time } : {}),
  };
}

// Optional code-change `result_type`, best-effort (mirrors pickTimes). Containers-only:
// parseApplicationUrl does NOT call this.
function pickResultType(o: Record<string, unknown>): { resultType?: string } {
  return typeof o.result_type === 'string' && o.result_type.length > 0 ? { resultType: o.result_type } : {};
}

// config_changes contract: `{ url, current_time?, previous_time? }`. `url` is the SOLE
// availability criterion — no url ⇒ undefined (unavailable); timestamps never gate it.
function parseApplicationUrl(res: unknown): ChangeReportDetail | undefined {
  if (isPlainObject(res) && typeof res.url === 'string' && res.url.length > 0) {
    return { url: res.url, ...pickTimes(res) };
  }
  return undefined;
}

// code_changes contract: `{ [container]: { url, current_time?, previous_time?,
// result_type? } }`, flattened to container → detail. Malformed entries (no valid url)
// are dropped (anti-corruption); a non-object payload ⇒ undefined (shape error).
function parseUrlByContainer(res: unknown): Record<string, ChangeReportDetail> | undefined {
  if (!isPlainObject(res)) {
    return undefined;
  }
  // Null prototype: a container named 'constructor' must read back undefined when
  // absent, else it resolves to the inherited Function and defeats the UI's hasOwn fallback.
  const flat: Record<string, ChangeReportDetail> = Object.create(null) as Record<string, ChangeReportDetail>;
  for (const [container, entry] of Object.entries(res)) {
    if (isPlainObject(entry) && typeof entry.url === 'string' && entry.url.length > 0) {
      flat[container] = { url: entry.url, ...pickTimes(entry), ...pickResultType(entry) };
    }
  }
  return flat;
}

// Best-effort message from a BackendSrv/FetchError rejection (data.message / statusText)
// without trusting its shape. Defaults to "Not Found", the common no-result case.
function errorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message.length > 0) {
    return reason.message;
  }
  if (isPlainObject(reason)) {
    const data = reason.data;
    if (isPlainObject(data) && typeof data.message === 'string' && data.message.length > 0) {
      return data.message;
    }
    if (typeof reason.statusText === 'string' && reason.statusText.length > 0) {
      return reason.statusText;
    }
  }
  return 'Not Found';
}

// Application target for the current key. A not-yet-resolved enabled key reads
// 'loading' (not 'unavailable') to avoid a "Not found" flash before setState lands.
function deriveApplication(
  appResult: { key: string; value: DetailLookup } | null,
  key: string,
  enabled: boolean
): DetailLookup {
  if (appResult !== null && appResult.key === key && enabled) {
    return appResult.value;
  }
  return enabled ? LOADING : UNAVAILABLE;
}

/**
 * Eager detail-URL prefetch for a right-clicked pod/controller: fires both queries in
 * parallel through the Grafana backend proxy (`getBackendSrv()` — the panel never
 * fetches external URLs directly) and exposes resolved URLs as per-target state.
 *
 * Effect is keyed on the request-key STRING, not the `input` object: a same-value data
 * refresh (new object identity) must NOT re-run it, else resolved anchors flash back to
 * loading — so it reads live input/base through a ref instead of listing them in deps.
 * In-flight requests abort on key change / unmount; handlers early-out on `aborted` so
 * an aborted pass never writes state. (React 18 StrictMode fires each twice in DEV only.)
 */
export function useNodeDetailUrls(input: NodeDetailQueryInput | undefined, endpoint: string): NodeDetailLookups {
  const base = endpoint.trim().replace(/\/+$/, '');
  const enabled = input !== undefined && base !== '';
  const key = enabled && input !== undefined ? requestKeyFor(base, input) : '';

  // Each tagged with its key so a node change reads back as fresh prefetch (no stale
  // frame). codeResult: map=null+!failed ⇒ loading; map set ⇒ settled-ready; failed ⇒
  // settled, no map (every row unavailable).
  const [appResult, setAppResult] = useState<{ key: string; value: DetailLookup } | null>(null);
  const [codeResult, setCodeResult] = useState<{
    key: string;
    map: Record<string, ChangeReportDetail> | null;
    failed: boolean;
  } | null>(null);

  // In-flight requests, aborted on key change / unmount. Same Set instance mutated
  // (never reassigned) so cleanup sees every controller from this key's lifetime.
  const controllersRef = useRef<Set<AbortController>>(new Set());

  // Live input/base read by the keyed effect at fire time (see hook doc — keeps a
  // same-key refresh from re-firing). Updated in a commit-every effect declared BEFORE
  // the fetch effect, so on a key change it refreshes first.
  const argsRef = useRef<{ input: NodeDetailQueryInput | undefined; base: string }>({ input, base });
  useEffect(() => {
    argsRef.current = { input, base };
  });

  useEffect(() => {
    const controllers = controllersRef.current;
    const cleanup = (): void => {
      for (const c of controllers) {
        c.abort();
      }
      controllers.clear();
    };
    if (key === '') {
      return cleanup; // disabled (key is '' iff !enabled / no input)
    }
    const { input: liveInput, base: liveBase } = argsRef.current;
    if (liveInput === undefined) {
      return cleanup; // unreachable when key !== '' — narrows the type
    }
    const k = key;

    // config_changes (application)
    const appController = new AbortController();
    controllers.add(appController);
    setAppResult({ key: k, value: LOADING });
    void getBackendSrv()
      .get<unknown>(`${liveBase}${DETAIL_CONFIG_CHANGES_PATH}`, liveInput, undefined, {
        abortSignal: appController.signal,
        showErrorAlert: false,
      })
      .then((res): ChangeReportDetail => {
        const parsed = parseApplicationUrl(res);
        if (parsed === undefined) {
          throw new Error('Not Found'); // malformed 200 → unavailable
        }
        return parsed;
      })
      .then(
        (parsed) => {
          if (!appController.signal.aborted) {
            setAppResult({ key: k, value: { status: 'ready', ...parsed } });
          }
        },
        (reason: unknown) => {
          if (!appController.signal.aborted) {
            setAppResult({ key: k, value: { status: 'unavailable', error: errorMessage(reason) } });
          }
        }
      )
      .finally(() => controllers.delete(appController));

    // code_changes (containers) — one call shared by every row
    const codeController = new AbortController();
    controllers.add(codeController);
    setCodeResult({ key: k, map: null, failed: false }); // null map + not-failed = loading
    void getBackendSrv()
      .get<unknown>(`${liveBase}${DETAIL_CODE_CHANGES_PATH}`, liveInput, undefined, {
        abortSignal: codeController.signal,
        showErrorAlert: false,
      })
      .then((res): Record<string, ChangeReportDetail> => {
        const map = parseUrlByContainer(res);
        if (map === undefined) {
          throw new Error('Not Found');
        }
        return map;
      })
      .then(
        (map) => {
          if (!codeController.signal.aborted) {
            setCodeResult({ key: k, map, failed: false });
          }
        },
        () => {
          if (!codeController.signal.aborted) {
            setCodeResult({ key: k, map: null, failed: true });
          }
        }
      )
      .finally(() => controllers.delete(codeController));

    return cleanup;
  }, [key]);

  const application = deriveApplication(appResult, key, enabled);

  // Container phase + per-name ready map (null-proto) for the current key. 'loading'
  // covers both pre-effect and in-flight so rows never flash "Not found".
  const containers = useMemo<NodeDetailLookups['containers']>(() => {
    if (codeResult === null || codeResult.key !== key || !enabled) {
      return { phase: enabled ? 'loading' : 'settled', byName: EMPTY_BY_NAME };
    }
    if (codeResult.map === null) {
      return { phase: codeResult.failed ? 'settled' : 'loading', byName: EMPTY_BY_NAME };
    }
    const byName: Record<string, DetailLookup> = Object.create(null) as Record<string, DetailLookup>;
    for (const [name, detail] of Object.entries(codeResult.map)) {
      byName[name] = { status: 'ready', ...detail };
    }
    return { phase: 'settled', byName };
  }, [codeResult, key, enabled]);

  return { enabled, application, containers };
}
