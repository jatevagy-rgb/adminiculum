import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');
const service = readFileSync(path.join(root, 'src/modules/compliance/complianceWorkspaceService.ts'), 'utf8');
const routes = readFileSync(path.join(root, 'src/modules/compliance/complianceOverviewRoutes.ts'), 'utf8');

describe('compliance workspace read model (static)', () => {
  it('exposes the bounded workspace route on the existing compliance router', () => {
    expect(routes).toContain("router.get('/clients/:clientId/workspace'");
    expect(routes).toContain('getComplianceWorkspace');
    expect(routes).toContain('COMPLIANCE_WORKSPACE_INTERNAL_ERROR');
  });

  it('keeps the existing workforce client-read access gate', () => {
    expect(service).toContain('await assertClientReadAccess(actor, clientId, prisma);');
  });

  it('is read-only: no persistence mutation calls exist in the service', () => {
    expect(service).not.toMatch(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
    expect(service).not.toMatch(/\$(executeRaw|queryRaw|transaction)/);
  });

  it('only aggregates existing authoritative records', () => {
    for (const model of ['clientOperatingProfile.findUnique', 'requirementApplicability.findMany', 'assessmentFinding.count', 'complianceProposal.count', 'factSubject.findMany', 'clientFact.findMany']) {
      expect(service).toContain(`prisma.${model}`);
    }
  });

  it('never exposes rule internals or evaluation snapshots', () => {
    expect(service).not.toMatch(/ruleAst|astJson|snapshotJson|snapshotDigest|ruleDigest/);
  });

  it('derives missing information only from stored rule fact dependencies', () => {
    expect(service).toContain('row.ruleVersion?.dependencies');
    expect(service).toContain('resolvedFactDefinition');
    expect(service).toContain('isCompanyProfileQuestion');
  });

  it('projects legal-source metadata from stored citations only', () => {
    expect(service).toContain('legalSourceVersion');
    expect(service).toContain('canonicalCitation');
  });
});
