/**
 * PHASE 6 — RULE AST v1 STRUCTURAL VALIDATOR
 *
 * A PURE structural/type validator. It:
 *
 *   - never queries the database;
 *   - never reads schema.prisma;
 *   - never decides legal applicability;
 *
 * It only proves that an unknown input is a structurally valid, schema-versioned
 * Rule AST v1 with a closed node/operator set and no escape hatches.
 *
 * Strict shape: every node kind has an exact allowed key set. Any unexpected
 * field is rejected so that executable/string-expression escape hatches or
 * arbitrary metadata cannot sneak in.
 */
import {
  ALL_RULE_NODE_KINDS,
  COMPARISON_OPERATORS,
  isComparisonOperator,
  isRuleSchemaVersion,
  RULE_AST_V1,
  type AllRuleNodeKind,
  type ComparisonOperator,
  type RuleNode,
} from './ruleAst';
import { isFactValueType } from './types';

export interface RuleAstError {
  /** JSONPath-like location, e.g. `node.children[0].operator`. */
  path: string;
  code:
    | 'NOT_OBJECT'
    | 'UNSUPPORTED_SCHEMA_VERSION'
    | 'UNKNOWN_NODE_TYPE'
    | 'UNKNOWN_OPERATOR'
    | 'MISSING_REQUIRED_FIELD'
    | 'UNEXPECTED_FIELD'
    | 'MALFORMED_FACT_REF'
    | 'INVALID_CHILD_COUNT'
    | 'INVALID_LITERAL_TYPE'
    | 'NOT_A_RULE_EXPRESSION';
  message: string;
}

export interface RuleAstValidationResult {
  valid: boolean;
  errors: RuleAstError[];
}

function error(path: string, code: RuleAstError['code'], message: string): RuleAstError {
  return { path, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Exact allowed keys per node kind (strict shape). */
const ALLOWED_KEYS: Record<AllRuleNodeKind, readonly string[]> = {
  AND: ['kind', 'children'],
  OR: ['kind', 'children'],
  NOT: ['kind', 'child'],
  COMPARE: ['kind', 'operator', 'left', 'right'],
  FACT: ['kind', 'factKey'],
  LITERAL: ['kind', 'valueType', 'value'],
};

function checkAllowedKeys(node: Record<string, unknown>, kind: AllRuleNodeKind, path: string, errors: RuleAstError[]): void {
  const allowed = ALLOWED_KEYS[kind];
  for (const key of Object.keys(node)) {
    if (!allowed.includes(key)) {
      errors.push(error(`${path}.${key}`, 'UNEXPECTED_FIELD', `Unexpected field "${key}" on node kind "${kind}".`));
    }
  }
}

function validateFactRef(node: Record<string, unknown>, path: string, errors: RuleAstError[]): void {
  checkAllowedKeys(node, 'FACT', path, errors);
  const key = node.factKey;
  if (typeof key !== 'string' || key.trim().length === 0) {
    errors.push(error(`${path}.factKey`, 'MALFORMED_FACT_REF', 'Fact reference requires a non-empty string factKey.'));
  }
}

function validateLiteral(node: Record<string, unknown>, path: string, errors: RuleAstError[]): void {
  checkAllowedKeys(node, 'LITERAL', path, errors);
  const valueType = node.valueType;
  if (!isFactValueType(valueType)) {
    errors.push(error(`${path}.valueType`, 'INVALID_LITERAL_TYPE', 'Literal valueType must be one of boolean|number|date|string.'));
    return;
  }
  const value = node.value;
  // A null literal is structurally valid (used by IS_NULL / IS_NOT_NULL).
  // When non-null, the value must match the declared valueType.
  if (value === null) return;
  if (valueType === 'boolean') {
    if (typeof value !== 'boolean') errors.push(error(`${path}.value`, 'INVALID_LITERAL_TYPE', 'boolean literal must be a boolean.'));
  } else if (valueType === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) errors.push(error(`${path}.value`, 'INVALID_LITERAL_TYPE', 'number literal must be a finite number.'));
  } else if (valueType === 'date') {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) errors.push(error(`${path}.value`, 'INVALID_LITERAL_TYPE', 'date literal must be an ISO date string.'));
  } else if (valueType === 'string') {
    if (typeof value !== 'string') errors.push(error(`${path}.value`, 'INVALID_LITERAL_TYPE', 'string literal must be a string.'));
  }
}

