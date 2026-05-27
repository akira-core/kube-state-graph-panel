import type { EdgeType, K8sResourceKind } from '../constants/types';

export interface GraphNode {
  id: string;
  kind: K8sResourceKind;
  label?: string;
  namespace?: string;
  labels?: Record<string, string>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  edgeType: EdgeType;
  weight?: number;
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
