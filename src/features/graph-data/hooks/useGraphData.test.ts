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

// Infinity's backend/JSON parser leaves fields empty and stashes the parsed
// response in meta.custom.data instead of fields[].values[0].
function frameWithMetaData(data: unknown): DataFrame {
  return {
    name: 'graph',
    length: 0,
    fields: [],
    meta: { custom: { data } },
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
    expect(result.current.hasPayload).toBe(false);
  });

  it('reports hasPayload=true for a graph payload that normalizes to zero elements', () => {
    // "Loaded and genuinely empty" must stay distinguishable from "no payload at
    // all" — side-effecting consumers (pod-list variable export) key off this.
    const data = panelData([frameWithFieldValue(JSON.stringify({ nodes: [], edges: [] }))]);
    const { result } = renderHook(() => useGraphData(data));
    expect(result.current.elements).toEqual([]);
    expect(result.current.hasPayload).toBe(true);
  });

  it('parses JSON string field and normalizes graph payload', () => {
    const payload = {
      nodes: [{ id: 'a', type: 'pod' }],
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
    const payload = { nodes: [{ id: 'a', type: 'pod' }], edges: [] };
    const data = panelData([frameWithFieldValue(payload)]);
    const { result } = renderHook(() => useGraphData(data));
    expect(result.current.elements).toHaveLength(1);
  });

  it('skips malformed JSON strings and returns no elements', () => {
    const data = panelData([frameWithFieldValue('not json {')]);
    const { result } = renderHook(() => useGraphData(data));
    expect(result.current.elements).toEqual([]);
    expect(result.current.error).toBeUndefined();
    expect(result.current.hasPayload).toBe(false);
  });

  it('surfaces normalize errors when payload shape is invalid', () => {
    const data = panelData([frameWithFieldValue(JSON.stringify('definitely not an object'))]);
    const { result } = renderHook(() => useGraphData(data));
    expect(result.current.error).toBeDefined();
  });

  it('skips parseable sibling columns and selects the graph envelope', () => {
    const envelope = {
      apiVersion: 'v1',
      clusters: ['cluster-alpha'],
      elements: {
        nodes: [{ data: { id: 'cluster-alpha/uid-1', name: 'pod-a', type: 'pod', labels: {} } }],
        edges: [],
      },
    };
    const frame: DataFrame = {
      name: 'graph',
      length: 1,
      fields: [
        { name: 'apiVersion', type: FieldType.string, config: {}, values: [JSON.stringify('v1')] },
        { name: 'clusters', type: FieldType.string, config: {}, values: [JSON.stringify(['cluster-alpha'])] },
        { name: 'payload', type: FieldType.string, config: {}, values: [JSON.stringify(envelope)] },
      ],
    };
    const data = panelData([frame]);
    const { result } = renderHook(() => useGraphData(data));
    expect(result.current.elements).toHaveLength(1);
    const first = result.current.elements[0] as { data: { id: string } };
    expect(first.data.id).toBe('cluster-alpha/uid-1');
    expect(result.current.error).toBeUndefined();
  });

  it('falls back to a parseable non-graph object so normalize surfaces an error', () => {
    const data = panelData([frameWithFieldValue(JSON.stringify({ foo: 1 }))]);
    const { result } = renderHook(() => useGraphData(data));
    expect(typeof result.current.error).toBe('string');
    expect(result.current.error).not.toBe('');
  });

  it('parses an object payload stashed in meta.custom.data (Infinity backend parser)', () => {
    const payload = { nodes: [{ id: 'a', type: 'pod' }], edges: [] };
    const data = panelData([frameWithMetaData(payload)]);
    const { result } = renderHook(() => useGraphData(data));
    expect(result.current.elements).toHaveLength(1);
    const first = result.current.elements[0] as { data: { id: string } };
    expect(first.data.id).toBe('a');
    expect(result.current.error).toBeUndefined();
  });

  it('parses a JSON string payload stashed in meta.custom.data', () => {
    const payload = { elements: { nodes: [{ id: 'a', type: 'pod' }], edges: [] } };
    const data = panelData([frameWithMetaData(JSON.stringify(payload))]);
    const { result } = renderHook(() => useGraphData(data));
    expect(result.current.elements).toHaveLength(1);
    expect(result.current.error).toBeUndefined();
  });

  it('prefers a graph payload in fields over meta.custom.data', () => {
    const frame: DataFrame = {
      ...frameWithFieldValue(JSON.stringify({ nodes: [{ id: 'field-node', type: 'pod' }], edges: [] })),
      meta: { custom: { data: { nodes: [{ id: 'meta-node', type: 'pod' }], edges: [] } } },
    };
    const { result } = renderHook(() => useGraphData(panelData([frame])));
    expect(result.current.elements).toHaveLength(1);
    const first = result.current.elements[0] as { data: { id: string } };
    expect(first.data.id).toBe('field-node');
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

  it('returns the SAME result object for a byte-identical payload in a NEW series array (no-op refresh)', () => {
    // Grafana rebuilds PanelData.series each refresh; an unchanged payload must not
    // produce a fresh elements array, or every downstream memo and the cy diff
    // effect re-fires for nothing on each dashboard tick.
    const payload = JSON.stringify({ nodes: [{ id: 'a', type: 'pod' }], edges: [] });
    const { result, rerender } = renderHook(({ d }: { d: PanelData }) => useGraphData(d), {
      initialProps: { d: panelData([frameWithFieldValue(payload)]) },
    });
    const first = result.current;
    rerender({ d: panelData([frameWithFieldValue(payload)]) }); // fresh frame, same bytes
    expect(result.current).toBe(first);
  });

  it('returns a NEW result when the payload content actually changes', () => {
    const { result, rerender } = renderHook(({ d }: { d: PanelData }) => useGraphData(d), {
      initialProps: {
        d: panelData([frameWithFieldValue(JSON.stringify({ nodes: [{ id: 'a', type: 'pod' }], edges: [] }))]),
      },
    });
    const first = result.current;
    rerender({
      d: panelData([
        frameWithFieldValue(
          JSON.stringify({
            nodes: [
              { id: 'a', type: 'pod' },
              { id: 'b', type: 'pod' },
            ],
            edges: [],
          })
        ),
      ]),
    });
    expect(result.current).not.toBe(first);
    expect(result.current.elements).toHaveLength(2);
  });

  it('short-circuits the meta.custom.data shape too (object payload, not string)', () => {
    const make = (): PanelData => panelData([frameWithMetaData({ nodes: [{ id: 'a', type: 'pod' }], edges: [] })]);
    const { result, rerender } = renderHook(({ d }: { d: PanelData }) => useGraphData(d), {
      initialProps: { d: make() },
    });
    const first = result.current;
    rerender({ d: make() }); // fresh frame AND fresh payload object, same content
    expect(result.current).toBe(first);
  });
});
