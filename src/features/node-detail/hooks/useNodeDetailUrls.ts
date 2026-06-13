import { getBackendSrv } from '@grafana/runtime';
import { useCallback, useEffect, useRef, useState } from 'react';

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

// Per-button lookup state. Each Change Report button is **lazy**: idle until the
// user clicks it. A click goes loading; on HTTP 200 + valid URL the report opens
// in a new tab and the button returns to idle (re-clickable); a non-200 / malformed
// response / missing-URL leaves an error beside the button (retryable). There is no
// resting "success" state — success is a side effect (window.open), not rendered.
export interface ChangeReportState {
  status: 'idle' | 'loading' | 'error';
  error?: string;
}

const IDLE: ChangeReportState = { status: 'idle' };

// The imperative controller the detail panel renders against: per-target state plus
// the click triggers. `enabled` is false when nothing is requested (no right-click)
// or no endpoint is configured — buttons render disabled and the triggers no-op
// (spec「未設定 endpoint 時停用」).
export interface NodeDetailLookups {
  enabled: boolean;
  application: ChangeReportState;
  containers: Record<string, ChangeReportState>; // by container name; missing key = idle
  openApplicationReport: () => void;
  openContainerReport: (container: string) => void;
}

// The no-lookup controller: nothing requested / no endpoint. Buttons render disabled
// off it and the triggers are no-ops.
export const IDLE_NODE_DETAIL_LOOKUPS: NodeDetailLookups = {
  enabled: false,
  application: IDLE,
  containers: {},
  openApplicationReport: () => undefined,
  openContainerReport: () => undefined,
};

