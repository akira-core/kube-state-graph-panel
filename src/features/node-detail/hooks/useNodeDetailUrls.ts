import { getBackendSrv } from '@grafana/runtime';
import { useEffect, useMemo, useRef, useState } from 'react';

import { DETAIL_CODE_CHANGES_PATH, DETAIL_CONFIG_CHANGES_PATH } from '../detailPaths';

// The shared input of BOTH detail-URL queries (design D2): the ArgoCD application
// plus the pod-controller identity and the right-click time (Unix SECONDS). A pod
// resolves kind/name from its owner, a controller from itself, a standalone pod
// from its own kind/name (resolveSelectedNode). undefined = nothing requested.
export interface NodeDetailQueryInput {
  application: string;
  kind: string;
  name: string;
  time: number;
}

// Three rendered states per Change Report target. Eager prefetch starts each at
// 'loading'; on resolve it becomes 'ready' (URL pre-resolved → the table renders a
// real <a href> anchor) or 'unavailable' (failure / not-found / no-url → a muted
// "No change report" hint, full error message in title). A discriminated union (not
// one interface with optional url?/error?) so exactOptionalPropertyTypes cannot
// admit a 'ready' state without a url.
export type DetailLookup =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'unavailable'; error?: string };

const LOADING: DetailLookup = { status: 'loading' };
const UNAVAILABLE: DetailLookup = { status: 'unavailable' };

// The resolved per-target lookup state the detail panel renders directly (eager
// prefetch — there are no click triggers). `enabled` is false when nothing is
// requested (no right-click input) or no endpoint is configured: every target then
// reads 'unavailable' (the muted hint), no spinner, no anchor, and the hook fires
// no query.
export interface NodeDetailLookups {
  enabled: boolean;
  application: DetailLookup;
  // The shared code_changes phase + the per-name resolved map. `phase: 'loading'` =
  // the whole-map request is in flight (every row shows a spinner). When 'settled',
  // a name PRESENT in byName is ready (anchor) and a name ABSENT is unavailable (the
  // container exists in node.containers but the backend returned no URL for it). The
  // container LIST comes from node.containers, not this map — so byName-missing is
  // the not-found rule, which a flat Record could not distinguish from "still loading".
  containers: {
    phase: 'loading' | 'settled';
    byName: Record<string, DetailLookup>; // only 'ready' entries
  };
}

// The no-lookup controller: nothing requested / no endpoint. Tables render every
// target as the muted "No change report" hint off it (no spinner, no anchor).
export const IDLE_NODE_DETAIL_LOOKUPS: NodeDetailLookups = {
  enabled: false,
  application: UNAVAILABLE,
  containers: { phase: 'settled', byName: {} },
};

// K8s names and URLs are NUL-free, so the joined form is unambiguous.
function requestKeyFor(base: string, input: NodeDetailQueryInput): string {
  return [base, input.application, input.kind, input.name, String(input.time)].join(' ');
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// application-detail (`config_changes`) contract: `{ "url": string }`. undefined =
// shape mismatch (surfaced as that side's unavailable).
function parseApplicationUrl(res: unknown): string | undefined {
  if (isPlainObject(res) && typeof res.url === 'string' && res.url.length > 0) {
    return res.url;
  }
  return undefined;
}

// image-detail (`code_changes`) contract: `{ [container]: { "url": string } }` —
// flattened here so the UI only ever sees container → URL. Malformed entries are
// dropped (anti-corruption); a non-object payload is a shape error (undefined).
function parseUrlByContainer(res: unknown): Record<string, string> | undefined {
  if (!isPlainObject(res)) {
    return undefined;
  }
  // Null prototype: container names are arbitrary backend strings, and a name like
  // 'constructor' must read back undefined when absent — on a prototype-ful object
  // it would resolve to the inherited Function and defeat the UI's ?? fallback.
  const flat: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [container, entry] of Object.entries(res)) {
    if (isPlainObject(entry) && typeof entry.url === 'string' && entry.url.length > 0) {
      flat[container] = entry.url;
    }
  }
  return flat;
}

