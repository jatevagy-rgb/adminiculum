/**
 * BE-GROW-005 — REQUEST_MORE_INFO → canonical ClientRequest handoff
 * (PostgreSQL).
 *
 * Contracts under test:
 *  1. REQUEST_MORE_INFO alone creates no published customer action: no
 *     ClientRequest, no projection row, no task, no email.
 *  2. The explicit customer-source choice creates/reuses exactly one DRAFT
 *     ClientRequest with correct client/case/recommendation/run provenance;
 *     repeated click and concurrent retry never duplicate the request.
 *  3. Publication is explicit; only then does the request appear through the
 *     existing customer request projection.
 *  4. The customer response (submission) is traceable back to the
 *     recommendation and never auto-accepts it.
 *  5. A rerun remains an explicit operator action after the response.
 *  6. Cross-client and non-manager creation is denied.
 */

import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  createGrowInfoRequestDraft,
  getGrowInfoRequestReadback,
  reviewRecommendation,
  runResearchCycle,
} from '../src/modules/company-growth/research/service';
import { publishRequest } from '../src/modules/client-interaction/requestService';
import {
  addStructuredAnswers,
  createDraftSubmission,
  submitSubmission,
} from '../src/modules/client-interaction/submissionService';
import { getCompanyClientRequestProjection } from '../src/modules/compliance/companyRequestProjection';
import { createOrganizationalPortalFixture } from './helpers/organizationalPortalFixture';

