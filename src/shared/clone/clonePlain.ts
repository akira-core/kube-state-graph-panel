// Plain-JSON deep clone. Covers every value the panel reads from / hands to
// cytoscape element data (normalize emits pure JSON). Non-plain values (class
// instances, functions) are returned as-is — they never occur in panel data.
export function clonePlain<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v: unknown) => clonePlain(v)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = clonePlain(v);
    }
    return out as T;
  }
  return value;
}
