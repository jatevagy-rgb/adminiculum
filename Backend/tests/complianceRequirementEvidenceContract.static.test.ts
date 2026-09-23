import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const controlService = read('src/modules/compliance/controlEvidenceService.ts');
const workspaceService = read('src/modules/compliance/complianceWorkspaceService.ts');
const routes = read('src/modules/compliance/controlEvidenceRoutes.ts');
const portalReadModel = read('src/modules/compliance/clientSafeComplianceService.ts');

/**
 * Contract: the workforce Compliance surface must be able to answer
 * WHAT_IS_REQUIRED / WHAT_EVIDENCE_IS_EXPECTED / CURRENT_EVIDENCE_IS_EXPECTED
 * entirely from persisted records, and must never equate the existence of a
 * document with compliance, nor leak internal state into the client portal.
 */
describe('compliance requirement -> evidence product contract (static)', () => {
  it('exposes the existing control coverage route unchanged', () => {
    expect(routes).toContain("router.get('/clients/:clientId/compliance/controls'");
    expect(routes).toContain('getControlCoverage');
  });

  it('projects the persisted expected-evidence wording and review cadence', () => {
    // WHAT evidence is expected is the stored ControlDefinition description/cadence.
    expect(controlService).toContain('description: map.controlDefinition.description ?? null');
    expect(controlService).toContain('reviewCadenceDays: map.controlDefinition.defaultReviewCadenceDays ?? null');
    // Existing authoritative gap classification is preserved.
    expect(controlService).toContain('classifyControlEvidenceGap');
  });

  it('projects recorded evidence with its validity window and freshness', () => {
    expect(controlService).toContain('validFrom: item.validFrom?.toISOString() || null');
    expect(controlService).toContain('validUntil: item.validUntil?.toISOString() || null');
    expect(controlService).toContain('freshness: freshness(item.validFrom, item.validUntil, now)');
    // Stale evidence is never counted as current.
    expect(controlService).toContain('accepted.filter((item) => isEvidenceCurrent(item.validFrom, item.validUntil, now))');
  });

  it('never derives compliance from the existence of evidence', () => {
    expect(controlService).not.toMatch(/status:\s*'ACCEPTED'\s*\)\)\s*\?|hasEvidence\s*\?\s*'EVIDENCED'/);
    expect(controlService).not.toMatch(/ruleAst|astJson|snapshotDigest|ruleDigest/);
  });

  it('keeps the requirement normative wording on the workforce projection only', () => {
    expect(workspaceService).toContain('normativeStatement: true');
    // The client-safe read model must not publish internal requirement wording.
    expect(portalReadModel).not.toMatch(/normativeStatement|reasonCodes|snapshotJson/);
  });
});