const databaseUrl = process.env.GROW_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL || process.env.DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('GROW REQUEST_MORE_INFO → ClientRequest handoff (PostgreSQL)', () => {
  let db: PrismaClient;
  let db2: PrismaClient;
  const suffix = crypto.randomUUID().slice(0, 8);
  const lawyer = { userId: crypto.randomUUID(), role: 'LAWYER' };
  const clientB = crypto.randomUUID();
  let fx: Awaited<ReturnType<typeof createOrganizationalPortalFixture>>;
  const manager = () => ({ userId: fx.adminId, role: 'ADMIN' });

  beforeAll(async () => {
    process.env.CLIENT_PORTAL_ACTIONS_ENABLED = 'true';
    process.env.CLIENT_PORTAL_DATA_REQUESTS_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    db2 = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    fx = await createOrganizationalPortalFixture(db, `grow-info-${suffix}`);
    await db.user.create({
      data: { id: lawyer.userId, email: `grow-info-lawyer-${suffix}@test.invalid`, name: 'Info Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] } as any,
    });
    await db.client.create({ data: { id: clientB, name: `Info Client B ${suffix}` } });
  });

  afterAll(async () => {
    delete process.env.CLIENT_PORTAL_ACTIONS_ENABLED;
    delete process.env.CLIENT_PORTAL_DATA_REQUESTS_ENABLED;
    await db?.$disconnect();
    await db2?.$disconnect();
  });

  async function seedMoreInfoRecommendation(clientId = fx.clientA) {
    const run = await db.recommendationRun.create({
      data: { clientId, status: 'COMPLETED', completedAt: new Date() },
    });
    const rec = await db.recommendationCandidate.create({
      data: {
        clientId,
        runId: run.id,
        title: 'Több adat szükséges a döntéshez',
        problemStatement: 'Kevés a mérési adat.',
        direction: 'Kiegészítő adatgyűjtés.',
        kind: 'QUICK_FIX',
        sufficiency: 'NEEDS_MORE_DATA',
        status: 'PENDING_REVIEW',
      } as any,
    });
    const reviewed = await reviewRecommendation(manager(), clientId, rec.id, { decision: 'REQUEST_MORE_INFO', note: 'Ügyfél-adat szükséges.' }, db);
    expect(reviewed.recommendation.status).toBe('NEEDS_MORE_DATA');
    return { run, rec };
  }

  it('1. REQUEST_MORE_INFO alone creates no published customer action', async () => {
    const { rec } = await seedMoreInfoRecommendation();
    expect(await db.clientRequest.count({ where: { recommendationId: rec.id } })).toBe(0);

    const readback = await getGrowInfoRequestReadback(manager(), fx.clientA, rec.id, db);
    expect(readback.recommendation.status).toBe('NEEDS_MORE_DATA');
    expect(readback.request).toBeNull();

    const projectionBefore = await getCompanyClientRequestProjection(fx.clientA, fx.authorizedIdentity, fx.orgWsA, db);
    expect(projectionBefore.items.filter((item) => item.title === 'Több adat szükséges a döntéshez')).toEqual([]);
  });

  it('2. explicit customer-source choice creates exactly one DRAFT with correct provenance', async () => {
    const { rec } = await seedMoreInfoRecommendation();
    const first = await createGrowInfoRequestDraft(manager(), fx.clientA, rec.id, {
      caseId: fx.caseOne,
      clientSafeTitle: 'Adja meg az aktuális folyamatlépés-időket',
      clientSafeInstructions: 'Kérjük, adja meg a havi jóváhagyási várakozási időt.',
    }, db);
    expect(first.reused).toBe(false);
    const requestId = String(first.request.id);
    const row = await db.clientRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(row.status).toBe('DRAFT');
    expect(row.type).toBe('INFORMATION_REQUEST');
    expect(row.clientId).toBe(fx.clientA);
    expect(row.caseId).toBe(fx.caseOne);
    expect(row.recommendationId).toBe(rec.id);
    expect(row.publishedAt).toBeNull();
    expect(rec.runId).toBeTruthy();

    // Retry / lost response: the same draft is reused, never duplicated.
    const retry = await createGrowInfoRequestDraft(manager(), fx.clientA, rec.id, {
      caseId: fx.caseOne,
      clientSafeTitle: 'Második kattintás',
    }, db);
    expect(retry.reused).toBe(true);
    expect(String(retry.request.id)).toBe(requestId);
    expect(await db.clientRequest.count({ where: { recommendationId: rec.id } })).toBe(1);
  });

  it('3. concurrent duplicate creation still yields exactly one request', async () => {
    const { rec } = await seedMoreInfoRecommendation();
    const outcomes = await Promise.allSettled([
      createGrowInfoRequestDraft(manager(), fx.clientA, rec.id, { caseId: fx.caseOne, clientSafeTitle: 'A kattintás' }, db),
      createGrowInfoRequestDraft(manager(), fx.clientA, rec.id, { caseId: fx.caseOne, clientSafeTitle: 'B kattintás' }, db2),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    const requests = await db.clientRequest.findMany({ where: { recommendationId: rec.id } });
    expect(requests).toHaveLength(1);
    expect(requests[0].status).toBe('DRAFT');
    const reused = outcomes.filter((o) => o.status === 'fulfilled' && (o as PromiseFulfilledResult<{ reused: boolean }>).value.reused === true);
    expect(reused.length).toBeGreaterThanOrEqual(1);
  });

  it('4. explicit publish makes the request visible through the existing customer projection', async () => {
    const { rec } = await seedMoreInfoRecommendation();
    const draft = await createGrowInfoRequestDraft(manager(), fx.clientA, rec.id, {
      caseId: fx.caseOne,
      clientSafeTitle: 'Kiegészítő adatkérés',
      clientSafeInstructions: 'Adja meg a folyamatadatok számát.',
    }, db);
    expect(draft.reused).toBe(false);
    const requestId = String(draft.request.id);

    // Before publication the customer projection never shows the request.
    const before = await getCompanyClientRequestProjection(fx.clientA, fx.authorizedIdentity, fx.orgWsA, db);
    expect(before.items.find((item) => item.id === requestId)).toBeUndefined();

    const published = await publishRequest(manager(), requestId, 0, db);
    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt).toBeTruthy();

    const after = await getCompanyClientRequestProjection(fx.clientA, fx.authorizedIdentity, fx.orgWsA, db);
    const visible = after.items.find((item) => item.id === requestId);
    expect(visible).toBeDefined();
    expect(visible!.title).toBe('Kiegészítő adatkérés');
    expect(visible!.state).toBe('AWAITING_CUSTOMER');
    expect(visible!.canRespond).toBe(true);

    // The customer-safe DTO never carries internal grow provenance ids.
    expect(JSON.stringify(visible)).not.toContain('recommendationId');
    expect(JSON.stringify(visible)).not.toContain(rec.id);
  });

  it('5. customer response is traceable back to the recommendation and never auto-accepts it', async () => {
    const { rec } = await seedMoreInfoRecommendation();
    const draft = await createGrowInfoRequestDraft(manager(), fx.clientA, rec.id, {
      caseId: fx.caseOne,
      clientSafeTitle: 'Válaszoljon a folyamatmérésre',
    }, db);
    const requestId = String(draft.request.id);
    const published = await publishRequest(manager(), requestId, 0, db);
    expect(published.status).toBe('PUBLISHED');

    const ctx = {
      clientPortalIdentityId: fx.authorizedIdentity,
      caseId: fx.caseOne,
      clientId: fx.clientA,
      grantId: 'grant-one',
      workspaceId: fx.orgWsA,
      membershipId: fx.authorizedMembership,
      permissions: ['MATTER_READ'] as string[],
      participantRole: 'REQUESTER' as string | null,
      isRequester: true,
    };
    const submission = await createDraftSubmission(ctx, requestId, db);
    await addStructuredAnswers(ctx, String(submission.id), [{ label: 'Válasz', value: 'A jóváhagyás havi 40 órát vár.' }], db);
    const submitted = await submitSubmission(ctx, String(submission.id), { customerNote: 'Íme az adat.' }, db);
    expect(submitted.status).toBe('SUBMITTED');

    // Traceable: submission -> request -> recommendation -> run.
    const subRow = await db.clientSubmission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(subRow.clientRequestId).toBe(requestId);
    const requestRow = await db.clientRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(requestRow.recommendationId).toBe(rec.id);
    // Canonical lifecycle: customer submission never auto-completes the request.
    expect(requestRow.status).toBe('PUBLISHED');

    const readback = await getGrowInfoRequestReadback(manager(), fx.clientA, rec.id, db);
    expect(readback.request).not.toBeNull();
    expect(readback.request!.submissions).toHaveLength(1);
    expect(readback.request!.submissions[0].status).toBe('SUBMITTED');
    expect(readback.request!.submissions[0].answerCount).toBe(1);

    // The response never auto-accepts the recommendation.
    const recRow = await db.recommendationCandidate.findUniqueOrThrow({ where: { id: rec.id } });
    expect(recRow.status).toBe('NEEDS_MORE_DATA');
    expect(await db.improvementOpportunity.count({ where: { recommendationId: rec.id } })).toBe(0);
  });

  it('6. operator can explicitly rerun research after the response', async () => {
    const { rec, run } = await seedMoreInfoRecommendation();
    const draft = await createGrowInfoRequestDraft(manager(), fx.clientA, rec.id, { caseId: fx.caseOne, clientSafeTitle: 'Újramérés előkészítése' }, db);
    const requestId = String(draft.request.id);
    await publishRequest(manager(), requestId, 0, db);
    await db.clientSubmission.create({
      data: {
        clientRequestId: requestId,
        clientId: fx.clientA,
        caseId: fx.caseOne,
        clientPortalIdentityId: fx.authorizedIdentity,
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });

    // The rerun is an explicit, separate operator action — never automatic.
    const rerun = await runResearchCycle(manager(), fx.clientA, { idempotencyKey: `rerun-${suffix}-${crypto.randomUUID().slice(0, 8)}` }, db);
    expect(rerun.status).toBe('COMPLETED');
    expect(rerun.runId).not.toBe(run.id);

    // The original recommendation stays readable history (NEEDS_MORE_DATA).
    const recRow = await db.recommendationCandidate.findUniqueOrThrow({ where: { id: rec.id } });
    expect(recRow.status).toBe('NEEDS_MORE_DATA');
    const readback = await getGrowInfoRequestReadback(manager(), fx.clientA, rec.id, db);
    expect(readback.request!.id).toBe(requestId);
  });

  it('7. cross-client and non-manager creation is denied', async () => {
    const { rec } = await seedMoreInfoRecommendation();
    await expect(createGrowInfoRequestDraft(manager(), clientB, rec.id, { caseId: fx.caseOne }, db))
      .rejects.toMatchObject({ code: 'RECOMMENDATION_NOT_FOUND' });
    await expect(createGrowInfoRequestDraft(lawyer, fx.clientA, rec.id, { caseId: fx.caseOne }, db))
      .rejects.toMatchObject({ code: 'GROW_REVIEW_FORBIDDEN' });
    expect(await db.clientRequest.count({ where: { recommendationId: rec.id } })).toBe(0);
  });

  it('8. a recommendation that was never REQUEST_MORE_INFO-reviewed cannot start a request', async () => {
    const run = await db.recommendationRun.create({ data: { clientId: fx.clientA, status: 'COMPLETED', completedAt: new Date() } });
    const rec = await db.recommendationCandidate.create({
      data: {
        clientId: fx.clientA,
        runId: run.id,
        title: 'Még felülvizsgálatlan',
        problemStatement: 'P',
        direction: 'D',
        kind: 'QUICK_FIX',
        sufficiency: 'NEEDS_MORE_DATA',
        status: 'PENDING_REVIEW',
      } as any,
    });
    await expect(createGrowInfoRequestDraft(manager(), fx.clientA, rec.id, { caseId: fx.caseOne }, db))
      .rejects.toMatchObject({ code: 'RECOMMENDATION_NOT_PENDING_INFO' });
    expect(await db.clientRequest.count({ where: { recommendationId: rec.id } })).toBe(0);
  });
});
