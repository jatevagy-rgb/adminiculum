/**
 * BE-GROW-004 — recommendation review decision concurrency + run validity
 * (PostgreSQL).
 *
 * Contracts under test:
 *  1. Only a still-PENDING recommendation from a COMPLETED run can receive a
 *     final human review decision (ACCEPT / DECLINE / REQUEST_MORE_INFO).
 *  2. Concurrent ACCEPT vs DECLINE (and duplicate ACCEPT) produce exactly one
 *     canonical winner and never a contradictory Opportunity/recommendation
 *     state; the loser fails explicitly with RECOMMENDATION_ALREADY_REVIEWED.
 *  3. Historical recommendations remain readable after review; nothing is
 *     deleted.
 *  4. Cross-client and non-manager reviewers are denied.
 */

import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  getOpportunityDetail,
  reviewRecommendation,
} from '../src/modules/company-growth/research/service';

const databaseUrl = process.env.GROW_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL || process.env.DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('GROW review decision concurrency + run validity (PostgreSQL)', () => {
  let db: PrismaClient;
  let db2: PrismaClient;
  const suffix = crypto.randomUUID().slice(0, 8);
  const admin = { userId: crypto.randomUUID(), role: 'ADMIN' };
  const partner = { userId: crypto.randomUUID(), role: 'PARTNER' };
  const lawyer = { userId: crypto.randomUUID(), role: 'LAWYER' };
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    db2 = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({
      data: [
        { id: admin.userId, email: `review-admin-${suffix}@test.invalid`, name: 'Review Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
        { id: partner.userId, email: `review-partner-${suffix}@test.invalid`, name: 'Review Partner', role: 'PARTNER', status: 'ACTIVE', isActive: true, skills: [] },
        { id: lawyer.userId, email: `review-lawyer-${suffix}@test.invalid`, name: 'Review Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      ] as any,
    });
    await db.client.createMany({
      data: [
        { id: clientA, name: `Review Client A ${suffix}` },
        { id: clientB, name: `Review Client B ${suffix}` },
      ],
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
    await db2?.$disconnect();
  });

  async function seedRecommendation(opts: { clientId?: string; runStatus?: 'COMPLETED' | 'RUNNING' | 'FAILED'; sufficiency?: string } = {}) {
    const clientId = opts.clientId ?? clientA;
    const run = await db.recommendationRun.create({
      data: {
        clientId,
        status: opts.runStatus ?? 'COMPLETED',
        completedAt: (opts.runStatus ?? 'COMPLETED') === 'COMPLETED' ? new Date() : null,
      },
    });
    const rec = await db.recommendationCandidate.create({
      data: {
        clientId,
        runId: run.id,
        title: 'Sablonosítási lehetőség',
        problemStatement: 'Sok kézi lépés.',
        direction: 'Automatizálás.',
        kind: 'QUICK_FIX',
        sufficiency: opts.sufficiency ?? 'SUPPORTED',
        status: 'PENDING_REVIEW',
      } as any,
    });
    return { run, rec };
  }

  it('1. concurrent ACCEPT vs DECLINE yields exactly one winner and one consistent state', async () => {
    const { rec } = await seedRecommendation();
    const outcomes = await Promise.allSettled([
      reviewRecommendation(admin, clientA, rec.id, { decision: 'ACCEPT' }, db),
      reviewRecommendation(partner, clientA, rec.id, { decision: 'DECLINE' }, db2),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'RECOMMENDATION_ALREADY_REVIEWED' });

    const finalRow = await db.recommendationCandidate.findUniqueOrThrow({ where: { id: rec.id } });
    const winner = (fulfilled[0] as PromiseFulfilledResult<{ opportunity: { id: string } | null }>).value;
    const opportunityCount = await db.improvementOpportunity.count({ where: { recommendationId: rec.id } });
    if (finalRow.status === 'ACCEPTED') {
      expect(opportunityCount).toBe(1);
      expect(winner.opportunity).not.toBeNull();
    } else {
      expect(finalRow.status).toBe('DECLINED');
      expect(opportunityCount).toBe(0);
      expect(winner.opportunity).toBeNull();
    }
    // Exactly one reviewer attestation wins; the loser's write never lands.
    expect(finalRow.reviewedById).toBeTruthy();
  });

  it('2. concurrent duplicate ACCEPT creates no duplicate opportunity', async () => {
    const { rec } = await seedRecommendation();
    const outcomes = await Promise.allSettled([
      reviewRecommendation(admin, clientA, rec.id, { decision: 'ACCEPT', note: 'A' }, db),
      reviewRecommendation(partner, clientA, rec.id, { decision: 'ACCEPT', note: 'B' }, db2),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'RECOMMENDATION_ALREADY_REVIEWED' });

    const finalRow = await db.recommendationCandidate.findUniqueOrThrow({ where: { id: rec.id } });
    expect(finalRow.status).toBe('ACCEPTED');
    expect(await db.improvementOpportunity.count({ where: { recommendationId: rec.id } })).toBe(1);
  });

  it('3. RUNNING and FAILED run recommendations cannot receive any final decision', async () => {
    for (const runStatus of ['RUNNING', 'FAILED'] as const) {
      const { rec } = await seedRecommendation({ runStatus });
      for (const decision of ['ACCEPT', 'DECLINE', 'REQUEST_MORE_INFO'] as const) {
        await expect(reviewRecommendation(admin, clientA, rec.id, { decision }, db))
          .rejects.toMatchObject({ code: 'RECOMMENDATION_RUN_NOT_COMPLETED' });
      }
      const row = await db.recommendationCandidate.findUniqueOrThrow({ where: { id: rec.id } });
      expect(row.status).toBe('PENDING_REVIEW');
      expect(row.reviewedById).toBeNull();
      expect(await db.improvementOpportunity.count({ where: { recommendationId: rec.id } })).toBe(0);
    }
  });

  it('4. a valid COMPLETED-run recommendation succeeds for every decision', async () => {
    const accepted = await seedRecommendation();
    const acceptedResult = await reviewRecommendation(admin, clientA, accepted.rec.id, { decision: 'ACCEPT', note: 'Elfogadva.' }, db);
    expect(acceptedResult.recommendation.status).toBe('ACCEPTED');
    expect(acceptedResult.opportunity).not.toBeNull();

    const declined = await seedRecommendation();
    const declinedResult = await reviewRecommendation(admin, clientA, declined.rec.id, { decision: 'DECLINE' }, db);
    expect(declinedResult.recommendation.status).toBe('DECLINED');
    expect(declinedResult.opportunity).toBeNull();

    const moreInfo = await seedRecommendation({ sufficiency: 'NEEDS_MORE_DATA' });
    const moreInfoResult = await reviewRecommendation(admin, clientA, moreInfo.rec.id, { decision: 'REQUEST_MORE_INFO', note: 'Több adat kell.' }, db);
    expect(moreInfoResult.recommendation.status).toBe('NEEDS_MORE_DATA');
    expect(moreInfoResult.recommendation.reviewNote).toBe('Több adat kell.');
    expect(moreInfoResult.opportunity).toBeNull();
    expect(await db.improvementOpportunity.count({ where: { recommendationId: moreInfo.rec.id } })).toBe(0);
  });

  it('5. reviewed history remains readable and same/conflicting replays fail explicitly', async () => {
    const { rec } = await seedRecommendation();
    await reviewRecommendation(admin, clientA, rec.id, { decision: 'DECLINE', note: 'Elutasítva.' }, db);

    // Conflicting replay: explicit failure, the winning decision never changes.
    await expect(reviewRecommendation(admin, clientA, rec.id, { decision: 'ACCEPT' }, db))
      .rejects.toMatchObject({ code: 'RECOMMENDATION_ALREADY_REVIEWED' });
    // Same-decision replay: also explicit, never a duplicate opportunity.
    await expect(reviewRecommendation(admin, clientA, rec.id, { decision: 'DECLINE' }, db))
      .rejects.toMatchObject({ code: 'RECOMMENDATION_ALREADY_REVIEWED' });

    const detail = await getOpportunityDetail(admin, clientA, rec.id, db);
    expect(detail.status).toBe('DECLINED');
    expect(detail.review).toMatchObject({ byId: admin.userId, note: 'Elutasítva.' });
    expect(await db.improvementOpportunity.count({ where: { recommendationId: rec.id } })).toBe(0);
  });

  it('6. cross-client review is denied and leaves the recommendation untouched', async () => {
    const { rec } = await seedRecommendation();
    await expect(reviewRecommendation(admin, clientB, rec.id, { decision: 'ACCEPT' }, db))
      .rejects.toMatchObject({ code: 'RECOMMENDATION_NOT_FOUND' });
    const row = await db.recommendationCandidate.findUniqueOrThrow({ where: { id: rec.id } });
    expect(row.status).toBe('PENDING_REVIEW');
    expect(await db.improvementOpportunity.count({ where: { recommendationId: rec.id } })).toBe(0);
  });

  it('7. non-manager reviewer is denied', async () => {
    const { rec } = await seedRecommendation();
    await expect(reviewRecommendation(lawyer, clientA, rec.id, { decision: 'ACCEPT' }, db))
      .rejects.toMatchObject({ code: 'GROW_REVIEW_FORBIDDEN' });
    const row = await db.recommendationCandidate.findUniqueOrThrow({ where: { id: rec.id } });
    expect(row.status).toBe('PENDING_REVIEW');
    expect(await db.improvementOpportunity.count({ where: { recommendationId: rec.id } })).toBe(0);
  });
});
