/**
 * DEMO KFT. — deterministic organizational fixture acceptance (PostgreSQL).
 *
 * Proves after `demo:kft:reset`:
 *  - ORGANIZATION workspace ACTIVE + Péterfi membership exists
 *  - 3 cases, correct responsible lawyers, Gyula assigned where expected
 *  - time total 875 (employment 380 / supplier 310 / compliance 185)
 *  - baseline fact = 47, no threshold finding at 47
 *  - portal-safe publications exist
 *  - repeat reset keeps the same cardinalities (idempotent)
 *  - mutate 47→52 via the REAL service -> engine-derived finding
 *  - reset again -> 47 + baseline finding restored
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createTypedFactAndEvaluate } from '../src/modules/compliance/typedFactMutationService';

const databaseUrl =
  process.env.DEMO_KFT_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL ||
  process.env.CLIENT_IDENTITY_TEST_DATABASE_URL ||
  process.env.DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

// Mirror the reset script's stable IDs by importing the shared logic is not
// straightforward across a .mjs; instead we re-derive the same deterministic ids.
function stableId(name) {
  return crypto.createHash('sha256').update(`DEMO_KFT_2026:${name}`).digest('hex').slice(0, 32);
}
const IDS = {
  clientId: stableId('demoClient'),
  identityId: stableId('portalIdentity'),
  workspaceId: stableId('orgWorkspace'),
  membershipId: stableId('membership'),
  adminUserId: stableId('adminUser'),
  lawyerCsanadId: stableId('lawyerCsanad'),
  lawyerGyulaId: stableId('lawyerGyula'),
  factDefinitionId: stableId('factDefinitionEmployeeCount'),
  matterEmploymentId: stableId('matterEmployment'),
  matterSupplierId: stableId('matterSupplier'),
  matterComplianceId: stableId('matterCompliance'),
  caseEmploymentId: stableId('caseEmployment'),
  caseSupplierId: stableId('caseSupplier'),
  caseComplianceId: stableId('caseCompliance'),
  factDefinitionKey: 'DEMO_KFT_COMPANY_EMPLOYEE_COUNT',
  requirementKey: 'DEMO_KFT_COMPANY_GROWTH_REVIEW',
  pubEmploymentId: stableId('pubEmployment'),
  pubSupplierId: stableId('pubSupplier'),
};

const MINUTES = { employment: 380, supplier: 310, compliance: 185 };

async function sumMatter(db, matterId) {
  const r = await db.timeEntry.aggregate({ where: { matterId }, _sum: { minutes: true } });
  return r._sum.minutes ?? 0;
}

function idsEqual(a, b) {
  return String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
}

d('DEMO KFT. organizational fixture (PostgreSQL)', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.ADMINICULUM_DEMO_CONTENT_ENABLED = 'true';
    // Simulate a reset by running the deterministic seed inline via child spawn.
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function reset() {
    const { execFileSync } = await import('node:child_process');
    execFileSync('node', ['scripts/demo-kft-reset.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, ADMINICULUM_DEMO_CONTENT_ENABLED: 'true' },
      stdio: 'pipe',
    });
  }

  it('seeds a coherent organizational tenant (idempotent)', async () => {
    await reset();

    const workspace = await db.clientPortalWorkspace.findUnique({ where: { id: IDS.workspaceId }, select: { mode: true, status: true } });
    expect(workspace?.mode).toBe('ORGANIZATION');
    expect(workspace?.status).toBe('ACTIVE');

    const membership = await db.clientPortalWorkspaceMembership.findUnique({ where: { id: IDS.membershipId }, select: { clientPortalIdentityId: true, workspaceId: true, status: true, role: true } });
    expect(membership?.clientPortalIdentityId).toBe(IDS.identityId);
    expect(membership?.workspaceId).toBe(IDS.workspaceId);
    expect(membership?.status).toBe('ACTIVE');
    expect(membership?.role).toBe('APPROVER');

    const cases = await db.case.findMany({ where: { id: { in: [IDS.caseEmploymentId, IDS.caseSupplierId, IDS.caseComplianceId] } }, select: { id: true, assignedLawyerId: true, matterId: true } });
    expect(cases).toHaveLength(3);
    const emp = cases.find((c) => c.id === IDS.caseEmploymentId);
    const sup = cases.find((c) => c.id === IDS.caseSupplierId);
    expect(idsEqual(emp?.assignedLawyerId, IDS.lawyerCsanadId)).toBe(true);
    expect(idsEqual(sup?.assignedLawyerId, IDS.lawyerGyulaId)).toBe(true);

    const gyulaTasks = await db.task.count({ where: { assignedToId: IDS.lawyerGyulaId, caseId: IDS.caseEmploymentId } });
    expect(gyulaTasks).toBeGreaterThanOrEqual(1);

    expect(await sumMatter(db, IDS.matterEmploymentId)).toBe(MINUTES.employment);
    expect(await sumMatter(db, IDS.matterSupplierId)).toBe(MINUTES.supplier);
    expect(await sumMatter(db, IDS.matterComplianceId)).toBe(MINUTES.compliance);
    const total = await db.timeEntry.aggregate({ where: { matterId: { in: [IDS.matterEmploymentId, IDS.matterSupplierId, IDS.matterComplianceId] } }, _sum: { minutes: true } });
    expect(total._sum.minutes ?? 0).toBe(875);

    const fact = await db.clientFact.findFirst({ where: { clientId: IDS.clientId, type: IDS.factDefinitionKey }, select: { numberValue: true } });
    expect(Number(fact?.numberValue)).toBe(47);

    const findingAt47 = await db.assessmentFinding.count({ where: { clientId: IDS.clientId } });
    expect(findingAt47).toBe(0);

    const pubs = await db.clientSafeUpdate.count({ where: { id: { in: [IDS.pubEmploymentId, IDS.pubSupplierId] }, status: 'PUBLISHED' } });
    expect(pubs).toBe(2);

    // Idempotency: second reset keeps cardinalities.
    await reset();
    const casesAfter = await db.case.count({ where: { id: { in: [IDS.caseEmploymentId, IDS.caseSupplierId, IDS.caseComplianceId] } } });
    expect(casesAfter).toBe(3);
    const timeAfter = (await db.timeEntry.aggregate({ where: { matterId: { in: [IDS.matterEmploymentId, IDS.matterSupplierId, IDS.matterComplianceId] } }, _sum: { minutes: true } }))._sum ?? 0;
    expect(timeAfter).toBe(875);
  });

  it('drives the real 47→52 engine journey and restores the baseline on reset', async () => {
    await reset();

    // 47 -> 52 via the REAL typed-fact write/evaluate path.
    await createTypedFactAndEvaluate(
      {
        clientId: IDS.clientId,
        factDefinitionId: IDS.factDefinitionId,
        actorUserId: IDS.adminUserId,
        verificationStatus: 'CLIENT_PROVIDED',
        input: {
          scopeType: 'COMPANY',
          numberValue: 52,
          validFrom: new Date().toISOString(),
          observedAt: new Date().toISOString(),
          evaluationAt: new Date().toISOString(),
          sourceReference: `DEMO_KFT_FIXTURE:${IDS.identityId}`,
        },
      },
      db,
    );

    const factNow = await db.clientFact.findFirst({ where: { clientId: IDS.clientId, type: IDS.factDefinitionKey }, select: { id: true, numberValue: true }, orderBy: { validFrom: 'desc' } });
    expect(Number(factNow?.numberValue)).toBe(52);

    const findingAfter = await db.assessmentFinding.count({ where: { clientId: IDS.clientId } });
    expect(findingAfter).toBeGreaterThanOrEqual(1);

    // Reset restores 47 + baseline.
    await reset();
    const factAfter = await db.clientFact.findFirst({ where: { clientId: IDS.clientId, type: IDS.factDefinitionKey }, select: { numberValue: true }, orderBy: { validFrom: 'desc' } });
    expect(Number(factAfter?.numberValue)).toBe(47);
    const findingRestored = await db.assessmentFinding.count({ where: { clientId: IDS.clientId } });
    expect(findingRestored).toBe(0);
  });
});
