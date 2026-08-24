import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Org client safe compliance read model contract', () => {
  const serviceFile = 'src/modules/compliance/clientSafeComplianceService.ts';
  const routeFile = 'src/modules/compliance/clientSafeComplianceRoutes.ts';
  const registryFile = 'src/modules/compliance/safeTopicRegistry.ts';

  it('mounts an authenticated client-portal route', () => {
    expect(read('src/index.ts')).toContain("app.use('/api/v1/client-portal/compliance', clientSafeComplianceRoutes)");
    expect(read(routeFile)).toContain('authenticateClientPortal');
    expect(read(routeFile)).toContain('requireActiveClientPortalSession');
    expect(read(routeFile)).toContain('resolvePortalWorkspace');
  });

  it('derives clientId from workspace, never from browser input', () => {
    const route = read(routeFile);
    expect(route).toContain('workspace.clientId');
    expect(route).not.toMatch(/req\.params\.clientId/);
  });

  it('enforces COMPANY scope only', () => {
    expect(read(serviceFile)).toContain("scopeType: 'COMPANY'");
  });

  it('filters by safe topic registry', () => {
    expect(read(serviceFile)).toContain('portalVisibleKeys');
    expect(read(serviceFile)).toContain('lookupSafeTopic');
  });

  it('excludes DOES_NOT_APPLY', () => {
    expect(read(serviceFile)).toContain('DOES_NOT_APPLY');
  });

  it('maps to human-safe states only', () => {
    const src = read(serviceFile);
    expect(src).toContain('REVIEW_RECOMMENDED');
    expect(src).toContain('MORE_INFORMATION_NEEDED');
    expect(src).toContain('LAWYER_REVIEW_REQUIRED');
    expect(src).toContain('ACTION_IN_PROGRESS');
    expect(src).toContain('RESOLVED');
  });

  it('never exposes internal fields in DTO', () => {
    const src = read(serviceFile);
    expect(src).toContain('assertClientSafe(result)');
    expect(src).not.toContain('requirementKey:');
    expect(src).not.toContain('severity:');
    expect(src).not.toContain('snapshotJson');
    expect(src).not.toContain('factSubjectId');
  });

  it('topicId comes from registry topicKey, never DB ids', () => {
    const src = read(serviceFile);
    // topicId is assigned from topic.topicKey
    expect(src).toContain('topicId: topic.topicKey');
    // No fallback to applicability.id or finding.id
    expect(src).not.toMatch(/topicId:\s*applicability/);
    expect(src).not.toMatch(/topicId:\s*finding/);
    expect(src).not.toContain('deriveTopicId');
  });

  it('omits manual findings without requirementKey', () => {
    const src = read(serviceFile);
    expect(src).toContain('if (!requirementKey) continue');
  });

  it('omits unregistered requirement keys', () => {
    const src = read(serviceFile);
    expect(src).toContain('if (!visibleKeys.has(requirementKey)) continue');
  });

  it('DEMO requires explicit opt-in: ADMINICULUM_DEMO_CONTENT_ENABLED', () => {
    const route = read(routeFile);
    expect(route).toContain('ADMINICULUM_DEMO_CONTENT_ENABLED');
    expect(route).toContain("process.env.NODE_ENV === 'production'");
    // Must be BOTH non-production AND explicit flag
    expect(route).toMatch(/demoEnabled\s*=\s*!isProduction\s*&&\s*process\.env\.ADMINICULUM_DEMO_CONTENT_ENABLED\s*===\s*'true'/);
  });

  it('does not import 7B proposal mutation modules', () => {
    const src = read(serviceFile);
    const importLines = src.split('\n').filter((line) => line.trimStart().startsWith('import '));
    const importText = importLines.join('\n');
    expect(importText).not.toContain('complianceProposalService');
    expect(importText).not.toContain('createProposal');
    expect(importText).not.toContain('bindProposal');
    expect(importText).not.toContain('confirmProposal');
    expect(importText).not.toContain('createTask');
    const route = read(routeFile);
    const routeImportLines = route.split('\n').filter((line) => line.trimStart().startsWith('import '));
    const routeImportText = routeImportLines.join('\n');
    expect(routeImportText).not.toContain('complianceProposalService');
    expect(routeImportText).not.toContain('createProposal');
  });

  it('missing information uses safe labels, never FactDefinition keys', () => {
    const src = read(serviceFile);
    expect(src).toContain('SAFE_QUESTION_LABELS');
    expect(src).toContain('safeQuestionLabel');
    expect(src).toContain('portalAnswerable');
    // Raw questionKey must never be used as label directly
    expect(src).not.toMatch(/label:\s*questionKey/);
  });

  it('no overclaiming legal certainty in client copy', () => {
    const src = read(serviceFile);
    // Forbidden phrases
    expect(src).not.toContain('követelmény teljesítve van');
    expect(src).not.toContain('Ügyvédünk hamarosan felveszi');
    expect(src).not.toContain('szükséges lépések folyamatban');
    expect(src).not.toContain('követelmény teljesítéséhez');
    // Safe alternatives present
    expect(src).toContain('nincs további portálos teendő');
    expect(src).toContain('Ügyvédi áttekintés javasolt');
    expect(src).toContain('További információ segíthet');
  });

  it('uses batched queries, not N+1', () => {
    const src = read(serviceFile);
    expect(src).toContain('batchLoadDependencyData');
    expect(src).toContain('computeMissingInformation');
    // No per-topic prisma calls in the loop
    const loopSection = src.slice(src.indexOf('for (const finding'));
    expect(loopSection).not.toContain('prisma.');
  });

  it('tracks the dedicated PostgreSQL suite', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['test:org-client-safe:db']).toContain('orgClientSafeComplianceReadModel.integration.test.ts');
  });

  it('registry has opaque topicKey for every entry', () => {
    const registry = read(registryFile);
    expect(registry).toContain('topicKey:');
    expect(registry).toContain('portal/gdpr-data-processing');
    expect(registry).toContain('portal/demo-sample-topic');
    expect(registry).toContain('demo?: boolean');
  });
});
