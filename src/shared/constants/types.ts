export type K8sResourceKind =
  | 'Pod'
  | 'Service'
  | 'Deployment'
  | 'StatefulSet'
  | 'DaemonSet'
  | 'Ingress'
  | 'ConfigMap'
  | 'Secret'
  | 'Node'
  | 'HPA'
  | 'Namespace'
  | 'ReplicaSet'
  | 'Job'
  | 'CronJob';

export type EdgeType = 'ownerReference' | 'serviceSelector' | 'networkTraffic' | 'ingressBackend';
