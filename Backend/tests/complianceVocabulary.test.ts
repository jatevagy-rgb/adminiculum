import {
  APPLICABILITY_OUTCOMES,
  FACT_VALUE_TYPES,
  isApplicabilityOutcome,
  isFactValueType,
} from '../src/modules/compliance/types';

describe('phase6 compliance result vocabulary', () => {
  it('exposes exactly the six frozen applicability outcomes', () => {
    expect(APPLICABILITY_OUTCOMES).toEqual([
      'APPLIES',
      'DOES_NOT_APPLY',
      'INSUFFICIENT_FACTS',
      'LEGAL_REVIEW_REQUIRED',
      'TECHNICAL_REVIEW_REQUIRED',
      'SOURCE_SUPPORT_INSUFFICIENT',
    ]);
  });

  it('isApplicabilityOutcome accepts every declared outcome', () => {
    for (const outcome of APPLICABILITY_OUTCOMES) {
      expect(isApplicabilityOutcome(outcome)).toBe(true);
    }
  });

  it('isApplicabilityOutcome rejects unknown/arbitrary values', () => {
    expect(isApplicabilityOutcome('APPLY')).toBe(false);
    expect(isApplicabilityOutcome('NOT_LISTED')).toBe(false);
    expect(isApplicabilityOutcome(42)).toBe(false);
    expect(isApplicabilityOutcome(null)).toBe(false);
    expect(isApplicabilityOutcome(undefined)).toBe(false);
  });

  it('exposes the four fact value types', () => {
    expect(FACT_VALUE_TYPES).toEqual(['boolean', 'number', 'date', 'string']);
    expect(isFactValueType('boolean')).toBe(true);
    expect(isFactValueType('number')).toBe(true);
    expect(isFactValueType('date')).toBe(true);
    expect(isFactValueType('string')).toBe(true);
    expect(isFactValueType('decimal')).toBe(false);
    expect(isFactValueType('bigint')).toBe(false);
  });
});