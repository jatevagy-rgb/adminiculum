/**
 * PHASE 6 SLICE C1 - PURE DETERMINISTIC RULE EVALUATOR
 *
 * This module evaluates the frozen Rule AST against an already-normalized fact
 * map. It deliberately has no persistence, clock, environment, or I/O access.
 */
import type { CompareNode, FactRefNode, LiteralNode, RuleExpression, RuleNode } from './ruleAst';
import { validateRuleAst } from './ruleAstValidator';
import type { ApplicabilityOutcome, FactValueType } from './types';

export type EvaluatorFactValue =
  | { readonly type: 'boolean'; readonly value: boolean }
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'date'; readonly value: string }
  | { readonly type: 'string'; readonly value: string };

export type EvaluatorFactMap = Readonly<Record<string, EvaluatorFactValue | null | undefined>>;

export type EvaluatorErrorCode =
  | 'INVALID_FACT_VALUE'
  | 'FACT_TYPE_MISMATCH'
  | 'UNSUPPORTED_RUNTIME_CONDITION'
  | 'INVALID_AST';

export interface EvaluatorError {
  readonly code: EvaluatorErrorCode;
  readonly factKey?: string;
  readonly path?: string;
  readonly message: string;
}

export interface EvaluatorTrace {
  readonly result: Extract<ApplicabilityOutcome, 'APPLIES' | 'DOES_NOT_APPLY' | 'INSUFFICIENT_FACTS'>;
  readonly missingFactKeys: string[];
  readonly evaluatedFactKeys: string[];
  readonly errors: EvaluatorError[];
}

export type EvaluatorResult = EvaluatorTrace;

type Truth = 'TRUE' | 'FALSE' | 'UNKNOWN' | 'INVALID';
interface InternalResult {
  truth: Truth;
  errors: EvaluatorError[];
}
interface EvaluationContext {
  readonly facts: EvaluatorFactMap;
  readonly missingFactKeys: Set<string>;
  readonly evaluatedFactKeys: Set<string>;
  readonly errors: EvaluatorError[];
}

function error(code: EvaluatorErrorCode, message: string, factKey?: string, path?: string): EvaluatorError {
  return { code, message, ...(factKey === undefined ? {} : { factKey }), ...(path === undefined ? {} : { path }) };
}

function isCanonicalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isFactValueType(value: unknown): value is FactValueType {
  return value === 'boolean' || value === 'number' || value === 'date' || value === 'string';
}

function isValidFactValue(value: unknown): value is EvaluatorFactValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as { type?: unknown; value?: unknown };
  if (!isFactValueType(candidate.type)) return false;
  if (candidate.type === 'boolean') return typeof candidate.value === 'boolean';
  if (candidate.type === 'number') return typeof candidate.value === 'number' && Number.isFinite(candidate.value);
  if (candidate.type === 'date') return typeof candidate.value === 'string' && isCanonicalDate(candidate.value);
  return typeof candidate.value === 'string';
}

function addError(context: EvaluationContext, item: EvaluatorError): InternalResult {
  context.errors.push(item);
  return { truth: 'INVALID', errors: [item] };
}

function readFact(ref: FactRefNode, context: EvaluationContext): { kind: 'MISSING' } | { kind: 'NULL' } | { kind: 'VALUE'; value: EvaluatorFactValue } | { kind: 'INVALID' } {
  const key = ref.factKey;
  context.evaluatedFactKeys.add(key);
  if (!(key in context.facts) || context.facts[key] === undefined) {
    context.missingFactKeys.add(key);
    return { kind: 'MISSING' };
  }
  const value = context.facts[key];
  if (value === null) return { kind: 'NULL' };
  if (!isValidFactValue(value)) {
    addError(context, error('INVALID_FACT_VALUE', `Fact "${key}" is not a valid normalized fact value.`, key));
    return { kind: 'INVALID' };
  }
  return { kind: 'VALUE', value };
}

function combineLogical(kind: 'AND' | 'OR', children: InternalResult[]): InternalResult {
  if (children.some((child) => child.truth === 'INVALID')) return { truth: 'INVALID', errors: children.flatMap((child) => child.errors) };
  if (kind === 'AND') {
    if (children.some((child) => child.truth === 'FALSE')) return { truth: 'FALSE', errors: [] };
    if (children.some((child) => child.truth === 'UNKNOWN')) return { truth: 'UNKNOWN', errors: [] };
    return { truth: 'TRUE', errors: [] };
  }
  if (children.some((child) => child.truth === 'TRUE')) return { truth: 'TRUE', errors: [] };
  if (children.some((child) => child.truth === 'UNKNOWN')) return { truth: 'UNKNOWN', errors: [] };
  return { truth: 'FALSE', errors: [] };
}

