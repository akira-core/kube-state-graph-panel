import { getBackendSrv } from '@grafana/runtime';
import { useEffect, useRef, useState } from 'react';

import type { DashboardParams } from '../assembleDashboardParams';
import { DETAIL_DASHBOARD_PATH } from '../detailPaths';
import { parseDashboardLinks, type DashboardLink } from '../parseDashboardLinks';

// 200-gated visibility: button renders only on 'ready'; 'loading'/'unavailable' render nothing.
export type DashboardLookup =
  | { status: 'loading' }
  | { status: 'ready'; urls: readonly DashboardLink[] }
  | { status: 'unavailable' };

const LOADING: DashboardLookup = { status: 'loading' };
const UNAVAILABLE: DashboardLookup = { status: 'unavailable' };

// Order-independent request key: an equal-value param map (fresh identity) must not refire the effect.
function serializeParams(base: string, params: DashboardParams): string {
  const body = Object.keys(params)
    .sort()
    .map((k) => {
      const v = params[k];
      // Fold string[] values (e.g. `ipaddress`) deterministically for the same reason.
      return `${k}=${Array.isArray(v) ? v.join(',') : (v ?? '')}`;
    })
    .join('&');
  return `${base}|${body}`;
}

/**
 * Eager per-node Dashboard URL prefetch. Mirrors useNodeDetailUrls' machinery (string-keyed
 * effect, ref'd live args, AbortController Set aborted on key change + unmount) but issues a
 * SINGLE request through the Grafana backend proxy (`getBackendSrv()`, never a direct fetch)
 * and carries no time. Absent `params`/`endpoint` idle the hook → 'unavailable'.
 */
export function useNodeDashboardUrl(params: DashboardParams | undefined, endpoint: string): DashboardLookup {
  const base = endpoint.trim().replace(/\/+$/, '');
  const enabled = params !== undefined && base !== '';
  const key = enabled && params !== undefined ? serializeParams(base, params) : '';

  const [result, setResult] = useState<{ key: string; value: DashboardLookup } | null>(null);

  // In-flight requests, aborted on key change (the keyed effect) and on unmount.
  const controllersRef = useRef<Set<AbortController>>(new Set());

  // Latest params/base read at fire time, so a same-key content refresh never re-runs the effect.
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
      .then((res): DashboardLink[] => {
        const urls = parseDashboardLinks(res);
        if (urls === undefined) {
          throw new Error('Not Found'); // malformed 200 / empty links → unavailable
        }
        return urls;
      })
      .then(
        (urls) => {
          if (!controller.signal.aborted) {
            setResult({ key: k, value: { status: 'ready', urls } });
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
  // Pre-effect/in-flight or a stale-key result reads 'loading' (no flash).
  return result !== null && result.key === key ? result.value : LOADING;
}
