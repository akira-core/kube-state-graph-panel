import type cytoscape from 'cytoscape';

import type { NodeAlert } from '../../shared/constants/types';

import { extractAlertPodNames } from './extractAlertPodNames';

function alert(name: string, severity: string): NodeAlert {
  return { name, severity, timeRecords: [] };
}

function node(data: cytoscape.NodeDataDefinition): cytoscape.ElementDefinition {
  return { group: 'nodes', data };
}

function edge(id: string, source: string, target: string): cytoscape.ElementDefinition {
  return { group: 'edges', data: { id, source, target, edgeType: 'pod-calls-pod' } };
}

describe('extractAlertPodNames', () => {
  it('only includes pod nodes with a non-empty alerts array', () => {
    const elements = [
      node({ id: 'pod-mongo-2', kind: 'pod', label: 'mongo-2', alerts: [alert('KubePodCrashLooping', 'critical')] }),
      node({ id: 'pod-mongo-0', kind: 'pod', label: 'mongo-0' }),
      node({ id: 'pod-mongo-1', kind: 'pod', label: 'mongo-1', alerts: [] }),
      node({
        id: 'node-worker-1',
        kind: 'node',
        label: 'worker-1',
        alerts: [alert('KubeNodeMemoryPressure', 'warning')],
      }),
      edge('e1', 'pod-mongo-0', 'pod-mongo-1'),
    ];
    expect(extractAlertPodNames(elements)).toEqual(['mongo-2']);
  });

  it('excludes a pod with undefined alerts', () => {
    const elements = [node({ id: 'pod-a', kind: 'pod', label: 'a' })];
    expect(extractAlertPodNames(elements)).toEqual([]);
  });

  it('excludes a pod with an empty alerts array', () => {
    const elements = [node({ id: 'pod-a', kind: 'pod', label: 'a', alerts: [] })];
    expect(extractAlertPodNames(elements)).toEqual([]);
  });

  it('excludes non-pod nodes even when they carry alerts', () => {
    const elements = [
      node({ id: 'node-1', kind: 'node', label: 'worker-1', alerts: [alert('KubeNodeMemoryPressure', 'warning')] }),
      node({ id: 'pvc-1', kind: 'pvc', label: 'data-mongo-2', alerts: [alert('VolumeNearFull', 'critical')] }),
      node({
        id: 'ctrl-1',
        kind: 'statefulset',
        isController: true,
        label: 'mongo',
        alerts: [alert('KubePodCrashLooping', 'critical')],
      }),
    ];
    expect(extractAlertPodNames(elements)).toEqual([]);
  });

  it('does not let severity affect inclusion — info counts the same as critical', () => {
    const elements = [
      node({ id: 'pod-a', kind: 'pod', label: 'a', alerts: [alert('SomeInfoAlert', 'info')] }),
      node({ id: 'pod-b', kind: 'pod', label: 'b', alerts: [alert('SomeCriticalAlert', 'critical')] }),
    ];
    expect(extractAlertPodNames(elements)).toEqual(['a', 'b']);
  });

  it('dedupes same-named alerting pods across clusters and sorts lexicographically', () => {
    const elements = [
      node({ id: 'prod/gateway', kind: 'pod', label: 'gateway', alerts: [alert('KubePodCrashLooping', 'critical')] }),
      node({ id: 'dr/gateway', kind: 'pod', label: 'gateway', alerts: [alert('KubePodCrashLooping', 'critical')] }),
      node({ id: 'dr/consumer', kind: 'pod', label: 'consumer', alerts: [alert('KubePodNotReady', 'warning')] }),
    ];
    expect(extractAlertPodNames(elements)).toEqual(['consumer', 'gateway']);
  });

  it('falls back to the node id when label is missing or empty', () => {
    const elements = [
      node({ id: 'pod-no-label', kind: 'pod', alerts: [alert('KubePodCrashLooping', 'critical')] }),
      node({ id: 'pod-empty-label', kind: 'pod', label: '', alerts: [alert('KubePodNotReady', 'warning')] }),
    ];
    expect(extractAlertPodNames(elements)).toEqual(['pod-empty-label', 'pod-no-label']);
  });

  it('ignores edges', () => {
    const elements = [
      node({ id: 'pod-a', kind: 'pod', label: 'a', alerts: [alert('KubePodCrashLooping', 'critical')] }),
      edge('e1', 'pod-a', 'pod-a'),
    ];
    expect(extractAlertPodNames(elements)).toEqual(['a']);
  });

  it('returns an empty list for empty input', () => {
    expect(extractAlertPodNames([])).toEqual([]);
  });
});
