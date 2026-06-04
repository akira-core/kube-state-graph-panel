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
    const candidates: unknown[] = frame.fields.map(
      (field) => (field.values as unknown as ArrayLike<unknown>)[0]
    );
    const metaData = frame.meta?.custom?.data;
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
  return useMemo<UseGraphDataResult>(() => {
    const payload = extractJsonFromFrames(data.series);
    if (payload === undefined) {
      return { elements: [] };
    }
    const { elements, errors } = normalizeGraph(payload);
    const firstError = errors[0];
    if (firstError !== undefined) {
      return { elements, error: firstError };
    }
    return { elements };
  }, [data.series]);
}
