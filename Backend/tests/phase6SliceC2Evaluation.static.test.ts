import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.resolve(root, '..', '.github', 'workflows', 'backend-postgresql-integration.yml'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

describe('Phase 6 Slice C2 static wiring', () => {
  it('executes the tracked PostgreSQL suite with result capture', () => {
    expect(packageJson.scripts['test:phase6-slice-c2:db']).toBe('jest --runInBand tests/phase6SliceC2Evaluation.integration.test.ts');
    expect(workflow).toContain('phase6-slice-c2=PENDING');
    expect(workflow).toContain('name: Phase 6 Slice C2 evaluation orchestration PG');
    expect(workflow).toContain('npm run test:phase6-slice-c2:db');
    expect(workflow).toContain('phase6-slice-c2=$rc');
    expect(workflow).toContain('[phase6-slice-c2]="Phase 6 Slice C2 evaluation orchestration"');
  });

  it('keeps C2 persistence-free and reuses the canonical evaluator', () => {
    const service = fs.readFileSync(path.join(root, 'src', 'modules', 'compliance', 'complianceEvaluationService.ts'), 'utf8');
    expect(service).toContain("from './evaluator'");
    expect(service).toContain('evaluateRule(');
    expect(service).not.toContain('create(');
    expect(service).not.toContain('update(');
    expect(service).not.toContain('delete(');
    expect(fs.existsSync(path.join(root, 'prisma', 'migrations'))).toBe(true);
  });
});
