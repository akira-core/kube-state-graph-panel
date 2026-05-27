import { type DataFrame, type PanelData } from '@grafana/data';
import type cytoscape from 'cytoscape';
import { useMemo } from 'react';

import { normalizeGraph } from '../normalize';

export interface UseGraphDataResult {
  elements: cytoscape.ElementDefinition[];
  error?: string;
}

function extractJsonFromFrames(series: DataFrame[]): unknown {
  for (const frame of series) {
    for (const field of frame.fields) {
      const values = field.values as unknown as ArrayLike<unknown>;
      const raw = values[0];
      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw);
        } catch {
          continue;
        }
      }
      if (typeof raw === 'object' && raw !== null) {
        return raw;
      }
    }
  }
  return undefined;
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
