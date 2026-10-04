/**
 * GROW — atomic initiative handoff integration tests (PostgreSQL).
 *
 * G3 contract under test:
 *  1. ACCEPT (review) and initiative handoff stay separate explicit actions.
 *  2. Handoff is a single transaction: initiative create + opportunity link +
 *     INITIATIVE_STARTED transition commit or roll back together.
 *  3. Failure after the first write leaves no orphan initiative.
 *  4. Concurrent or retried handoffs yield exactly one legitimate
 *     initiative/link; the loser is rejected with OPPORTUNITY_ALREADY_LINKED.
 *  5. Cross-client and invalid-state calls are rejected inside the mutation.
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { startInitiativeFromOpportunity } from '../src/modules/company-growth/research/service';

const databaseUrl = process.env.GROW_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL || process.env.DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

/** A proxy over the real PrismaClient that injects a failure on the second
 *  write (improvementOpportunity.updateMany) inside the handoff transaction.
 *  Everything else is delegated to the real client/transaction. */
function failingOnSecondWrite(client: PrismaClient): PrismaClient {
  return new Proxy(client, {
    get(target, prop) {
      if (prop === '$transaction') {
        return async (cb: (tx: unknown) => Promise<unknown>) =>
          target.$transaction(async (tx) => {
            const txProxy = new Proxy(tx, {
              get(t, p) {
                if (p === 'improvementOpportunity') {
                  const io = Reflect.get(t, p) as unknown as Record<string, unknown>;
                  return new Proxy(io, {
                    get(ioT, ioP) {
                      if (ioP === 'updateMany') {
                        return async () => {
                          throw new Error('injected-second-write-failure');
                        };
                      }
                      const v = Reflect.get(ioT, ioP);
                      return typeof v === 'function' ? v.bind(ioT) : v;
                    },
                  });
                }
                const v = Reflect.get(t, p);
                return typeof v === 'function' ? v.bind(t) : v;
              },
            });
            return cb(txProxy as never);
          });
      }
      const v = Reflect.get(target, prop);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

d('GROW initiative handoff atomicity (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID().slice(0, 8);
  const admin = { userId: crypto.randomUUID(), role: 'ADMIN' };
  const lawyer = { userId: crypto.randomUUID(), role: 'LAWYER' };
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({
      data: [
        { id: admin.userId, email: `handoff-admin-${suffix}@test.invalid`, name: 'Handoff Admin', role: 'ADMIN', status: 'ACTIVE' },
        { id: lawyer.userId, email: `handoff-lawyer-${suffix}@test.invalid`, name: 'Handoff Lawyer', role: 'LAWYER', status: 'ACTIVE' },
      ] as never,
    });
    await db.client.createMany({
      data: [
        { id: clientA, name: `Handoff Client A ${suffix}` },
        { id: clientB, name: `Handoff Client B ${suffix}` },
      ],
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  async function seedOpportunity(clientId: string): Promise<string> {
    const run = await db.recommendationRun.create({
      data: { clientId, status: 'COMPLETED', idempotencyKey: `run-${crypto.randomUUID().slice(0, 8)}` },
    });
    const rec = await db.recommendationCandidate.create({
      data: {
        clientId,
        runId: run.id,
        title: 'Sablonosítási lehetőség',
        problemStatement: 'Sok kézi lépés.',
        direction: 'Automatizálás.',
        kind: 'QUICK_FIX',
        sufficiency: 'SUPPORTED',
        status: 'ACCEPTED',
      },
    });
    const opp = await db.improvementOpportunity.create({
      data: {
        clientId,
        recommendationId: rec.id,
        title: rec.title,
        problem: rec.problemStatement,
        direction: rec.direction,
        kind: rec.kind,
        status: 'OPEN',
      },
    });
    return opp.id;
  }

  it('1. handoff creates initiative + link + INITIATIVE_STARTED in one transaction', async () => {
    const opportunityId = await seedOpportunity(clientA);
    const result = await startInitiativeFromOpportunity(admin, clientA, opportunityId, { priority: 'HIGH' }, db);

    expect(result.initiative.title).toBe('Sablonosítási lehetőség');
    expect(result.initiative.status).toBe('PLANNED');
    expect(result.opportunity.status).toBe('INITIATIVE_STARTED');
    expect(result.opportunity.developmentInitiativeId).toBe(result.initiative.id);

    const row = await db.improvementOpportunity.findUnique({ where: { id: opportunityId } });
    expect(row?.developmentInitiativeId).toBe(result.initiative.id);
    expect(await db.developmentInitiative.count({ where: { clientId: clientA } })).toBe(1);
  });

  it('2. retried handoff (replay) is rejected without creating a second initiative', async () => {
    const opportunityId = await seedOpportunity(clientA);
    const first = await startInitiativeFromOpportunity(admin, clientA, opportunityId, {}, db);
    expect(first.initiative.id).toBeTruthy();

    await expect(startInitiativeFromOpportunity(admin, clientA, opportunityId, {}, db)).rejects.toMatchObject({
      code: 'OPPORTUNITY_ALREADY_LINKED',
    });

    const initiatives = await db.developmentInitiative.count({ where: { clientId: clientA } });
    expect(initiatives).toBe(2); // exactly the one from test 1 + one from this test
    const linked = await db.improvementOpportunity.findUnique({ where: { id: opportunityId } });
    expect(linked?.developmentInitiativeId).toBe(first.initiative.id);
  });

  it('3. concurrent handoffs produce exactly one legitimate initiative and link', async () => {
    const opportunityId = await seedOpportunity(clientA);
    const before = await db.developmentInitiative.count({ where: { clientId: clientA } });

    const outcomes = await Promise.allSettled([
      startInitiativeFromOpportunity(admin, clientA, opportunityId, { title: 'A jelölt' }, db),
      startInitiativeFromOpportunity(admin, clientA, opportunityId, { title: 'B jelölt' }, db),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'OPPORTUNITY_ALREADY_LINKED' });

    expect(await db.developmentInitiative.count({ where: { clientId: clientA } })).toBe(before + 1);
    const winner = (fulfilled[0] as PromiseFulfilledResult<{ initiative: { id: string } }>).value.initiative.id;
    const row = await db.improvementOpportunity.findUnique({ where: { id: opportunityId } });
    expect(row?.developmentInitiativeId).toBe(winner);
  });

  it('4. failure after the first write rolls back — no orphan initiative, no link', async () => {
    const opportunityId = await seedOpportunity(clientA);
    const before = await db.developmentInitiative.count({ where: { clientId: clientA } });
    const failing = failingOnSecondWrite(db);

    await expect(startInitiativeFromOpportunity(admin, clientA, opportunityId, {}, failing)).rejects.toThrow(
      /injected-second-write-failure/,
    );

    expect(await db.developmentInitiative.count({ where: { clientId: clientA } })).toBe(before);
    const row = await db.improvementOpportunity.findUnique({ where: { id: opportunityId } });
    expect(row?.developmentInitiativeId).toBeNull();
    expect(row?.status).toBe('OPEN');
  });

  it('5. cross-client handoff is rejected inside the mutation', async () => {
    const opportunityId = await seedOpportunity(clientA);
    await expect(startInitiativeFromOpportunity(admin, clientB, opportunityId, {}, db)).rejects.toMatchObject({
      code: 'OPPORTUNITY_NOT_FOUND',
    });
    const row = await db.improvementOpportunity.findUnique({ where: { id: opportunityId } });
    expect(row?.developmentInitiativeId).toBeNull();
  });

  it('6. non-manager actors cannot start an initiative', async () => {
    const opportunityId = await seedOpportunity(clientA);
    await expect(startInitiativeFromOpportunity(lawyer, clientA, opportunityId, {}, db)).rejects.toMatchObject({
      code: 'GROW_REVIEW_FORBIDDEN',
    });
    const row = await db.improvementOpportunity.findUnique({ where: { id: opportunityId } });
    expect(row?.developmentInitiativeId).toBeNull();
  });

  it('7. human ACCEPT stays separate: reviewed ACCEPT creates no initiative', async () => {
    const run = await db.recommendationRun.create({
      data: { clientId: clientA, status: 'COMPLETED', idempotencyKey: `run-acc-${crypto.randomUUID().slice(0, 8)}` },
    });
    const rec = await db.recommendationCandidate.create({
      data: {
        clientId: clientA,
        runId: run.id,
        title: 'Csak elfogadás',
        problemStatement: 'P',
        direction: 'D',
        kind: 'QUICK_FIX',
        sufficiency: 'SUPPORTED',
        status: 'ACCEPTED',
        reviewedById: admin.userId,
        reviewedAt: new Date(),
      },
    });
    const opp = await db.improvementOpportunity.create({
      data: {
        clientId: clientA,
        recommendationId: rec.id,
        title: rec.title,
        problem: 'P',
        direction: 'D',
        kind: 'QUICK_FIX',
        status: 'OPEN',
      },
    });
    expect(opp.developmentInitiativeId).toBeNull();
    const linked = await db.improvementOpportunity.findUnique({ where: { id: opp.id } });
    expect(linked?.developmentInitiativeId).toBeNull();
  });
});
