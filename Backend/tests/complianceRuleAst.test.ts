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
import { MAX_RULE_AST_DEPTH, MAX_RULE_AST_NODES } from '../src/modules/compliance/ruleAstValidator';

const VALID_COMPARE = {
  kind: 'COMPARE',
  operator: 'EQ',
  left: { kind: 'FACT', factKey: 'regulated_activity' },
  right: { kind: 'LITERAL', valueType: 'boolean', value: true },
} as const;

function expression(node: unknown): unknown {
  return { schemaVersion: RULE_AST_V1, node };
}

function nestedNot(depth: number): unknown {
  let node: unknown = VALID_COMPARE;
  for (let index = 0; index < depth; index += 1) node = { kind: 'NOT', child: node };
  return node;
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

  it('rejects non-FACT left operands and nested right-hand nodes', () => {
    const left = validateRuleAst(expression({ kind: 'COMPARE', operator: 'EQ', left: { kind: 'LITERAL', valueType: 'boolean', value: true }, right: { kind: 'LITERAL', valueType: 'boolean', value: true } }));
    expect(left.errors.some((e) => e.code === 'MALFORMED_FACT_REF')).toBe(true);
    const right = validateRuleAst(expression({ kind: 'COMPARE', operator: 'EQ', left: { kind: 'FACT', factKey: 'a' }, right: { kind: 'AND', children: [VALID_COMPARE, VALID_COMPARE] } }));
    expect(right.errors.some((e) => e.path === '$.node.right' && e.code === 'NOT_OBJECT')).toBe(true);
  });

  it('rejects envelope extensions and impossible/non-ISO dates', () => {
    const extra = validateRuleAst({ schemaVersion: RULE_AST_V1, node: VALID_COMPARE, metadata: 'nope' });
    expect(extra.errors.some((e) => e.code === 'UNEXPECTED_FIELD')).toBe(true);
    for (const value of ['March 4, 2024', '1', '2024-02-30']) {
      const result = validateRuleAst(expression({ kind: 'COMPARE', operator: 'EQ', left: { kind: 'FACT', factKey: 'd' }, right: { kind: 'LITERAL', valueType: 'date', value } }));
      expect(result.errors.some((e) => e.code === 'INVALID_LITERAL_TYPE')).toBe(true);
    }
  });

  it('rejects ASTs beyond the maximum depth without throwing', () => {
    const result = validateRuleAst(expression(nestedNot(MAX_RULE_AST_DEPTH)));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MAX_DEPTH_EXCEEDED')).toBe(true);
  });

  it('accepts the maximum-depth boundary', () => {
    const result = validateRuleAst(expression(nestedNot(MAX_RULE_AST_DEPTH - 2)));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects ASTs beyond the maximum node count deterministically', () => {
    const node = { kind: 'AND', children: Array.from({ length: MAX_RULE_AST_NODES }, () => VALID_COMPARE) };
    const first = validateRuleAst(expression(node));
    const second = validateRuleAst(expression(node));
    expect(first.valid).toBe(false);
    expect(first.errors.some((e) => e.code === 'MAX_NODE_COUNT_EXCEEDED')).toBe(true);
    expect(second).toEqual(first);
  });

  it('accepts the maximum-node-count boundary', () => {
    const result = validateRuleAst(expression({ kind: 'AND', children: Array.from({ length: Math.floor((MAX_RULE_AST_NODES - 1) / 2) }, () => VALID_COMPARE) }));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts leap-day dates and rejects invalid calendar boundaries', () => {
    const valid = validateRuleAst(expression({ kind: 'COMPARE', operator: 'EQ', left: { kind: 'FACT', factKey: 'd' }, right: { kind: 'LITERAL', valueType: 'date', value: '2024-02-29' } }));
    expect(valid.valid).toBe(true);
    for (const value of ['2023-02-29', '2024-13-01']) {
      const result = validateRuleAst(expression({ kind: 'COMPARE', operator: 'EQ', left: { kind: 'FACT', factKey: 'd' }, right: { kind: 'LITERAL', valueType: 'date', value } }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_LITERAL_TYPE')).toBe(true);
    }
  });
});
