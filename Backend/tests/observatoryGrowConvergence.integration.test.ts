/**
 * OBSERVATORY → GROW convergence (PostgreSQL, canonical services).
 *
 * Golden path proving the Company Observatory is a fail-closed INPUT BOUNDARY
 * for the existing Grow research engine — not a second engine:
 *
 *   canonical SURVEY source → DiscoveryRun → DECLARED_SURVEY Observation
 *     → fail-closed normalized GrowSignal (observationSignals)
 *     → existing DiagnosisCandidate / sufficiency gate / RecommendationCandidate
 *     → human ACCEPT → ImprovementOpportunity (only)
 *     → separate explicit handoff → DevelopmentInitiative (only)
 *
 * Invariants asserted here:
 *  - ingestion alone creates ZERO recommendation / opportunity / initiative / task;
 *  - declared observations appear as provenance in research output;
 *  - measured ProcessObservationSnapshot and declared Observation provenance
 *    converge downstream without being collapsed;
 *  - the evidence/sufficiency gate and human review stay authoritative;
 *  - research idempotency and Observatory idempotency keep one logical chain;
 *  - cross-client isolation holds and a forged cross-client processId cannot
 *    attach a Client A observation to a Client B process.
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ObservatoryIngestionService } from '../src/modules/company-observatory/ingestion/service';
import {
  getOpportunityDetail,
  listGrowOpportunities,
  reviewRecommendation,
  runResearchCycle,
  startInitiativeFromOpportunity,
} from '../src/modules/company-growth/research/service';
import { captureProcessObservation } from '../src/modules/company-growth/observation/processObservationService';
import { submitSurveyIntake, listSurveyIntakes } from '../src/modules/company-observatory/intake';
import {
  addProcessStep,
  createBusinessProcess,
  createBusinessSystem,
} from '../src/modules/client-company/service';

const databaseUrl =
  process.env.OBSERVATORY_GROW_TEST_DATABASE_URL ||
  process.env.GROW_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL ||
  process.env.DATABASE_URL;

const d = databaseUrl ? describe : describe.skip;

d('Observatory → Grow convergence (PostgreSQL)', () => {
  let db: PrismaClient;
  const service = new ObservatoryIngestionService();

  const suffix = crypto.randomUUID().slice(0, 8);
  const admin = { userId: crypto.randomUUID(), role: 'ADMIN' };
  const lawyer = { userId: crypto.randomUUID(), role: 'LAWYER' };
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();

  let caseAId: string;
  let processAId: string;
  let processBId: string;

  let sourceId: string;
  let runId: string;
  let observationId: string;
  let surveyKey: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    await db.user.createMany({
      data: [
        { id: admin.userId, email: `convergence-admin-${suffix}@test.invalid`, name: 'Conv Admin', role: 'ADMIN', status: 'ACTIVE' },
        { id: lawyer.userId, email: `convergence-lawyer-${suffix}@test.invalid`, name: 'Conv Lawyer', role: 'LAWYER', status: 'ACTIVE' },
      ] as never,
    });
    await db.client.createMany({
      data: [
        { id: clientA, name: `Convergence A ${suffix}` },
        { id: clientB, name: `Convergence B ${suffix}` },
      ],
    });

    // Case on client A assigned to the lawyer: gives the lawyer access to A only.
    caseAId = crypto.randomUUID();
    await db.case.create({
      data: {
        id: caseAId,
        caseNumber: `CONV-${suffix}`,
        title: 'Convergence case',
        caseType: 'OTHER',
        clientId: clientA,
        createdById: admin.userId,
        assignedLawyerId: lawyer.userId,
      } as any,
    });

    // Measured process on client A (waiting share ≥ 0.4 → APPROVAL_DELAY).
    const procA = await createBusinessProcess(admin, clientA, {
      name: 'Convergence measured process',
      category: 'PROCUREMENT',
      frequency: 'WEEKLY',
    });
    processAId = procA.id;
    const system = await createBusinessSystem(admin, clientA, { name: 'Email' });
    await addProcessStep(admin, processAId, { name: 'Kérés', stepType: 'MANUAL', estimatedActiveMinutes: 20, estimatedWaitingMinutes: 0, systemId: system.id });
    await addProcessStep(admin, processAId, { name: 'Jóváhagyás 1', stepType: 'APPROVAL', isApproval: true, estimatedActiveMinutes: 5, estimatedWaitingMinutes: 1440 });
    await addProcessStep(admin, processAId, { name: 'Jóváhagyás 2', stepType: 'APPROVAL', isApproval: true, estimatedActiveMinutes: 5, estimatedWaitingMinutes: 1440 });
    await captureProcessObservation(admin, { clientId: clientA, businessProcessId: processAId });

    // A real ACTIVE process on client B — the target of a forged reference.
    const procB = await createBusinessProcess(admin, clientB, { name: 'Convergence B process' });
    processBId = procB.id;
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  const counts = async (clientId: string) => ({
    recommendations: await db.recommendationCandidate.count({ where: { clientId } }),
    opportunities: await db.improvementOpportunity.count({ where: { clientId } }),
    initiatives: await db.developmentInitiative.count({ where: { clientId } }),
    tasks: await db.task.count({ where: { case: { clientId } } }),
  });

  it('1. canonical Observatory path: register → start run → ingest DECLARED_SURVEY → complete', async () => {
    const source = await service.registerExternalSource(admin, {
      clientId: clientA,
      sourceType: 'SURVEY',
      name: 'Convergence survey source',
      config: { kind: 'structured-survey', version: 1 },
    });
    sourceId = source.id;
    expect(source.status).toBe('ACTIVE');

    const run = await service.startDiscoveryRun(admin, { clientId: clientA, connectionId: sourceId });
    runId = run.id;
    expect(run.status).toBe('RUNNING');

    surveyKey = `conv-${suffix}-1`;
    const observation = await service.ingestObservation(admin, {
      clientId: clientA,
      connectionId: sourceId,
      discoveryRunId: runId,
      observationType: 'DECLARED_SURVEY' as never,
      idempotencyKey: surveyKey,
      sourceRecordId: `survey:${surveyKey}`,
      rawPayload: {
        kind: 'GROW_PAIN_INTAKE',
        categories: ['SLOW_APPROVAL', 'REWORK'],
        categoryLabelsHu: ['Lassú jóváhagyások / várakozás', 'Sok a javítás / újramunka'],
        freeText: 'A jóváhagyások hetekig tartanak.',
        processId: processAId,
      } as never,
    });
    observationId = observation.id;
    expect(observation.observationType).toBe('DECLARED_SURVEY');

    const completed = await service.completeDiscoveryRun(admin, { clientId: clientA, runId });
    expect(completed.status).toBe('COMPLETED');
  });

  it('2. ingestion alone creates ZERO recommendation / opportunity / initiative / task', async () => {
    const c = await counts(clientA);
    expect(c.recommendations).toBe(0);
    expect(c.opportunities).toBe(0);
    expect(c.initiatives).toBe(0);
    expect(c.tasks).toBe(0);
  });

  it('3. explicit research normalizes the observation and preserves measured + declared provenance', async () => {
    const run = await runResearchCycle(admin, clientA, { idempotencyKey: `conv-run-${suffix}` }, db);
    expect(run.status).toBe('COMPLETED');
    expect(run.diagnosisCount).toBeGreaterThan(0);

    const diagnoses = await db.diagnosisCandidate.findMany({ where: { clientId: clientA } });
    const withProvenance = diagnoses.filter((diag) => {
      const refs = diag.sourceRefs as any;
      return Array.isArray(refs?.observationIds) && refs.observationIds.includes(observationId);
    });
    expect(withProvenance.length).toBeGreaterThan(0);

    // Canonical internal observation evidence is citable with provenance.
    const internalEvidence = await db.researchEvidence.findUnique({ where: { corpusKey: `obs:${observationId}` } });
    expect(internalEvidence).not.toBeNull();
    expect(internalEvidence!.locator).toBe(`observation:${observationId}`);
    expect(internalEvidence!.kind).toBe('INTERNAL_OBSERVATION');

    // Measured + declared converge into SUPPORTED; both snapshot and observation
    // provenance survive (not collapsed).
    const approval = diagnoses.find((diag) => {
      const refs = diag.sourceRefs as any;
      return Array.isArray(refs?.observationIds) && refs.observationIds.includes(observationId) && refs.snapshotIds?.length > 0;
    });
    expect(approval).toBeDefined();

    const opps = await listGrowOpportunities(admin, clientA, db);
    const supported = opps.find((o) => o.sufficiency === 'SUPPORTED' && o.domainKey === 'APPROVAL_DELAY');
    expect(supported).toBeDefined();
    expect(supported!.actionable).toBe(true);
    expect(supported!.interventionCodes.length).toBeGreaterThan(0);

    // Declared-only domain keeps the (tenant-validated) process reference.
    const reworkDiag = diagnoses.find((diag) => {
      const refs = diag.sourceRefs as any;
      return Array.isArray(refs?.observationIds) && refs.observationIds.includes(observationId) && refs.businessProcessId === processAId;
    });
    expect(reworkDiag).toBeDefined();
  });

  it('4. Observatory and research idempotency keep exactly one logical chain', async () => {
    const before = await counts(clientA);
    const obsBefore = await db.observation.count({ where: { clientId: clientA } });

    // Exact Observatory replay → same observation.
    const replay = await service.ingestObservation(admin, {
      clientId: clientA,
      connectionId: sourceId,
      discoveryRunId: runId,
      observationType: 'DECLARED_SURVEY' as never,
      idempotencyKey: surveyKey,
      sourceRecordId: `survey:${surveyKey}`,
      rawPayload: {
        kind: 'GROW_PAIN_INTAKE',
        categories: ['SLOW_APPROVAL', 'REWORK'],
        categoryLabelsHu: ['Lassú jóváhagyások / várakozás', 'Sok a javítás / újramunka'],
        freeText: 'A jóváhagyások hetekig tartanak.',
        processId: processAId,
      } as never,
    });
    expect(replay.id).toBe(observationId);
    expect(await db.observation.count({ where: { clientId: clientA } })).toBe(obsBefore);

    // Same Observatory idempotency key + changed payload → typed conflict, no extra observation.
    await expect(
      service.ingestObservation(admin, {
        clientId: clientA,
        connectionId: sourceId,
        discoveryRunId: runId,
        observationType: 'DECLARED_SURVEY' as never,
        idempotencyKey: surveyKey,
        rawPayload: {
          kind: 'GROW_PAIN_INTAKE',
          categories: ['SLOW_APPROVAL'],
          freeText: 'CHANGED PAYLOAD for the same key.',
          processId: processAId,
        } as never,
      }),
    ).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    expect(await db.observation.count({ where: { clientId: clientA } })).toBe(obsBefore);

    // Research replay with the same grow idempotency key → no duplicate chain.
    const researchKey = `conv-run-${suffix}`;
    const firstDiagnoses = await db.diagnosisCandidate.count({ where: { clientId: clientA } });
    const replayRun = await runResearchCycle(admin, clientA, { idempotencyKey: researchKey }, db);
    expect(replayRun.replayed).toBe(true);
    expect(await db.recommendationRun.count({ where: { clientId: clientA, idempotencyKey: researchKey } })).toBe(1);
    expect(await db.diagnosisCandidate.count({ where: { clientId: clientA } })).toBe(firstDiagnoses);

    const after = await counts(clientA);
    expect(after).toEqual(before);
  });

  it('5. human review is required; ACCEPT creates ImprovementOpportunity only', async () => {
    const before = await counts(clientA);
    const opps = await listGrowOpportunities(admin, clientA, db);
    const target = opps.find((o) => o.sufficiency === 'SUPPORTED')!;
    expect(target).toBeDefined();

    // Non-manager cannot accept.
    await expect(reviewRecommendation(lawyer, clientA, target.id, { decision: 'ACCEPT' }, db))
      .rejects.toMatchObject({ code: 'GROW_REVIEW_FORBIDDEN' });

    const reviewed = await reviewRecommendation(admin, clientA, target.id, { decision: 'ACCEPT', note: 'Elfogadva.' }, db);
    expect(reviewed.recommendation.status).toBe('ACCEPTED');
    expect(reviewed.opportunity).not.toBeNull();
    expect(reviewed.opportunity!.developmentInitiativeId).toBeNull();

    const after = await counts(clientA);
    expect(after.opportunities).toBe(before.opportunities + 1);
    expect(after.initiatives).toBe(before.initiatives);
    expect(after.tasks).toBe(before.tasks);

    const detail = await getOpportunityDetail(admin, clientA, target.id, db);
    expect(detail.evidence.length).toBeGreaterThan(0);
    expect(detail.review?.byId).toBe(admin.userId);
  });

  it('6. initiative handoff is separate and explicit; still no automatic task', async () => {
    const before = await counts(clientA);
    const accepted = await db.improvementOpportunity.findFirst({ where: { clientId: clientA, status: 'OPEN' } });
    expect(accepted).not.toBeNull();

    const handoff = await startInitiativeFromOpportunity(admin, clientA, accepted!.id, { priority: 'HIGH' }, db);
    expect(handoff.opportunity.status).toBe('INITIATIVE_STARTED');
    expect(handoff.initiative.id).toBeDefined();

    const after = await counts(clientA);
    expect(after.initiatives).toBe(before.initiatives + 1);
    expect(after.tasks).toBe(before.tasks);
  });

  it('7. cross-client isolation: foreign observations are unreadable and cannot attach', async () => {
    // Lawyer has case access to client A only → client B reads are denied.
    await expect(listSurveyIntakes(lawyer, clientB, db)).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' });
    expect(await listSurveyIntakes(admin, clientB, db)).toEqual([]);

    // Forged processId via the canonical intake boundary is dropped.
    const forgeKey = `forge-intake-${suffix}`;
    await submitSurveyIntake(admin, clientA, {
      categories: ['MANUAL_ADMIN'],
      processId: processBId,
      idempotencyKey: forgeKey,
    });
    const forgedObs = await db.observation.findFirst({ where: { clientId: clientA, idempotencyKey: forgeKey } });
    expect(forgedObs).not.toBeNull();
    expect((forgedObs!.rawPayload as any).processId).toBeNull();

    // Defense in depth: an observation ingested directly (bypassing intake) with a
    // forged foreign processId still cannot attach at research time.
    const directKey = `forge-direct-${suffix}`;
    const directObs = await service.ingestObservation(admin, {
      clientId: clientA,
      connectionId: sourceId,
      discoveryRunId: runId,
      observationType: 'DECLARED_SURVEY' as never,
      idempotencyKey: directKey,
      rawPayload: {
        kind: 'GROW_PAIN_INTAKE',
        categories: ['TOO_MANY_SYSTEMS'],
        processId: processBId,
      } as never,
    });
    await runResearchCycle(admin, clientA, { idempotencyKey: `conv-run-forge-${suffix}` }, db);

    const diagnoses = await db.diagnosisCandidate.findMany({ where: { clientId: clientA } });
    for (const diag of diagnoses) {
      const refs = diag.sourceRefs as any;
      expect(refs?.businessProcessId).not.toBe(processBId);
      expect(Array.isArray(refs?.observationIds) ? refs.observationIds.includes(directObs.id) && refs.businessProcessId === processBId : false).toBe(false);
    }

    // A generic observation produces no Grow signal for its client.
    const sourceB = await service.registerExternalSource(admin, {
      clientId: clientB,
      sourceType: 'SURVEY',
      name: 'Convergence B survey source',
      config: { kind: 'structured-survey', version: 1 },
    });
    const runB = await service.startDiscoveryRun(admin, { clientId: clientB, connectionId: sourceB.id });
    const genericObs = await service.ingestObservation(admin, {
      clientId: clientB,
      connectionId: sourceB.id,
      discoveryRunId: runB.id,
      observationType: 'GENERIC_RECORD' as never,
      idempotencyKey: `generic-${suffix}`,
      rawPayload: { categories: ['REWORK'], kind: 'GROW_PAIN_INTAKE' } as never,
    });
    await service.completeDiscoveryRun(admin, { clientId: clientB, runId: runB.id });

    const clientBRun = await runResearchCycle(admin, clientB, { idempotencyKey: `conv-run-b-${suffix}` }, db);
    expect(clientBRun.status).toBe('COMPLETED');
    const bDiagnoses = await db.diagnosisCandidate.findMany({ where: { clientId: clientB } });
    for (const diag of bDiagnoses) {
      const refs = diag.sourceRefs as any;
      expect(Array.isArray(refs?.observationIds) ? refs.observationIds.includes(genericObs.id) : false).toBe(false);
    }
  });
});
