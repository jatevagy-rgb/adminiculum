import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Compliance document linkage (static)', () => {
  it('tracks the dedicated PostgreSQL suite', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    const workflow = read('../.github/workflows/backend-postgresql-integration.yml');
    expect(pkg.scripts['test:compliance-document-linkage:db']).toContain('complianceDocumentLinkage.integration.test.ts');
    expect(workflow).toContain('compliance-document-linkage');
  });

  it('keeps the linkage migration additive and non-destructive', () => {
    const migration = read('prisma/migrations/20260914130000_compliance_document_linkage/migration.sql');
    expect(migration).toMatch(/CREATE TYPE "ComplianceDocumentAudience"/);
    expect(migration).toMatch(/CREATE TABLE "compliance_documents"/);
    expect(migration).toMatch(/INTERNAL_ANALYSIS/);
    expect(migration).toMatch(/CLIENT_POLICY/);
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|DELETE FROM|ALTER COLUMN)\b/i);
  });

  it('declares the additive ComplianceDocument model with an audience enum', () => {
    const schema = read('prisma/schema.prisma');
    expect(schema).toMatch(/model ComplianceDocument \{/);
    expect(schema).toMatch(/enum ComplianceDocumentAudience \{\s+INTERNAL_ANALYSIS\s+CLIENT_POLICY\s+\}/);
    expect(schema).toMatch(/@@map\("compliance_documents"\)/);
  });
});
