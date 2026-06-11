import { clonePlain } from './clonePlain';

describe('clonePlain', () => {
  it('deep-clones nested objects and arrays', () => {
    const original = { a: 1, nested: { b: [1, 2, { c: 'x' }] } };
    const cloned = clonePlain(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.nested).not.toBe(original.nested);
    expect(cloned.nested.b).not.toBe(original.nested.b);
    expect(cloned.nested.b[2]).not.toBe(original.nested.b[2]);
  });

  it('passes primitives (including falsy ones) through unchanged', () => {
    expect(clonePlain(0)).toBe(0);
    expect(clonePlain('')).toBe('');
    expect(clonePlain(null)).toBeNull();
    expect(clonePlain(undefined)).toBeUndefined();
    expect(clonePlain(false)).toBe(false);
  });
});