function compareValues(operator: CompareNode['operator'], left: EvaluatorFactValue, right: EvaluatorFactValue | LiteralNode): Truth {
  const rightType = 'type' in right ? right.type : right.valueType;
  const rightValue = right.value;
  if (left.type !== rightType || rightValue === null) return 'INVALID';
  if (operator === 'EQ') return left.value === rightValue ? 'TRUE' : 'FALSE';
  if (operator === 'NEQ') return left.value !== rightValue ? 'TRUE' : 'FALSE';
  if (left.type === 'number' || left.type === 'date') {
    if (operator === 'GT') return left.value > rightValue ? 'TRUE' : 'FALSE';
    if (operator === 'GTE') return left.value >= rightValue ? 'TRUE' : 'FALSE';
    if (operator === 'LT') return left.value < rightValue ? 'TRUE' : 'FALSE';
    if (operator === 'LTE') return left.value <= rightValue ? 'TRUE' : 'FALSE';
  }
  if (left.type === 'string') {
    if (operator === 'CONTAINS') return left.value.includes(rightValue as string) ? 'TRUE' : 'FALSE';
    if (operator === 'NOT_CONTAINS') return left.value.includes(rightValue as string) ? 'FALSE' : 'TRUE';
  }
  return 'INVALID';
}

function evaluateCompare(node: CompareNode, context: EvaluationContext): InternalResult {
  const left = readFact(node.left, context);
  if (node.operator === 'IS_NULL' || node.operator === 'IS_NOT_NULL') {
    if (node.right.kind !== 'LITERAL' || node.right.value !== null) return addError(context, error('UNSUPPORTED_RUNTIME_CONDITION', 'Null checks require a null literal right operand.'));
    if (left.kind === 'MISSING') return { truth: 'UNKNOWN', errors: [] };
    if (left.kind === 'INVALID') return { truth: 'INVALID', errors: [] };
    const isNull = left.kind === 'NULL';
    return { truth: node.operator === 'IS_NULL' ? (isNull ? 'TRUE' : 'FALSE') : (isNull ? 'FALSE' : 'TRUE'), errors: [] };
  }
  if (left.kind === 'MISSING') return { truth: 'UNKNOWN', errors: [] };
  if (left.kind === 'INVALID' || left.kind === 'NULL') {
    return left.kind === 'NULL' ? addError(context, error('INVALID_FACT_VALUE', 'Explicit null may only be used with IS_NULL or IS_NOT_NULL.', node.left.factKey)) : { truth: 'INVALID', errors: [] };
  }
  let right: EvaluatorFactValue | LiteralNode;
  if (node.right.kind === 'FACT') {
    const resolved = readFact(node.right, context);
    if (resolved.kind === 'MISSING') return { truth: 'UNKNOWN', errors: [] };
    if (resolved.kind === 'NULL') return addError(context, error('INVALID_FACT_VALUE', 'Explicit null may only be used with IS_NULL or IS_NOT_NULL.', node.right.factKey));
    if (resolved.kind === 'INVALID') return { truth: 'INVALID', errors: [] };
    right = resolved.value;
  } else {
    right = node.right;
    if (!isFactValueType(right.valueType) || (right.value !== null && !isValidFactValue({ type: right.valueType, value: right.value }))) {
      return addError(context, error('INVALID_AST', 'Comparison literal is not valid for its declared type.'));
    }
    if (right.value === null) return addError(context, error('INVALID_FACT_VALUE', 'Explicit null may only be used with IS_NULL or IS_NOT_NULL.', node.left.factKey));
  }
  const truth = compareValues(node.operator, left.value, right);
  return truth === 'INVALID' ? addError(context, error('FACT_TYPE_MISMATCH', 'Comparison operands have incompatible types.')) : { truth, errors: [] };
}

function evaluateNode(node: RuleNode, context: EvaluationContext): InternalResult {
  switch (node.kind) {
    case 'COMPARE': return evaluateCompare(node, context);
    case 'NOT': {
      const child = evaluateNode(node.child, context);
      if (child.truth === 'TRUE') return { truth: 'FALSE', errors: child.errors };
      if (child.truth === 'FALSE') return { truth: 'TRUE', errors: child.errors };
      return child;
    }
    case 'AND': return combineLogical('AND', node.children.map((child) => evaluateNode(child, context)));
    case 'OR': return combineLogical('OR', node.children.map((child) => evaluateNode(child, context)));
    default: return addError(context, error('INVALID_AST', 'Only comparison and logical nodes can be evaluated.'));
  }
}

export function evaluateRule(ast: unknown, facts: EvaluatorFactMap): EvaluatorResult {
  const context: EvaluationContext = { facts: facts ?? {}, missingFactKeys: new Set(), evaluatedFactKeys: new Set(), errors: [] };
  const validation = validateRuleAst(ast);
  let truth: Truth = 'INVALID';
  if (!validation.valid) {
    for (const validationError of validation.errors) context.errors.push(error('INVALID_AST', validationError.message, undefined, validationError.path));
  } else if (facts === null || typeof facts !== 'object' || Array.isArray(facts)) {
    context.errors.push(error('INVALID_FACT_VALUE', 'Fact map must be a plain object.'));
  } else {
    truth = evaluateNode((ast as RuleExpression).node, context).truth;
  }
  const result = truth === 'TRUE' ? 'APPLIES' : truth === 'FALSE' ? 'DOES_NOT_APPLY' : 'INSUFFICIENT_FACTS';
  return {
    result,
    missingFactKeys: [...context.missingFactKeys].sort(),
    evaluatedFactKeys: [...context.evaluatedFactKeys].sort(),
    errors: context.errors,
  };
}
