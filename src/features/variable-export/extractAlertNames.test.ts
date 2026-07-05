import type cytoscape from 'cytoscape';

import type { NodeAlert } from '../../shared/constants/types';

import { extractAlertNames } from './extractAlertNames';

function alert(name: string, severity: string): NodeAlert {
  return { name, severity, timeRecords: [] };
}

function node(data: cytoscape.NodeDataDefinition): cytoscape.ElementDefinition {
  return { group: 'nodes', data };
}

function edge(id: string, source: string, target: string): cytoscape.ElementDefinition {
  return { group: 'edges', data: { id, source, target, edgeType: 'pod-calls-pod' } };
}

describe('extractAlertNames', () => {
  it('collects alert names across pod/node/pvc kinds, sorted', () => {
    const elements = [
      node({
        id: 'pod-mongo-2',
        kind: 'pod',
        label: 'mongo-2',
        alerts: [alert('KubePodCrashLooping', 'critical'), alert('KubePodNotReady', 'warning')],
      }),
      node({ id: 'node-worker-1', kind: 'node', label: 'worker-1', alerts: [alert('KubeNodeMemoryPressure', 'warning')] }),
      node({ id: 'pvc-data-mongo-2', kind: 'pvc', label: 'data-mongo-2', alerts: [alert('VolumeNearFull', 'critical')] }),
    ];
    expect(extractAlertNames(elements)).toEqual([
      'KubeNodeMemoryPressure',
      'KubePodCrashLooping',
      'KubePodNotReady',
      'VolumeNearFull',
    ]);
  });

  it('also collects alert names carried on service and controller nodes', () => {
    const elements = [
      node({ id: 'svc-1', kind: 'service', label: 'mongo-headless', alerts: [alert('ServiceDegraded', 'warning')] }),
      node({
        id: 'ctrl-1',
        kind: 'statefulset',
        isController: true,
        label: 'mongo',
        alerts: [alert('KubeStatefulSetReplicasMismatch', 'critical')],
      }),
    ];
    expect(extractAlertNames(elements)).toEqual(['KubeStatefulSetReplicasMismatch', 'ServiceDegraded']);
  });

  it('dedupes a controller-aggregated alert name that also appears on the child pod', () => {
    const elements = [
      node({ id: 'pod-mongo-2', kind: 'pod', label: 'mongo-2', alerts: [alert('KubePodCrashLooping', 'critical')] }),
      node({
        id: 'ctrl-mongo',
        kind: 'statefulset',
        isController: true,
        label: 'mongo',
        alerts: [alert('KubePodCrashLooping', 'critical')],
      }),
    ];
    expect(extractAlertNames(elements)).toEqual(['KubePodCrashLooping']);
  });

  it('ignores nodes with no alerts', () => {
    const elements = [
      node({ id: 'pod-a', kind: 'pod', label: 'a' }),
      node({ id: 'pod-b', kind: 'pod', label: 'b', alerts: [] }),
    ];
    expect(extractAlertNames(elements)).toEqual([]);
  });

  it('ignores edges', () => {
    const elements = [
      node({ id: 'pod-a', kind: 'pod', label: 'a', alerts: [alert('KubePodCrashLooping', 'critical')] }),
      edge('e1', 'pod-a', 'pod-a'),
    ];
    expect(extractAlertNames(elements)).toEqual(['KubePodCrashLooping']);
  });

  it('returns an empty list when no node in the graph carries alerts', () => {
    const elements = [node({ id: 'pod-a', kind: 'pod', label: 'a' }), node({ id: 'pod-b', kind: 'pod', label: 'b' })];
    expect(extractAlertNames(elements)).toEqual([]);
  });

  it('returns an empty list for empty input', () => {
    expect(extractAlertNames([])).toEqual([]);
  });
});
