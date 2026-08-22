import fs from 'node:fs';
import path from 'node:path';
import { isComplianceEngineEnabled } from '../src/middleware/featureAvailability';

const root = path.resolve(__dirname, '..');
const schema = fs.readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'prisma', 'migrations', '20260822120000_phase6_slice_a_foundation', 'migration.sql'), 'utf8');

describe('Phase 6 Slice A static safety', () => {
  it('keeps compliance runtime disabled by default and adds no runtime surface', () => {
    const previous = process.env.ENABLE_COMPLIANCE_ENGINE;
    delete process.env.ENABLE_COMPLIANCE_ENGINE;
    expect(isComplianceEngineEnabled()).toBe(false);
    if (previous === undefined) delete process.env.ENABLE_COMPLIANCE_ENGINE;
    else process.env.ENABLE_COMPLIANCE_ENGINE = previous;
    expect(schema).not.toMatch(/\bmodel\s+(Requirement|RequirementVersion|RequirementApplicability|ApplicabilityRuleVersion)\b/);
  });

  it('contains only the Slice A persistence models and preserves legacy ClientFact fields', () => {
    for (const model of ['FactDefinition', 'FactSubject', 'LegalSource', 'LegalSourceVersion', 'LegalSourceCapture']) expect(schema).toContain(`model ${model}`);
    for (const field of [/^\s+type\s+String$/m, /^\s+value\s+String$/m, /^\s+validFrom\s+DateTime$/m, /^\s+sourceDocumentVersionId\s+String\?$/m]) expect(schema).toMatch(field);
    expect(schema).toMatch(/^\s+factDefinitionId\s+String\?$/m);
    expect(schema).toMatch(/^\s+factSubjectId\s+String\?$/m);
    expect(schema).not.toContain('OrganizationFact');
    expect(schema).not.toContain('RequirementVersion');
  });

  it('is additive and rejects destructive migration patterns', () => {
    expect(migration).toContain('CREATE TABLE "fact_definitions"');
    expect(migration).toContain('CREATE TABLE "legal_source_captures"');
    expect(migration).toContain('ALTER TABLE "client_facts" ADD COLUMN');
    expect(migration).toContain('client_facts_money_pair_check');
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
    expect(migration).not.toMatch(/\b(DELETE|UPDATE)\s+"/i);
  });
});
