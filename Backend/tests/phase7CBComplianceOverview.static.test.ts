import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Phase 7C-B compliance overview contract', () => {
  const service = () => read('src/modules/compliance/complianceOverviewService.ts');

  it('mounts an authenticated internal read route with the canonical client gate', () => {
    expect(read('src/index.ts')).toContain("app.use('/api/v1/compliance', complianceOverviewRoutes)");
    expect(read('src/modules/compliance/complianceOverviewRoutes.ts')).toContain('router.use(authenticate)');
    expect(service()).toContain('assertClientReadAccess(actor, clientId, prisma)');
  });

  it('uses the applicability-pinned requirement version and a bounded subject batch', () => {
    const src = service();
    expect(src).toContain('requirementApplicability');
    expect(src).toContain('requirementVersion');
    expect(src).toContain('prisma.factSubject.findMany');
    expect(src).toContain('where: { clientId, id: { in: subjectIds } }');
    expect(src).not.toContain('prisma.requirementVersion.findMany');
  });

  it('keeps the DTO restricted to presentation-safe fields', () => {
    const src = service();
    for (const key of ['id:', 'title:', 'description:', 'recommendation:', 'severity:', 'operationalStatus:', 'applicabilityStatus:', 'requirementKey:', 'scopeType:', 'subjectLabel:']) expect(src).toContain(key);
    expect(src).not.toContain('snapshotJson:');
    expect(src).not.toContain('factSubjectId: finding.factSubjectId');
  });

  it('tracks the dedicated PostgreSQL suite', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['test:phase7cb:db']).toContain('phase7CBComplianceOverview.integration.test.ts');
  });
});
