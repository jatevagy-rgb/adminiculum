import { canonicalDigest } from '../src/modules/compliance/canonicalDigest';
import { selectFacts, type ClientFactForSelection, type FactDefinitionForSelection } from '../src/modules/compliance/factSelection';
import { evaluateCompliance } from '../src/modules/compliance/complianceEvaluationService';

const at = new Date('2026-06-15T12:00:00.000Z');
const baseFact = (id: string, definition: string, changes: Partial<ClientFactForSelection> = {}): ClientFactForSelection => ({
  id, factDefinitionId: definition, scopeType: 'COMPANY', factSubjectId: null, validFrom: new Date('2026-01-01T00:00:00.000Z'), validTo: null,
  booleanValue: null, numberValue: null, stringValue: null, dateValue: null, observedAt: at, effectiveAt: at,
  referencePeriodStart: null, referencePeriodEnd: null, supersededAt: null, ...changes,
});
const definition = (id: string, key: string, valueType = 'BOOLEAN', temporalPolicy = 'OBSERVATION', status = 'ACTIVE'): FactDefinitionForSelection => ({ id, key, valueType, temporalPolicy, status, allowedScopeTypes: ['COMPANY'] });
const scope = { scopeType: 'COMPANY' as const, evaluationAt: at };

function run(def: FactDefinitionForSelection, facts: ClientFactForSelection[]) {
  return selectFacts({ clientId: 'client-a', scope, subject: null, dependencies: [{ factKey: def.key, definition: def, facts }] });
}

