import type { EvaluatorFactMap, EvaluatorFactValue } from './evaluator';

export type FactScopeType = 'COMPANY' | 'WORKPLACE_SITE' | 'EMPLOYEE' | 'EVENT' | 'SALES_CHANNEL' | 'PRODUCT_SERVICE' | 'CONTRACT' | 'TAX_PERIOD' | 'TRANSACTION' | 'REPORTING_EVENT';
export type FactTemporalPolicy = 'VALIDITY_INTERVAL' | 'OBSERVATION' | 'EFFECTIVE_INSTANT' | 'REFERENCE_PERIOD' | 'EVENT';

export interface EvaluationScope {
  scopeType: FactScopeType;
  factSubjectId?: string;
  evaluationAt: Date;
  referencePeriod?: { start: Date; end: Date };
}

export interface FactDefinitionForSelection {
  id: string;
  key: string;
  valueType: string;
  status: string;
  allowedScopeTypes: readonly string[];
  temporalPolicy: string;
}

export interface ClientFactForSelection {
  id: string;
  factDefinitionId: string | null;
  scopeType: string | null;
  factSubjectId: string | null;
  validFrom: Date;
  validTo: Date | null;
  booleanValue: boolean | null;
  numberValue: unknown;
  stringValue: string | null;
  dateValue: Date | null;
  observedAt: Date | null;
  effectiveAt: Date | null;
  referencePeriodStart: Date | null;
  referencePeriodEnd: Date | null;
  supersededAt: Date | null;
}

export interface FactSubjectForSelection {
  id: string;
  clientId: string;
  scopeType: string;
  startsAt: Date | null;
  endsAt: Date | null;
  archivedAt: Date | null;
}

export interface FactSelectionResult {
  factMap: EvaluatorFactMap;
  selectedClientFactIds: string[];
  missingFactKeys: string[];
  reasonCodes: string[];
  warningCodes: string[];
}

function canonicalDate(value: Date): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

function normalizeValue(definition: FactDefinitionForSelection, fact: ClientFactForSelection): EvaluatorFactValue | null {
  switch (definition.valueType) {
    case 'BOOLEAN': return typeof fact.booleanValue === 'boolean' ? { type: 'boolean', value: fact.booleanValue } : null;
    case 'NUMBER': {
      const value = typeof fact.numberValue === 'number' ? fact.numberValue : Number(String(fact.numberValue));
      return Number.isFinite(value) ? { type: 'number', value } : null;
    }
    case 'DATE': {
      const value = fact.dateValue ? canonicalDate(fact.dateValue) : null;
      return value ? { type: 'date', value } : null;
    }
    case 'STRING': return typeof fact.stringValue === 'string' ? { type: 'string', value: fact.stringValue } : null;
    default: return null;
  }
}

function eligibleAt(fact: ClientFactForSelection, definition: FactDefinitionForSelection, scope: EvaluationScope): boolean {
  const at = scope.evaluationAt;
  if (fact.supersededAt !== null) return false;
  if (fact.validFrom > at || (fact.validTo !== null && at >= fact.validTo)) return false;
  switch (definition.temporalPolicy) {
    case 'VALIDITY_INTERVAL': return true;
    case 'OBSERVATION': return fact.observedAt !== null && fact.observedAt <= at;
    case 'EFFECTIVE_INSTANT': return fact.effectiveAt !== null && fact.effectiveAt <= at;
    case 'REFERENCE_PERIOD':
      return scope.referencePeriod !== undefined && fact.referencePeriodStart !== null
        && fact.referencePeriodStart <= scope.referencePeriod.start
        && (fact.referencePeriodEnd === null || fact.referencePeriodEnd >= scope.referencePeriod.end);
    case 'EVENT': return false;
    default: return false;
  }
}

function sameValue(left: EvaluatorFactValue, right: EvaluatorFactValue): boolean {
  return left.type === right.type && left.value === right.value;
}

