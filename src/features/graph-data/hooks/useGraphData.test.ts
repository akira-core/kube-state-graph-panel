import { dateTime, FieldType, LoadingState, type DataFrame, type PanelData, type TimeRange } from '@grafana/data';
import { renderHook } from '@testing-library/react';

import { useGraphData } from './useGraphData';

const stubTimeRange: TimeRange = {
  from: dateTime(),
  to: dateTime(),
  raw: { from: 'now-1h', to: 'now' },
};

function frameWithFieldValue(value: unknown): DataFrame {
  return {
    name: 'graph',
    length: 1,
    fields: [
      {
        name: 'payload',
        type: FieldType.string,
        config: {},
        values: [value],
      },
    ],
  };
}

function panelData(series: DataFrame[]): PanelData {
  return {
    state: LoadingState.Done,
    series,
    timeRange: stubTimeRange,
  };
}

describe('useGraphData', () => {
  it('returns empty elements when series is empty', () => {
    const { result } = renderHook(() => useGraphData(panelData([])));
    expect(result.current.elements).toEqual([]);
    expect(result.current.error).toBeUndefined();
  });

  it('parses JSON string field and normalizes graph payload', () => {
    const payload = {
      nodes: [{ id: 'a', kind: 'Pod' }],
      edges: [],
    };
    const data = panelData([frameWithFieldValue(JSON.stringify(payload))]);
    const { result } = renderHook(() => useGraphData(data));
    expect(result.current.elements).toHaveLength(1);
    const first = result.current.elements[0] as { data: { id: string } };
    expect(first.data.id).toBe('a');
    expect(result.current.error).toBeUndefined();
  });

  it('accepts object field value directly (non-stringified payload)', () => {
    const payload = { nodes: [{ id: 'a', kind: 'Pod' }], edges: [] };
    const data = panelData([frameWithFieldValue(payload)]);
    const { result } = renderHook(() => useGraphData(data));
    expect(result.current.elements).toHaveLength(1);
  });

  it('skips malformed JSON strings and returns no elements', () => {
    const data = panelData([frameWithFieldValue('not json {')]);
    const { result } = renderHook(() => useGraphData(data));
    expect(result.current.elements).toEqual([]);
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces normalize errors when payload shape is invalid', () => {
    const data = panelData([frameWithFieldValue(JSON.stringify('definitely not an object'))]);
    const { result } = renderHook(() => useGraphData(data));
    expect(result.current.error).toBeDefined();
  });

  it('memoizes result across renders with same data.series reference', () => {
    const data = panelData([frameWithFieldValue(JSON.stringify({ nodes: [], edges: [] }))]);
    const { result, rerender } = renderHook(({ d }: { d: PanelData }) => useGraphData(d), {
      initialProps: { d: data },
    });
    const first = result.current;
    rerender({ d: data });
    expect(result.current).toBe(first);
  });
});
