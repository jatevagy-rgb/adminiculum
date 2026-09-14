import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ObservatoryIngestionService } from '../src/modules/company-observatory/ingestion/service';
import { captureProcessObservation } from '../src/modules/company-growth/observation/processObservationService';
import { getDiagnosticWorkbench } from '../src/modules/company-growth/diagnostic/workbenchService';
import { addProcessStep, createBusinessProcess, createBusinessSystem } from '../src/modules/client-company/service';

const databaseUrl =
  process.env.GROW_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL ||
  process.env.DATABASE_URL;

const d = databaseUrl ? describe : describe.skip;

d('Diagnostic workbench integration (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID().slice(0, 8);
  const admin = { userId: crypto.randomUUID(), role: 'ADMIN' };
  const lawyer = { userId: crypto.randomUUID(), role: 'LAWYER' };
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const observatory = new ObservatoryIngestionService();

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({
      data: [
        { id: admin.userId, email: `workbench-admin-${suffix}@test.invalid`, name: 'Workbench Admin', role: 'ADMIN', status: 'ACTIVE' },
        { id: lawyer.userId, email: `workbench-lawyer-${suffix}@test.invalid`, name: 'Workbench Lawyer', role: 'LAWYER', status: 'ACTIVE' },
      ] as never,
    });
    await db.client.createMany({
      data: [
        { id: clientA, name: `Workbench Client A ${suffix}` },
        { id: clientB, name: `Workbench Client B ${suffix}` },
      ],
    });
    await db.case.create({
      data: {
        id: crypto.randomUUID(),
        caseNumber: `WORKBENCH-${suffix}`,
        title: 'Workbench access case',
        caseType: 'OTHER',
        clientId: clientA,
        createdById: admin.userId,
        assignedLawyerId: lawyer.userId,
      } as never,
    });
    await db.clientFact.create({
      data: {
        clientId: clientA,
        type: 'LEGAL_NAME',
        value: 'Client A Kft.',
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        verificationStatus: 'CLIENT_PROVIDED',
      },
    });
    await db.clientFact.create({
      data: {
        clientId: clientB,
        type: 'LEGAL_NAME',
        value: 'Client B Kft.',
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        verificationStatus: 'CLIENT_PROVIDED',
      },
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('keeps canonical state, declared observations, and measured snapshots distinct', async () => {
    const process = await createBusinessProcess(admin, clientA, {
      name: 'Approval flow',
      category: 'OPERATIONS',
      frequency: 'WEEKLY',
    }, db);
    const system = await createBusinessSystem(admin, clientA, { name: 'Case system' }, db);
    await addProcessStep(admin, process.id, {
      name: 'Review request',
      stepType: 'MANUAL',
      systemId: system.id,
      estimatedActiveMinutes: 15,
      estimatedWaitingMinutes: 60,
    }, db);

    const source = await observatory.registerExternalSource(admin, {
      clientId: clientA,
      sourceType: 'CSV_IMPORT',
      name: 'Declared survey source',
      config: { description: 'source-secret-marker', secret: 'source-secret-marker' },
    });
    const run = await observatory.startDiscoveryRun(admin, { clientId: clientA, connectionId: source.id });
    await observatory.ingestObservation(admin, {
      clientId: clientA,
      connectionId: source.id,
      discoveryRunId: run.id,
      idempotencyKey: `workbench-${suffix}`,
      rawPayload: { privateDetail: 'must not escape' },
      observationType: 'DECLARED_SURVEY',
    });
    await observatory.ingestObservation(admin, {
      clientId: clientA,
      connectionId: source.id,
      discoveryRunId: run.id,
      idempotencyKey: `workbench-system-${suffix}`,
      rawPayload: { systemDetail: 'must not be projected yet' },
      observationType: 'SYSTEM_RECORD',
    });
    await captureProcessObservation(admin, { clientId: clientA, businessProcessId: process.id }, db);
    const researchRun = await db.recommendationRun.create({
      data: { clientId: clientA, status: 'COMPLETED', completedAt: new Date() },
    });
    const domain = await db.problemDomain.create({
      data: { clientId: clientA, key: 'APPROVAL_DELAY', name: 'Approval delay' },
    });
    const diagnosis = await db.diagnosisCandidate.create({
      data: {
        clientId: clientA,
        runId: researchRun.id,
        problemDomainId: domain.id,
        businessProcessId: process.id,
        title: 'Approval queue is slow',
        summary: 'Waiting time dominates the process.',
        sourceRefs: [],
      },
    });
    const evidence = await db.researchEvidence.create({
      data: {
        clientId: clientA,
        kind: 'INTERNAL_MEASUREMENT',
        title: 'Approval measurement',
        verificationStatus: 'VERIFIED',
        strength: 'MODERATE',
      },
    });
    await db.diagnosisEvidenceLink.create({
      data: { diagnosisId: diagnosis.id, evidenceId: evidence.id },
    });
    await db.recommendationCandidate.create({
      data: {
        clientId: clientA,
        runId: researchRun.id,
        diagnosisId: diagnosis.id,
        title: 'Reduce approval waiting',
        problemStatement: 'Approvals add avoidable waiting time.',
        direction: 'Review approval routing.',
        kind: 'QUICK_FIX',
        sufficiency: 'SUPPORTED',
        evidenceLinks: { create: { evidenceId: evidence.id } },
      },
    });

    const result = await getDiagnosticWorkbench(admin, clientA, db);

    expect(result.known.facts.some((fact) => fact.value === 'Client A Kft.')).toBe(true);
    expect(result.observed.observations.some((observation) => observation.observationType === 'DECLARED_SURVEY')).toBe(true);
    expect(result.observed.processSnapshots.some((snapshot) => snapshot.businessProcess.id === process.id)).toBe(true);
    expect(result.problems.diagnoses.some((diagnosisRow) => diagnosisRow.id === diagnosis.id)).toBe(true);
    expect(result.proposed.recommendations.some((recommendation) => recommendation.title === 'Reduce approval waiting')).toBe(true);
    expect(result.known.facts.every((fact) => fact.provenanceClass === 'CANONICAL_STATE')).toBe(true);
    expect(result.observed.observations.every((observation) => observation.provenanceClass === 'DECLARED_OBSERVATION')).toBe(true);
    expect(result.observed.observations).toHaveLength(1);
    expect(result.observed.observations[0].observationType).toBe('DECLARED_SURVEY');
    expect(result.observed.processSnapshots.every((snapshot) => snapshot.provenanceClass === 'MEASURED_SNAPSHOT')).toBe(true);
    expect(result.observed.processSnapshots[0].metrics.every((metric) => [
      'TOTAL_ACTIVE_MINUTES',
      'TOTAL_WAITING_MINUTES',
      'TOTAL_CYCLE_MINUTES',
      'WAITING_SHARE',
      'APPROVAL_STEP_COUNT',
      'DATA_ENTRY_STEP_COUNT',
      'HANDOFF_STEP_COUNT',
      'RESPONSIBLE_PERSON_CHANGE_COUNT',
      'SYSTEM_COUNT',
      'SYSTEM_SWITCH_COUNT',
      'UNASSIGNED_STEP_COUNT',
      'PROCESS_OWNER_PRESENT',
    ].includes(metric.code))).toBe(true);
    expect(JSON.stringify(result)).not.toContain('rawPayload');
    expect(JSON.stringify(result)).not.toContain('privateDetail');
    expect(JSON.stringify(result)).not.toContain('systemDetail');
    expect(JSON.stringify(result)).not.toContain('source-secret-marker');
    expect(JSON.stringify(result)).not.toContain('"config"');
    expect(JSON.stringify(result)).not.toContain('"sourceRefs"');
  });

  it('isolates clients and preserves empty states without creating downstream objects', async () => {
    const before = await Promise.all([
      db.observation.count({ where: { clientId: clientA } }),
      db.diagnosisCandidate.count({ where: { clientId: clientA } }),
      db.recommendationRun.count({ where: { clientId: clientA } }),
      db.recommendationCandidate.count({ where: { clientId: clientA } }),
      db.improvementOpportunity.count({ where: { clientId: clientA } }),
      db.developmentInitiative.count({ where: { clientId: clientA } }),
      db.task.count({ where: { case: { clientId: clientA } } }),
      db.timeEntry.count({ where: { case: { clientId: clientA } } }),
    ]);

    const lawyerView = await getDiagnosticWorkbench(lawyer, clientA, db);
    await expect(getDiagnosticWorkbench(lawyer, clientB, db)).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' });
    const clientBView = await getDiagnosticWorkbench(admin, clientB, db);
    await expect(getDiagnosticWorkbench(admin, crypto.randomUUID(), db)).rejects.toMatchObject({ code: 'CLIENT_NOT_FOUND', status: 404 });

    expect(lawyerView.client.id).toBe(clientA);
    expect(lawyerView.known.facts.every((fact) => fact.value !== 'Client B Kft.')).toBe(true);
    expect(clientBView.known.facts.some((fact) => fact.value === 'Client B Kft.')).toBe(true);
    expect(clientBView.observed.observations).toEqual([]);
    expect(clientBView.observed.processSnapshots).toEqual([]);
    expect(clientBView.proposed.recommendations).toEqual([]);
    expect(clientBView.missing.unresolvedItems).toEqual([]);

    const after = await Promise.all([
      db.observation.count({ where: { clientId: clientA } }),
      db.diagnosisCandidate.count({ where: { clientId: clientA } }),
      db.recommendationRun.count({ where: { clientId: clientA } }),
      db.recommendationCandidate.count({ where: { clientId: clientA } }),
      db.improvementOpportunity.count({ where: { clientId: clientA } }),
      db.developmentInitiative.count({ where: { clientId: clientA } }),
      db.task.count({ where: { case: { clientId: clientA } } }),
      db.timeEntry.count({ where: { case: { clientId: clientA } } }),
    ]);
    expect(after).toEqual(before);
  });
});
