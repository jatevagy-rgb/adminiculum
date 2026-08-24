import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Phase 7B proposal contract', () => {
  const schema = read('prisma/schema.prisma');
  const migration = read('prisma/migrations/20260826090000_phase7b_finding_action_task/migration.sql');

  it('declares exact lifecycle and proposal kind enums', () => {
    expect(schema).toMatch(/enum ComplianceProposalStatus \{\s+PROPOSED\s+CONFIRMED\s+REJECTED\s+STALE\s+\}/);
    expect(schema).toMatch(/enum ComplianceProposalKind \{\s+REMEDIATION\s+DISCLOSURE\s+DOCUMENT_UPDATE\s+CONTROL_IMPLEMENTATION\s+REVIEW\s+OPEN_MATTER\s+\}/);
  });

  it('uses partial active indexes rather than Prisma full uniqueness', () => {
    expect(schema).not.toMatch(/@@unique\(\[findingId, proposalKind, actionIntentKey/);
    expect(migration).toContain('compliance_proposals_active_case_identity_key');
    expect(migration).toMatch(/\("findingId", "proposalKind", "actionIntentKey", "caseId"\)\s+WHERE "status" = 'PROPOSED' AND "caseId" IS NOT NULL/);
    expect(migration).toContain('compliance_proposals_active_no_case_identity_key');
    expect(migration).toMatch(/\("findingId", "proposalKind", "actionIntentKey"\)\s+WHERE "status" = 'PROPOSED' AND "caseId" IS NULL/);
    expect(schema).toMatch(/taskId\s+String\?\s+@unique/);
  });

  it('keeps provenance and task/case relations restrictive', () => {
    expect(schema).toMatch(/finding\s+AssessmentFinding\s+@relation\(fields: \[findingId\], references: \[id\], onDelete: Restrict\)/);
    expect(schema).toMatch(/applicabilityAtProposal\s+RequirementApplicability\s+@relation\([^\n]*onDelete: Restrict\)/);
    expect(schema).toMatch(/case\s+Case\?\s+@relation\(fields: \[caseId\], references: \[id\], onDelete: Restrict\)/);
    expect(schema).toMatch(/caseId\s+String\n\s+case\s+Case/);
  });

  it('keeps routes internal and omits new-case backend creation', () => {
    const routes = read('src/modules/compliance/complianceProposalRoutes.ts');
    const index = read('src/index.ts');
    expect(index).toContain("app.use('/api/v1/compliance/proposals', complianceProposalRoutes)");
    expect(routes).toContain("router.post('/:id/bind-case'");
    expect(routes).toContain("router.post('/:id/confirm'");
    expect(routes).not.toContain('start-new-case');
    expect(read('src/modules/compliance/complianceProposalService.ts')).not.toContain('createCaseIntake');
  });

  it('rejects generic mutation of immutable proposal fields', () => {
    const service = read('src/modules/compliance/complianceProposalService.ts');
    expect(service).toContain("'PROPOSAL_IMMUTABLE'");
    expect(service).toContain('applicabilityIdAtProposal');
    expect(service).toContain('findingStatusAtProposal');
  });

  it('tracks the dedicated PostgreSQL suite', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    const workflow = read('../.github/workflows/backend-postgresql-integration.yml');
    expect(pkg.scripts['test:phase7b:db']).toContain('phase7BComplianceProposal.integration.test.ts');
    expect(workflow).toContain('phase7b');
  });
});
