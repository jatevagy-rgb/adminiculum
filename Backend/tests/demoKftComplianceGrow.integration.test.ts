/**
 * Demo Kft. compliance + Grow With Us — real-engine acceptance (PostgreSQL).
 *
 * Proves the full 47 -> 52 journey via the REAL typed-fact engine path, the
 * human-gated proposal -> confirm -> Task flow, and truthful reset:
 *   reset -> 47 -> 0 findings
 *   typed-fact mutation (valid observedAt) -> 52 -> 1 engine-derived finding
 *   safe Grow narrative reflects 47 -> 52
 *   proposal available; NO Task before human confirm
 *   confirmProposal (human gate) -> Task created
 *   reset -> 47 -> baseline finding removed
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createTypedFactAndEvaluate } from '../src/modules/compliance/typedFactMutationService';
import { createProposal, confirmProposal } from '../src/modules/compliance/complianceProposalService';
import { getClientSafeGrowthNarrative } from '../src/modules/compliance/companyGrowthNarrative';

const databaseUrl =
  process.env.DEMO_KFT_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL ||
  process.env.CLIENT_IDENTITY_TEST_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

function stableId(name: string): string {
  return crypto.createHash('sha256').update(`DEMO_KFT_2026:${name}`).digest('hex').slice(0, 32);
}
const IDS = {
  clientId: stableId('demoClient'),
  adminUserId: stableId('adminUser'),
  identityId: stableId('portalIdentity'),
  factDefinitionId: stableId('factDefinitionEmployeeCount'),
  factDefinitionKey: 'DEMO_KFT_COMPANY_EMPLOYEE_COUNT',
};

d('Demo Kft. compliance + Grow With Us (PostgreSQL)', () => {
  let db: PrismaClient;
  const admin = { userId: IDS.adminUserId, role: 'ADMIN' };

  beforeAll(() => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.ADMINICULUM_DEMO_CONTENT_ENABLED = 'true';
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

  async function findingCount(): Promise<number> {
    return db.assessmentFinding.count({ where: { clientId: IDS.clientId } });
  }

  it('reset -> 47 -> zero threshold finding; safe Grow unchanged', async () => {
    await reset();
    expect(await findingCount()).toBe(0);
    const grow = await getClientSafeGrowthNarrative(IDS.clientId, db);
    expect(grow.beforeEmployeeCount).toBe(47);
    expect(grow.currentEmployeeCount).toBe(47);
    expect(grow.changed).toBe(false);
    expect(grow.newTopicSafeCount).toBe(0);
  });

  it('real portal-equivalent typed-fact mutation (valid observedAt) -> 52 -> one engine finding', async () => {
    const now = new Date();
    const { evaluations } = await createTypedFactAndEvaluate(
      {
        clientId: IDS.clientId,
        factDefinitionId: IDS.factDefinitionId,
        actorUserId: IDS.adminUserId,
        verificationStatus: 'CLIENT_PROVIDED',
        input: {
          scopeType: 'COMPANY',
          numberValue: 52,
          validFrom: now.toISOString(),
          observedAt: now.toISOString(),
          evaluationAt: now.toISOString(),
          sourceReference: `CLIENT_PORTAL_IDENTITY:${IDS.identityId}`,
        },
      },
      db,
    );
    expect(Number(evaluations?.length ?? 0)).toBeGreaterThanOrEqual(1);
    expect(await findingCount()).toBeGreaterThanOrEqual(1);

    const grow = await getClientSafeGrowthNarrative(IDS.clientId, db);
    expect(grow.changed).toBe(true);
    expect(grow.beforeEmployeeCount).toBe(47);
    expect(grow.currentEmployeeCount).toBe(52);
    expect(grow.newTopicSafeCount).toBeGreaterThanOrEqual(1);
    expect(grow.safeFeedback).toContain('új terület');
    expect(grow.safeMeaningText).toContain('szükséges');
  });

  it('proposal is human-gated: NO Task before confirm; Task created only after confirm', async () => {
    const finding = await db.assessmentFinding.findFirst({ where: { clientId: IDS.clientId }, select: { id: true } });
    expect(finding).not.toBeNull();

    const proposal = await createProposal(admin, {
      findingId: (finding as { id: string }).id,
      proposalKind: 'REVIEW',
      title: 'Megfelelőségi áttekintés megindítása',
      suggestedAction: 'Jogi áttekintés a Szervezeti növekedési áttekintés témában.',
    }, db);
    expect(String(proposal.status)).toBe('PROPOSED');
    // No task yet — human confirmation is mandatory.
    expect(proposal.taskId).toBeNull();
    expect(proposal.task).toBeNull();

    const confirmed = await confirmProposal(admin, String(proposal.id), db);
    expect(String(confirmed.status)).toBe('CONFIRMED');
    expect(confirmed.taskId).not.toBeNull();
    expect(confirmed.confirmedById).toBe(IDS.adminUserId);
    const task = await db.task.findUnique({ where: { id: String(confirmed.taskId) } });
    expect(task).not.toBeNull();
  });

  it('reset restores 47 and removes the demo 52-derived finding truthfully', async () => {
    await reset();
    expect(await findingCount()).toBe(0);
    const grow = await getClientSafeGrowthNarrative(IDS.clientId, db);
    expect(grow.currentEmployeeCount).toBe(47);
    expect(grow.changed).toBe(false);
    expect(grow.newTopicSafeCount).toBe(0);
  });
});
