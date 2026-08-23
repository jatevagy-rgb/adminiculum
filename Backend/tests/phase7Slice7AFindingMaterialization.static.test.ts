import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.resolve(root, '..', '.github', 'workflows', 'backend-postgresql-integration.yml'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

describe('Phase 7 Slice 7A static wiring', () => {
  it('tracks and executes the PostgreSQL suite with result capture', () => {
    expect(packageJson.scripts['test:phase7-slice-7a:db']).toBe('jest --runInBand tests/phase7Slice7AFindingMaterialization.integration.test.ts');
    expect(workflow).toContain('phase7-slice-7a=PENDING');
    expect(workflow).toContain('name: Phase 7 Slice 7A finding materialization PG');
    expect(workflow).toContain('npm run test:phase7-slice-7a:db');
    expect(workflow).toContain('phase7-slice-7a=$rc');
    expect(workflow).toContain('[phase7-slice-7a]="Phase 7 Slice 7A finding materialization"');
  });

  it('keeps materialization authoritative, transactional, and route-free', () => {
    const service = fs.readFileSync(path.join(root, 'src', 'modules', 'compliance', 'findingMaterializationService.ts'), 'utf8');
    expect(service).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(service).toContain('requirementApplicability.findUnique');
    expect(service).not.toContain('createRequirementApplicability');
    expect(service).not.toContain('router.');
    expect(service).not.toContain('task.create');
  });

  it('keeps the finding identity and immutable evidence link tenant-scoped', () => {
    const schema = fs.readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8');
    const migration = fs.readFileSync(path.join(root, 'prisma', 'migrations', '20260824100000_phase7_slice_7a_finding_materialization', 'migration.sql'), 'utf8');
    expect(schema).toContain('requirementId              String?');
    expect(schema).toContain('applicabilityOutcome       RequirementApplicabilityOutcome?');
    expect(schema).toContain('requirementApplicability   RequirementApplicability?');
    expect(migration).toContain('CREATE UNIQUE INDEX "assessment_findings_clientId_requirementId_materialized_key"');
    expect(migration).toContain('WHERE "requirementId" IS NOT NULL');
  });
});