describe('Phase 6 C2 deterministic fact selection', () => {
  it('applies source gate precedence before fact loading or C1', async () => {
    const db = {
      requirementVersion: { findUnique: jest.fn().mockResolvedValue({ id: 'req-v', status: 'APPROVED', sourceSupportState: 'INCOMPLETE', specialistRequirement: 'NONE' }) },
      applicabilityRuleVersion: { findUnique: jest.fn().mockResolvedValue({ requirementVersionId: 'req-v', status: 'APPROVED', canonicalDigest: 'a'.repeat(64), astJson: {}, dependencies: [] }) },
      factSubject: { findUnique: jest.fn() },
      clientFact: { findMany: jest.fn() },
    } as any;
    const result = await evaluateCompliance({ requirementVersionId: 'req-v', ruleVersionId: 'rule-v', clientId: 'client-a', scope }, db);
    expect(result.outcome).toBe('SOURCE_SUPPORT_INSUFFICIENT');
  });
  it('accepts boolean, number, date and string normalization', () => {
    expect(run(definition('b', 'b'), [baseFact('b1', 'b', { booleanValue: true })]).factMap.b).toEqual({ type: 'boolean', value: true });
    expect(run(definition('n', 'n', 'NUMBER'), [baseFact('n1', 'n', { numberValue: '12.50' })]).factMap.n).toEqual({ type: 'number', value: 12.5 });
    expect(run(definition('d', 'd', 'DATE'), [baseFact('d1', 'd', { dateValue: new Date('2026-02-03T23:00:00Z') })]).factMap.d).toEqual({ type: 'date', value: '2026-02-03' });
    expect(run(definition('s', 's', 'STRING'), [baseFact('s1', 's', { stringValue: 'yes' })]).factMap.s).toEqual({ type: 'string', value: 'yes' });
  });

  it('returns consumed typed payload separately from the content-light selection result', () => {
    const result = run(definition('b', 'b'), [baseFact('b1', 'b', { booleanValue: true })]);
    expect(result.consumedFacts.b).toEqual({
      factDefinitionId: 'b', factKey: 'b', valueType: 'BOOLEAN', normalizedValue: true, clientFactIds: ['b1'],
    });
  });

  it('returns missing facts without legacy fallback and sorts trace IDs', () => {
    const result = run(definition('b', 'b'), [baseFact('z', 'b', { booleanValue: true }), baseFact('a', 'b', { booleanValue: true })]);
    expect(result.selectedClientFactIds).toEqual(['a', 'z']);
    expect(result.factMap.b).toEqual({ type: 'boolean', value: true });
    expect(run(definition('m', 'm'), []).reasonCodes).toContain('MISSING_FACT');
  });

  it('fails closed for conflicting, malformed, unsupported, retired and EVENT facts', () => {
    expect(run(definition('b', 'b'), [baseFact('1', 'b', { booleanValue: true }), baseFact('2', 'b', { booleanValue: false })]).reasonCodes).toContain('CONFLICTING_FACT_VALUES');
    expect(run(definition('b', 'b'), [baseFact('1', 'b')]).reasonCodes).toContain('MALFORMED_FACT_VALUE');
    expect(run(definition('m', 'm', 'MONEY'), [baseFact('1', 'm')]).reasonCodes).toContain('UNSUPPORTED_FACT_TYPE');
    expect(run(definition('r', 'r', 'BOOLEAN', 'OBSERVATION', 'RETIRED'), [baseFact('1', 'r', { booleanValue: true })]).reasonCodes).toContain('FACT_DEFINITION_RETIRED');
    expect(run(definition('e', 'e', 'BOOLEAN', 'EVENT'), [baseFact('1', 'e', { booleanValue: true })]).reasonCodes).toContain('UNSUPPORTED_TEMPORAL_POLICY_EVENT');
    expect(run(definition('d', 'd', 'BOOLEAN', 'OBSERVATION', 'DEPRECATED'), [baseFact('1', 'd', { booleanValue: true })]).warningCodes).toContain('DEPRECATED_FACT_DEFINITION_USED');
  });

  it('enforces temporal boundaries and reference-period containment', () => {
    expect(run(definition('v', 'v', 'BOOLEAN', 'VALIDITY_INTERVAL'), [baseFact('1', 'v', { booleanValue: true, validFrom: at })]).factMap.v).toBeDefined();
    expect(run(definition('v', 'v', 'BOOLEAN', 'VALIDITY_INTERVAL'), [baseFact('1', 'v', { booleanValue: true, validFrom: new Date('2026-06-16T00:00:00Z') })]).reasonCodes).toContain('MISSING_FACT');
    expect(run(definition('o', 'o', 'BOOLEAN', 'OBSERVATION'), [baseFact('1', 'o', { booleanValue: true, observedAt: new Date('2026-06-16T00:00:00Z') })]).reasonCodes).toContain('MISSING_FACT');
    expect(run(definition('e', 'e', 'BOOLEAN', 'EFFECTIVE_INSTANT'), [baseFact('1', 'e', { booleanValue: true, effectiveAt: new Date('2026-06-16T00:00:00Z') })]).reasonCodes).toContain('MISSING_FACT');
    const reference = { ...scope, referencePeriod: { start: new Date('2026-02-01T00:00:00Z'), end: new Date('2026-03-31T00:00:00Z') } };
    const def = definition('p', 'p', 'NUMBER', 'REFERENCE_PERIOD');
    expect(selectFacts({ clientId: 'client-a', scope: reference, subject: null, dependencies: [{ factKey: 'p', definition: def, facts: [baseFact('1', 'p', { numberValue: '4', referencePeriodStart: new Date('2026-01-01T00:00:00Z'), referencePeriodEnd: new Date('2026-04-01T00:00:00Z') })] }] }).factMap.p).toBeDefined();
    expect(selectFacts({ clientId: 'client-a', scope: reference, subject: null, dependencies: [{ factKey: 'p', definition: def, facts: [baseFact('1', 'p', { numberValue: '4', referencePeriodStart: new Date('2026-02-15T00:00:00Z'), referencePeriodEnd: new Date('2026-03-15T00:00:00Z') })] }] }).reasonCodes).toContain('MISSING_FACT');
  });

  it('is deterministic and preserves content-light inputs', () => {
    const first = run(definition('b', 'b'), [baseFact('z', 'b', { booleanValue: true }), baseFact('a', 'b', { booleanValue: true })]);
    const second = run(definition('b', 'b'), [baseFact('a', 'b', { booleanValue: true }), baseFact('z', 'b', { booleanValue: true })]);
    expect(first).toEqual(second);
    expect(canonicalDigest(first)).toBe(canonicalDigest(second));
  });
});
