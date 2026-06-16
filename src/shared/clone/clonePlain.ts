// Plain-JSON deep clone. Covers every value the panel reads from / hands to
// cytoscape element data (normalize emits pure JSON).
//
// Only arrays and PLAIN objects (Object.prototype / null prototype) are recursed.
// Any non-plain object is returned by reference, untouched:
//   - class instances, Dates, functions — never copied;
//   - crucially, the live cytoscape collections the expand-collapse extension
//     parks on element data (`collapsedChildren`, `originalEnds`, …). Those are
//     array-like and reference cy, so they are cyclic — recursing into them blew
//     the stack ("Maximum call stack size exceeded") on every hover.
// A WeakSet also guards against reference cycles among plain values, so a cyclic
// structure terminates instead of overflowing.
function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function cloneInner<T>(value: T, seen: WeakSet<object>): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const obj = value as unknown as object;
  if (seen.has(obj)) {
    return value;
  }
  if (Array.isArray(value)) {
    seen.add(obj);
    return value.map((v: unknown) => cloneInner(v, seen)) as T;
  }
  // Non-plain objects (class instances, live cytoscape collections, …) are not
  // JSON and are returned as-is — never recursed.
  if (!isPlainObject(obj)) {
    return value;
  }
  seen.add(obj);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = cloneInner(v, seen);
  }
  return out as T;
}

export function clonePlain<T>(value: T): T {
  return cloneInner(value, new WeakSet<object>());
}
