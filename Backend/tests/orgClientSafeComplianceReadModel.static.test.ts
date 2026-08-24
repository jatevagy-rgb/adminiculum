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

  it('DEMO topics are gated by isProduction', () => {
    const registry = read(registryFile);
    expect(registry).toContain('DEMO_SAMPLE_TOPIC');
    expect(registry).toContain('demo?: boolean');
    expect(read(serviceFile)).toContain('isProduction');
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
    expect(src).toContain('Ügyvédi pontosítás szükséges.');
    expect(src).toContain('portalAnswerable');
  });

  it('tracks the dedicated PostgreSQL suite', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['test:org-client-safe:db']).toContain('orgClientSafeComplianceReadModel.integration.test.ts');
  });
});
