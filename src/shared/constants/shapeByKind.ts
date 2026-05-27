import type { K8sResourceKind } from './types';

export type CytoscapeNodeShape =
  | 'ellipse'
  | 'round-rectangle'
  | 'rectangle'
  | 'hexagon'
  | 'diamond'
  | 'octagon'
  | 'barrel'
  | 'tag'
  | 'cut-rectangle'
  | 'star';

export const SHAPE_BY_KIND: Record<K8sResourceKind, CytoscapeNodeShape> = {
  Pod: 'ellipse',
  Service: 'round-rectangle',
  Deployment: 'hexagon',
  Ingress: 'diamond',
  Node: 'octagon',
  StatefulSet: 'barrel',
  DaemonSet: 'tag',
  ConfigMap: 'rectangle',
  Secret: 'cut-rectangle',
  HPA: 'star',
  Namespace: 'rectangle',
  ReplicaSet: 'hexagon',
  Job: 'rectangle',
  CronJob: 'rectangle',
};

export const FALLBACK_SHAPE: CytoscapeNodeShape = 'round-rectangle';
