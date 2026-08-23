import fs from 'node:fs';
import path from 'node:path';

const backendRoot = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.resolve(backendRoot, '..', '.github', 'workflows', 'backend-postgresql-integration.yml'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(backendRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

describe('Phase 6 Slice D static wiring', () => {
  it('tracks and executes the PostgreSQL suite', () => {
    expect(packageJson.scripts['test:phase6-slice-d:db']).toBe('jest --runInBand tests/phase6SliceDRequirementApplicability.integration.test.ts');
    expect(workflow).toContain('phase6-slice-d=PENDING');
    expect(workflow).toContain('name: Phase 6 Slice D immutable applicability snapshot PG');
    expect(workflow).toContain('npm run test:phase6-slice-d:db');
    expect(workflow).toContain('phase6-slice-d=$rc');
    expect(workflow).toContain('[phase6-slice-d]="Phase 6 Slice D immutable applicability snapshot"');
  });

  it('keeps the snapshot service authoritative and route-free', () => {
    const service = fs.readFileSync(path.join(backendRoot, 'src', 'modules', 'compliance', 'requirementApplicabilityService.ts'), 'utf8');
    expect(service).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(service).toContain('evaluateComplianceWithConsumedFacts');
    expect(service).not.toContain('outcome: input.outcome');
    expect(service).not.toContain('router.');
    expect(fs.existsSync(path.join(backendRoot, 'prisma', 'migrations'))).toBe(true);
  });
});