export function selectFacts(input: {
  clientId: string;
  scope: EvaluationScope;
  dependencies: ReadonlyArray<{ factKey: string; definition: FactDefinitionForSelection | null; facts: ClientFactForSelection[] }>;
  subject: FactSubjectForSelection | null;
}): FactSelectionResult {
  const factMap: Record<string, EvaluatorFactValue> = {};
  const selectedClientFactIds: string[] = [];
  const missingFactKeys: string[] = [];
  const reasonCodes: string[] = [];
  const warningCodes: string[] = [];

  for (const dependency of [...input.dependencies].sort((a, b) => a.factKey.localeCompare(b.factKey))) {
    const definition = dependency.definition;
    if (!definition) {
      missingFactKeys.push(dependency.factKey);
      reasonCodes.push('UNRESOLVED_FACT_DEPENDENCY');
      continue;
    }
    if (definition.status === 'RETIRED') {
      reasonCodes.push('FACT_DEFINITION_RETIRED');
      continue;
    }
    if (definition.status === 'DEPRECATED') warningCodes.push('DEPRECATED_FACT_DEFINITION_USED');
    if (!definition.allowedScopeTypes.includes(input.scope.scopeType)) {
      missingFactKeys.push(dependency.factKey);
      reasonCodes.push('FACT_SCOPE_MISMATCH');
      continue;
    }
    if (input.scope.scopeType === 'COMPANY') {
      if (input.scope.factSubjectId !== undefined) {
        missingFactKeys.push(dependency.factKey);
        reasonCodes.push('FACT_SCOPE_MISMATCH');
        continue;
      }
    } else if (!input.scope.factSubjectId || !input.subject || input.subject.clientId !== input.clientId
      || input.subject.scopeType !== input.scope.scopeType || input.subject.archivedAt !== null
      || (input.subject.startsAt !== null && input.scope.evaluationAt < input.subject.startsAt)
      || (input.subject.endsAt !== null && input.scope.evaluationAt >= input.subject.endsAt)) {
      missingFactKeys.push(dependency.factKey);
      reasonCodes.push('FACT_SUBJECT_INELIGIBLE');
      continue;
    }
    if (definition.temporalPolicy === 'EVENT') {
      reasonCodes.push('UNSUPPORTED_TEMPORAL_POLICY_EVENT');
      continue;
    }
    if (!['BOOLEAN', 'NUMBER', 'DATE', 'STRING'].includes(definition.valueType)) {
      reasonCodes.push('UNSUPPORTED_FACT_TYPE');
      continue;
    }
    const eligible = dependency.facts.filter((fact) => fact.factDefinitionId === definition.id
      && fact.scopeType === input.scope.scopeType
      && (input.scope.scopeType === 'COMPANY' ? fact.factSubjectId === null : fact.factSubjectId === input.scope.factSubjectId)
      && eligibleAt(fact, definition, input.scope));
    if (eligible.length === 0) {
      missingFactKeys.push(dependency.factKey);
      reasonCodes.push('MISSING_FACT');
      continue;
    }
    const normalized = eligible.map((fact) => ({ fact, value: normalizeValue(definition, fact) }));
    if (normalized.some((item) => item.value === null)) {
      selectedClientFactIds.push(...eligible.map((fact) => fact.id));
      reasonCodes.push('MALFORMED_FACT_VALUE');
      continue;
    }
    const first = normalized[0].value!;
    if (normalized.some((item) => !sameValue(first, item.value!))) {
      selectedClientFactIds.push(...eligible.map((fact) => fact.id));
      reasonCodes.push('CONFLICTING_FACT_VALUES');
      continue;
    }
    factMap[dependency.factKey] = first;
    selectedClientFactIds.push(...eligible.map((fact) => fact.id));
  }

  return {
    factMap,
    selectedClientFactIds: [...new Set(selectedClientFactIds)].sort(),
    missingFactKeys: [...new Set(missingFactKeys)].sort(),
    reasonCodes: [...new Set(reasonCodes)].sort(),
    warningCodes: [...new Set(warningCodes)].sort(),
  };
}
