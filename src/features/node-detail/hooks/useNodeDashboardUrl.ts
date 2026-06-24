import { getBackendSrv } from '@grafana/runtime';
import { useEffect, useRef, useState } from 'react';

import type { DashboardParams } from '../assembleDashboardParams';
import { DETAIL_DASHBOARD_PATH } from '../detailPaths';

// Three rendered states of the per-node Dashboard URL lookup. Deliberately lighter
// than DetailLookup (no diff-timestamp / result-type extras a dashboard URL never
// has): the button renders ONLY on 'ready'; 'loading' and 'unavailable' both render
// nothing (no spinner, no error — 200-gated visibility).
export type DashboardLookup = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'unavailable' };

const LOADING: DashboardLookup = { status: 'loading' };
const UNAVAILABLE: DashboardLookup = { status: 'unavailable' };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// dashboard contract: `{ "url": string }`. A non-empty `url` is the SOLE availability
// criterion — anything else (non-object, missing/empty url) is a shape mismatch and
// resolves to unavailable (the button hides).
function parseDashboardUrl(res: unknown): string | undefined {
  if (isPlainObject(res) && typeof res.url === 'string' && res.url.length > 0) {
    return res.url;
  }
  return undefined;
}

// Stable request key independent of param insertion order, so a refresh that rebuilds
// an equal param map (different identity, same values) does not refire the effect.
function serializeParams(base: string, params: DashboardParams): string {
  const body = Object.keys(params)
    .sort()
    .map((k) => {
      const v = params[k];
      // Fold a string[] value (e.g. `ipaddress`) deterministically so an equal-value,
      // fresh-identity array does not refire the keyed effect.
      return `${k}=${Array.isArray(v) ? v.join(',') : (v ?? '')}`;
    })
    .join('&');
  return `${base}|${body}`;
}

/**
 * Eager per-node Dashboard URL prefetch. Mirrors useNodeDetailUrls' machinery — one
 * effect keyed on a request-key STRING, live args read through a ref so a same-value
 * re-render does not refire, AbortController registered in a ref'd Set and aborted on
 * key change + unmount — but issues a SINGLE request through the Grafana backend proxy
 * (`getBackendSrv()`; never a direct external fetch) and carries NO time (the trigger
 * is the panel OPENING, left- or right-click, not a right-click time capture).
 *
 * `params` is the assembled query map (undefined when the node is missing / not
 * dashboard-eligible) and `endpoint` the resolved detail base; either being absent
 * idles the hook (no request, state 'unavailable' → the button hides). On resolve the
 * state is 'ready' (200 + non-empty url → the button renders) or 'unavailable' (any
 * other outcome → hidden, no error surfaced).
 */
export function useNodeDashboardUrl(params: DashboardParams | undefined, endpoint: string): DashboardLookup {
  const base = endpoint.trim().replace(/\/+$/, '');
  const enabled = params !== undefined && base !== '';
  const key = enabled && params !== undefined ? serializeParams(base, params) : '';

  const [result, setResult] = useState<{ key: string; value: DashboardLookup } | null>(null);

  // In-flight requests, aborted on key change (the keyed effect) and on unmount.
  const controllersRef = useRef<Set<AbortController>>(new Set());

  // Latest params/base for the keyed effect to read at fire time, so a same-key
  // content refresh (new identity, same values) never re-runs the effect.
  const argsRef = useRef<{ params: DashboardParams | undefined; base: string }>({ params, base });
  useEffect(() => {
    argsRef.current = { params, base };
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
      return cleanup; // disabled (no params / no base)
    }
    const { params: liveParams, base: liveBase } = argsRef.current;
    if (liveParams === undefined) {
      return cleanup; // unreachable when key !== '' — narrows the type
    }
    const k = key;

    const controller = new AbortController();
    controllers.add(controller);
    setResult({ key: k, value: LOADING });
    void getBackendSrv()
      .get<unknown>(`${liveBase}${DETAIL_DASHBOARD_PATH}`, liveParams, undefined, {
        abortSignal: controller.signal,
        showErrorAlert: false,
      })
      .then((res): string => {
        const url = parseDashboardUrl(res);
        if (url === undefined) {
          throw new Error('Not Found'); // malformed 200 / empty url → unavailable
        }
        return url;
      })
      .then(
        (url) => {
          if (!controller.signal.aborted) {
            setResult({ key: k, value: { status: 'ready', url } });
          }
        },
        () => {
          if (!controller.signal.aborted) {
            setResult({ key: k, value: UNAVAILABLE });
          }
        }
      )
      .finally(() => controllers.delete(controller));

    return cleanup;
  }, [key]);

  if (!enabled) {
    return UNAVAILABLE; // disabled → hidden button, no request
  }
  // Pre-effect / in-flight for the current key reads 'loading' (no flash); a resolved
  // value for a stale key is ignored (reads back fresh on the new key).
  return result !== null && result.key === key ? result.value : LOADING;
}
