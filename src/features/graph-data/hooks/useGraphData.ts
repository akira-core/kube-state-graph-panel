import { type DataFrame, type PanelData } from '@grafana/data';
import type cytoscape from 'cytoscape';
import { useMemo } from 'react';

import { isPlainObject, normalizeGraph } from '../normalize';

export interface UseGraphDataResult {
  elements: cytoscape.ElementDefinition[];
  error?: string;
  // Distinguishes "no payload at all" from a payload that legitimately normalized
  // to zero elements — an empty backend graph still has a payload (hasPayload true).
  // Side-effecting consumers must not treat the former as "the graph is empty" —
  // see pod-list-variable-export spec.
  hasPayload: boolean;
}

// A graph payload is the full backend response ({ elements: { nodes, edges } }) or
// an already-unwrapped { nodes, edges }. Lets us skip sibling columns (apiVersion,
// clusters) that Infinity's table flattening may surface ahead of the graph data.
function looksLikeGraphPayload(value: unknown): boolean {
  // Reuse normalize's guard so "what is a graph payload" lives only at that boundary.
  if (!isPlainObject(value)) {
    return false;
  }
  return isPlainObject(value.elements) || Array.isArray(value.nodes);
}

function extractJsonFromFrames(series: DataFrame[]): unknown {
  let fallback: unknown;
  for (const frame of series) {
    // Infinity quirk: the frontend "table" parser flattens JSON into fields
    // (values[0]); the backend/JSON parser leaves fields empty and stashes the
    // response in meta.custom.data. Probe both so either parsing mode renders.
    const candidates: unknown[] = frame.fields.map((field) => (field.values as unknown as ArrayLike<unknown>)[0]);
    // meta.custom is typed Record<string, any>; pin to unknown (narrowed below).
    const metaData: unknown = frame.meta?.custom?.data;
    if (metaData !== undefined) {
      candidates.push(metaData);
    }
    for (const raw of candidates) {
      let candidate: unknown = raw;
      if (typeof raw === 'string') {
        try {
          candidate = JSON.parse(raw);
        } catch {
          continue;
        }
      }
      if (looksLikeGraphPayload(candidate)) {
        return candidate;
      }
      // Keep the first parseable candidate so an invalid payload still reaches
      // normalizeGraph and surfaces an error rather than rendering blank.
      if (fallback === undefined) {
        fallback = candidate;
      }
    }
  }
  return fallback;
}

export function useGraphData(data: PanelData): UseGraphDataResult {
  // Grafana builds a NEW series array every refresh, so a memo keyed on it re-runs
  // even when payload bytes are identical, invalidating every downstream memo.
  // Two-stage memo: reduce series to a fingerprint string, then key the result memo
  // on that string so a byte-identical refresh reuses the prior result object.
  const fingerprint = useMemo<string | null>(() => {
    const payload = extractJsonFromFrames(data.series);
    return payload === undefined ? null : JSON.stringify(payload);
  }, [data.series]);

  return useMemo<UseGraphDataResult>(() => {
    if (fingerprint === null) {
      return { elements: [], hasPayload: false };
    }
    // Re-parse from the fingerprint string so the dep array carries no object identity.
    const payload = JSON.parse(fingerprint) as unknown;
    const { elements, errors } = normalizeGraph(payload);
    const firstError = errors[0];
    return firstError !== undefined
      ? { elements, error: firstError, hasPayload: true }
      : { elements, hasPayload: true };
  }, [fingerprint]);
}
