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
  deleteBusinessProcess,
  updateBusinessProcess,
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

  // Process-scoped declared survey fixtures (defect-1 / defect-2 coverage).
  let scopedProcessAId: string;
  let scopedProcessBId: string;
  let scopedObservationAId: string;
  let scopedObservationBId: string;

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

  it('8. PROCESS_SCOPED_SURVEY_SEPARATION=PASS', async () => {
    const procPA = await createBusinessProcess(admin, clientA, { name: `Scoped A ${suffix}`, category: 'GENERAL', frequency: 'WEEKLY' });
    scopedProcessAId = procPA.id;
    const procPB = await createBusinessProcess(admin, clientA, { name: `Scoped B ${suffix}`, category: 'GENERAL', frequency: 'WEEKLY' });
    scopedProcessBId = procPB.id;

    const resA = await submitSurveyIntake(admin, clientA, { categories: ['REWORK'], processId: scopedProcessAId, idempotencyKey: `scope-a-${suffix}` });
    const resB = await submitSurveyIntake(admin, clientA, { categories: ['REWORK'], processId: scopedProcessBId, idempotencyKey: `scope-b-${suffix}` });
    scopedObservationAId = resA.observationId;
    scopedObservationBId = resB.observationId;

    const before = await counts(clientA);
    const run = await runResearchCycle(admin, clientA, { idempotencyKey: `scope-run-${suffix}` }, db);
    expect(run.status).toBe('COMPLETED');

    const diagnoses = await db.diagnosisCandidate.findMany({ where: { clientId: clientA } });
    const diagA = diagnoses.find((diag) => {
      const refs = diag.sourceRefs as any;
      return Array.isArray(refs?.observationIds) && refs.observationIds.includes(scopedObservationAId);
    });
    const diagB = diagnoses.find((diag) => {
      const refs = diag.sourceRefs as any;
      return Array.isArray(refs?.observationIds) && refs.observationIds.includes(scopedObservationBId);
    });
    expect(diagA).toBeDefined();
    expect(diagB).toBeDefined();
    expect(diagA!.id).not.toBe(diagB!.id);

    const refsA = diagA!.sourceRefs as any;
    const refsB = diagB!.sourceRefs as any;
    expect(refsA.businessProcessId).toBe(scopedProcessAId);
    expect(refsA.observationIds).not.toContain(scopedObservationBId);
    expect(refsB.businessProcessId).toBe(scopedProcessBId);
    expect(refsB.observationIds).not.toContain(scopedObservationAId);

    // Both diagnoses remain under the canonical REWORK ProblemDomain.
    const reworkDomain = await db.problemDomain.findFirst({ where: { clientId: clientA, key: 'REWORK' } });
    expect(reworkDomain).not.toBeNull();
    expect(diagA!.problemDomainId).toBe(reworkDomain!.id);
    expect(diagB!.problemDomainId).toBe(reworkDomain!.id);

    // Ingestion + explicit research create no automatic opportunity/initiative/task.
    const after = await counts(clientA);
    expect(after.opportunities).toBe(before.opportunities);
    expect(after.initiatives).toBe(before.initiatives);
    expect(after.tasks).toBe(before.tasks);
  });

  it('9. SAME_PROCESS_SAME_DOMAIN_AGGREGATION=PASS', async () => {
    const res2 = await submitSurveyIntake(admin, clientA, { categories: ['REWORK'], processId: scopedProcessAId, idempotencyKey: `scope-a2-${suffix}` });
    const res3 = await submitSurveyIntake(admin, clientA, { categories: ['REWORK'], processId: scopedProcessAId, idempotencyKey: `scope-a3-${suffix}` });

    await runResearchCycle(admin, clientA, { idempotencyKey: `scope-agg-run-${suffix}` }, db);
    const diagnoses = await db.diagnosisCandidate.findMany({ where: { clientId: clientA } });
    const diagA = diagnoses.find((diag) => {
      const refs = diag.sourceRefs as any;
      return Array.isArray(refs?.observationIds) && refs.observationIds.includes(res2.observationId);
    });
    expect(diagA).toBeDefined();
    const refs = diagA!.sourceRefs as any;
    expect(refs.businessProcessId).toBe(scopedProcessAId);
    expect(refs.observationIds).toContain(res2.observationId);
    expect(refs.observationIds).toContain(res3.observationId);
    // Same-process bucket aggregates across observations from prior runs too.
    expect(refs.observationIds).toContain(scopedObservationAId);
    // No evidence leakage from the other process.
    expect(refs.observationIds).not.toContain(scopedObservationBId);
  });

  it('10. MEASURED_DECLARED_SAME_PROCESS_CONVERGENCE=PASS', async () => {
    const procM = await createBusinessProcess(admin, clientA, { name: `Measured scoped ${suffix}`, category: 'PROCUREMENT', frequency: 'WEEKLY' });
    await addProcessStep(admin, procM.id, { name: 'Kérés', stepType: 'MANUAL', estimatedActiveMinutes: 10, estimatedWaitingMinutes: 0 });
    await addProcessStep(admin, procM.id, { name: 'Jóváhagyás 1', stepType: 'APPROVAL', isApproval: true, estimatedActiveMinutes: 5, estimatedWaitingMinutes: 1440 });
    await addProcessStep(admin, procM.id, { name: 'Jóváhagyás 2', stepType: 'APPROVAL', isApproval: true, estimatedActiveMinutes: 5, estimatedWaitingMinutes: 1440 });
    const snapshot = await captureProcessObservation(admin, { clientId: clientA, businessProcessId: procM.id });
    const res = await submitSurveyIntake(admin, clientA, { categories: ['SLOW_APPROVAL'], processId: procM.id, idempotencyKey: `scope-measured-${suffix}` });

    await runResearchCycle(admin, clientA, { idempotencyKey: `scope-measured-run-${suffix}` }, db);
    const diagnoses = await db.diagnosisCandidate.findMany({ where: { clientId: clientA } });
    const diag = diagnoses.find((d) => {
      const refs = d.sourceRefs as any;
      return refs?.businessProcessId === procM.id && Array.isArray(refs?.snapshotIds) && refs.snapshotIds.includes(snapshot.id);
    });
    expect(diag).toBeDefined();
    const refs = diag!.sourceRefs as any;
    expect(refs.snapshotIds).toContain(snapshot.id);
    expect(refs.observationIds).toContain(res.observationId);
  });

  it('11. IDEMPOTENT_REPLAY_AFTER_PROCESS_DEACTIVATION=PASS', async () => {
    const proc = await createBusinessProcess(admin, clientA, { name: `Replay deactivate ${suffix}` });
    const key = `replay-deactivate-${suffix}`;
    const first = await submitSurveyIntake(admin, clientA, { categories: ['REWORK'], processId: proc.id, idempotencyKey: key });
    expect(first.replayed).toBe(false);

    await updateBusinessProcess(admin, proc.id, { status: 'INACTIVE' });

    const retry = await submitSurveyIntake(admin, clientA, { categories: ['REWORK'], processId: proc.id, idempotencyKey: key });
    expect(retry.replayed).toBe(true);
    expect(retry.observationId).toBe(first.observationId);
    expect(retry.runId).toBe(first.runId);
    expect(await db.observation.count({ where: { clientId: clientA, idempotencyKey: key } })).toBe(1);
  });

  it('12. IDEMPOTENT_CHANGED_PROCESS_CONFLICT=PASS', async () => {
    const p1 = await createBusinessProcess(admin, clientA, { name: `Conflict p1 ${suffix}` });
    const p2 = await createBusinessProcess(admin, clientA, { name: `Conflict p2 ${suffix}` });
    const key = `replay-changed-process-${suffix}`;
    await submitSurveyIntake(admin, clientA, { categories: ['REWORK'], processId: p1.id, idempotencyKey: key });
    await expect(
      submitSurveyIntake(admin, clientA, { categories: ['REWORK'], processId: p2.id, idempotencyKey: key }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('13. IDEMPOTENT_CHANGED_PAYLOAD_CONFLICT=PASS', async () => {
    const key = `replay-changed-payload-${suffix}`;
    await submitSurveyIntake(admin, clientA, { categories: ['REWORK'], idempotencyKey: key });
    await expect(
      submitSurveyIntake(admin, clientA, { categories: ['SLOW_APPROVAL'], idempotencyKey: key }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      submitSurveyIntake(admin, clientA, { categories: ['REWORK'], freeText: 'changed payload', idempotencyKey: key }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('14. FOREIGN_PROCESS_NEW_SUBMISSION_STILL_SAFE=PASS', async () => {
    const key = `foreign-new-${suffix}`;
    const res = await submitSurveyIntake(admin, clientA, { categories: ['MANUAL_ADMIN'], processId: processBId, idempotencyKey: key });
    expect(res.replayed).toBe(false);
    const obs = await db.observation.findUnique({ where: { id: res.observationId } });
    expect(obs!.clientId).toBe(clientA);
    expect((obs!.rawPayload as any).processId).toBeNull();

    await runResearchCycle(admin, clientA, { idempotencyKey: `foreign-run-${suffix}` }, db);
    const diagnoses = await db.diagnosisCandidate.findMany({ where: { clientId: clientA } });
    for (const diag of diagnoses) {
      const refs = diag.sourceRefs as any;
      expect(refs?.businessProcessId).not.toBe(processBId);
    }
  });

  it('15. IDEMPOTENT_REPLAY_AFTER_PROCESS_DELETE=PASS', async () => {
    const proc = await createBusinessProcess(admin, clientA, { name: `Replay delete ${suffix}` });
    const key = `replay-delete-${suffix}`;
    const first = await submitSurveyIntake(admin, clientA, { categories: ['REWORK'], processId: proc.id, idempotencyKey: key });
    await deleteBusinessProcess(admin, proc.id);
    const retry = await submitSurveyIntake(admin, clientA, { categories: ['REWORK'], processId: proc.id, idempotencyKey: key });
    expect(retry.replayed).toBe(true);
    expect(retry.observationId).toBe(first.observationId);
  });

  it('16. TARGETED_RESEARCH_DOES_NOT_REINTERPRET_OTHER_PROCESS_AS_UNSCOPED=PASS', async () => {
    const c = crypto.randomUUID();
    await db.client.create({ data: { id: c, name: `Targeted scope ${suffix}` } });
    const procA = await createBusinessProcess(admin, c, { name: `Targeted A ${suffix}`, category: 'GENERAL', frequency: 'WEEKLY' });
    const procB = await createBusinessProcess(admin, c, { name: `Targeted B ${suffix}`, category: 'GENERAL', frequency: 'WEEKLY' });

    // Valid same-client survey scoped to B.
    const resB = await submitSurveyIntake(admin, c, { categories: ['REWORK'], processId: procB.id, idempotencyKey: `targeted-b-${suffix}` });

    // Targeted run for A only.
    const run = await runResearchCycle(admin, c, { businessProcessId: procA.id, idempotencyKey: `targeted-run-${suffix}` }, db);
    const diags = await db.diagnosisCandidate.findMany({ where: { clientId: c, runId: run.runId } });

    // B is excluded (not reinterpreted as unscoped): no B evidence anywhere and
    // no unscoped declared-only outcome is fabricated for this run.
    for (const diag of diags) {
      const refs = diag.sourceRefs as any;
      expect(Array.isArray(refs?.observationIds) ? refs.observationIds.includes(resB.observationId) : false).toBe(false);
    }
    expect(diags.every((diag) => diag.businessProcessId === procA.id)).toBe(true);
    expect(diags.length).toBeGreaterThan(0);

    const opps = await listGrowOpportunities(admin, c, db);
    for (const opp of opps) {
      expect(opp.businessProcess?.id ?? null).toBe(procA.id);
    }
  });

  it('17. PROCESS_SCOPED_INTERVENTION_ISOLATION=PASS', async () => {
    const c = crypto.randomUUID();
    await db.client.create({ data: { id: c, name: `Intervention isolation ${suffix}` } });
    const procA = await createBusinessProcess(admin, c, { name: `Intervention A ${suffix}`, category: 'PROCUREMENT', frequency: 'WEEKLY' });
    // Three DATA_ENTRY steps → measured DUPLICATE_DATA_ENTRY + AUTOMATE_REPETITIVE_STEP eligibility.
    await addProcessStep(admin, procA.id, { name: 'Adatrögzítés 1', stepType: 'DATA_ENTRY', estimatedActiveMinutes: 10 });
    await addProcessStep(admin, procA.id, { name: 'Adatrögzítés 2', stepType: 'DATA_ENTRY', estimatedActiveMinutes: 10 });
    await addProcessStep(admin, procA.id, { name: 'Adatrögzítés 3', stepType: 'DATA_ENTRY', estimatedActiveMinutes: 10 });
    await captureProcessObservation(admin, { clientId: c, businessProcessId: procA.id });

    const procB = await createBusinessProcess(admin, c, { name: `Intervention B ${suffix}`, category: 'GENERAL', frequency: 'WEEKLY' });
    const resB = await submitSurveyIntake(admin, c, { categories: ['REWORK'], processId: procB.id, idempotencyKey: `intervention-b-${suffix}` });

    const run = await runResearchCycle(admin, c, { idempotencyKey: `intervention-run-${suffix}` }, db);
    const opps = await listGrowOpportunities(admin, c, db);
    const dupOpp = opps.find((o) => o.domainKey === 'DUPLICATE_DATA_ENTRY');
    expect(dupOpp).toBeDefined();
    // B's REWORK must NOT become a contraindication for A's automation choice.
    expect(dupOpp!.interventionCodes).toContain('AUTOMATE_REPETITIVE_STEP');
    expect(dupOpp!.interventionCodes).not.toContain('REDESIGN_BEFORE_AUTOMATING');

    const diags = await db.diagnosisCandidate.findMany({ where: { clientId: c, runId: run.runId } });
    for (const diag of diags.filter((d) => d.businessProcessId === procA.id)) {
      const refs = diag.sourceRefs as any;
      expect(Array.isArray(refs?.observationIds) ? refs.observationIds.includes(resB.observationId) : false).toBe(false);
    }
  });

  it('18. SAME_PROCESS_CATEGORY_STILL_AFFECTS_INTERVENTION=PASS', async () => {
    const c = crypto.randomUUID();
    await db.client.create({ data: { id: c, name: `Same process category ${suffix}` } });
    const procA = await createBusinessProcess(admin, c, { name: `Category A ${suffix}`, category: 'GENERAL', frequency: 'WEEKLY' });
    const res = await submitSurveyIntake(admin, c, { categories: ['REWORK'], processId: procA.id, idempotencyKey: `category-a-${suffix}` });

    const run = await runResearchCycle(admin, c, { idempotencyKey: `category-run-${suffix}` }, db);
    const diags = await db.diagnosisCandidate.findMany({ where: { clientId: c, runId: run.runId } });
    const reworkDiag = diags.find((diag) => {
      const refs = diag.sourceRefs as any;
      return diag.businessProcessId === procA.id && Array.isArray(refs?.observationIds) && refs.observationIds.includes(res.observationId);
    });
    expect(reworkDiag).toBeDefined();

    // The attached category still drives the canonical guardrails: REWORK_PRESENT
    // selects REDESIGN_BEFORE_AUTOMATING for A's own REWORK outcome.
    const opps = await listGrowOpportunities(admin, c, db);
    const reworkOpp = opps.find((o) => o.domainKey === 'REWORK');
    expect(reworkOpp).toBeDefined();
    expect(reworkOpp!.interventionCodes).toContain('REDESIGN_BEFORE_AUTOMATING');
  });

  it('19. TRUE_UNSCOPED_BEHAVIOR_PRESERVED=PASS', async () => {
    const c = crypto.randomUUID();
    await db.client.create({ data: { id: c, name: `Unscoped behavior ${suffix}` } });
    await createBusinessProcess(admin, c, { name: `Unscoped A ${suffix}`, category: 'GENERAL', frequency: 'WEEKLY' });

    // Genuinely wild unscoped survey (no processId).
    const res = await submitSurveyIntake(admin, c, { categories: ['REWORK'], idempotencyKey: `unscoped-${suffix}` });
    const run = await runResearchCycle(admin, c, { idempotencyKey: `unscoped-run-${suffix}` }, db);
    const diags = await db.diagnosisCandidate.findMany({ where: { clientId: c, runId: run.runId } });
    const reworkDiag = diags.find((diag) => {
      const refs = diag.sourceRefs as any;
      return Array.isArray(refs?.observationIds) && refs.observationIds.includes(res.observationId);
    });
    expect(reworkDiag).toBeDefined();
    expect(reworkDiag!.businessProcessId).toBeNull();
  });

  it('20. STALE_DEACTIVATED_PROCESS_SIGNAL_EXCLUDED=PASS', async () => {
    const c = crypto.randomUUID();
    await db.client.create({ data: { id: c, name: `Stale scoped ${suffix}` } });
    const procA = await createBusinessProcess(admin, c, { name: `Stale A ${suffix}`, category: 'PROCUREMENT', frequency: 'WEEKLY' });
    await addProcessStep(admin, procA.id, { name: 'Adatrögzítés 1', stepType: 'DATA_ENTRY', estimatedActiveMinutes: 10 });
    await addProcessStep(admin, procA.id, { name: 'Adatrögzítés 2', stepType: 'DATA_ENTRY', estimatedActiveMinutes: 10 });
    await addProcessStep(admin, procA.id, { name: 'Adatrögzítés 3', stepType: 'DATA_ENTRY', estimatedActiveMinutes: 10 });
    await captureProcessObservation(admin, { clientId: c, businessProcessId: procA.id });

    const procB = await createBusinessProcess(admin, c, { name: `Stale B ${suffix}`, category: 'GENERAL', frequency: 'WEEKLY' });
    const resB = await submitSurveyIntake(admin, c, { categories: ['DUPLICATE_DATA'], processId: procB.id, idempotencyKey: `stale-b-${suffix}` });
    expect(resB.replayed).toBe(false);

    // B is archived AFTER accepting a survey scoped to it. The stale reference
    // must be excluded, never rewritten as tenant-wide unscoped evidence.
    await updateBusinessProcess(admin, procB.id, { status: 'INACTIVE' });

    const run = await runResearchCycle(admin, c, { idempotencyKey: `stale-run-${suffix}` }, db);
    const diags = await db.diagnosisCandidate.findMany({ where: { clientId: c, runId: run.runId } });
    for (const diag of diags) {
      const refs = diag.sourceRefs as any;
      expect(Array.isArray(refs?.observationIds) ? refs.observationIds.includes(resB.observationId) : false).toBe(false);
    }
    expect(diags.some((diag) => diag.businessProcessId === procA.id)).toBe(true);

    const opps = await listGrowOpportunities(admin, c, db);
    for (const opp of opps) {
      const detail = await getOpportunityDetail(admin, c, opp.id, db);
      expect(JSON.stringify(detail.diagnosis?.sourceRefs ?? {})).not.toContain(resB.observationId);
    }
  });
});