function validateOperand(node: unknown, path: string, errors: RuleAstError[]): void {
  if (!isRecord(node)) {
    errors.push(error(path, 'NOT_OBJECT', 'Operand must be an object.'));
    return;
  }
  const kind = node.kind;
  if (!isKnownNodeKind(kind)) {
    errors.push(error(`${path}.kind`, 'UNKNOWN_NODE_TYPE', `Unknown node kind: ${String(kind)}.`));
    return;
  }
  validateNode(node as unknown as RuleNode, path, errors);
}

function isKnownNodeKind(value: unknown): value is AllRuleNodeKind {
  return typeof value === 'string' && (ALL_RULE_NODE_KINDS as readonly string[]).includes(value);
}

function validateNode(node: unknown, path: string, errors: RuleAstError[]): void {
  if (!isRecord(node)) {
    errors.push(error(path, 'NOT_OBJECT', 'Node must be an object.'));
    return;
  }
  const kind = node.kind;
  if (!isKnownNodeKind(kind)) {
    errors.push(error(`${path}.kind`, 'UNKNOWN_NODE_TYPE', `Unknown node kind: ${String(kind)}.`));
    return;
  }

  checkAllowedKeys(node, kind, path, errors);

  switch (kind) {
    case 'FACT': {
      validateFactRef(node, path, errors);
      break;
    }
    case 'LITERAL': {
      validateLiteral(node, path, errors);
      break;
    }
    case 'AND':
    case 'OR': {
      if (!Array.isArray(node.children)) {
        errors.push(error(`${path}.children`, 'MISSING_REQUIRED_FIELD', `${kind} requires a children array.`));
        break;
      }
      if (node.children.length < 2) {
        errors.push(error(`${path}.children`, 'INVALID_CHILD_COUNT', `${kind} requires at least 2 children, got ${node.children.length}.`));
      }
      node.children.forEach((child, i) => validateNode(child, `${path}.children[${i}]`, errors));
      break;
    }
    case 'NOT': {
      if (!('child' in node)) {
        errors.push(error(`${path}.child`, 'MISSING_REQUIRED_FIELD', 'NOT requires a child.'));
        break;
      }
      validateNode(node.child, `${path}.child`, errors);
      break;
    }
    case 'COMPARE': {
      if (!isComparisonOperator(node.operator)) {
        errors.push(error(`${path}.operator`, 'UNKNOWN_OPERATOR', `Unknown comparison operator: ${String(node.operator)}.`));
      }
      if (!('left' in node)) {
        errors.push(error(`${path}.left`, 'MISSING_REQUIRED_FIELD', 'COMPARE requires a left operand.'));
        break;
      }
      if (!('right' in node)) {
        errors.push(error(`${path}.right`, 'MISSING_REQUIRED_FIELD', 'COMPARE requires a right operand.'));
        break;
      }
      validateFactRef(node.left as Record<string, unknown>, `${path}.left`, errors);
      // The right operand may be a FACT reference or a LITERAL. Its shape is
      // validated generically; type-compatibility is a separate pass.
      validateOperand(node.right, `${path}.right`, errors);
      break;
    }
  }
}

/**
 * Validate that an unknown input is a structurally valid Rule AST v1 expression.
 * Returns a deterministic result (never throws on malformed input).
 */
export function validateRuleAst(input: unknown): RuleAstValidationResult {
  const errors: RuleAstError[] = [];

  if (!isRecord(input)) {
    return { valid: false, errors: [error('$', 'NOT_A_RULE_EXPRESSION', 'Rule expression must be an object.')] };
  }

  if (input.schemaVersion !== RULE_AST_V1) {
    errors.push(
      error(
        '$.schemaVersion',
        'UNSUPPORTED_SCHEMA_VERSION',
        `Unsupported schema version: ${String(input.schemaVersion)}. Only "${RULE_AST_V1}" is accepted.`,
      ),
    );
  }

  if (!('node' in input)) {
    errors.push(error('$.node', 'MISSING_REQUIRED_FIELD', 'Rule expression requires a node.'));
  } else {
    validateNode(input.node, '$.node', errors);
  }

  return { valid: errors.length === 0, errors };
}

// Re-exported for convenience so consumers can assert operator membership
// against the same frozen set used by the validator.
export { COMPARISON_OPERATORS, isComparisonOperator, type ComparisonOperator, type RuleNode } from './ruleAst';