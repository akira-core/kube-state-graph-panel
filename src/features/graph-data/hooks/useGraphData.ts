import { type DataFrame, type PanelData } from '@grafana/data';
import type cytoscape from 'cytoscape';
import { useMemo } from 'react';

import { isPlainObject, normalizeGraph } from '../normalize';

export interface UseGraphDataResult {
  elements: cytoscape.ElementDefinition[];
  error?: string;
}

// A graph payload is either the full backend response ({ elements: { nodes, edges } })
// or an already-unwrapped { nodes, edges } object. This guard lets us skip sibling
// columns (apiVersion string, clusters array) that Infinity's table flattening may
// surface ahead of the graph data.
function looksLikeGraphPayload(value: unknown): boolean {
  // Reuse normalize's plain-object guard so the "what is a graph payload" rule
  // lives in one place (the normalize anti-corruption boundary), not two.
  if (!isPlainObject(value)) {
    return false;
  }
  return isPlainObject(value.elements) || Array.isArray(value.nodes);
}

function extractJsonFromFrames(series: DataFrame[]): unknown {
  let fallback: unknown;
  for (const frame of series) {
    // Infinity's frontend "table" parser flattens the JSON object into fields
    // (values[0]); its backend/JSON parser instead leaves fields empty and stashes
    // the parsed response in meta.custom.data. Probe both shapes so the panel
    // renders regardless of which Infinity parsing mode the query is configured for.
    const candidates: unknown[] = frame.fields.map((field) => (field.values as unknown as ArrayLike<unknown>)[0]);
    // @grafana/data types meta.custom as Record<string, any>, so this access is
    // `any`; pin it to `unknown` at the boundary (the candidates array is unknown[]
    // and every value is narrowed below before use).
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
      // Remember the first parseable candidate so a wholly-invalid payload still
      // reaches normalizeGraph and surfaces an error rather than rendering blank.
      if (fallback === undefined) {
        fallback = candidate;
      }
    }
  }
  return fallback;
}

export function useGraphData(data: PanelData): UseGraphDataResult {
  // Grafana builds a NEW series array for every query response, so a memo keyed
  // on data.series re-runs each refresh even when the payload bytes are identical
  // — and a fresh result object would invalidate EVERY downstream memo (mode
  // transform clone, visibility passes, legend derivations, the cy diff effect).
  // Two-stage memo: first reduce the series to a payload FINGERPRINT string
  // (covering both the string-field and meta.custom.data shapes); the second memo
  // depends on that string, so a byte-identical refresh compares equal and the
  // previous result object is reused without re-normalizing.
  const fingerprint = useMemo<string | null>(() => {
    const payload = extractJsonFromFrames(data.series);
    return payload === undefined ? null : JSON.stringify(payload);
  }, [data.series]);

  return useMemo<UseGraphDataResult>(() => {
    if (fingerprint === null) {
      return { elements: [] };
    }
    // Re-parse from the fingerprint (one parse per ACTUAL data change) so this
    // memo's input is the plain string — no object identity in the dep array.
    const payload = JSON.parse(fingerprint) as unknown;
    const { elements, errors } = normalizeGraph(payload);
    const firstError = errors[0];
    return firstError !== undefined ? { elements, error: firstError } : { elements };
  }, [fingerprint]);
}
