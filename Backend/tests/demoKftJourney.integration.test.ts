/**
 * DEMO KFT — the complete benchmark journey end-to-end (PostgreSQL).
 *
 * Canonical vendor onboarding process → structured survey intake → research
 * run → sufficiency gate (SUPPORTED / NEEDS_MORE_DATA, with the honest rule
 * that INSUFFICIENT_EVIDENCE never reaches the feed) → human review →
 * ImprovementOpportunity → explicit initiative handoff → Task with planning
 * fields → before/after snapshots → OutcomeMeasurement → ROI provenance.
 *
 * The after-snapshot is explicitly synthetic test data.
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { submitSurveyIntake } from '../src/modules/company-observatory/intake';
import {
  getOpportunityDetail,
  listGrowOpportunities,
  recordOutcomeMeasurement,
  reviewRecommendation,
  runResearchCycle,
  startInitiativeFromOpportunity,
} from '../src/modules/company-growth/research/service';
import { captureProcessObservation } from '../src/modules/company-growth/observation/processObservationService';
import {
  addProcessStep,
  createBusinessProcess,
  createBusinessSystem,
  updateProcessStep,
} from '../src/modules/client-company/service';
import { createTask } from '../src/modules/tasks/services';
import { resolveTaskPlanning } from '../src/modules/tasks/taskPlanning';

const databaseUrl = process.env.GROW_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL || process.env.DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('Demo Kft — end-to-end Grow journey (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID().slice(0, 8);
  const admin = { userId: crypto.randomUUID(), role: 'ADMIN' };
  const partner = { userId: crypto.randomUUID(), role: 'PARTNER' };
  const lawyer = { userId: crypto.randomUUID(), role: 'LAWYER' };
  const clientId = crypto.randomUUID();
  const caseId = crypto.randomUUID();

  let processId: string;
  let beforeSnapshotId: string;
  let afterSnapshotId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({
      data: [
        { id: admin.userId, email: `demo-admin-${suffix}@test.invalid`, name: 'Demo Admin', role: 'ADMIN', status: 'ACTIVE' },
        { id: partner.userId, email: `demo-partner-${suffix}@test.invalid`, name: 'Demo Partner', role: 'PARTNER', status: 'ACTIVE' },
        { id: lawyer.userId, email: `demo-lawyer-${suffix}@test.invalid`, name: 'Demo Lawyer', role: 'LAWYER', status: 'ACTIVE' },
      ] as never,
    });
    await db.client.create({ data: { id: clientId, name: `Demo Kft ${suffix}` } });
    await db.case.create({
      data: {
        id: caseId,
        caseNumber: `DEMO-${suffix}`,
        title: 'Vendor onboarding fejlesztés',
        caseType: 'OTHER',
        clientId,
        createdById: admin.userId,
        assignedLawyerId: lawyer.userId,
      } as any,
    });

    // Canonical vendor onboarding process — measured to trigger
    // APPROVAL_DELAY (waiting share ≥ 0.4 / approvals ≥ 3) and
    // UNCLEAR_OWNERSHIP (unassigned steps ≥ 2 / no owner).
    const proc = await createBusinessProcess(admin, clientId, {
      name: 'Beszállító-felvétel (vendor onboarding)',
      category: 'PROCUREMENT',
      frequency: 'WEEKLY',
    });
    processId = proc.id;

    const email = await createBusinessSystem(admin, clientId, { name: 'E-mail' });
    const dms = await createBusinessSystem(admin, clientId, { name: 'DMS' });

    await addProcessStep(admin, processId, { name: 'Beszállító bekéri adatok', stepType: 'MANUAL', estimatedActiveMinutes: 30, systemId: email.id });
    await addProcessStep(admin, processId, { name: 'Ügyvéd jóváhagyás', stepType: 'APPROVAL', isApproval: true, estimatedActiveMinutes: 10, estimatedWaitingMinutes: 1440, systemId: email.id });
    await addProcessStep(admin, processId, { name: 'Partner jóváhagyás', stepType: 'APPROVAL', isApproval: true, estimatedActiveMinutes: 10, estimatedWaitingMinutes: 1440 });
    await addProcessStep(admin, processId, { name: 'Ügyfél jóváhagyás', stepType: 'APPROVAL', isApproval: true, estimatedActiveMinutes: 5, estimatedWaitingMinutes: 720 });
    await addProcessStep(admin, processId, { name: 'Adatrögzítés DMS-be', stepType: 'DATA_ENTRY', estimatedActiveMinutes: 25, systemId: dms.id });
    await addProcessStep(admin, processId, { name: 'Adat ismételt rögzítése táblázatba', stepType: 'DATA_ENTRY', estimatedActiveMinutes: 20 });

    const before = await captureProcessObservation(admin, { clientId, businessProcessId: processId });
    beforeSnapshotId = before.id;
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('1. survey intake records declared pain (provenance only)', async () => {
    const intake = await submitSurveyIntake(admin, clientId, {
      categories: ['SLOW_APPROVAL', 'DUPLICATE_DATA', 'UNMEASURED_COST'],
      freeText: 'A beszállító-felvétel hetekig tart.',
      processId,
      idempotencyKey: `demo-intake-${suffix}`,
    });
    expect(intake.replayed).toBe(false);
    const obs = await db.observation.findUnique({ where: { id: intake.observationId } });
    expect(obs?.observationType).toBe('DECLARED_SURVEY');
    expect((obs?.rawPayload as any).processId).toBe(processId);
  });

  it('2. research run gates scenarios honestly', async () => {
    const run = await runResearchCycle(admin, clientId, { idempotencyKey: `demo-run-${suffix}` }, db);
    expect(run.status).toBe('COMPLETED');

    const opps = await listGrowOpportunities(admin, clientId, db);
    const byDomain = new Map(opps.map((o) => [o.domainKey, o]));

    // SUPPORTED — measured signal + verified corpus.
    expect(byDomain.get('APPROVAL_DELAY')?.sufficiency).toBe('SUPPORTED');
    expect(byDomain.get('UNCLEAR_OWNERSHIP')?.sufficiency).toBe('SUPPORTED');
    expect(byDomain.get('DUPLICATE_DATA_ENTRY')?.sufficiency).toBe('SUPPORTED');

    // NEEDS_MORE_DATA — declared via intake but no verified corpus for the domain.
    expect(byDomain.get('UNMEASURED_COST')?.sufficiency).toBe('NEEDS_MORE_DATA');

    // Citation coverage: every SUPPORTED recommendation links ≥1 VERIFIED evidence.
    const supported = opps.filter((o) => o.sufficiency === 'SUPPORTED');
    expect(supported.length).toBeGreaterThan(0);
    for (const opp of supported) {
      // Only SUPPORTED is actionable and it must carry ≥1 canonical intervention.
      expect(opp.actionable).toBe(true);
      expect(opp.interventionCodes.length).toBeGreaterThan(0);
    }
    for (const opp of opps.filter((o) => o.sufficiency !== 'SUPPORTED')) {
      expect(opp.actionable).toBe(false);
    }
    for (const opp of supported) {
      const detail = await getOpportunityDetail(admin, clientId, opp.id, db);
      expect(detail.evidence.length).toBeGreaterThan(0);
      expect(detail.evidence.some((e) => e.verificationStatus === 'VERIFIED')).toBe(true);
    }

    // No recommendation ever sits in the feed without an internal signal.
    const insufficientRecs = await db.recommendationCandidate.count({ where: { clientId, sufficiency: 'INSUFFICIENT_EVIDENCE' } });
    expect(insufficientRecs).toBe(0);
  });

  it('3. human review → opportunity → explicit initiative handoff → task', async () => {
    const opps = await listGrowOpportunities(admin, clientId, db);
    const approval = opps.find((o) => o.domainKey === 'APPROVAL_DELAY' && o.sufficiency === 'SUPPORTED')!;

    // Defer a NEEDS_MORE_DATA recommendation — abstention is a valid outcome.
    const weak = opps.find((o) => o.sufficiency === 'NEEDS_MORE_DATA')!;
    const deferred = await reviewRecommendation(admin, clientId, weak.id, { decision: 'REQUEST_MORE_INFO', note: 'Több mérés kell.' }, db);
    expect(deferred.recommendation.status).toBe('NEEDS_MORE_DATA');
    expect(deferred.opportunity).toBeNull();

    // Decline path.
    const another = opps.find((o) => o.domainKey === 'DUPLICATE_DATA_ENTRY')!;
    await reviewRecommendation(admin, clientId, another.id, { decision: 'DECLINE' }, db);

    const accepted = await reviewRecommendation(admin, clientId, approval.id, { decision: 'ACCEPT', note: 'Benchmark út.' }, db);
    const opportunityId = accepted.opportunity.id;
    expect(accepted.opportunity.status).toBe('OPEN');
    expect(accepted.opportunity.developmentInitiativeId).toBeNull();

    const handoff = await startInitiativeFromOpportunity(partner, clientId, opportunityId, {
      caseId,
      priority: 'HIGH',
      title: 'Jóváhagyási pontok csökkentése',
    }, db);
    expect(handoff.initiative.caseId).toBe(caseId);
    expect(handoff.opportunity.status).toBe('INITIATIVE_STARTED');

    // Task/workflow: a task on the initiative's case, with planning fields.
    const planning = await resolveTaskPlanning(
      { taskTypeLabel: 'Jóváhagyási pontok felülvizsgálata', plannedReviewerId: partner.userId, saveToCatalogue: true, taskDefinitionClientId: clientId },
      admin,
      db,
    );
    const task = await createTask({
      caseId,
      title: 'Jóváhagyási pontok csökkentése — terv',
      taskType: 'OTHER',
      assignedBy: admin.userId,
      assignedTo: lawyer.userId,
      taskDefinitionId: planning.taskDefinitionId,
      taskTypeLabelSnapshot: planning.taskTypeLabelSnapshot,
      plannedReviewerId: planning.plannedReviewerId,
    }, db);
    expect(task.plannedReviewerId).toBe(partner.userId);
    expect(task.taskTypeLabelSnapshot).toBe('Jóváhagyási pontok felülvizsgálata');

    // The reviewer/collaborator roles grant no case access.
    expect(await db.caseCollaborator.count({ where: { caseId, userId: partner.userId } })).toBe(0);
  });

  it('4. synthetic after-snapshot → OutcomeMeasurement → ROI provenance', async () => {
    // Simulate the improvement: remove one approval layer's waiting and merge
    // the duplicate data entry. Explicitly synthetic test data.
    const steps = await db.businessProcessStep.findMany({ where: { processId }, orderBy: { position: 'asc' } });
    for (const step of steps) {
      if (step.isApproval) {
        await updateProcessStep(admin, step.id, { estimatedWaitingMinutes: 240 });
      }
      if (step.name === 'Adat ismételt rögzítése táblázatba') {
        await updateProcessStep(admin, step.id, { estimatedActiveMinutes: 5 });
      }
    }
    const after = await captureProcessObservation(admin, {
      clientId,
      businessProcessId: processId,
      observedAt: new Date(Date.now() + 60_000).toISOString(),
      provenanceSource: 'SYNTHETIC_AFTER_IMPROVEMENT',
    });
    afterSnapshotId = after.id;
    expect(afterSnapshotId).not.toBe(beforeSnapshotId);

    const opp = await db.improvementOpportunity.findFirst({ where: { clientId, status: 'INITIATIVE_STARTED' } });
    const outcome = await recordOutcomeMeasurement(partner, clientId, opp!.id, {
      businessProcessId: processId,
      beforeSnapshotId,
      afterSnapshotId,
      hourlyCostHuf: { low: 8000, base: 12000, high: 16000 },
      peopleAffected: 3,
      synthetic: true,
      note: 'Szintetikus bemutató adat — nem éles mérés.',
    }, db);

    expect(outcome.basis).toBe('MEASURED');
    expect(outcome.synthetic).toBe(true);
    const roi = outcome.roi as any;
    expect(roi.timeSavedMinutesPerRun.base).toBeGreaterThan(0);
    expect(roi.timeSavedMinutesPerRun.low).toBeLessThanOrEqual(roi.timeSavedMinutesPerRun.base);
    expect(roi.timeSavedMinutesPerRun.high).toBeGreaterThanOrEqual(roi.timeSavedMinutesPerRun.base);
    expect(roi.cashSavedHufPerMonth.base).toBeGreaterThan(0);
    expect(roi.provenance.timeSavedIsNotCashSaved).toBe(true);
    expect(roi.provenance.formulaVersion).toBeDefined();
    expect(roi.provenance.recordedById).toBe(partner.userId);

    const metrics = outcome.metricsSummary as any;
    expect(metrics.comparable).toBe(true);
    expect(metrics.after.TOTAL_WAITING_MINUTES).toBeLessThan(metrics.before.TOTAL_WAITING_MINUTES);

    const afterOpp = await db.improvementOpportunity.findUnique({ where: { id: opp!.id } });
    expect(afterOpp?.status).toBe('OUTCOME_RECORDED');
  });

  it('5. acceptance check: no wrong SUPPORTED without verified corpus + internal signal', async () => {
    const opps = await listGrowOpportunities(admin, clientId, db);
    // Every remaining PENDING_REVIEW item is either SUPPORTED (verified +
    // signal) or NEEDS_MORE_DATA (internal signal only) — never a bare guess.
    for (const opp of opps) {
      expect(['SUPPORTED', 'NEEDS_MORE_DATA']).toContain(opp.sufficiency);
    }
  });
});
