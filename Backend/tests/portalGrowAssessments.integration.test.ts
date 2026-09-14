/**
 * GROW CUSTOMER ASSESSMENT JOURNEY — portal runtime integration suite (PostgreSQL).
 *
 * Proves the customer-safe assessment journey end to end:
 *  - catalogue + four V1 packs visible only to an authorized org customer
 *  - cross-client / cross-workspace / membership isolation
 *  - completion persists ONE canonical DECLARED_SURVEY observation (GROW_ASSESSMENT_V1)
 *  - refresh/readback returns COMPLETED with a deterministic latest result
 *  - idempotent replay AND idempotency conflict
 *  - exact schema validation (pack/version/question/answer)
 *  - UNKNOWN produces no negative finding
 *  - customer-safe result: findings/directions/evidence with no internal ids
 *  - submission creates ZERO recommendation / opportunity / initiative / task
 *  - mappable finding enters the Observation → GrowSignal boundary; non-mappable
 *    (strategy/leadership) finding is NOT coerced into a Grow domain
 *  - the existing generic GROW_PAIN_INTAKE survey keeps working
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import express, { Express } from 'express';
import http from 'http';
import { createOrganizationalPortalFixture, OrgPortalFixtureIds } from './helpers/organizationalPortalFixture';
import {
  listPortalGrowAssessments,
} from '../src/modules/company-observatory/assessmentIntake';
import {
  listPortalSurveyIntakes,
  listSurveyIntakes,
} from '../src/modules/company-observatory/intake';
import { listGrowOpportunities, runResearchCycle } from '../src/modules/company-growth/research/service';
import { getAssessmentPack } from '../src/modules/company-growth/assessments/registry';
import { observationToGrowSignals } from '../src/modules/company-growth/research/observationSignals';
import clientPortalRoutes from '../src/routes/clientPortal';

jest.mock('../src/middleware/clientPortalAuth', () => {
  const actual = jest.requireActual('../src/middleware/clientPortalAuth');
  return {
    ...actual,
    authenticateClientPortal: (req: any, res: any, next: any) => {
      const sessionHeader = req.headers['x-client-portal-session'];
      if (sessionHeader) {
        try {
          req.clientPortalSession =
            typeof sessionHeader === 'string' ? JSON.parse(sessionHeader) : sessionHeader;
          return next();
        } catch {
          return res.status(401).json({ status: 401, code: 'CLIENT_PORTAL_AUTH_REQUIRED' });
        }
      }
      return res.status(401).json({
        status: 401,
        code: 'CLIENT_PORTAL_AUTH_REQUIRED',
        message: 'Client portal authentication is required.',
      });
    },
  };
});

function createTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/client-portal', clientPortalRoutes);
  return app;
}

function httpRequest(
  app: Express,
  method: 'GET' | 'POST' | 'PUT',
  reqPath: string,
  headers: Record<string, string> = {},
  bodyData?: any,
): Promise<{ status: number; body: any; rawBody: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Address unavailable'));
        return;
      }
      const serialized = bodyData !== undefined ? JSON.stringify(bodyData) : undefined;
      const finalHeaders: Record<string, string> = { ...headers };
      if (serialized) {
        finalHeaders['content-type'] = 'application/json';
        finalHeaders['content-length'] = Buffer.byteLength(serialized).toString();
      }
      const req = http.request(
        {
          host: '127.0.0.1',
          port: address.port,
          path: reqPath,
          method,
          headers: finalHeaders,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            server.close();
            let parsed = null;
            try {
              parsed = JSON.parse(data);
            } catch {}
            resolve({ status: res.statusCode || 0, body: parsed, rawBody: data });
          });
        },
      );
      req.on('error', (err) => {
        server.close();
        reject(err);
      });
      if (serialized) req.write(serialized);
      req.end();
    });
  });
}

function makeSession(identityId: string, email: string, displayName: string) {
  return JSON.stringify({
    identityType: 'CLIENT_PORTAL',
    issuer: 'https://issuer.invalid/',
    audience: 'adminiculum-client-portal',
    subject: `sub-${identityId}`,
    clientPortalIdentityId: identityId,
    normalizedEmail: email,
    displayName,
    accountType: 'ORGANIZATION_MEMBER',
    status: 'ACTIVE',
    emailVerified: true,
    sessionContext: 'CUSTOMER_IDENTITY_PROVIDER',
  });
}

const databaseUrl =
  process.env.PORTAL_GROW_ASSESSMENT_TEST_DATABASE_URL ||
  process.env.GROW_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL ||
  process.env.DATABASE_URL;

const d = databaseUrl ? describe : describe.skip;

function answersFor(packKey: string, overrides: Record<string, string> = {}, fallback = 'UNKNOWN') {
  const pack = getAssessmentPack(packKey)!;
  return pack.questions.map((q) => ({ questionKey: q.questionKey, answer: overrides[q.questionKey] ?? fallback }));
}

d('GROW CUSTOMER ASSESSMENT JOURNEY (PostgreSQL)', () => {
  let db: PrismaClient;
  let app: Express;
  let ids: OrgPortalFixtureIds;
  const seed = crypto.randomUUID().slice(0, 8);
  const wsARef = `PGA-${seed}`;
  const wsBRef = `PGB-${seed}`;
  const admin = { userId: '', role: 'ADMIN' };

  let orgWsB_forClientB: string;
  let identityB: string;
  let sessionAuthA: string;
  let sessionAuthB: string;

  const NEUTRAL_PROCESS: Record<string, string> = {
    pa_owner: 'YES',
    pa_documented: 'YES',
    pa_stable: 'YES',
    pa_rework: 'NO',
    pa_manual_repetitive: 'NO',
    pa_duplicate_entry: 'NO',
    pa_approval_wait: 'NO',
    pa_measured: 'YES',
    pa_automation_suitable: 'YES',
  };

  const processKey = `assess-process-${seed}-1`;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.CLIENT_PORTAL_READ_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    app = createTestApp();

    ids = await createOrganizationalPortalFixture(db, seed, { publicReferenceA: wsARef });
    admin.userId = ids.adminId;

    orgWsB_forClientB = crypto.randomUUID();
    identityB = crypto.randomUUID();

    await db.clientPortalWorkspace.create({
      data: {
        id: orgWsB_forClientB,
        clientId: ids.clientB,
        name: 'Assessment Client B workspace',
        mode: 'ORGANIZATION',
        status: 'ACTIVE',
        communicationMode: 'PORTAL_PRIMARY',
        connectedSystemState: 'NOT_CONFIGURED',
        publicReference: wsBRef,
        createdById: ids.adminId,
      } as never,
    });
    await db.clientPortalIdentity.create({
      data: {
        id: identityB,
        provider: 'ENTRA_EXTERNAL_ID',
        issuer: 'https://issuer.invalid/',
        subject: `sub-b-${seed}`,
        normalizedEmail: `clientb-${seed}@fixture.invalid`,
        emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
        displayName: 'Client B Customer',
        accountType: 'ORGANIZATION_MEMBER',
        status: 'ACTIVE',
      } as never,
    });
    await db.clientPortalWorkspaceMembership.create({
      data: {
        id: crypto.randomUUID(),
        clientPortalIdentityId: identityB,
        workspaceId: orgWsB_forClientB,
        status: 'ACTIVE',
        role: 'MEMBER',
        approvedAt: new Date('2026-01-01T00:00:00Z'),
        approvedById: ids.adminId,
      } as never,
    });

    sessionAuthA = makeSession(ids.authorizedIdentity, `authorized-${seed}@fixture.invalid`, 'Authorized Customer');
    sessionAuthB = makeSession(identityB, `clientb-${seed}@fixture.invalid`, 'Client B Customer');
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('A. ASSESSMENT_CATALOGUE_VISIBLE_TO_AUTHORIZED_CUSTOMER=PASS', async () => {
    const res = await httpRequest(app, 'GET', '/api/v1/client-portal/org/grow-assessments', {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.packs)).toBe(true);
    expect(res.body.packs).toHaveLength(4);
  });

  it('B. FOUR_V1_PACKS_RETURNED=PASS', async () => {
    const res = await httpRequest(app, 'GET', '/api/v1/client-portal/org/grow-assessments', {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    });
    expect(res.body.packs.map((p: any) => p.packKey)).toEqual([
      'DIGITAL_MATURITY',
      'TRANSFORMATION_READINESS',
      'PROCESS_AUTOMATION_READINESS',
      'SYSTEMS_DATA_FLOW',
    ]);
    for (const pack of res.body.packs) {
      expect(pack.status).toBe('NOT_STARTED');
      expect(pack.questionCount).toBeGreaterThanOrEqual(8);
      expect(pack.estimatedMinutes).toBeGreaterThan(0);
    }
  });

  it('C. CUSTOMER_A_CANNOT_ACCESS_CUSTOMER_B_DATA=PASS', async () => {
    const cross = await httpRequest(app, 'GET', '/api/v1/client-portal/org/grow-assessments', {
      'x-client-portal-session': sessionAuthB,
      'x-client-portal-workspace': wsARef,
    });
    expect(cross.status).toBe(403);
    expect(cross.body.code).toBe('CLIENT_WORKSPACE_FORBIDDEN');

    const own = await httpRequest(app, 'GET', '/api/v1/client-portal/org/grow-assessments', {
      'x-client-portal-session': sessionAuthB,
      'x-client-portal-workspace': wsBRef,
    });
    expect(own.status).toBe(200);
    expect(own.body.packs.every((p: any) => p.status === 'NOT_STARTED')).toBe(true);
  });

  it('D. MEMBER_WORKSPACE_AUTHORITY_PRESERVED=PASS', async () => {
    const unauthenticated = await httpRequest(app, 'GET', '/api/v1/client-portal/org/grow-assessments', {
      'x-client-portal-workspace': wsARef,
    });
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.code).toBe('CLIENT_PORTAL_AUTH_REQUIRED');

    const noMemIdentity = crypto.randomUUID();
    await db.clientPortalIdentity.create({
      data: {
        id: noMemIdentity,
        provider: 'ENTRA_EXTERNAL_ID',
        issuer: 'https://issuer.invalid/',
        subject: `sub-nomem-${seed}`,
        normalizedEmail: `nomem-${seed}@fixture.invalid`,
        emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
        displayName: 'No Membership',
        accountType: 'ORGANIZATION_MEMBER',
        status: 'ACTIVE',
      } as never,
    });
    const noMem = await httpRequest(app, 'POST', '/api/v1/client-portal/org/grow-assessments/DIGITAL_MATURITY/submissions', {
      'x-client-portal-session': makeSession(noMemIdentity, `nomem-${seed}@fixture.invalid`, 'No Membership'),
      'x-client-portal-workspace': wsARef,
    }, { answers: answersFor('DIGITAL_MATURITY'), idempotencyKey: `assess-nomem-${seed}` });
    expect(noMem.status).toBe(403);
    expect(noMem.body.code).toBe('CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED');
  });

  it('E. COMPLETION_PERSISTS_ONE_CANONICAL_DECLARED_SURVEY_OBSERVATION=PASS', async () => {
    const res = await httpRequest(app, 'POST', `/api/v1/client-portal/org/grow-assessments/PROCESS_AUTOMATION_READINESS/submissions`, {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    }, {
      answers: answersFor('PROCESS_AUTOMATION_READINESS', { ...NEUTRAL_PROCESS, pa_manual_repetitive: 'YES' }),
      idempotencyKey: processKey,
    });
    expect(res.status).toBe(201);
    expect(res.body.submission.replayed).toBe(false);

    const rows = await db.observation.findMany({
      where: { clientId: ids.clientA, idempotencyKey: processKey },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].observationType).toBe('DECLARED_SURVEY');
    const payload = rows[0].rawPayload as any;
    expect(payload.schema).toBe('GROW_ASSESSMENT_V1');
    expect(payload.packKey).toBe('PROCESS_AUTOMATION_READINESS');
    expect(payload.packVersion).toBe(1);
    expect(payload.provenance.channel).toBe('CLIENT_PORTAL');
    expect(payload.provenance.workspaceId).toBe(ids.orgWsA);
  });

  it('F. REFRESH_READBACK_RETURNS_COMPLETED_STATE=PASS', async () => {
    const catalogue = await httpRequest(app, 'GET', '/api/v1/client-portal/org/grow-assessments', {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    });
    const pack = catalogue.body.packs.find((p: any) => p.packKey === 'PROCESS_AUTOMATION_READINESS');
    expect(pack.status).toBe('COMPLETED');
    expect(pack.latestCompletedAt).toBeTruthy();
    expect(pack.latestFindingCount).toBeGreaterThan(0);

    const detail = await httpRequest(app, 'GET', '/api/v1/client-portal/org/grow-assessments/PROCESS_AUTOMATION_READINESS', {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    });
    expect(detail.status).toBe(200);
    expect(detail.body.definition.questions.length).toBeGreaterThanOrEqual(8);
    expect(detail.body.latestResult).not.toBeNull();
  });

  it('G. LATEST_RESULT_IS_DETERMINISTIC=PASS', async () => {
    const first = await httpRequest(app, 'GET', '/api/v1/client-portal/org/grow-assessments/PROCESS_AUTOMATION_READINESS', {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    });
    const second = await httpRequest(app, 'GET', '/api/v1/client-portal/org/grow-assessments/PROCESS_AUTOMATION_READINESS', {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    });
    expect(first.body.latestResult).toEqual(second.body.latestResult);
    expect(first.body.latestResult.findings.length).toBeGreaterThan(0);
    expect(first.body.latestResult.directions.length).toBeGreaterThan(0);
    expect(first.body.latestResult.evidence.length).toBeGreaterThan(0);
  });

  it('H. IDEMPOTENT_REPLAY_SAME_KEY_SAME_PAYLOAD=PASS', async () => {
    const countBefore = await db.observation.count({ where: { clientId: ids.clientA } });
    const res = await httpRequest(app, 'POST', `/api/v1/client-portal/org/grow-assessments/PROCESS_AUTOMATION_READINESS/submissions`, {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    }, {
      answers: answersFor('PROCESS_AUTOMATION_READINESS', { ...NEUTRAL_PROCESS, pa_manual_repetitive: 'YES' }),
      idempotencyKey: processKey,
    });
    expect(res.status).toBe(200);
    expect(res.body.submission.replayed).toBe(true);
    expect(await db.observation.count({ where: { clientId: ids.clientA } })).toBe(countBefore);
  });

  it('I. IDEMPOTENCY_CONFLICT_CHANGED_ANSWERS=PASS', async () => {
    const countBefore = await db.observation.count({ where: { clientId: ids.clientA } });
    const res = await httpRequest(app, 'POST', `/api/v1/client-portal/org/grow-assessments/PROCESS_AUTOMATION_READINESS/submissions`, {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    }, {
      answers: answersFor('PROCESS_AUTOMATION_READINESS', { ...NEUTRAL_PROCESS, pa_manual_repetitive: 'NO' }),
      idempotencyKey: processKey,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await db.observation.count({ where: { clientId: ids.clientA } })).toBe(countBefore);
  });

  it('J. INVALID_PACK_REJECTED=PASS', async () => {
    const res = await httpRequest(app, 'POST', '/api/v1/client-portal/org/grow-assessments/NOT_A_PACK/submissions', {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    }, { answers: [], idempotencyKey: `assess-badpack-${seed}` });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ASSESSMENT_UNKNOWN_PACK');
  });

  it('K. INVALID_QUESTION_REJECTED=PASS', async () => {
    const answers = answersFor('DIGITAL_MATURITY');
    answers[0] = { questionKey: 'not_a_question', answer: 'YES' } as never;
    const res = await httpRequest(app, 'POST', '/api/v1/client-portal/org/grow-assessments/DIGITAL_MATURITY/submissions', {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    }, { answers, idempotencyKey: `assess-badq-${seed}` });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ASSESSMENT_UNKNOWN_QUESTION');
  });

  it('L. INVALID_ANSWER_REJECTED=PASS', async () => {
    const answers = answersFor('DIGITAL_MATURITY');
    answers[0] = { questionKey: answers[0].questionKey, answer: 'MAYBE' };
    const res = await httpRequest(app, 'POST', '/api/v1/client-portal/org/grow-assessments/DIGITAL_MATURITY/submissions', {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    }, { answers, idempotencyKey: `assess-bada-${seed}` });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ASSESSMENT_INVALID_ANSWER');
  });

  it('M. UNKNOWN_ANSWER_PRODUCES_NO_NEGATIVE_FINDING=PASS', async () => {
    const res = await httpRequest(app, 'POST', '/api/v1/client-portal/org/grow-assessments/DIGITAL_MATURITY/submissions', {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    }, { answers: answersFor('DIGITAL_MATURITY', {}, 'UNKNOWN'), idempotencyKey: `assess-unknown-${seed}` });
    expect(res.status).toBe(201);
    expect(res.body.result.findings).toHaveLength(0);
    expect(res.body.result.unknownAreaCount).toBeGreaterThan(0);
  });

  it('N. RESULT_IS_CUSTOMER_SAFE_NO_INTERNAL_IDS=PASS', async () => {
    const res = await httpRequest(app, 'GET', '/api/v1/client-portal/org/grow-assessments/PROCESS_AUTOMATION_READINESS', {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    });
    const serialized = JSON.stringify(res.body.latestResult);
    expect(serialized).not.toMatch(/observationId|discoveryRunId|connectionId|clientId|rawPayload|corpusKey/);
    expect(serialized).not.toMatch(/\bclientId\b/);
    expect(res.body.latestResult).not.toHaveProperty('id');
    expect(res.body.latestResult.findings[0]).not.toHaveProperty('findingKey');
  });

  it('O. SUBMISSION_CREATES_ZERO_AUTOMATIC_DOWNSTREAM_OBJECTS=PASS', async () => {
    const before = {
      recommendations: await db.recommendationCandidate.count({ where: { clientId: ids.clientA } }),
      opportunities: await db.improvementOpportunity.count({ where: { clientId: ids.clientA } }),
      initiatives: await db.developmentInitiative.count({ where: { clientId: ids.clientA } }),
      tasks: await db.task.count({ where: { case: { clientId: ids.clientA } } }),
    };
    const res = await httpRequest(app, 'POST', '/api/v1/client-portal/org/grow-assessments/SYSTEMS_DATA_FLOW/submissions', {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    }, {
      answers: answersFor('SYSTEMS_DATA_FLOW', { sd_reentry: 'YES' }, 'UNKNOWN'),
      idempotencyKey: `assess-zero-${seed}`,
    });
    expect(res.status).toBe(201);
    expect(await db.recommendationCandidate.count({ where: { clientId: ids.clientA } })).toBe(before.recommendations);
    expect(await db.improvementOpportunity.count({ where: { clientId: ids.clientA } })).toBe(before.opportunities);
    expect(await db.developmentInitiative.count({ where: { clientId: ids.clientA } })).toBe(before.initiatives);
    expect(await db.task.count({ where: { case: { clientId: ids.clientA } } })).toBe(before.tasks);
  });

  it('P. MAPPABLE_PROCESS_FINDING_IS_CONSUMABLE_BY_GROW_SIGNAL_BOUNDARY=PASS', async () => {
    const obs = await db.observation.findFirst({ where: { clientId: ids.clientA, idempotencyKey: processKey } });
    expect(obs).not.toBeNull();
    const signals = observationToGrowSignals({
      id: obs!.id,
      observationType: obs!.observationType,
      rawPayload: obs!.rawPayload,
      observedAt: obs!.observedAt,
      sourceRecordId: obs!.sourceRecordId,
    });
    expect(signals.map((s) => s.domainKey)).toContain('MANUAL_ADMIN_LOAD');

    const cycle = await runResearchCycle(admin, ids.clientA, { idempotencyKey: `research-assess-${seed}` }, db);
    expect(cycle.status).toBe('COMPLETED');
    expect(cycle.diagnosisCount).toBeGreaterThan(0);
    const opportunities = await listGrowOpportunities(admin, ids.clientA, db);
    expect(opportunities.some((o) => o.domainKey === 'MANUAL_ADMIN_LOAD')).toBe(true);
  });

  it('Q. NON_MAPPABLE_STRATEGY_FINDING_NOT_COERCED=PASS', async () => {
    const res = await httpRequest(app, 'POST', '/api/v1/client-portal/org/grow-assessments/DIGITAL_MATURITY/submissions', {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    }, {
      answers: answersFor('DIGITAL_MATURITY', { dm_strategy_alignment: 'NO' }, 'UNKNOWN'),
      idempotencyKey: `assess-strategy-${seed}`,
    });
    expect(res.status).toBe(201);
    expect(
      res.body.result.findings.some((f: any) => /üzleti célok kapcsolata/i.test(f.titleHu)),
    ).toBe(true);

    const obs = await db.observation.findFirst({ where: { clientId: ids.clientA, idempotencyKey: `assess-strategy-${seed}` } });
    const signals = observationToGrowSignals({
      id: obs!.id,
      observationType: obs!.observationType,
      rawPayload: obs!.rawPayload,
      observedAt: obs!.observedAt,
      sourceRecordId: obs!.sourceRecordId,
    });
    expect(signals).toHaveLength(0);
  });

  it('R. GENERIC_GROW_PAIN_INTAKE_SURVEY_STILL_FUNCTIONAL=PASS', async () => {
    const marker = `survey-marker-${seed}`;
    const post = await httpRequest(app, 'POST', '/api/v1/client-portal/org/grow-survey', {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    }, { categories: ['REWORK'], freeText: marker, idempotencyKey: `assess-survey-${seed}` });
    expect(post.status).toBe(201);

    const surveyList = await httpRequest(app, 'GET', '/api/v1/client-portal/org/grow-survey', {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    });
    expect(surveyList.status).toBe(200);
    const texts = surveyList.body.items.map((i: any) => i.freeText);
    expect(texts).toContain(marker);
    // Assessment submissions must NOT appear as survey feedback.
    expect(surveyList.body.items.every((i: any) => Array.isArray(i.categoryLabels))).toBe(true);
    expect(surveyList.body.items.some((i: any) => i.freeText === null && i.categoryLabels.length === 0)).toBe(false);

    // Workforce readback shares the canonical set and also excludes assessments.
    const workforce = await listSurveyIntakes(admin, ids.clientA, db);
    expect(workforce.some((w) => (w.payload as any)?.freeText === marker)).toBe(true);
    expect(workforce.every((w) => (w.payload as any)?.kind === 'GROW_PAIN_INTAKE')).toBe(true);

    // Assessment readback is workspace-scoped and separate from the survey feed.
    const assessments = await listPortalGrowAssessments(ids.authorizedIdentity, ids.orgWsA, db);
    expect(assessments.items.length).toBeGreaterThan(0);
    expect(assessments.items.every((i) => i.packKey.length > 0)).toBe(true);

    // The org Grow view still exposes the survey readback.
    const grow = await httpRequest(app, 'GET', '/api/v1/client-portal/org/grow', {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    });
    expect(grow.status).toBe(200);
    expect(Array.isArray(grow.body.surveys)).toBe(true);
    expect(grow.body.surveys.some((s: any) => s.freeText === marker)).toBe(true);
  });

  it('S. COMPLETED_PACK_SURVIVES_HIGH_SUBMISSION_VOLUME=PASS', async () => {
    const reference = await db.observation.findFirst({
      where: { clientId: ids.clientA, idempotencyKey: processKey },
    });
    expect(reference).not.toBeNull();
    const connection = await db.externalSourceConnection.findFirst({
      where: { clientId: ids.clientA, sourceType: 'SURVEY' },
    });
    expect(connection).not.toBeNull();

    // Push the older completed PROCESS_AUTOMATION_READINESS submission well
    // outside a newest-50 window by flooding a DIFFERENT pack with newer rows.
    const answers = answersFor('DIGITAL_MATURITY', {}, 'UNKNOWN');
    const base = Date.now() + 60_000;
    const rows = Array.from({ length: 55 }, (_, i) => ({
      id: crypto.randomUUID(),
      clientId: ids.clientA,
      connectionId: connection!.id,
      discoveryRunId: reference!.discoveryRunId,
      idempotencyKey: `assess-flood-${seed}-${i}`,
      inputDigest: crypto.createHash('sha256').update(`flood-${seed}-${i}`).digest('hex'),
      observationType: 'DECLARED_SURVEY',
      observedAt: new Date(base + i * 1000),
      rawPayload: {
        schema: 'GROW_ASSESSMENT_V1',
        kind: 'GROW_ASSESSMENT',
        packKey: 'DIGITAL_MATURITY',
        packVersion: 1,
        answers,
        processId: null,
        provenance: { channel: 'CLIENT_PORTAL', workspaceId: ids.orgWsA, identityId: ids.authorizedIdentity },
      },
    }));
    await db.observation.createMany({ data: rows as never });

    const catalogue = await httpRequest(app, 'GET', '/api/v1/client-portal/org/grow-assessments', {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    });
    const older = catalogue.body.packs.find((p: any) => p.packKey === 'PROCESS_AUTOMATION_READINESS');
    // Must be COMPLETED even though its newest row fell outside the newest 50.
    expect(older.status).toBe('COMPLETED');
    expect(older.latestFindingCount).toBeGreaterThan(0);

    const digital = catalogue.body.packs.find((p: any) => p.packKey === 'DIGITAL_MATURITY');
    expect(digital.status).toBe('COMPLETED');
  });

  it('T. PROCESS_SCOPED_SUBMISSION_PERSISTS_SELECTED_PROCESS=PASS', async () => {
    const processId = crypto.randomUUID();
    await db.businessProcess.create({
      data: {
        id: processId,
        clientId: ids.clientA,
        name: `Scoped assessment process ${seed}`,
        status: 'ACTIVE',
      } as never,
    });

    const res = await httpRequest(
      app,
      'POST',
      '/api/v1/client-portal/org/grow-assessments/PROCESS_AUTOMATION_READINESS/submissions',
      {
        'x-client-portal-session': sessionAuthA,
        'x-client-portal-workspace': wsARef,
      },
      {
        answers: answersFor('PROCESS_AUTOMATION_READINESS', { ...NEUTRAL_PROCESS, pa_manual_repetitive: 'YES' }),
        idempotencyKey: `assess-scoped-${seed}`,
        processId,
      },
    );
    expect(res.status).toBe(201);

    const rows = await db.observation.findMany({
      where: { clientId: ids.clientA, idempotencyKey: `assess-scoped-${seed}` },
    });
    expect(rows).toHaveLength(1);
    expect((rows[0].rawPayload as any).processId).toBe(processId);

    const assessments = await listPortalGrowAssessments(ids.authorizedIdentity, ids.orgWsA, db);
    const scoped = assessments.items.find((i) => i.packKey === 'PROCESS_AUTOMATION_READINESS');
    expect(scoped?.processId).toBe(processId);
  });

  it('U. COMPLETED_ZERO_FINDINGS_AND_UNKNOWN_SUMMARY=PASS', async () => {
    const res = await httpRequest(
      app,
      'POST',
      '/api/v1/client-portal/org/grow-assessments/TRANSFORMATION_READINESS/submissions',
      {
        'x-client-portal-session': sessionAuthA,
        'x-client-portal-workspace': wsARef,
      },
      {
        answers: answersFor('TRANSFORMATION_READINESS', {}, 'UNKNOWN'),
        idempotencyKey: `assess-zero-find-${seed}`,
      },
    );
    expect(res.status).toBe(201);
    expect(res.body.result.findings).toHaveLength(0);
    expect(res.body.result.unknownAreaCount).toBeGreaterThan(0);

    const catalogue = await httpRequest(app, 'GET', '/api/v1/client-portal/org/grow-assessments', {
      'x-client-portal-session': sessionAuthA,
      'x-client-portal-workspace': wsARef,
    });
    const pack = catalogue.body.packs.find((p: any) => p.packKey === 'TRANSFORMATION_READINESS');
    // Completed with zero findings must still read COMPLETED (the UI bases its
    // empty message on completion status, not on aggregated finding count).
    expect(pack.status).toBe('COMPLETED');
    expect(pack.latestFindingCount).toBe(0);
    expect(catalogue.body.aggregatedUnknownAreaCount).toBeGreaterThan(0);
  });

  it('V. PROCESS_REFERENCE_INVALID_DENIED=PASS', async () => {
    const res = await httpRequest(
      app,
      'POST',
      '/api/v1/client-portal/org/grow-assessments/PROCESS_AUTOMATION_READINESS/submissions',
      {
        'x-client-portal-session': sessionAuthA,
        'x-client-portal-workspace': wsARef,
      },
      {
        answers: answersFor('PROCESS_AUTOMATION_READINESS', { ...NEUTRAL_PROCESS, pa_manual_repetitive: 'YES' }),
        idempotencyKey: `assess-badproc-${seed}`,
        processId: crypto.randomUUID(),
      },
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ASSESSMENT_PROCESS_REFERENCE_INVALID');
    expect(
      await db.observation.count({ where: { clientId: ids.clientA, idempotencyKey: `assess-badproc-${seed}` } }),
    ).toBe(0);
  });

  it('W. PROCESS_REFERENCE_CROSS_CLIENT_DENIED=PASS', async () => {
    const foreignProcessId = crypto.randomUUID();
    await db.businessProcess.create({
      data: {
        id: foreignProcessId,
        clientId: ids.clientB,
        name: `Foreign process ${seed}`,
        status: 'ACTIVE',
      } as never,
    });

    const res = await httpRequest(
      app,
      'POST',
      '/api/v1/client-portal/org/grow-assessments/PROCESS_AUTOMATION_READINESS/submissions',
      {
        'x-client-portal-session': sessionAuthA,
        'x-client-portal-workspace': wsARef,
      },
      {
        answers: answersFor('PROCESS_AUTOMATION_READINESS', { ...NEUTRAL_PROCESS, pa_manual_repetitive: 'YES' }),
        idempotencyKey: `assess-foreignproc-${seed}`,
        processId: foreignProcessId,
      },
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ASSESSMENT_PROCESS_REFERENCE_INVALID');
  });

  it('X. NON_PROCESS_PACK_PROCESS_REFERENCE_IGNORED=PASS', async () => {
    const processId = crypto.randomUUID();
    await db.businessProcess.create({
      data: {
        id: processId,
        clientId: ids.clientA,
        name: `Non-process-pack scope ${seed}`,
        status: 'ACTIVE',
      } as never,
    });

    const res = await httpRequest(
      app,
      'POST',
      '/api/v1/client-portal/org/grow-assessments/DIGITAL_MATURITY/submissions',
      {
        'x-client-portal-session': sessionAuthA,
        'x-client-portal-workspace': wsARef,
      },
      {
        answers: answersFor('DIGITAL_MATURITY', {}, 'UNKNOWN'),
        idempotencyKey: `assess-nonprocess-${seed}`,
        processId,
      },
    );
    expect(res.status).toBe(201);

    const rows = await db.observation.findMany({
      where: { clientId: ids.clientA, idempotencyKey: `assess-nonprocess-${seed}` },
    });
    expect(rows).toHaveLength(1);
    // DIGITAL_MATURITY does not allow a process reference → persisted as unscoped.
    expect((rows[0].rawPayload as any).processId).toBeNull();
  });
});
