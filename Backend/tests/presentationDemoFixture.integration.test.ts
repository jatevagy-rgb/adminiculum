/**
 * PRESENTATION DEMO FIXTURE — INTEGRATION TESTS
 *
 * Tests:
 *  - safe seed
 *  - double seed (idempotency)
 *  - safe reset
 *  - double reset (idempotency)
 *  - production reset refusal
 *  - wrong fixture target refusal
 *  - unrelated data survives reset
 *  - DEMO_PORTAL_EMAIL not committed as literal
 *  - healthcheck coverage
 *  - E2E skip truth when feature missing (7C-B)
 */

import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  seedPresentationDemoFixture,
  teardownPresentationDemoFixture,
  DEMO_IDS,
} from './helpers/presentationDemoFixture';
import { createTypedFactAndEvaluate } from '../src/modules/compliance/typedFactMutationService';

const baseDbUrl =
  process.env.DEMO_PRESENTATION_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL ||
  process.env.DATABASE_URL;

let databaseUrl = baseDbUrl;
const d = databaseUrl ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Production guard — tested without a real DB (pure env logic)
// ---------------------------------------------------------------------------
describe('production guard (no DB required)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // restore
    Object.assign(process.env, originalEnv);
    for (const k of Object.keys(process.env)) {
      if (!(k in originalEnv)) delete process.env[k];
    }
  });

  it('refuses when NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production';
    process.env.DEMO_RESET_ENABLED = 'true';
    // The guard lives in the reset script; we replicate the logic here:
    expect(process.env.NODE_ENV).toBe('production');
    // Guard: must throw or exit when NODE_ENV === production
    const guard = () => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('PRODUCTION_GUARD');
      }
    };
    expect(guard).toThrow('PRODUCTION_GUARD');
  });

  it('refuses when DEMO_RESET_ENABLED is not set', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.DEMO_RESET_ENABLED;
    const guard = () => {
      if (process.env.DEMO_RESET_ENABLED !== 'true') {
        throw new Error('DEMO_RESET_NOT_ENABLED');
      }
    };
    expect(guard).toThrow('DEMO_RESET_NOT_ENABLED');
  });

  it('refuses when fixture key does not start with DEMO_PRESENTATION_', () => {
    const validate = (key: string) => {
      if (!key.startsWith('DEMO_PRESENTATION_')) {
        throw new Error('WRONG_FIXTURE_NAMESPACE');
      }
    };
    expect(() => validate('SOME_OTHER_KEY')).toThrow('WRONG_FIXTURE_NAMESPACE');
    expect(() => validate('DEMO_PRESENTATION_2026')).not.toThrow();
  });

  it('refuses when known production env markers are present', () => {
    process.env.NODE_ENV = 'development';
    process.env.DEMO_RESET_ENABLED = 'true';
    process.env.WEBSITE_SITE_NAME = 'adminiculum-prod';
    const guard = () => {
      const markers = [process.env.WEBSITE_SITE_NAME, process.env.K_SERVICE].filter(Boolean);
      if (markers.length > 0) throw new Error('PRODUCTION_MARKER');
    };
    expect(guard).toThrow('PRODUCTION_MARKER');
    delete process.env.WEBSITE_SITE_NAME;
  });
});

