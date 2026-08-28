import fs from 'node:fs';
import path from 'node:path';

const backendRoot = path.resolve(__dirname, '..');
const runner = fs.readFileSync(
  path.join(backendRoot, 'App_Data/jobs/triggered/adminiculum-demo-kft-reset/runner.cjs'),
  'utf8',
);
const schema = fs.readFileSync(path.join(backendRoot, 'prisma/schema.prisma'), 'utf8');

function modelBody(modelName: string): string {
  const match = schema.match(new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Missing Prisma model: ${modelName}`);
  return match[1];
}

describe('Demo Kft verification text-id contract', () => {
  it('matches the Prisma String contract for all runner ID comparisons', () => {
    expect(modelBody('Case')).toMatch(/\bid\s+String\s+@id\s+@default\(uuid\(\)\)/);
    expect(modelBody('Matter')).toMatch(/\bid\s+String\s+@id\s+@default\(uuid\(\)\)/);
    expect(modelBody('TimeEntry')).toMatch(/\bmatterId\s+String\b/);

    expect(modelBody('Case')).not.toMatch(/@db\.Uuid/);
    expect(modelBody('Matter')).not.toMatch(/@db\.Uuid/);
    expect(modelBody('TimeEntry')).not.toMatch(/@db\.Uuid/);
  });

  it('contains no UUID-array cast for Prisma String verification IDs', () => {
    expect(runner).not.toContain('ANY($1::uuid[])');
    expect(runner).toContain('WHERE id = ANY($1::text[])');
    expect(runner).toContain('WHERE "matterId" = ANY($1::text[])');
  });
});
