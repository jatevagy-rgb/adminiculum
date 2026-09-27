/**
 * Contract date candidates — structural invariants.
 *
 * 1. The candidate router is mounted on the internal workforce surface and the
 *    candidate model is additive-only (single source table).
 * 2. Pending candidates are INTERNAL lawyer work: no client-portal publication
 *    module may reference the candidate table/model, so unconfirmed extraction
 *    output can never leak to customers through the portal projection code.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', 'src');
const ROOT_INDEX = path.join(SRC, 'index.ts');
const PRISMA_SCHEMA = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const MIGRATION_DIR = path.join(__dirname, '..', 'prisma', 'migrations');

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

describe('contract date candidate routes — internal mounting', () => {
  it('is mounted at /api/v1/contract-date-candidates in the app entry', () => {
    const indexSource = fs.readFileSync(ROOT_INDEX, 'utf8');
    expect(indexSource).toContain("app.use('/api/v1/contract-date-candidates', contractDateCandidatesRouter)");
  });

  it('does not define any client-portal path', () => {
    const routesSource = read('modules/contract-date-candidates/routes.ts');
    expect(routesSource).not.toContain('/client-portal');
    expect(routesSource).toContain('requireWorkforceUser');
  });
});

describe('client portal isolation — pending candidates are never projected', () => {
  const portalModules = [
    'modules/client-portal-calendar/projection.ts',
    'modules/client-portal-calendar/mappers.ts',
    'modules/client-portal-calendar/service.ts',
    'modules/client-workspace/orgContractsService.ts',
    'modules/client-contracts/projector.ts',
    'modules/client-publication/publication.routes.ts',
  ];

  it.each(portalModules)('%s contains no candidate-table reference', (rel) => {
    const source = read(rel);
    expect(source).not.toMatch(/contractDateCandidate|contract_date_candidates/i);
  });

  it('the portal calendar service reads canonical contract/obligation sources only', () => {
    const source = read('modules/client-portal-calendar/service.ts');
    expect(source).toMatch(/contractRecord|clientObligation|contractEntitlement/i);
    expect(source).not.toMatch(/contractDateCandidate|contract_date_candidates/i);
  });
});

describe('schema and migration — small additive candidate model', () => {
  it('defines exactly one candidate model and one candidate status enum', () => {
    const schema = fs.readFileSync(PRISMA_SCHEMA, 'utf8');
    expect(schema.match(/model ContractDateCandidate\b/g)?.length ?? 0).toBe(1);
    expect(schema.match(/enum ContractDateCandidateStatus\b/g)?.length ?? 0).toBe(1);
    // Candidate dates never reuse canonical ContractRecord fields as scratch.
    expect(schema).toContain('dateType');
    expect(schema).toContain('documentVersionId');
    expect(schema).toContain('sourceExcerpt');
    expect(schema).toContain('status ContractDateCandidateStatus @default(PENDING)');
  });

  it('the migration is one new table with no statements against existing tables', () => {
    const migrationPath = path.join(MIGRATION_DIR, '20260927090000_contract_date_candidates', 'migration.sql');
    const migration = fs.readFileSync(migrationPath, 'utf8');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "contract_date_candidates"');
    const statements = migration
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);
    const altered = statements.filter((statement) =>
      /ALTER\s+TABLE\s+"(?!contract_date_candidates)/i.test(statement) && statement.includes('ALTER TABLE'),
    );
    expect(altered).toHaveLength(0);
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|DELETE FROM)\b/);
  });
});
