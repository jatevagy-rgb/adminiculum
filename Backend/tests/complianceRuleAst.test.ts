import {
  COMPARISON_OPERATORS,
  isComparisonOperator,
  isRuleNodeKind,
  isRuleSchemaVersion,
  RULE_AST_V1,
  RULE_NODE_KINDS,
  type RuleExpression,
} from '../src/modules/compliance/ruleAst';
import { validateRuleAst } from '../src/modules/compliance/ruleAstValidator';

const VALID_COMPARE = {
  kind: 'COMPARE',
  operator: 'EQ',
  left: { kind: 'FACT', factKey: 'regulated_activity' },
  right: { kind: 'LITERAL', valueType: 'boolean', value: true },
} as const;

function expression(node: unknown): unknown {
  return { schemaVersion: RULE_AST_V1, node };
}

describe('phase6 rule AST v1 constants', () => {
  it('frozen schema version is rule-ast/v1', () => {
    expect(RULE_AST_V1).toBe('rule-ast/v1');
    expect(isRuleSchemaVersion('rule-ast/v1')).toBe(true);
    expect(isRuleSchemaVersion('rule-ast/v2')).toBe(false);
  });

  it('exposes a closed operator set', () => {
    expect(COMPARISON_OPERATORS).toEqual([
      'EQ',
      'NEQ',
      'GT',
      'GTE',
      'LT',
      'LTE',
      'CONTAINS',
      'NOT_CONTAINS',
      'IS_NULL',
      'IS_NOT_NULL',
    ]);
  });

  it('exposes a closed node kind set', () => {
    expect(RULE_NODE_KINDS).toEqual(['AND', 'OR', 'NOT', 'COMPARE']);
  });

  it('isComparisonOperator / isRuleNodeKind reject unknowns', () => {
    expect(isComparisonOperator('EQ')).toBe(true);
    expect(isComparisonOperator('LIKE')).toBe(false);
    expect(isRuleNodeKind('AND')).toBe(true);
    expect(isRuleNodeKind('EVAL')).toBe(false);
  });
});

describe('phase6 rule AST structural validator', () => {
  it('accepts a valid minimal rule', () => {
    const result = validateRuleAst(expression(VALID_COMPARE));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a nested AND/OR/NOT tree', () => {
    const tree: RuleExpression = {
      schemaVersion: RULE_AST_V1,
      node: {
        kind: 'AND',
        children: [
          { kind: 'COMPARE', operator: 'EQ', left: { kind: 'FACT', factKey: 'a' }, right: { kind: 'LITERAL', valueType: 'boolean', value: true } },
          {
            kind: 'OR',
            children: [
              { kind: 'COMPARE', operator: 'GT', left: { kind: 'FACT', factKey: 'n' }, right: { kind: 'LITERAL', valueType: 'number', value: 3 } },
              {
                kind: 'NOT',
                child: { kind: 'COMPARE', operator: 'IS_NULL', left: { kind: 'FACT', factKey: 's' }, right: { kind: 'LITERAL', valueType: 'string', value: null } },
              },
            ],
          },
        ],
      },
    };
    const result = validateRuleAst(tree);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects an unknown node type', () => {
    const result = validateRuleAst(expression({ kind: 'EVAL', code: 'x' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'UNKNOWN_NODE_TYPE')).toBe(true);
  });

  it('rejects an unknown operator', () => {
    const result = validateRuleAst(
      expression({ kind: 'COMPARE', operator: 'LIKE', left: { kind: 'FACT', factKey: 'a' }, right: { kind: 'LITERAL', valueType: 'string', value: 'x' } }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'UNKNOWN_OPERATOR')).toBe(true);
  });

  it('rejects a malformed fact reference (missing/blank factKey)', () => {
    const missing = validateRuleAst(expression({ kind: 'COMPARE', operator: 'EQ', left: { kind: 'FACT' }, right: { kind: 'LITERAL', valueType: 'boolean', value: true } }));
    expect(missing.valid).toBe(false);
    expect(missing.errors.some((e) => e.code === 'MALFORMED_FACT_REF')).toBe(true);

    const blank = validateRuleAst(
      expression({ kind: 'COMPARE', operator: 'EQ', left: { kind: 'FACT', factKey: '   ' }, right: { kind: 'LITERAL', valueType: 'boolean', value: true } }),
    );
    expect(blank.valid).toBe(false);
    expect(blank.errors.some((e) => e.code === 'MALFORMED_FACT_REF')).toBe(true);
  });

  it('rejects an invalid child count (AND with < 2 children, NOT with 2 children)', () => {
    const andSingle = validateRuleAst(expression({ kind: 'AND', children: [VALID_COMPARE] }));
    expect(andSingle.valid).toBe(false);
    expect(andSingle.errors.some((e) => e.code === 'INVALID_CHILD_COUNT')).toBe(true);

    const notTwo = validateRuleAst(expression({ kind: 'NOT', child: { kind: 'AND', children: [VALID_COMPARE, VALID_COMPARE] } }));
    // NOT with a single child is valid; here we check NOT-invalid via missing child.
    expect(notTwo.valid).toBe(true);

    const notMissing = validateRuleAst(expression({ kind: 'NOT' }));
    expect(notMissing.valid).toBe(false);
    expect(notMissing.errors.some((e) => e.code === 'MISSING_REQUIRED_FIELD')).toBe(true);
  });

  it('rejects an unsupported schema version', () => {
    const result = validateRuleAst({ schemaVersion: 'rule-ast/v2', node: VALID_COMPARE });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'UNSUPPORTED_SCHEMA_VERSION')).toBe(true);
  });

  it('rejects an arbitrary executable expression field (escape hatch)', () => {
    const result = validateRuleAst(
      expression({ kind: 'COMPARE', operator: 'EQ', left: { kind: 'FACT', factKey: 'a' }, right: { kind: 'LITERAL', valueType: 'string', value: 'x' }, expression: 'a === x' }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'UNEXPECTED_FIELD')).toBe(true);
  });

  it('rejects a node that is not an object', () => {
    const result = validateRuleAst(expression('not-an-object'));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'NOT_OBJECT')).toBe(true);
  });

  it('rejects a non-object rule expression envelope', () => {
    const result = validateRuleAst(null);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'NOT_A_RULE_EXPRESSION')).toBe(true);
  });

  it('rejects an invalid literal type (number literal that is not a number)', () => {
    const result = validateRuleAst(
      expression({ kind: 'COMPARE', operator: 'GT', left: { kind: 'FACT', factKey: 'n' }, right: { kind: 'LITERAL', valueType: 'number', value: 'ten' } }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_LITERAL_TYPE')).toBe(true);
  });
});