// Best-effort human message from a BackendSrv rejection (FetchError carries
// data.message / statusText) without trusting its shape. Defaults to "Not Found"
// (a non-200 / no-result lookup is the common case the UI surfaces in title).
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

// The application target for the current key: its resolved value, or 'loading'
// while the prefetch is pending (enabled), or 'unavailable' when disabled. Showing
// 'loading' rather than 'unavailable' for a not-yet-resolved enabled key avoids a
// "No change report" flash on the frame before the effect's setState lands.
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
 * Eager detail-URL prefetch for a right-clicked pod/controller. The right-click
 * builds the query input; as soon as it (and an endpoint) is available the hook
 * IMMEDIATELY fires BOTH queries in parallel through the Grafana backend proxy
 * (`getBackendSrv()` — the panel never fetches external URLs directly). No click is
 * needed: the resolved URL is exposed as per-target state so the tables render a
 * real `<a href target="_blank" rel="noopener noreferrer">` anchor on success, a
 * spinner while loading, and a muted "No change report" hint on failure / no-url.
 *
 * Each endpoint fires AT MOST ONCE per open node: the `config_changes` /
 * `code_changes` responses are cached by request key (the code_changes map is the
 * whole container→URL set, shared by every row). Only successes cache; a failure
 * clears its slot so a remount refetches. State (and the caches) are keyed by the
 * request context: the derived getters read back idle/loading for any key but the
 * current one, so changing the selected node resets every target with no stale
 * frame. The caches and any in-flight request clear/abort on node/endpoint change
 * and on unmount (panel close); an aborted pass never writes state.
 */