// K8s names and URLs are NUL-free, so the joined form is unambiguous.
function requestKeyFor(base: string, input: NodeDetailQueryInput): string {
  return [base, input.application, input.kind, input.name, String(input.time)].join(' ');
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// application-detail (`config_changes`) contract: `{ "url": string }`. undefined =
// shape mismatch (surfaced as that side's error).
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
  // it would resolve to the inherited Function and defeat the UI's !== undefined guard.
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
// (a non-200 / no-result lookup is the common case the UI surfaces).
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

type ContainerResult = { key: string; states: Record<string, ChangeReportState> } | null;

// Merge one container's next state into the per-node container result; a key change
// (new node) starts a fresh map so a previous node's rows never leak through.
function mergeContainer(
  prev: ContainerResult,
  key: string,
  container: string,
  state: ChangeReportState
): { key: string; states: Record<string, ChangeReportState> } {
  const base = prev !== null && prev.key === key ? prev.states : {};
  return { key, states: { ...base, [container]: state } };
}

/**
 * Lazy detail-URL lookups for a right-clicked pod/controller. The right-click only
 * builds the query input; NOTHING is fetched until the user clicks a Change Report
 * button. `openApplicationReport()` / `openContainerReport(name)` fire their query
 * through the Grafana backend proxy (`getBackendSrv()` — the panel never fetches
 * external URLs directly); on HTTP 200 + valid URL they open the report in a new
 * tab (`window.open(..., '_blank', 'noopener,noreferrer')`); otherwise they leave a
 * retryable error on that target.
 *
 * Each endpoint fires AT MOST ONCE per open node: the `code_changes` response is the
 * whole container→URL map, so every container row shares one cached call (later
 * clicks reuse the resolved promise — no new request), and `config_changes` is cached
 * the same way. Only successes cache; a failure clears its slot so a retry refetches.
 *
 * State (and the caches) are keyed by the request context: the derived getters return
 * idle for any key but the current one, so changing the selected node resets every
 * button with no stale render frame. The caches and any in-flight request clear/abort
 * on node/endpoint change and on unmount (panel close); an aborted pass never writes
 * state.
 */
export function useNodeDetailUrls(input: NodeDetailQueryInput | undefined, endpoint: string): NodeDetailLookups {
  const base = endpoint.trim().replace(/\/+$/, '');
  const enabled = input !== undefined && base !== '';
  const key = enabled && input !== undefined ? requestKeyFor(base, input) : '';

  const [appResult, setAppResult] = useState<{ key: string; state: ChangeReportState } | null>(null);
  const [containerResult, setContainerResult] = useState<ContainerResult>(null);

  // Latest request context for the (stable) triggers to read at click time. Synced
  // in an effect (not written during render) so the click handlers always see the
  // current node without touching the ref mid-render (react-hooks/refs).
  const ctxRef = useRef<{ input: NodeDetailQueryInput | undefined; base: string; enabled: boolean; key: string }>({
    input,
    base,
    enabled,
    key,
  });
  useEffect(() => {
    ctxRef.current = { input, base, enabled, key };
  });

  // In-flight requests, aborted on node/endpoint change (the [key] effect) and on
  // unmount. The same Set instance is mutated (never reassigned), so the cleanup
  // sees every controller registered during this key's lifetime.
  const controllersRef = useRef<Set<AbortController>>(new Set());
  // Per-node response cache so each endpoint fires AT MOST ONCE while the panel
  // stays open: the first click stores the in-flight/resolved promise, later clicks
  // (any container shares the one `code_changes` map) reuse it — no new call. Only
  // SUCCESSES are cached; a failure clears its slot so a later click retries. Both
  // slots clear on node/endpoint change + unmount (panel close), below.
  const appCacheRef = useRef<{ key: string; promise: Promise<string> } | null>(null);
  const codeCacheRef = useRef<{ key: string; promise: Promise<Record<string, string>> } | null>(null);
  useEffect(() => {
    const controllers = controllersRef.current;
    return (): void => {
      for (const controller of controllers) {
        controller.abort();
      }
      controllers.clear();
      appCacheRef.current = null;
      codeCacheRef.current = null;
    };
  }, [key]);

  const openApplicationReport = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx.enabled || ctx.input === undefined) {
      return;
    }
    const k = ctx.key;
    setAppResult({ key: k, state: { status: 'loading' } });
    let entry = appCacheRef.current;
    if (entry === null || entry.key !== k) {
      const controller = new AbortController();
      controllersRef.current.add(controller);
      const options = { abortSignal: controller.signal, showErrorAlert: false };
      const promise = getBackendSrv()
        .get<unknown>(`${ctx.base}/api/v1/config_changes`, ctx.input, undefined, options)
        .then((res): string => {
          const url = parseApplicationUrl(res);
          if (url === undefined) {
            throw new Error('Not Found'); // malformed 200 → reject (uncached, retryable)
          }
          return url;
        })
        .finally(() => controllersRef.current.delete(controller));
      entry = { key: k, promise };
      appCacheRef.current = entry;
      const created = entry;
      promise.catch(() => {
        if (appCacheRef.current === created) {
          appCacheRef.current = null; // don't cache failures — allow retry
        }
      });
    }
    void entry.promise.then(
      (url) => {
        if (ctxRef.current.key !== k) {
          return; // node changed while awaiting — never write stale state
        }
        const opened = window.open(url, '_blank', 'noopener,noreferrer');
        setAppResult({ key: k, state: opened === null ? { status: 'error', error: 'Pop-up blocked' } : IDLE });
      },
      (reason: unknown) => {
        if (ctxRef.current.key === k) {
          setAppResult({ key: k, state: { status: 'error', error: errorMessage(reason) } });
        }
      }
    );
  }, []);

  const openContainerReport = useCallback((container: string) => {
    const ctx = ctxRef.current;
    if (!ctx.enabled || ctx.input === undefined) {
      return;
    }
    const k = ctx.key;
    setContainerResult((prev) => mergeContainer(prev, k, container, { status: 'loading' }));
    // The backend returns the WHOLE container→URL map in one call, so every row
    // shares a single `code_changes` request: fetch once, then look the clicked
    // container up in the cached map.
    let entry = codeCacheRef.current;
    if (entry === null || entry.key !== k) {
      const controller = new AbortController();
      controllersRef.current.add(controller);
      const options = { abortSignal: controller.signal, showErrorAlert: false };
      const promise = getBackendSrv()
        .get<unknown>(`${ctx.base}/api/v1/code_changes`, ctx.input, undefined, options)
        .then((res): Record<string, string> => {
          const map = parseUrlByContainer(res);
          if (map === undefined) {
            throw new Error('Not Found'); // malformed 200 → reject (uncached, retryable)
          }
          return map;
        })
        .finally(() => controllersRef.current.delete(controller));
      entry = { key: k, promise };
      codeCacheRef.current = entry;
      const created = entry;
      promise.catch(() => {
        if (codeCacheRef.current === created) {
          codeCacheRef.current = null; // don't cache failures — allow retry
        }
      });
    }
    void entry.promise.then(
      (map) => {
        if (ctxRef.current.key !== k) {
          return;
        }
        // A valid map missing this container = definitive "Not Found" (cached, no refetch).
        const url = map[container];
        if (url === undefined) {
          setContainerResult((prev) => mergeContainer(prev, k, container, { status: 'error', error: 'Not Found' }));
          return;
        }
        const opened = window.open(url, '_blank', 'noopener,noreferrer');
        setContainerResult((prev) =>
          mergeContainer(prev, k, container, opened === null ? { status: 'error', error: 'Pop-up blocked' } : IDLE)
        );
      },
      (reason: unknown) => {
        if (ctxRef.current.key === k) {
          setContainerResult((prev) =>
            mergeContainer(prev, k, container, { status: 'error', error: errorMessage(reason) })
          );
        }
      }
    );
  }, []);

  // Results count only for the CURRENT request key; a node/endpoint change reads
  // back as idle without a reset effect.
  const application = appResult !== null && appResult.key === key && key !== '' ? appResult.state : IDLE;
  const containers =
    containerResult !== null && containerResult.key === key && key !== '' ? containerResult.states : {};

  return { enabled, application, containers, openApplicationReport, openContainerReport };
}
