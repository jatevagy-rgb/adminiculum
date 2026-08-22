import { evaluateRule, type EvaluatorFactMap } from '../src/modules/compliance/evaluator';
import { RULE_AST_V1, type RuleExpression, type RuleNode } from '../src/modules/compliance/ruleAst';

const fact = (factKey: string) => ({ kind: 'FACT' as const, factKey });
const literal = (valueType: 'boolean' | 'number' | 'date' | 'string', value: boolean | number | string | null) => ({ kind: 'LITERAL' as const, valueType, value });
const compare = (operator: string, factKey: string, right: ReturnType<typeof literal> | ReturnType<typeof fact>): RuleNode => ({ kind: 'COMPARE', operator, left: fact(factKey), right } as RuleNode);
const expression = (node: RuleNode): RuleExpression => ({ schemaVersion: RULE_AST_V1, node });
const boolRule = (operator: string = 'EQ') => expression(compare(operator, 'enabled', literal('boolean', true)));
const result = (node: RuleNode, facts: EvaluatorFactMap) => evaluateRule(expression(node), facts);

describe('phase6 slice C1 pure deterministic evaluator', () => {
  it('evaluates boolean equality and inequality', () => {
    expect(evaluateRule(boolRule(), { enabled: { type: 'boolean', value: true } }).result).toBe('APPLIES');
    expect(evaluateRule(boolRule(), { enabled: { type: 'boolean', value: false } }).result).toBe('DOES_NOT_APPLY');
  });

  it('preserves missing facts as UNKNOWN through NOT', () => {
    const evaluated = evaluateRule(expression({ kind: 'NOT', child: compare('EQ', 'enabled', literal('boolean', true)) }), {});
    expect(evaluated.result).toBe('INSUFFICIENT_FACTS');
    expect(evaluated.missingFactKeys).toEqual(['enabled']);
  });

  it('implements three-valued AND and OR', () => {
    const unknown = compare('EQ', 'missing', literal('boolean', true));
    const falseNode = compare('EQ', 'enabled', literal('boolean', true));
    const trueNode = compare('EQ', 'enabled', literal('boolean', true));
    expect(result({ kind: 'AND', children: [trueNode, unknown] }, { enabled: { type: 'boolean', value: true } }).result).toBe('INSUFFICIENT_FACTS');
    expect(result({ kind: 'AND', children: [falseNode, unknown] }, { enabled: { type: 'boolean', value: false } }).result).toBe('DOES_NOT_APPLY');
    expect(result({ kind: 'OR', children: [trueNode, unknown] }, { enabled: { type: 'boolean', value: true } }).result).toBe('APPLIES');
    expect(result({ kind: 'OR', children: [falseNode, unknown] }, { enabled: { type: 'boolean', value: false } }).result).toBe('INSUFFICIENT_FACTS');
  });

  it('handles null checks separately from missing and concrete values', () => {
    const isNull = expression(compare('IS_NULL', 'value', literal('string', null)));
    const isNotNull = expression(compare('IS_NOT_NULL', 'value', literal('string', null)));
    expect(evaluateRule(isNull, { value: null }).result).toBe('APPLIES');
    expect(evaluateRule(isNotNull, { value: null }).result).toBe('DOES_NOT_APPLY');
    expect(evaluateRule(isNull, { value: { type: 'string', value: 'x' } }).result).toBe('DOES_NOT_APPLY');
    expect(evaluateRule(isNull, {}).result).toBe('INSUFFICIENT_FACTS');
  });

  it('supports all numeric relational operators and exact boundaries', () => {
    const facts = { n: { type: 'number' as const, value: 10 } };
    expect(result(compare('EQ', 'n', literal('number', 10)), facts).result).toBe('APPLIES');
    expect(result(compare('NEQ', 'n', literal('number', 11)), facts).result).toBe('APPLIES');
    expect(result(compare('GT', 'n', literal('number', 9)), facts).result).toBe('APPLIES');
    expect(result(compare('GTE', 'n', literal('number', 10)), facts).result).toBe('APPLIES');
    expect(result(compare('LT', 'n', literal('number', 11)), facts).result).toBe('APPLIES');
    expect(result(compare('LTE', 'n', literal('number', 10)), facts).result).toBe('APPLIES');
    expect(result(compare('EQ', 'n', literal('number', -0)), { n: { type: 'number', value: 0 } }).result).toBe('APPLIES');
  });

  it('compares canonical dates lexicographically', () => {
    const facts = { d: { type: 'date' as const, value: '2024-02-29' } };
    expect(result(compare('EQ', 'd', literal('date', '2024-02-29')), facts).result).toBe('APPLIES');
    expect(result(compare('GT', 'd', literal('date', '2023-12-31')), facts).result).toBe('APPLIES');
    expect(result(compare('LT', 'd', literal('date', '2024-03-01')), facts).result).toBe('APPLIES');
    expect(evaluateRule(expression(compare('EQ', 'd', literal('date', '2024-02-29'))), { d: { type: 'date', value: '2024-02-30' } } as never).result).toBe('INSUFFICIENT_FACTS');
  });

  it('uses case-sensitive literal string containment, including empty strings', () => {
    const facts = { s: { type: 'string' as const, value: 'Adminiculum' } };
    expect(result(compare('EQ', 's', literal('string', 'Adminiculum')), facts).result).toBe('APPLIES');
    expect(result(compare('CONTAINS', 's', literal('string', 'min')), facts).result).toBe('APPLIES');
    expect(result(compare('CONTAINS', 's', literal('string', 'MIN')), facts).result).toBe('DOES_NOT_APPLY');
    expect(result(compare('NOT_CONTAINS', 's', literal('string', 'MIN')), facts).result).toBe('APPLIES');
    expect(result(compare('CONTAINS', 's', literal('string', '')), facts).result).toBe('APPLIES');
  });

  it('supports fact-to-fact comparisons and reports missing/type mismatch safely', () => {
    const same = compare('EQ', 'left', fact('right'));
    expect(result(same, { left: { type: 'number', value: 2 }, right: { type: 'number', value: 2 } }).result).toBe('APPLIES');
    expect(result(same, { left: { type: 'number', value: 2 }, right: { type: 'number', value: 3 } }).result).toBe('DOES_NOT_APPLY');
    expect(result(same, { left: { type: 'number', value: 2 } }).result).toBe('INSUFFICIENT_FACTS');
    expect(result(same, { left: { type: 'number', value: 2 }, right: { type: 'string', value: '2' } }).result).toBe('INSUFFICIENT_FACTS');
    expect(result(compare('EQ', 'left', literal('number', null)), { left: { type: 'number', value: 2 } }).errors[0].code).toBe('INVALID_FACT_VALUE');
  });

  it('evaluates nested trees without side effects', () => {
    const node: RuleNode = { kind: 'AND', children: [compare('EQ', 'a', literal('boolean', true)), { kind: 'NOT', child: compare('EQ', 'b', literal('boolean', false)) }] };
    const facts = { a: { type: 'boolean' as const, value: true }, b: { type: 'boolean' as const, value: true } };
    const first = result(node, facts);
    expect(first.result).toBe('APPLIES');
    expect(result(node, facts)).toEqual(first);
  });

  it('keeps trace keys unique and sorted regardless of fact-map insertion order', () => {
    const node: RuleNode = { kind: 'AND', children: [compare('EQ', 'z', literal('boolean', true)), compare('EQ', 'a', literal('boolean', true)), compare('EQ', 'z', literal('boolean', true))] };
    const first = result(node, { z: { type: 'boolean', value: true }, a: { type: 'boolean', value: true } });
    const second = result(node, { a: { type: 'boolean', value: true }, z: { type: 'boolean', value: true } });
    expect(first).toEqual(second);
    expect(first.evaluatedFactKeys).toEqual(['a', 'z']);
  });

  it('accepts a valid AST at the resource boundary', () => {
    let node: RuleNode = compare('EQ', 'enabled', literal('boolean', true));
    for (let index = 0; index < 30; index += 1) node = { kind: 'NOT', child: node };
    expect(evaluateRule(expression(node), { enabled: { type: 'boolean', value: true } }).errors).toEqual([]);
  });

  it('fails malformed normalized facts and malformed ASTs cleanly', () => {
    const malformedFacts = { value: { type: 'number', value: Number.NaN } } as never;
    expect(() => evaluateRule(expression(compare('EQ', 'value', literal('number', 1))), malformedFacts)).not.toThrow();
    expect(evaluateRule(expression(compare('EQ', 'value', literal('number', 1))), malformedFacts).result).toBe('INSUFFICIENT_FACTS');
    expect(() => evaluateRule({ schemaVersion: RULE_AST_V1, node: { kind: 'EVAL' } }, {})).not.toThrow();
    expect(evaluateRule({ schemaVersion: RULE_AST_V1, node: { kind: 'EVAL' } }, {}).result).toBe('INSUFFICIENT_FACTS');
  });
});