export function useNodeDetailUrls(input: NodeDetailQueryInput | undefined, endpoint: string): NodeDetailLookups {
  const base = endpoint.trim().replace(/\/+$/, '');
  const enabled = input !== undefined && base !== '';
  const key = enabled && input !== undefined ? requestKeyFor(base, input) : '';

  // Application target state, and the resolved container→URL map, each tagged with
  // the key they belong to so a node change reads back as fresh prefetch (no stale
  // frame). codeResult: map=null + failed=false ⇒ loading; map set ⇒ settled-ready;
  // failed ⇒ settled with no map (every row reads unavailable).
  const [appResult, setAppResult] = useState<{ key: string; value: DetailLookup } | null>(null);
  const [codeResult, setCodeResult] = useState<{
    key: string;
    map: Record<string, string> | null;
    failed: boolean;
  } | null>(null);

  // In-flight requests, aborted on node/endpoint change (the keyed effect) and on
  // unmount. The same Set instance is mutated (never reassigned), so the cleanup
  // sees every controller registered during this key's lifetime.
  const controllersRef = useRef<Set<AbortController>>(new Set());
  // Per-node response cache so each endpoint fires AT MOST ONCE while the panel
  // stays open: the effect stores the in-flight/resolved promise, and a re-run for
  // the same key reuses it — no new call. Only SUCCESSES are cached; a failure
  // clears its slot so a remount refetches. Both clear on key change + unmount, below.
  const appCacheRef = useRef<{ key: string; promise: Promise<string> } | null>(null);
  const codeCacheRef = useRef<{ key: string; promise: Promise<Record<string, string>> } | null>(null);

  useEffect(() => {
    const controllers = controllersRef.current;
    // Cleanup aborts every in-flight controller and clears both caches — on key
    // change AND on unmount (panel close). The resolve/reject handlers below early-
    // out on `controller.signal.aborted`, so an aborted pass never setState (no
    // stale write, no setState-after-unmount). React 18 StrictMode double-mounts in
    // dev (mount→cleanup→mount) so each endpoint may fire twice in DEV; production
    // and the non-StrictMode test renderer fetch once. We do NOT weaken the abort/
    // clear-on-close correctness (a spec requirement) to suppress the dev double-fetch.
    const cleanup = (): void => {
      for (const c of controllers) {
        c.abort();
      }
      controllers.clear();
      appCacheRef.current = null;
      codeCacheRef.current = null;
    };
    if (!enabled || input === undefined) {
      return cleanup;
    }
    const k = key;

    // --- config_changes (application) — at most once per key (success cached) ---
    if (appCacheRef.current === null || appCacheRef.current.key !== k) {
      setAppResult({ key: k, value: LOADING });
      const controller = new AbortController();
      controllers.add(controller);
      const options = { abortSignal: controller.signal, showErrorAlert: false };
      const promise = getBackendSrv()
        .get<unknown>(`${base}${DETAIL_CONFIG_CHANGES_PATH}`, input, undefined, options)
        .then((res): string => {
          const url = parseApplicationUrl(res);
          if (url === undefined) {
            throw new Error('Not Found'); // malformed 200 → reject (uncached, retryable)
          }
          return url;
        })
        .finally(() => controllers.delete(controller));
      const created = { key: k, promise };
      appCacheRef.current = created;
      promise.catch(() => {
        if (appCacheRef.current === created) {
          appCacheRef.current = null; // don't cache failures — a remount refetches
        }
      });
      void promise.then(
        (url) => {
          if (controller.signal.aborted) {
            return;
          }
          setAppResult({ key: k, value: { status: 'ready', url } });
        },
        (reason: unknown) => {
          if (controller.signal.aborted) {
            return;
          }
          setAppResult({ key: k, value: { status: 'unavailable', error: errorMessage(reason) } });
        }
      );
    }

    // --- code_changes (containers) — at most once per key (success cached) ---
    if (codeCacheRef.current === null || codeCacheRef.current.key !== k) {
      setCodeResult({ key: k, map: null, failed: false }); // null map + not-failed = loading
      const controller = new AbortController();
      controllers.add(controller);
      const options = { abortSignal: controller.signal, showErrorAlert: false };
      const promise = getBackendSrv()
        .get<unknown>(`${base}${DETAIL_CODE_CHANGES_PATH}`, input, undefined, options)
        .then((res): Record<string, string> => {
          const map = parseUrlByContainer(res);
          if (map === undefined) {
            throw new Error('Not Found'); // malformed 200 → reject (uncached, retryable)
          }
          return map;
        })
        .finally(() => controllers.delete(controller));
      const created = { key: k, promise };
      codeCacheRef.current = created;
      promise.catch(() => {
        if (codeCacheRef.current === created) {
          codeCacheRef.current = null;
        }
      });
      void promise.then(
        (map) => {
          if (controller.signal.aborted) {
            return;
          }
          setCodeResult({ key: k, map, failed: false });
        },
        () => {
          if (controller.signal.aborted) {
            return;
          }
          setCodeResult({ key: k, map: null, failed: true });
        }
      );
    }
    return cleanup;
  }, [key, enabled, base, input]);

  const application = deriveApplication(appResult, key, enabled);

  // Container phase + per-name ready map for the current key. byName holds only
  // resolved URLs; a settled map missing a name ⇒ that row is unavailable (the
  // ?? fallback in the table). 'loading' covers both pre-effect (enabled, no result
  // yet) and the in-flight map, so rows never flash "No change report" mid-fetch.
  const containers = useMemo<NodeDetailLookups['containers']>(() => {
    const empty: NodeDetailLookups['containers'] = { phase: 'settled', byName: {} };
    if (codeResult === null || codeResult.key !== key || !enabled) {
      return enabled ? { phase: 'loading', byName: {} } : empty;
    }
    if (codeResult.map === null) {
      return codeResult.failed ? empty : { phase: 'loading', byName: {} };
    }
    const byName: Record<string, DetailLookup> = Object.create(null) as Record<string, DetailLookup>;
    for (const [name, url] of Object.entries(codeResult.map)) {
      byName[name] = { status: 'ready', url };
    }
    return { phase: 'settled', byName };
  }, [codeResult, key, enabled]);

  return { enabled, application, containers };
}
