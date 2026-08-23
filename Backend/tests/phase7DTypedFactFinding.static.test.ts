import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Phase 7D typed fact to finding wiring', () => {
  it('keeps the assessment relation nullable and uses one forward migration', () => {
    const schema = read('prisma/schema.prisma');
    const migration = read('prisma/migrations/20260825090000_phase7d_fact_to_finding_automation/migration.sql');
    expect(schema).toMatch(/assessmentId\s+String\?/);
    expect(schema).toMatch(/assessment\s+Assessment\?\s+@relation/);
    expect(migration).toContain('ALTER COLUMN "assessmentId" DROP NOT NULL');
  });

  it('wires typed writes through the serializable orchestration path', () => {
    const mutation = read('src/modules/compliance/typedFactMutationService.ts');
    const applicability = read('src/modules/compliance/requirementApplicabilityService.ts');
    const finding = read('src/modules/compliance/findingMaterializationService.ts');
    expect(mutation).toContain('isolationLevel: Prisma.TransactionIsolationLevel.Serializable');
    expect(mutation).toContain('FACT_OVERLAP_CONFLICT');
    expect(mutation).toContain('applicabilityRuleFactDependency');
    expect(mutation).not.toMatch(/assessment|task|proposal|case/i);
    expect(applicability).toContain('createRequirementApplicabilityInTx');
    expect(finding).toContain('assessmentId: null');
    expect(finding).not.toContain('input.assessmentId');
  });

  it('tracks the dedicated PostgreSQL suite in package and CI wiring', () => {
    const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    const workflow = read('../.github/workflows/backend-postgresql-integration.yml');
    expect(packageJson.scripts['test:phase7d:db']).toContain('phase7DTypedFactFinding.integration.test.ts');
    expect(workflow).toContain('phase7d');
    expect(workflow).toContain('Phase 7D typed fact to finding automation PG');
  });
});
