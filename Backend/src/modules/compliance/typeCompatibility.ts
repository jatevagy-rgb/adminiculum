/**
 * PHASE 6 — TYPE-COMPATIBILITY VALIDATION INTERFACE
 *
 * A PURE boundary that verifies a comparison node's operands are type
 * compatible given an abstract fact-definition map.
 *
 * It does NOT hardcode any Prisma model and does NOT read schema.prisma.
 * The caller supplies a `FactDefinitionMap` (see types.ts) describing the fact
 * value types. Unknown fact keys are handled deterministically as an error so
 * callers cannot silently compare against an undeclared fact.
 *
 * This pass is orthogonal to structural validation: it assumes the node is
 * already structurally valid (see ruleAstValidator.ts) and only checks type
 * compatibility of the COMPARE operands.
 */
import type { CompareNode } from './ruleAst';
import type { FactDefinitionMap, FactValueType } from './types';

export interface TypeCompatibilityError {
  path: string;
  code:
    | 'UNKNOWN_FACT'
    | 'CROSS_TYPE_FACT_FACT'
    | 'CROSS_TYPE_FACT_LITERAL'
    | 'UNSUPPORTED_OPERATOR_FOR_TYPE';
  message: string;
}

export interface TypeCompatibilityResult {
  compatible: boolean;
  errors: TypeCompatibilityError[];
}

function resolveFactType(factKey: string, facts: FactDefinitionMap): FactValueType | null {
  const definition = facts[factKey];
  if (!definition) return null;
  return definition.type;
}

const UNARY_NULL_OPERATORS = new Set(['IS_NULL', 'IS_NOT_NULL']);

/**
 * Verify type compatibility of a COMPARE node's operands.
 *
 * Rules:
 *   - FACT vs FACT: both facts must be declared and of the SAME value type.
 *   - FACT vs LITERAL: the literal's declared type must equal the fact's type.
 *   - date vs number is inherently rejected (different types).
 *   - IS_NULL / IS_NOT_NULL accept any fact type (no cross-type constraint).
 *   - An unknown (undeclared) fact key is a deterministic error.
 */
export function checkComparisonTypeCompatibility(
  node: CompareNode,
  facts: FactDefinitionMap,
): TypeCompatibilityResult {
  const errors: TypeCompatibilityError[] = [];

  const leftType = resolveFactType(node.left.factKey, facts);
  if (leftType === null) {
    errors.push({
      path: '$.left.factKey',
      code: 'UNKNOWN_FACT',
      message: `Fact "${node.left.factKey}" is not declared in the fact-definition map.`,
    });
    return { compatible: false, errors };
  }

  if (UNARY_NULL_OPERATORS.has(node.operator)) {
    return { compatible: true, errors };
  }

  if (node.right.kind === 'FACT') {
    const rightType = resolveFactType(node.right.factKey, facts);
    if (rightType === null) {
      errors.push({
        path: '$.right.factKey',
        code: 'UNKNOWN_FACT',
        message: `Fact "${node.right.factKey}" is not declared in the fact-definition map.`,
      });
      return { compatible: false, errors };
    }
    if (leftType !== rightType) {
      errors.push({
        path: '$.right',
        code: 'CROSS_TYPE_FACT_FACT',
        message: `Cannot compare fact "${node.left.factKey}" (${leftType}) to fact "${node.right.factKey}" (${rightType}).`,
      });
      return { compatible: false, errors };
    }
    return { compatible: true, errors };
  }

  // Literal operand: literal.valueType must match the left fact type.
  if (leftType !== node.right.valueType) {
    errors.push({
      path: '$.right.valueType',
      code: 'CROSS_TYPE_FACT_LITERAL',
      message: `Cannot compare fact "${node.left.factKey}" (${leftType}) to a ${node.right.valueType} literal.`,
    });
    return { compatible: false, errors };
  }

  return { compatible: true, errors };
}