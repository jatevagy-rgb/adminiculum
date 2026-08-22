/**
 * PHASE 6 — RULE AST v1 (frozen, closed, deterministic)
 *
 * The rule engine's input is a closed deterministic AST. This contract is
 * FROZEN for Phase 6. It intentionally does NOT allow:
 *
 *   - arbitrary JavaScript / code
 *   - SQL
 *   - eval / Function constructors
 *   - executable string expressions
 *   - function bodies / callbacks
 *   - prompt / AI nodes
 *
 * Only the node kinds and operators declared below are valid. There is no
 * escape hatch: an input containing any unrecognized node kind, operator, or
 * unexpected field is structurally invalid and MUST be rejected.
 *
 * The AST is schema-versioned so that later slices can evolve it explicitly
 * without silently changing semantics for persisted snapshots.
 */
import type { FactValueType } from './types';

/** Explicit schema version for the rule AST. v1 is the frozen Phase 6 shape. */
export const RULE_AST_V1 = 'rule-ast/v1' as const;

export type RuleSchemaVersion = typeof RULE_AST_V1;

export function isRuleSchemaVersion(value: unknown): value is RuleSchemaVersion {
  return value === RULE_AST_V1;
}

// ---------------------------------------------------------------------------
// Closed operator set
// ---------------------------------------------------------------------------
export const COMPARISON_OPERATORS = [
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
] as const;

export type ComparisonOperator = (typeof COMPARISON_OPERATORS)[number];

export function isComparisonOperator(value: unknown): value is ComparisonOperator {
  return typeof value === 'string' && (COMPARISON_OPERATORS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Node kinds (closed set)
// ---------------------------------------------------------------------------
export const RULE_NODE_KINDS = ['AND', 'OR', 'NOT', 'COMPARE'] as const;

export type RuleNodeKind = (typeof RULE_NODE_KINDS)[number];

export function isRuleNodeKind(value: unknown): value is RuleNodeKind {
  return typeof value === 'string' && (RULE_NODE_KINDS as readonly string[]).includes(value);
}

/** All node kinds including operand kinds (FACT / LITERAL). */
export const ALL_RULE_NODE_KINDS = [...RULE_NODE_KINDS, 'FACT', 'LITERAL'] as const;

export type AllRuleNodeKind = (typeof ALL_RULE_NODE_KINDS)[number];

// ---------------------------------------------------------------------------
// Operand nodes
// ---------------------------------------------------------------------------

/** Reference to a fact by its stable string key. */
export interface FactRefNode {
  kind: 'FACT';
  /** Non-empty stable fact key. */
  factKey: string;
}

/** A literal value with an explicit type. No free-form expressions. */
export interface LiteralNode {
  kind: 'LITERAL';
  valueType: FactValueType;
  value: boolean | number | string | null;
}

// ---------------------------------------------------------------------------
// Logic nodes
// ---------------------------------------------------------------------------

/** N-ary logical AND/OR. Requires >= 2 children. */
export interface LogicalNode {
  kind: 'AND' | 'OR';
  children: RuleNode[];
}

/** Unary logical NOT. Requires exactly 1 child. */
export interface NotNode {
  kind: 'NOT';
  child: RuleNode;
}

// ---------------------------------------------------------------------------
// Comparison node
// ---------------------------------------------------------------------------

/**
 * Binary comparison of a FACT against either a LITERAL or another FACT.
 * `IS_NULL` / `IS_NOT_NULL` are unary in intent but are represented with the
 * same shape: the left operand is the fact, the right operand is ignored by
 * the structural validator (present but must still be a valid operand node)
 * so the shape stays uniform and deterministic.
 */
export interface CompareNode {
  kind: 'COMPARE';
  operator: ComparisonOperator;
  left: FactRefNode;
  right: FactRefNode | LiteralNode;
}

// ---------------------------------------------------------------------------
// Root union + rule expression envelope
// ---------------------------------------------------------------------------

export type RuleNode = LogicalNode | NotNode | CompareNode | FactRefNode | LiteralNode;

/** A top-level rule. Every rule carries the explicit schema version. */
export interface RuleExpression {
  schemaVersion: RuleSchemaVersion;
  node: RuleNode;
}