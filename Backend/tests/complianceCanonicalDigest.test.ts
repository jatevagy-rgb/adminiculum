import { canonicalDigest, canonicalStringify, CanonicalizationError } from '../src/modules/compliance/canonicalDigest';

describe('phase6 deterministic canonicalization + digest', () => {
  it('produces identical canonical output for different object key insertion order', () => {
    const a = { z: 1, a: { y: true, b: 'x' }, m: [1, 2] };
    const b = { a: { b: 'x', y: true }, m: [1, 2], z: 1 };
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
    expect(canonicalDigest(a)).toBe(canonicalDigest(b));
  });

  it('produces a different digest when a value changes', () => {
    const a = { factKey: 'regulated_activity', value: true };
    const b = { factKey: 'regulated_activity', value: false };
    expect(canonicalDigest(a)).not.toBe(canonicalDigest(b));
  });

  it('produces a different digest when array order changes (arrays are meaningful)', () => {
    const a = { items: [1, 2, 3] };
    const b = { items: [3, 2, 1] };
    expect(canonicalDigest(a)).not.toBe(canonicalDigest(b));
  });

  it('keeps nested object ordering stable regardless of insertion order', () => {
    const a = { outer: { inner: { z: 1, a: 2 } }, list: [1, 2] };
    const b = { outer: { inner: { a: 2, z: 1 } }, list: [1, 2] };
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
    expect(canonicalDigest(a)).toBe(canonicalDigest(b));
  });

  it('rejects undefined by default (non-JSON policy)', () => {
    expect(() => canonicalStringify({ a: undefined })).toThrowError(CanonicalizationError);
  });

  it('rejects non-JSON values: functions, symbols, bigint, Date, non-finite numbers', () => {
    expect(() => canonicalStringify({ f: () => 1 })).toThrowError(CanonicalizationError);
    expect(() => canonicalStringify({ s: Symbol('x') })).toThrowError(CanonicalizationError);
    expect(() => canonicalStringify({ b: BigInt(1) })).toThrowError(CanonicalizationError);
    expect(() => canonicalStringify({ d: new Date() })).toThrowError(CanonicalizationError);
    expect(() => canonicalStringify({ n: NaN })).toThrowError(CanonicalizationError);
    expect(() => canonicalStringify({ n: Infinity })).toThrowError(CanonicalizationError);
    expect(() => canonicalStringify(new Map([['a', 1]]))).toThrowError(CanonicalizationError);
    expect(() => canonicalStringify(new Set([1]))).toThrowError(CanonicalizationError);
    expect(() => canonicalStringify(/x/)).toThrowError(CanonicalizationError);
  });

  it('rejects cycles instead of producing an ambiguous digest', () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => canonicalStringify(value)).toThrowError(CanonicalizationError);
  });

  it('normalizes -0 to 0 for determinism', () => {
    expect(canonicalStringify({ n: -0 })).toBe(canonicalStringify({ n: 0 }));
  });

  it('digest is a 64-char hex SHA-256 by default', () => {
    const digest = canonicalDigest({ a: 1, b: [true, null, 'x'] });
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});
