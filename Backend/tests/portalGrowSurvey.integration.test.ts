/**
 * GROW WITH US P0-A: CUSTOMER SURVEY RUNTIME INTEGRATION SUITE (PostgreSQL).
 *
 * Verifies all 17 required runtime invariants:
 * 1.  PORTAL_SURVEY_PERSISTED_IN_SHARED_GROW_ENGINE=PASS
 * 2.  PORTAL_SURVEY_CREATES_CONNECTION_RUN_OBSERVATION=PASS
 * 3.  PORTAL_SURVEY_CANONICAL_SOURCE_TYPE_SURVEY=PASS
 * 4.  PORTAL_SURVEY_DECLARED_SURVEY_OBSERVATION=PASS
 * 5.  PORTAL_SURVEY_TRUTHFUL_PROVENANCE_AND_CHANNEL=PASS
 * 6.  PORTAL_SURVEY_NO_SECRETS_STORED=PASS
 * 7.  PORTAL_SURVEY_CLIENT_DERIVED_FROM_WORKSPACE_IDENTITY=PASS
 * 8.  PORTAL_SURVEY_CROSS_TENANT_REJECTED=PASS
 * 9.  PORTAL_SURVEY_UNAUTHENTICATED_REJECTED=PASS
 * 10. PORTAL_SURVEY_MISSING_MEMBERSHIP_REJECTED=PASS
 * 11. PORTAL_SURVEY_IDEMPOTENT_REPLAY=PASS
 * 12. PORTAL_SURVEY_WORKFORCE_RUN_RESEARCH_CYCLE_CONSUMES_IT=PASS
 * 13. PORTAL_SURVEY_NO_AUTOMATIC_TASK_OR_RECOMMENDATION=PASS
 * 14. PORTAL_SURVEY_CUSTOMER_READBACK_SAFE=PASS
 * 15. PORTAL_SURVEY_READBACK_CROSS_TENANT_ISOLATED=PASS
 * 16. PORTAL_SURVEY_ORGANIZATIONAL_GROW_VIEW_INCLUDES_SURVEYS=PASS
 * 17. PORTAL_SURVEY_SHARED_PERSISTENCE_NOT_DUPLICATE_ENGINE=PASS
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import express, { Express } from 'express';
import http from 'http';
import {
  createOrganizationalPortalFixture,
  OrgPortalFixtureIds,
} from './helpers/organizationalPortalFixture';
import {
  submitSurveyIntake,
  listSurveyIntakes,
  submitPortalSurveyIntake,
  listPortalSurveyIntakes,
} from '../src/modules/company-observatory/intake';
import { runResearchCycle, listGrowOpportunities } from '../src/modules/company-growth/research/service';
import clientPortalRoutes from '../src/routes/clientPortal';

// Mock authenticateClientPortal so route-level requests can supply a trusted test session
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
      const auth = req.headers.authorization;
      if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({
          status: 401,
          code: 'CLIENT_PORTAL_AUTH_REQUIRED',
          message: 'Client portal authentication is required.',
        });
      }
      return actual.authenticateClientPortal(req, res, next);
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
      if (serialized) {
        req.write(serialized);
      }
      req.end();
    });
  });
}

function makeSession(
  identityId: string,
  email: string,
  displayName: string,
  status = 'ACTIVE',
  emailVerified = true,
) {
  return JSON.stringify({
    identityType: 'CLIENT_PORTAL',
    issuer: 'https://issuer.invalid/',
    audience: 'adminiculum-client-portal',
    subject: `sub-${identityId}`,
    clientPortalIdentityId: identityId,
    normalizedEmail: email,
    displayName,
    accountType: 'ORGANIZATION_MEMBER',
    status,
    emailVerified,
    sessionContext: 'CUSTOMER_IDENTITY_PROVIDER',
  });
}

const databaseUrl =
  process.env.PORTAL_SURVEY_TEST_DATABASE_URL ||
  process.env.GROW_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL ||
  process.env.DATABASE_URL;

const d = databaseUrl ? describe : describe.skip;

d('GROW WITH US P0-A: Customer Survey Runtime (PostgreSQL)', () => {
  let db: PrismaClient;
  let app: Express;
  let ids: OrgPortalFixtureIds;
  const seed = crypto.randomUUID().slice(0, 8);
  const wsARef = `PW-A-${seed}`;
  const wsBRef = `PW-B-${seed}`;
  const admin = { userId: '', role: 'ADMIN' };

  // Tenant B setup
  let orgWsB_forClientB: string;
  let identityB: string;
  let sessionAuthA: string;
  let sessionAuthB: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.CLIENT_PORTAL_READ_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    app = createTestApp();

    ids = await createOrganizationalPortalFixture(db, seed, { publicReferenceA: wsARef });
    admin.userId = ids.adminId;

    // Create a dedicated workspace and identity on Client B for cross-tenant isolation testing
    orgWsB_forClientB = crypto.randomUUID();
    identityB = crypto.randomUUID();

    await db.clientPortalWorkspace.create({
      data: {
        id: orgWsB_forClientB,
        clientId: ids.clientB,
        name: 'Phase5 Org Workspace Client B',
        mode: 'ORGANIZATION',
        status: 'ACTIVE',
        communicationMode: 'PORTAL_PRIMARY',
        connectedSystemState: 'NOT_CONFIGURED',
        publicReference: wsBRef,
        createdById: ids.adminId,
      },
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
      },
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
      },
    });

    sessionAuthA = makeSession(ids.authorizedIdentity, `authorized-${seed}@fixture.invalid`, 'Authorized Customer');
    sessionAuthB = makeSession(identityB, `clientb-${seed}@fixture.invalid`, 'Client B Customer');
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  // Track the primary submitted observation for subsequent assertions
  let createdObsId: string;
  let createdRunId: string;
  let createdConnId: string;
  const surveyKey1 = `survey-portal-${seed}-1`;

  it('1. PORTAL_SURVEY_PERSISTED_IN_SHARED_GROW_ENGINE=PASS', async () => {
    const res = await httpRequest(
      app,
      'POST',
      '/api/v1/client-portal/org/grow-survey',
      {
        'x-client-portal-session': sessionAuthA,
        'x-client-portal-workspace': wsARef,
      },
      {
        categories: ['APPROVAL_DELAY', 'REWORK'],
        freeText: 'A jóváhagyások túl lassan haladnak át a pénzügyi osztályon.',
        idempotencyKey: surveyKey1,
      },
    );

    expect(res.status).toBe(201);
    expect(res.body.status).toBe(201);
    expect(res.body.replayed).toBe(false);
    expect(res.body.success).toBe(true);

    // Confirm stored in PostgreSQL in the shared observatory engine
    const obs = await db.observation.findFirst({
      where: {
        clientId: ids.clientA,
        observationType: 'DECLARED_SURVEY',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(obs).not.toBeNull();
    createdObsId = obs!.id;
    createdRunId = obs!.discoveryRunId;
    createdConnId = obs!.connectionId;
  });

  it('2. PORTAL_SURVEY_CREATES_CONNECTION_RUN_OBSERVATION=PASS', async () => {
    expect(createdObsId).toBeDefined();
    expect(createdRunId).toBeDefined();
    expect(createdConnId).toBeDefined();

    const conn = await db.externalSourceConnection.findUnique({ where: { id: createdConnId } });
    expect(conn).not.toBeNull();
    expect(conn!.clientId).toBe(ids.clientA);

    const run = await db.discoveryRun.findUnique({ where: { id: createdRunId } });
    expect(run).not.toBeNull();
    expect(run!.connectionId).toBe(createdConnId);
    expect(run!.clientId).toBe(ids.clientA);

    const obs = await db.observation.findUnique({ where: { id: createdObsId } });
    expect(obs).not.toBeNull();
    expect(obs!.discoveryRunId).toBe(createdRunId);
    expect(obs!.connectionId).toBe(createdConnId);
  });

  it('3. PORTAL_SURVEY_CANONICAL_SOURCE_TYPE_SURVEY=PASS', async () => {
    const conn = await db.externalSourceConnection.findUnique({ where: { id: createdConnId } });
    expect(conn!.sourceType).toBe('SURVEY');
  });

  it('4. PORTAL_SURVEY_DECLARED_SURVEY_OBSERVATION=PASS', async () => {
    const obs = await db.observation.findUnique({ where: { id: createdObsId } });
    expect(obs!.observationType).toBe('DECLARED_SURVEY');
  });

  it('5. PORTAL_SURVEY_TRUTHFUL_PROVENANCE_AND_CHANNEL=PASS', async () => {
    const obs = await db.observation.findUnique({ where: { id: createdObsId } });
    const run = await db.discoveryRun.findUnique({ where: { id: createdRunId } });

    const payload = obs!.rawPayload as any;
    expect(payload).toBeDefined();
    expect(payload.provenance).toBeDefined();
    expect(payload.provenance.channel).toBe('CLIENT_PORTAL');
    expect(payload.provenance.workspaceId).toBe(ids.orgWsA);
    expect(payload.provenance.identityId).toBe(ids.authorizedIdentity);
    expect(obs!.idempotencyKey).toBe(surveyKey1);
    expect(obs!.observedAt).toBeDefined();
    expect(run!.startedAt).toBeDefined();
  });

  it('6. PORTAL_SURVEY_NO_SECRETS_STORED=PASS', async () => {
    const obs = await db.observation.findUnique({ where: { id: createdObsId } });
    const run = await db.discoveryRun.findUnique({ where: { id: createdRunId } });
    const conn = await db.externalSourceConnection.findUnique({ where: { id: createdConnId } });

    const combined = JSON.stringify({
      obsPayload: obs?.rawPayload,
      connConfig: conn?.config,
      runStatus: run?.status,
    });

    expect(combined).not.toMatch(/Bearer/i);
    expect(combined).not.toMatch(/clientPortalSession/i);
    expect(combined).not.toMatch(/ENTRA_EXTERNAL_ID/i);
    expect(combined).not.toMatch(/password/i);
    expect(combined).not.toMatch(/sessionContext/i);
  });

  it('7. PORTAL_SURVEY_CLIENT_DERIVED_FROM_WORKSPACE_IDENTITY=PASS', async () => {
    // Attempt to spoof clientId in the body to Client B while workspace resolves to client A
    const spoofKey = `survey-spoof-${seed}`;
    const res = await httpRequest(
      app,
      'POST',
      '/api/v1/client-portal/org/grow-survey',
      {
        'x-client-portal-session': sessionAuthA,
        'x-client-portal-workspace': wsARef,
      },
      {
        clientId: ids.clientB, // spoof attempt in body!
        categories: ['COMMUNICATION_OVERHEAD'],
        freeText: 'Spoof attempt',
        idempotencyKey: spoofKey,
      },
    );

    expect(res.status).toBe(201);
    // The observation must have been stored under clientA (the workspace's client), NOT clientB
    const obs = await db.observation.findFirst({
      where: {
        idempotencyKey: spoofKey,
      },
    });
    expect(obs).not.toBeNull();
    expect(obs!.clientId).toBe(ids.clientA);
    expect(obs!.clientId).not.toBe(ids.clientB);
  });

  it('8. PORTAL_SURVEY_CROSS_TENANT_REJECTED=PASS', async () => {
    // Client B user trying to submit survey to Client A's workspace reference
    const res = await httpRequest(
      app,
      'POST',
      '/api/v1/client-portal/org/grow-survey',
      {
        'x-client-portal-session': sessionAuthB,
        'x-client-portal-workspace': wsARef,
      },
      {
        categories: ['BOTTLENECK'],
        freeText: 'Cross tenant attack',
        idempotencyKey: `survey-cross-${seed}`,
      },
    );

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CLIENT_WORKSPACE_FORBIDDEN');
  });

  it('9. PORTAL_SURVEY_UNAUTHENTICATED_REJECTED=PASS', async () => {
    const res = await httpRequest(
      app,
      'POST',
      '/api/v1/client-portal/org/grow-survey',
      {
        'x-client-portal-workspace': wsARef,
      }, // no session header
      {
        categories: ['BOTTLENECK'],
        idempotencyKey: `survey-unauth-${seed}`,
      },
    );

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('CLIENT_PORTAL_AUTH_REQUIRED');
  });

  it('10. PORTAL_SURVEY_MISSING_MEMBERSHIP_REJECTED=PASS', async () => {
    // Identity with no membership in orgWsA
    const inactiveSession = makeSession(crypto.randomUUID(), 'unknown@fixture.invalid', 'Unknown User');
    const res = await httpRequest(
      app,
      'POST',
      '/api/v1/client-portal/org/grow-survey',
      {
        'x-client-portal-session': inactiveSession,
        'x-client-portal-workspace': wsARef,
      },
      {
        categories: ['BOTTLENECK'],
        idempotencyKey: `survey-nomem-${seed}`,
      },
    );

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED');
  });

  it('11. PORTAL_SURVEY_IDEMPOTENT_REPLAY=PASS', async () => {
    const countBefore = await db.observation.count({ where: { clientId: ids.clientA } });

    const res = await httpRequest(
      app,
      'POST',
      '/api/v1/client-portal/org/grow-survey',
      {
        'x-client-portal-session': sessionAuthA,
        'x-client-portal-workspace': wsARef,
      },
      {
        categories: ['APPROVAL_DELAY', 'REWORK'],
        freeText: 'A jóváhagyások túl lassan haladnak át a pénzügyi osztályon.',
        idempotencyKey: surveyKey1, // Identical key and payload
      },
    );

    expect(res.status).toBe(200);
    expect(res.body.replayed).toBe(true);

    const countAfter = await db.observation.count({ where: { clientId: ids.clientA } });
    expect(countAfter).toBe(countBefore);
  });

  it('12. PORTAL_SURVEY_WORKFORCE_RUN_RESEARCH_CYCLE_CONSUMES_IT=PASS', async () => {
    // Run research cycle for clientA - it must consume the DECLARED_SURVEY observation created by the portal
    const cycleRes = await runResearchCycle(
      admin,
      ids.clientA,
      { idempotencyKey: `research-${seed}-portal` },
      db,
    );

    expect(cycleRes.status).toBe('COMPLETED');
    expect(cycleRes.diagnosisCount).toBeGreaterThan(0);

    // Verify opportunities created based on declared survey signal
    const opps = await listGrowOpportunities(admin, ids.clientA, db);
    expect(opps.length).toBeGreaterThan(0);
    const reworkOrApproval = opps.find(
      (o) => o.domainKey === 'APPROVAL_DELAY' || o.domainKey === 'REWORK',
    );
    expect(reworkOrApproval).toBeDefined();
  });

  it('13. PORTAL_SURVEY_NO_AUTOMATIC_TASK_OR_RECOMMENDATION=PASS', async () => {
    // Submit another fresh survey
    const freshKey = `survey-no-side-effect-${seed}`;
    const beforeRecCount = await db.recommendationCandidate.count({ where: { clientId: ids.clientA } });
    const beforeOppCount = await db.improvementOpportunity.count({ where: { clientId: ids.clientA } });
    const beforeTaskCount = await db.task.count({ where: { case: { clientId: ids.clientA } } });
    const beforeInitCount = await db.developmentInitiative.count({ where: { clientId: ids.clientA } });

    await httpRequest(
      app,
      'POST',
      '/api/v1/client-portal/org/grow-survey',
      {
        'x-client-portal-session': sessionAuthA,
        'x-client-portal-workspace': wsARef,
      },
      {
        categories: ['SCATTERED_TOOLING'],
        freeText: 'Túl sok a párhuzamos szoftver.',
        idempotencyKey: freshKey,
      },
    );

    // Neither recommendations, opportunities, tasks, nor initiatives should increase automatically
    expect(await db.recommendationCandidate.count({ where: { clientId: ids.clientA } })).toBe(beforeRecCount);
    expect(await db.improvementOpportunity.count({ where: { clientId: ids.clientA } })).toBe(beforeOppCount);
    expect(await db.task.count({ where: { case: { clientId: ids.clientA } } })).toBe(beforeTaskCount);
    expect(await db.developmentInitiative.count({ where: { clientId: ids.clientA } })).toBe(beforeInitCount);
  });

  it('14. PORTAL_SURVEY_CUSTOMER_READBACK_SAFE=PASS', async () => {
    const res = await httpRequest(
      app,
      'GET',
      '/api/v1/client-portal/org/grow-survey',
      {
        'x-client-portal-session': sessionAuthA,
        'x-client-portal-workspace': wsARef,
      },
    );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);

    const first = res.body.items[0];
    // Must have safe fields
    expect(first).toHaveProperty('submittedAt');
    expect(first).toHaveProperty('categoryLabels');
    expect(first).toHaveProperty('freeText');
    expect(first).toHaveProperty('processName');

    // MUST NOT have internal entity IDs, raw payloads, or database keys
    expect(first).not.toHaveProperty('id');
    expect(first).not.toHaveProperty('observationId');
    expect(first).not.toHaveProperty('discoveryRunId');
    expect(first).not.toHaveProperty('connectionId');
    expect(first).not.toHaveProperty('rawPayload');
    expect(first).not.toHaveProperty('clientId');
  });

  it('15. PORTAL_SURVEY_READBACK_CROSS_TENANT_ISOLATED=PASS', async () => {
    // Client B attempts to read surveys from workspace A reference
    const crossRes = await httpRequest(
      app,
      'GET',
      '/api/v1/client-portal/org/grow-survey',
      {
        'x-client-portal-session': sessionAuthB,
        'x-client-portal-workspace': wsARef,
      },
    );

    expect(crossRes.status).toBe(403);
    expect(crossRes.body.code).toBe('CLIENT_WORKSPACE_FORBIDDEN');

    // Client B reading its own workspace should return 0 items
    const ownRes = await httpRequest(
      app,
      'GET',
      '/api/v1/client-portal/org/grow-survey',
      {
        'x-client-portal-session': sessionAuthB,
        'x-client-portal-workspace': wsBRef,
      },
    );

    expect(ownRes.status).toBe(200);
    expect(ownRes.body.items).toEqual([]);
  });

  it('16. PORTAL_SURVEY_ORGANIZATIONAL_GROW_VIEW_INCLUDES_SURVEYS=PASS', async () => {
    const res = await httpRequest(
      app,
      'GET',
      '/api/v1/client-portal/org/grow',
      {
        'x-client-portal-session': sessionAuthA,
        'x-client-portal-workspace': wsARef,
      },
    );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.surveys)).toBe(true);
    expect(res.body.surveys.length).toBeGreaterThan(0);
    expect(res.body.surveys[0]).toHaveProperty('categoryLabels');
  });

  it('17. PORTAL_SURVEY_SHARED_PERSISTENCE_NOT_DUPLICATE_ENGINE=PASS', async () => {
    // The workforce API (listSurveyIntakes) and portal API read from the exact same table
    const workforceList = await listSurveyIntakes(admin, ids.clientA, db);
    const portalList = await listPortalSurveyIntakes(
      ids.authorizedIdentity,
      ids.orgWsA,
      db,
    );

    expect(workforceList.length).toBeGreaterThan(0);
    expect(portalList.items.length).toBeGreaterThan(0);
    expect(workforceList.length).toBe(portalList.items.length);

    // Shared observation: verify that workforce observation id matches the one in DB
    const matchingObs = await db.observation.findUnique({
      where: { id: workforceList[0].id },
    });
    expect(matchingObs).not.toBeNull();
    expect(matchingObs!.clientId).toBe(ids.clientA);
  });
});
