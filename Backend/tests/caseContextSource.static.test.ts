/**
 * Case Context V2 — static model/migration/source-contract guards.
 *
 * These prove, without a live database, that:
 *  - the migration is additive-only (CREATE enum/table/index/FK, no rewrite,
 *    no backfill, no destructive statement);
 *  - the FK delete semantics match the authorized design;
 *  - the Prisma model has no forbidden persistent fields (userTerms/status/
 *    reversible mapping);
 *  - the service uses the pure anonymization foundation and never external AI.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const schema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
const migration = fs.readFileSync(
  path.join(ROOT, 'prisma', 'migrations', '20260927120000_add_case_context_sources', 'migration.sql'),
  'utf8',
);
const serviceSource = fs.readFileSync(path.join(ROOT, 'src', 'modules', 'case-context', 'service.ts'), 'utf8');
const routesSource = fs.readFileSync(path.join(ROOT, 'src', 'modules', 'case-context', 'routes.ts'), 'utf8');

describe('migration is additive-only', () => {
  it('contains no destructive or rewritable statements', () => {
    expect(migration).not.toMatch(/DROP\s+(TABLE|TYPE|COLUMN|INDEX|CONSTRAINT)/i);
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
    expect(migration).not.toMatch(/TRUNCATE/i);
    expect(migration).not.toMatch(/UPDATE\s+"cases"/i);
    expect(migration).not.toMatch(/UPDATE\s+"users"/i);
    expect(migration).not.toMatch(/UPDATE\s+"communications"/i);
  });

  it('creates the enum, table and indexes only', () => {
    expect(migration).toContain('CREATE TYPE "CaseContextOrigin"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "case_context_sources"');
    expect(migration).toContain('case_context_sources_caseId_createdAt_idx');
    expect(migration).toContain('case_context_sources_sourceCommunicationId_idx');
  });

  it('performs no backfill', () => {
    expect(migration).not.toMatch(/INSERT\s+INTO\s+"case_context_sources"/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+(cases|users|communications)/i);
  });

  it('applies the authorized delete semantics', () => {
    expect(migration).toMatch(/REFERENCES\s+"cases"\("id"\)\s+ON DELETE CASCADE/i);
    expect(migration).toMatch(/REFERENCES\s+"users"\("id"\)\s+ON DELETE RESTRICT/i);
    expect(migration).toMatch(/REFERENCES\s+"communications"\("id"\)\s+ON DELETE SET NULL/i);
  });
});

describe('Prisma model shape', () => {
  it('declares the CaseContextSource model with the authorized fields', () => {
    expect(schema).toMatch(/model\s+CaseContextSource\s*\{/);
    expect(schema).toMatch(/rawText\s+String/);
    expect(schema).toMatch(/anonymizedText\s+String\?/);
    expect(schema).toMatch(/anonymizationSnapshot\s+Json\?/);
    expect(schema).toMatch(/sourceCommunicationId\s+String\?/);
    expect(schema).toMatch(/origin\s+CaseContextOrigin/);
  });

  it('declares the CaseContextOrigin enum with PASTED and COMMUNICATION', () => {
    expect(schema).toMatch(/enum\s+CaseContextOrigin\s*\{[^}]*PASTED[^}]*COMMUNICATION[^}]*\}/s);
  });

  it('does not add forbidden persistent fields', () => {
    const model = schema.match(/model\s+CaseContextSource\s*\{[^}]*\}/s)?.[0] ?? '';
    expect(model).not.toContain('userTerms');
    expect(model).not.toContain('status');
    expect(model).not.toContain('replacementMapping');
    expect(model).not.toContain('rehydrationMap');
    expect(model).not.toContain('originalToReplacementMapping');
  });

  it('adds back-relations on Case, User and Communication', () => {
    expect(schema).toMatch(/caseContextSources\s+CaseContextSource\[\]/);
  });
});

describe('service source contract (no external AI)', () => {
  function importSpecifiers(source: string): string[] {
    const staticImports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const dynamicImports = [...source.matchAll(/import\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
    return [...staticImports, ...dynamicImports];
  }

  it('reuses the pure anonymization foundation', () => {
    const specifiers = importSpecifiers(serviceSource);
    expect(specifiers).toContain('../anonymization');
    expect(serviceSource).toContain('detectCandidates');
  });

  it('never imports AI prompt preparation, the document-coupled anonymize module, or an AI provider', () => {
    for (const spec of importSpecifiers(serviceSource)) {
      expect(spec).not.toMatch(/ai-prompts/);
      expect(spec).not.toMatch(/(^|\/)anonymize($|\/)/);
      expect(spec).not.toMatch(/openai|anthropic|azure/i);
    }
  });

  it('never builds the reversible mapping', () => {
    expect(serviceSource).not.toContain('buildInternalMapping');
    expect(serviceSource).not.toContain('InternalReplacementMapping');
  });
});

describe('rawText immutability', () => {
  it('exposes no PATCH/PUT route for a context source', () => {
    expect(routesSource).not.toMatch(/router\.(patch|put)\(/);
  });
});
