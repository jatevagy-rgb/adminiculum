import fs from 'fs';
import path from 'path';

const migrationPath = path.resolve(__dirname, '..', 'prisma', 'migrations', '20260719120000_add_client_color_key', 'migration.sql');

describe('client color migration candidate', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('is additive, nullable, and contains no backfill or destructive statement', () => {
    expect(sql).toContain('CREATE TYPE "ClientColorKey" AS ENUM');
    expect(sql).toContain('ALTER TABLE "clients" ADD COLUMN "colorKey" "ClientColorKey";');
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE)\b/i);
    expect(sql).not.toMatch(/\bNOT NULL\b/i);
    expect(sql).not.toMatch(/\bDEFAULT\b/i);
  });
});
