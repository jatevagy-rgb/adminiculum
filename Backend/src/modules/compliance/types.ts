/**
 * PHASE 6 — COMPLIANCE ENGINE DETERMINISTIC FOUNDATION
 *
 * Shared application-domain typing for the frozen applicability outcomes and
 * the abstract fact-definition contract used for type-compatibility checks.
 *
 * This is DOMAIN typing only. It deliberately introduces NO database enums,
 * NO Prisma models, and NO persistence representation. The Codex/schema owner
 * decides how (or whether) any of this maps to storage later.
 */

// ---------------------------------------------------------------------------
// Frozen applicability outcomes
// ---------------------------------------------------------------------------
//
// These six outcomes are the CLOSED set of deterministic applicability results
// the compliance evaluation slice can emit. They are frozen for Phase 6.
export const APPLICABILITY_OUTCOMES = [
  'APPLIES',
  'DOES_NOT_APPLY',
  'INSUFFICIENT_FACTS',
  'LEGAL_REVIEW_REQUIRED',
  'TECHNICAL_REVIEW_REQUIRED',
  'SOURCE_SUPPORT_INSUFFICIENT',
] as const;

export type ApplicabilityOutcome = (typeof APPLICABILITY_OUTCOMES)[number];

export function isApplicabilityOutcome(value: unknown): value is ApplicabilityOutcome {
  return typeof value === 'string' && (APPLICABILITY_OUTCOMES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Abstract fact-definition contract (for type-compatibility validation)
// ---------------------------------------------------------------------------
//
// This is an abstract typed fact-definition interface. It is intentionally
// decoupled from the current Prisma model: later slices hand in a map derived
// from whatever schema owns fact definitions. The validator never reads
// schema.prisma and never hardcodes a concrete model.
export const FACT_VALUE_TYPES = ['boolean', 'number', 'date', 'string'] as const;

export type FactValueType = (typeof FACT_VALUE_TYPES)[number];

export function isFactValueType(value: unknown): value is FactValueType {
  return typeof value === 'string' && (FACT_VALUE_TYPES as readonly string[]).includes(value);
}

/** A single fact definition as declared by a later schema-backed slice. */
export interface FactDefinition {
  /** The value type the fact carries. */
  readonly type: FactValueType;
}

/**
 * A map of fact-key -> definition. Fact keys are stable string identifiers.
 * An unknown fact key (one absent from this map) is treated as undefined and
 * handled deterministically by the type-compatibility validator.
 */
export type FactDefinitionMap = Readonly<Record<string, FactDefinition>>;