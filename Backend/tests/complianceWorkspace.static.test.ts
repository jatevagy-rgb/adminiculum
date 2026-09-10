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

  it('never exposes rule internals or raw snapshots in the DTO', () => {
    expect(service).not.toMatch(/ruleAst|astJson|snapshotDigest|ruleDigest/);
    // snapshotJson is read internally only as the authoritative source of
    // missingFactKeys — it is never returned in the projected DTO.
    expect(service).toContain('snapshotMissingFactKeys(row.snapshotJson)');
    expect(service).not.toMatch(/snapshotJson\s*[,}]|snapshotJson:\s*row\./);
  });

  it('projects missing information only from the persisted snapshot missingFactKeys', () => {
    expect(service).toContain('snapshotMissingFactKeys');
    expect(service).toContain('resolvedFactDefinition');
    expect(service).toContain('isCompanyProfileQuestion');
    // Unconsumed dependencies must not be treated as proof of a gap.
    expect(service).not.toMatch(/if \(usedKeys\.has/);
  });

  it('mirrors the canonical currentness filter (approved + effective + non-superseded)', () => {
    expect(service).toMatch(/requirementVersion:\s*\{[\s\S]*status: 'APPROVED'/);
    expect(service).toContain("ruleVersion: { status: 'APPROVED', supersededById: null }");
  });

  it('projects legal-source metadata from stored citations only', () => {
    expect(service).toContain('legalSourceVersion');
    expect(service).toContain('canonicalCitation');
  });
});
