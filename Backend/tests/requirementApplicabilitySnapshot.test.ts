import { canonicalDigest } from '../src/modules/compliance/canonicalDigest';
import {
  buildRequirementApplicabilitySnapshot,
  REQUIREMENT_APPLICABILITY_SCHEMA_VERSION,
} from '../src/modules/compliance/requirementApplicabilityService';

const baseInput = {
  requirementVersionId: 'req-v1',
  ruleVersionId: 'rule-v1',
  clientId: 'client-a',
  scope: {
    scopeType: 'COMPANY' as const,
    evaluationAt: new Date('2026-06-15T12:00:00.000Z'),
    referencePeriod: { start: new Date('2026-01-01T00:00:00.000Z'), end: new Date('2026-03-31T00:00:00.000Z') },
  },
};

function build(outcome: 'APPLIES' | 'DOES_NOT_APPLY' | 'INSUFFICIENT_FACTS' | 'LEGAL_REVIEW_REQUIRED' | 'TECHNICAL_REVIEW_REQUIRED' | 'SOURCE_SUPPORT_INSUFFICIENT' = 'APPLIES') {
  return buildRequirementApplicabilitySnapshot({
    evaluationInput: baseInput,
    evaluation: {
      outcome,
      trace: {
        requirementVersionId: 'req-v1', ruleVersionId: 'rule-v1', ruleDigest: 'a'.repeat(64),
        factDefinitionKeys: ['z', 'a'], selectedClientFactIds: ['fact-z', 'fact-a', 'fact-a'], missingFactKeys: ['missing-z', 'missing-a'],
        evaluatorResult: null, outcome, reasonCodes: ['Z_REASON', 'A_REASON'],
      },
      consumedFacts: {
        z: { factDefinitionId: 'def-z', factKey: 'z', valueType: 'STRING', normalizedValue: 'safe', clientFactIds: ['fact-z'] },
        a: { factDefinitionId: 'def-a', factKey: 'a', valueType: 'NUMBER', normalizedValue: 4, clientFactIds: ['fact-a', 'fact-a'] },
      },
    },
    requirementVersion: { sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', specialistDomainCode: null },
    rule: { canonicalDigest: 'a'.repeat(64), dependencies: [{ factKey: 'z', resolvedFactDefinition: { id: 'def-z' } }, { factKey: 'a', resolvedFactDefinition: { id: 'def-a' } }] },
  });
}

describe('Phase 6 Slice D snapshot builder', () => {
  it('builds the frozen schema and sorts set-like fields', () => {
    const result = build();
    expect(result.payload.schemaVersion).toBe(REQUIREMENT_APPLICABILITY_SCHEMA_VERSION);
    expect(result.payload.reasonCodes).toEqual(['A_REASON', 'Z_REASON']);
    expect(result.payload.missingFactKeys).toEqual(['missing-a', 'missing-z']);
    expect(result.payload.factDefinitions.map((item) => item.factKey)).toEqual(['a', 'z']);
    expect(result.payload.normalizedValues.map((item) => item.factKey)).toEqual(['a', 'z']);
    expect(result.payload.selectedClientFactIds).toEqual(['fact-a', 'fact-z']);
  });

  it.each(['APPLIES', 'DOES_NOT_APPLY', 'INSUFFICIENT_FACTS', 'LEGAL_REVIEW_REQUIRED', 'TECHNICAL_REVIEW_REQUIRED', 'SOURCE_SUPPORT_INSUFFICIENT'] as const)('persists frozen outcome %s in the payload', (outcome) => {
    expect(build(outcome).payload.outcome).toBe(outcome);
  });

  it('retains normalized typed values and separate equal-duplicate provenance', () => {
    const result = build();
    expect(result.payload.normalizedValues.find((item) => item.factKey === 'a')?.normalizedValue).toBe(4);
    expect(result.valueDigests.filter((item) => item.factKey === 'a')).toHaveLength(1);
    expect(result.payload.normalizedValues.find((item) => item.factKey === 'a')?.clientFactIds).toEqual(['fact-a']);
  });

  it('is deterministic and contains no raw persistence payloads', () => {
    const first = build();
    const second = build();
    expect(first.payload).toEqual(second.payload);
    expect(first.snapshotDigest).toBe(canonicalDigest(first.payload));
    const serialized = JSON.stringify(first.payload);
    expect(serialized).not.toContain('sourceDocumentVersionId');
    expect(serialized).not.toContain('legalSourceBody');
    expect(serialized).not.toContain('comment');
    expect(serialized).not.toContain('legacy-unused');
  });
});