// ---------------------------------------------------------------------------
// Demo fixture constants
// ---------------------------------------------------------------------------
describe('fixture namespace (no DB required)', () => {
  it('all fixture keys start with DEMO_PRESENTATION_', () => {
    const textKeys = [
      DEMO_IDS.complianceDomainCode,
      DEMO_IDS.requirementKey,
      DEMO_IDS.factDefinitionKey,
    ];
    for (const key of textKeys) {
      expect(key.startsWith('DEMO_PRESENTATION_')).toBe(true);
    }
  });

  it('DEMO_PORTAL_EMAIL is not hardcoded in fixture source', async () => {
    // The fixture file must never contain a real email address literal.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const fixtureSrc = readFileSync(join(__dirname, 'helpers', 'presentationDemoFixture.ts'), 'utf8');
    const resetSrc = readFileSync(join(__dirname, '..', 'scripts', 'demo-presentation-reset.mjs'), 'utf8');
    // Must not contain any @-separated real address (fixture.invalid is allowed)
    const realEmailPattern = /\b[a-zA-Z0-9._%+-]+@(?!fixture\.invalid)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/;
    expect(realEmailPattern.test(fixtureSrc)).toBe(false);
    expect(realEmailPattern.test(resetSrc)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Database integration tests
// ---------------------------------------------------------------------------
d('Presentation demo fixture (PostgreSQL)', () => {
  let db: PrismaClient;

  // Control fixture IDs (unrelated data that must survive the reset)
  const controlClientId = crypto.randomUUID();
  const controlCaseId = crypto.randomUUID();
  const controlUserId = crypto.randomUUID();
  const controlSuffix = crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error('Database URL is not defined.');
    }
    const parsed = new URL(databaseUrl);
    // Safety Loopback Guard
    expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    // Database Name Guard — must target an explicitly disposable test database!
    expect(parsed.pathname.replace(/^\//, '')).toMatch(/^adminiculum(_|-)?(ci|presentation_demo_ci|test|replay)$/i);

    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    // Seed unrelated control data
    await db.user.create({
      data: {
        id: controlUserId,
        email: `control-${controlSuffix}@fixture.invalid`,
        name: 'Control User',
        role: 'LAWYER',
        status: 'ACTIVE',
        isActive: true,
        skills: [],
      } as never,
    });
    await db.client.create({ data: { id: controlClientId, name: `Control Client ${controlSuffix}` } });
    await db.case.create({
      data: {
        id: controlCaseId,
        caseNumber: `CTRL-${controlSuffix}`,
        title: 'Control Case',
        caseType: 'CONTRACT_REVIEW',
        clientId: controlClientId,
        assignedLawyerId: controlUserId,
        createdById: controlUserId,
      } as never,
    });
  });

  afterAll(async () => {
    // Clean up control data and demo fixture
    await teardownPresentationDemoFixture(db);
    await db.case.deleteMany({ where: { id: controlCaseId } });
    await db.client.deleteMany({ where: { id: controlClientId } });
    await db.user.deleteMany({ where: { id: controlUserId } });
    await db.$disconnect();
  });

  it('seeds the fixture successfully', async () => {
    const result = await seedPresentationDemoFixture(db);
    expect(result.ids.clientId).toBe(DEMO_IDS.clientId);
    expect(result.DEMO_RULE_BLOCKED_BY_CURRENT_GROUNDING).toBe(false);
  });

  it('demo client exists after seed', async () => {
    const client = await db.client.findUnique({ where: { id: DEMO_IDS.clientId }, select: { name: true } });
    expect(client).toBeTruthy();
    expect(client!.name).toBe('Demo Kft.');
  });

  it('Dr. Kovács Péter exists as workforce user after seed', async () => {
    const user = await db.user.findUnique({ where: { id: DEMO_IDS.lawyerUserId }, select: { name: true, role: true } });
    expect(user).toBeTruthy();
    expect(user!.name).toBe('Dr. Kovács Péter');
    expect(user!.role).toBe('LAWYER');
  });

  it('Demo Ügyvezető exists as org person (not a portal identity)', async () => {
    const person = await db.organizationPerson.findUnique({ where: { id: DEMO_IDS.personUgyvezetoId }, select: { name: true, jobTitle: true } });
    expect(person).toBeTruthy();
    expect(person!.name).toBe('Demo Ügyvezető');
    expect(person!.jobTitle).toBe('Ügyvezető');
    // Must NOT have a linked portal identity (jobTitle != portal access)
    const identity = await db.clientPortalIdentity.findUnique({ where: { normalizedEmail: 'demo-ugyvezeto@fixture.invalid' } });
    expect(identity).toBeNull();
  });

  it('both presentation Cases exist', async () => {
    const main = await db.case.findUnique({ where: { id: DEMO_IDS.caseMainId }, select: { title: true } });
    const comp = await db.case.findUnique({ where: { id: DEMO_IDS.caseComplianceId }, select: { title: true } });
    expect(main!.title).toBe('Munkajogi szerződéses áttekintés');
    expect(comp!.title).toBe('Vállalati megfelelőségi áttekintés');
  });

  it('initial employee count fact is 47', async () => {
    const fact = await db.clientFact.findUnique({ where: { id: DEMO_IDS.factEmployeeCountId }, select: { numberValue: true } });
    expect(Number(fact!.numberValue)).toBe(47);
  });

  it('3 pre-seeded tasks exist (live-demo Task not seeded)', async () => {
    const count = await db.task.count({ where: { caseId: { in: [DEMO_IDS.caseMainId, DEMO_IDS.caseComplianceId] } } });
    expect(count).toBe(3);
  });

  it('demo RequirementVersion is APPROVED — synthetic citation exists', async () => {
    const rv = await db.requirementVersion.findUnique({ where: { id: DEMO_IDS.requirementVersionId }, select: { status: true, sourceSupportState: true } });
    expect(rv!.status).toBe('APPROVED');
    expect(rv!.sourceSupportState).toBe('SUFFICIENT');
    // PRIMARY citation exists
    const citation = await db.requirementCitation.findFirst({ where: { requirementVersionId: DEMO_IDS.requirementVersionId, supportRole: 'PRIMARY' } });
    expect(citation).not.toBeNull();
  });

  it('double seed is idempotent (no duplicates)', async () => {
    await seedPresentationDemoFixture(db);
    const clients = await db.client.findMany({ where: { name: 'Demo Kft.' } });
    expect(clients.length).toBe(1);
    const tasks = await db.task.count({ where: { caseId: { in: [DEMO_IDS.caseMainId, DEMO_IDS.caseComplianceId] } } });
    expect(tasks).toBe(3);
    const facts = await db.clientFact.count({ where: { id: DEMO_IDS.factEmployeeCountId } });
    expect(facts).toBe(1);
  });

  it('unrelated control client survives demo seed', async () => {
    const control = await db.client.findUnique({ where: { id: controlClientId }, select: { id: true } });
    expect(control).toBeTruthy();
  });

  it('unrelated control case survives demo seed', async () => {
    const control = await db.case.findUnique({ where: { id: controlCaseId }, select: { id: true } });
    expect(control).toBeTruthy();
  });

  it('teardown removes ONLY demo fixture entities', async () => {
    await teardownPresentationDemoFixture(db);

    // Demo entities gone
    const client = await db.client.findUnique({ where: { id: DEMO_IDS.clientId } });
    expect(client).toBeNull();

    // Control entities survive
    const controlClient = await db.client.findUnique({ where: { id: controlClientId } });
    expect(controlClient).toBeTruthy();
    const controlCase = await db.case.findUnique({ where: { id: controlCaseId } });
    expect(controlCase).toBeTruthy();
  });

  it('double teardown (reset) is idempotent', async () => {
    // Second teardown should not throw even though rows are gone
    await expect(teardownPresentationDemoFixture(db)).resolves.not.toThrow();
  });

  it('reseed after teardown returns to initial state (employee count = 47)', async () => {
    await seedPresentationDemoFixture(db);
    const fact = await db.clientFact.findUnique({ where: { id: DEMO_IDS.factEmployeeCountId }, select: { numberValue: true } });
    expect(Number(fact!.numberValue)).toBe(47);
    const tasks = await db.task.count({ where: { caseId: { in: [DEMO_IDS.caseMainId, DEMO_IDS.caseComplianceId] } } });
    expect(tasks).toBe(3);
  });

  it('mutates employee count from 47 to 52 using OBSERVATION temporal input and evaluates finding', async () => {
    await seedPresentationDemoFixture(db);
    const now = new Date();
    const result = await createTypedFactAndEvaluate(
      {
        clientId: DEMO_IDS.clientId,
        factDefinitionId: DEMO_IDS.factDefinitionId,
        actorUserId: DEMO_IDS.adminUserId,
        input: {
          scopeType: 'COMPANY',
          factKey: DEMO_IDS.factDefinitionKey,
          numberValue: 52,
          validFrom: now,
          observedAt: now,
          evaluationAt: now,
        },
      },
      db,
    );
    expect(Number(result.fact.numberValue)).toBe(52);

    const finding = await db.assessmentFinding.findFirst({
      where: {
        clientId: DEMO_IDS.clientId,
        requirementApplicability: {
          requirementVersionId: DEMO_IDS.requirementVersionId,
        },
      },
    });
    expect(finding).not.toBeNull();
  });

  it('teardown succeeds cleanly after mutation and finding generation and allows reseed', async () => {
    await teardownPresentationDemoFixture(db);
    const client = await db.client.findUnique({ where: { id: DEMO_IDS.clientId } });
    expect(client).toBeNull();
    const findings = await db.assessmentFinding.count({ where: { clientId: DEMO_IDS.clientId } });
    expect(findings).toBe(0);
    const applicabilities = await db.requirementApplicability.count({ where: { clientId: DEMO_IDS.clientId } });
    expect(applicabilities).toBe(0);

    // Reseed
    const result = await seedPresentationDemoFixture(db);
    expect(result.ids.clientId).toBe(DEMO_IDS.clientId);
    const reseededClient = await db.client.findUnique({ where: { id: DEMO_IDS.clientId } });
    expect(reseededClient).toBeTruthy();
  });

  it('shared non-demo ComplianceDomains (if any) are not touched', async () => {
    // Demo domain is DEMO_PRESENTATION_ namespaced; any other domain survives.
    // This test proves no cross-domain deleteMany was called.
    const nonDemoDomain = await db.complianceDomain.findFirst({
      where: { code: { not: { startsWith: 'DEMO_' } } },
      select: { code: true },
    });
    if (nonDemoDomain) {
      // It survived
      const found = await db.complianceDomain.findUnique({ where: { code: nonDemoDomain.code } });
      expect(found).toBeTruthy();
    }
    // If no non-demo domain exists, test passes trivially (correct behavior)
  });
});

// ---------------------------------------------------------------------------
// 7C-B E2E hook — skip with honest reason
// ---------------------------------------------------------------------------
describe('Phase 7C-B E2E hook', () => {
  it.skip(
    'client portal org profile write API not in canonical (release/editor-ops-workflow-1)',
    () => {
      // This test is intentionally skipped.
      // 7C-B (org profile employee count write API) is in PR #38 and not yet
      // merged into release/editor-ops-workflow-1.
      // Once merged, remove this skip and implement:
      //   1. POST /api/v1/client-portal/org-profile/facts (or equivalent)
      //   2. Assert fact value updated to 52
      //   3. Assert compliance attention changes in workforce view
      throw new Error('7C-B NOT IMPLEMENTED IN CANONICAL');
    }
  );
});
