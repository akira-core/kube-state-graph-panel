import { isPlainObject } from '../guards/isPlainObject';

// One promoted attribute row for a node. Shared shape between the hover tooltip's
// promoted attrs and the detail panel's Properties section — same source, two renderers.
export interface NodeAttribute {
  key: string;
  value: string;
  // Wrap instead of clip — for long values like a storageclass selector parameter.
  wrap?: boolean;
}

// Single source for a node's promoted attributes, consumed by BOTH the hover tooltip
// and the detail-panel Properties section so the two never drift. Only emits rows that
// HAVE a value (no empty rows). Backend D6 namespace / application groups are kind-LESS
// in data (invisible to the kind filter + icon legend), so a synthetic kind is surfaced;
// a real data.kind (leaf / k8s node / enriched controller) wins. Accepts the raw node
// `data` bag (cytoscape `NodeDataDefinition` or the hover layer's `Record<string,
// unknown>`); every read is guarded so untyped values narrow safely.
export function buildNodeAttributes(data: Readonly<Record<string, unknown>>): NodeAttribute[] {
  const attrs: NodeAttribute[] = [];

  const kindValue =
    typeof data.kind === 'string'
      ? data.kind
      : data.isApplication === true
        ? 'application'
        : data.isNamespace === true
          ? 'namespace'
          : undefined;
  if (kindValue !== undefined) {
    attrs.push({ key: 'kind', value: kindValue });
  }
  if (typeof data.namespace === 'string') {
    attrs.push({ key: 'namespace', value: data.namespace });
  }
  // ArgoCD application — promoted on any leaf carrying one (pod / service / pvc per
  // backend D6, plus enriched controllers). Skipped on the decorative application GROUP
  // node, whose synthetic `kind: application` + name already convey it.
  if (typeof data.application === 'string' && data.application.length > 0 && data.isApplication !== true) {
    attrs.push({ key: 'application', value: data.application });
  }
  if (Array.isArray(data.ipAddress) && data.ipAddress.length > 0) {
    attrs.push({ key: 'ipAddress', value: data.ipAddress.filter((ip) => typeof ip === 'string').join(', ') });
  }
  // A storageclass leaf (backend D6) carries its own provisioner.
  if (typeof data.provisioner === 'string' && data.provisioner.length > 0) {
    attrs.push({ key: 'provisioner', value: data.provisioner });
  }
  // StorageClass backing-storage parameters (D6): a typed string map. Each as a wrapped
  // row (values like a selector can be long) — key-sorted for a deterministic order.
  const parameters = data.parameters;
  if (isPlainObject(parameters)) {
    for (const key of Object.keys(parameters).sort()) {
      const value = parameters[key];
      if (typeof value === 'string') {
        attrs.push({ key, value, wrap: true });
      }
    }
  }
  return attrs;
}
