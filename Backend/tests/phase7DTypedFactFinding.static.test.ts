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

  it('preserves enrollment migration semantics and exposes only manager diagnostics', () => {
    const migration = read('prisma/migrations/20260824150000_phase7d1_temporal_scope_enrollment/migration.sql');
    const replay = read('scripts/verify-migration-replay.mjs');
    const diagnostics = read('src/modules/compliance/complianceOverviewService.ts');
    const routes = read('src/modules/compliance/complianceOverviewRoutes.ts');
    const portal = read('src/routes/clientPortal.ts');
    expect(migration).not.toContain('SET "complianceEnrollmentStatus" = \'ENROLLED\'');
    expect(migration).not.toContain('INSERT INTO "client_operating_profiles"');
    expect(replay).toContain('seedPhase7D1EnrollmentFixture');
    expect(replay).toContain('phase7d1-bare-client');
    expect(diagnostics).toContain('COMPLIANCE_DIAGNOSTICS_FORBIDDEN');
    expect(diagnostics).toContain("status: 'APPROVED', supersededById: null, evaluationScopeType: null");
    expect(routes).toContain("/diagnostics/unresolved-rule-scopes");
    expect(portal).not.toContain('unresolved-rule-scopes');
  });

  it('gates only compliance enrollment mutation behind manager authority', () => {
    const service = read('src/modules/client-company/service.ts');
    expect(service).toContain('await assertClientReadAccess(actor, clientId, prisma);');
    expect(service).toContain("if (input.complianceEnrollmentStatus !== undefined)");
    expect(service).toContain('requireManager(actor);');
  });
});
