import type { CompareNode } from '../src/modules/compliance/ruleAst';
import { checkComparisonTypeCompatibility } from '../src/modules/compliance/typeCompatibility';
import type { FactDefinitionMap } from '../src/modules/compliance/types';

const FACTS: FactDefinitionMap = {
  regulated_activity: { type: 'boolean' },
  employee_count: { type: 'number' },
  incorporation_date: { type: 'date' },
  entity_name: { type: 'string' },
};

function compare(partial: Partial<CompareNode> & Pick<CompareNode, 'left' | 'right'>): CompareNode {
  return {
    kind: 'COMPARE',
    operator: 'EQ',
    ...partial,
  };
}

describe('phase6 type-compatibility validation', () => {
  it('accepts a valid boolean comparison (fact vs boolean literal)', () => {
    const node = compare({
      operator: 'EQ',
      left: { kind: 'FACT', factKey: 'regulated_activity' },
      right: { kind: 'LITERAL', valueType: 'boolean', value: true },
    });
    const result = checkComparisonTypeCompatibility(node, FACTS);
    expect(result.compatible).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a valid numeric comparison (fact vs number literal)', () => {
    const node = compare({
      operator: 'GTE',
      left: { kind: 'FACT', factKey: 'employee_count' },
      right: { kind: 'LITERAL', valueType: 'number', value: 10 },
    });
    const result = checkComparisonTypeCompatibility(node, FACTS);
    expect(result.compatible).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a fact-to-fact comparison of the same type', () => {
    const node = compare({
      operator: 'EQ',
      left: { kind: 'FACT', factKey: 'entity_name' },
      right: { kind: 'FACT', factKey: 'entity_name' },
    });
    const result = checkComparisonTypeCompatibility(node, FACTS);
    expect(result.compatible).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a cross-type comparison (date fact vs number literal)', () => {
    const node = compare({
      operator: 'GT',
      left: { kind: 'FACT', factKey: 'incorporation_date' },
      right: { kind: 'LITERAL', valueType: 'number', value: 2000 },
    });
    const result = checkComparisonTypeCompatibility(node, FACTS);
    expect(result.compatible).toBe(false);
    expect(result.errors.some((e) => e.code === 'CROSS_TYPE_FACT_LITERAL')).toBe(true);
  });

  it('rejects a cross-type fact-to-fact comparison (boolean vs number)', () => {
    const node = compare({
      operator: 'EQ',
      left: { kind: 'FACT', factKey: 'regulated_activity' },
      right: { kind: 'FACT', factKey: 'employee_count' },
    });
    const result = checkComparisonTypeCompatibility(node, FACTS);
    expect(result.compatible).toBe(false);
    expect(result.errors.some((e) => e.code === 'CROSS_TYPE_FACT_FACT')).toBe(true);
  });

  it('handles an unknown fact definition deterministically (error)', () => {
    const node = compare({
      operator: 'EQ',
      left: { kind: 'FACT', factKey: 'not_declared' },
      right: { kind: 'LITERAL', valueType: 'string', value: 'x' },
    });
    const result = checkComparisonTypeCompatibility(node, FACTS);
    expect(result.compatible).toBe(false);
    expect(result.errors.some((e) => e.code === 'UNKNOWN_FACT')).toBe(true);
  });

  it('accepts IS_NULL / IS_NOT_NULL for any fact type (no cross-type constraint)', () => {
    for (const op of ['IS_NULL', 'IS_NOT_NULL'] as const) {
      const node = compare({
        operator: op,
        left: { kind: 'FACT', factKey: 'incorporation_date' },
        right: { kind: 'LITERAL', valueType: 'string', value: null },
      });
      const result = checkComparisonTypeCompatibility(node, FACTS);
      expect(result.compatible).toBe(true);
    }
  });
});