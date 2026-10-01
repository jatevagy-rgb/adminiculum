/**
 * GROW — outcome provenance & measurement basis integration tests (PostgreSQL).
 *
 * G1/G2 service-level contract under test:
 *  1. Before/after snapshots captured by the canonical T2B path are
 *     estimate-based inputs — the recorded outcome must be ESTIMATED
 *     (CLIENT_ESTIMATE), never MEASURED.
 *  2. A legacy snapshot without provenance cannot support any basis: the
 *     recording is rejected with an actionable SNAPSHOT_PROVENANCE_UNKNOWN.
 *  3. Before/after snapshots from incompatible metric versions are rejected
 *     (SNAPSHOT_SCOPE_INCOMPATIBLE) instead of being compared.
 *  4. Negative improvement is an explicit zero, not a fabricated gain.
 *  5. Stored ROI exposes the honest basis and never monetizes waiting time.
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { recordOutcomeMeasurement } from '../src/modules/company-growth/research/service';
import { captureProcessObservation } from '../src/modules/company-growth/observation/processObservationService';
import {
  addProcessStep,
  createBusinessProcess,
  createBusinessSystem,
} from '../src/modules/client-company/service';

const databaseUrl = process.env.GROW_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL || process.env.DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('GROW outcome provenance & measurement basis (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID().slice(0, 8);
  const admin = { userId: crypto.randomUUID(), role: 'ADMIN' };
  const clientA = crypto.randomUUID();

  let processId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({
      data: [{ id: admin.userId, email: `prov-admin-${suffix}@test.invalid`, name: 'Prov Admin', role: 'ADMIN', status: 'ACTIVE' }] as never,
    });
    await db.client.createMany({
      data: [{ id: clientA, name: `Prov Client A ${suffix}` }],
    });

    const proc = await createBusinessProcess(admin, clientA, {
      name: 'Szolgáltatási folyamat',
      category: 'PROCUREMENT',
      frequency: 'WEEKLY',
    });
    processId = proc.id;
    const system = await createBusinessSystem(admin, clientA, { name: 'Email' });
    await addProcessStep(admin, processId, { name: 'Első lépés', stepType: 'MANUAL', estimatedActiveMinutes: 30, estimatedWaitingMinutes: 60, systemId: system.id });
    await addProcessStep(admin, processId, { name: 'Jóváhagyás', stepType: 'APPROVAL', isApproval: true, estimatedActiveMinutes: 10, estimatedWaitingMinutes: 1440 });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  async function seedOpportunity(): Promise<string> {
    const run = await db.recommendationRun.create({
      data: { clientId: clientA, status: 'COMPLETED', idempotencyKey: `prov-run-${crypto.randomUUID().slice(0, 8)}` },
    });
    const rec = await db.recommendationCandidate.create({
      data: {
        clientId: clientA,
        runId: run.id,
        title: 'Mérési lehetőség',
        problemStatement: 'P',
        direction: 'D',
        kind: 'QUICK_FIX',
        sufficiency: 'SUPPORTED',
        status: 'ACCEPTED',
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
    return opp.id;
  }

  it('1. before/after snapshots from the canonical path are labelled ESTIMATED, never MEASURED', async () => {
    const opportunityId = await seedOpportunity();
    const before = await captureProcessObservation(admin, {
      clientId: clientA,
      businessProcessId: processId,
      observedAt: '2026-01-01T09:00:00.000Z',
    });
    const after = await captureProcessObservation(admin, {
      clientId: clientA,
      businessProcessId: processId,
      observedAt: '2026-02-01T09:00:00.000Z',
    });

    const outcome = await recordOutcomeMeasurement(admin, clientA, opportunityId, {
      businessProcessId: processId,
      beforeSnapshotId: before.id,
      afterSnapshotId: after.id,
      synthetic: true,
      note: 'Provenance test.',
    }, db);

    expect(outcome.basis).toBe('ESTIMATED');
    const roi = outcome.roi as any;
    expect(roi.provenanceType).toBe('CLIENT_ESTIMATE');
    expect(roi.provenance.inputs.beforeOrigin).toBe('ESTIMATED');
    expect(roi.provenance.inputs.afterOrigin).toBe('ESTIMATED');
    // Identical estimates -> explicit zero savings, no invented cash.
    expect(roi.timeSavedMinutesPerRun).toEqual({ low: 0, base: 0, high: 0 });
    expect(roi.cashSavedHufPerMonth).toBeNull();
  });

  it('2. a snapshot without provenance is rejected with an actionable unavailable state', async () => {
    const opportunityId = await seedOpportunity();
    const raw = await db.processObservationSnapshot.create({
      data: {
        clientId: clientA,
        businessProcessId: processId,
        metricVersion: 'GROW_PROCESS_METRICS_V1',
        observedAt: new Date('2026-03-01T09:00:00.000Z'),
        inputDigest: 'a'.repeat(64),
        snapshotDigest: 'b'.repeat(64),
        metrics: [{ code: 'TOTAL_ACTIVE_MINUTES', value: 40, unit: 'MINUTES' }],
        provenance: null,
      },
    });

    await expect(
      recordOutcomeMeasurement(admin, clientA, opportunityId, {
        businessProcessId: processId,
        beforeSnapshotId: raw.id,
      }, db),
    ).rejects.toMatchObject({ code: 'SNAPSHOT_PROVENANCE_UNKNOWN' });
  });

  it('3. before/after snapshots with incompatible metric versions are rejected', async () => {
    const opportunityId = await seedOpportunity();
    const before = await captureProcessObservation(admin, {
      clientId: clientA,
      businessProcessId: processId,
      observedAt: '2026-04-01T09:00:00.000Z',
    });
    const incompatibleAfter = await db.processObservationSnapshot.create({
      data: {
        clientId: clientA,
        businessProcessId: processId,
        metricVersion: 'GROW_PROCESS_METRICS_V9',
        observedAt: new Date('2026-05-01T09:00:00.000Z'),
        inputDigest: 'c'.repeat(64),
        snapshotDigest: 'd'.repeat(64),
        metrics: [{ code: 'TOTAL_ACTIVE_MINUTES', value: 5, unit: 'MINUTES' }],
        provenance: {
          source: 'CANONICAL_BUSINESS_PROCESS',
          calculatedBy: 'GROW_PROCESS_METRICS_V1',
          stepCount: 2,
          inputFieldInventory: ['steps.estimatedActiveMinutes'],
        },
      },
    });

    await expect(
      recordOutcomeMeasurement(admin, clientA, opportunityId, {
        businessProcessId: processId,
        beforeSnapshotId: before.id,
        afterSnapshotId: incompatibleAfter.id,
      }, db),
    ).rejects.toMatchObject({ code: 'SNAPSHOT_SCOPE_INCOMPATIBLE' });
  });

  it('4. negative improvement between estimate snapshots is an explicit zero, not a gain', async () => {
    const opportunityId = await seedOpportunity();
    const before = await captureProcessObservation(admin, {
      clientId: clientA,
      businessProcessId: processId,
      observedAt: '2026-06-01T09:00:00.000Z',
    });
    // More estimated work after the intervention -> negative delta.
    await addProcessStep(admin, processId, { name: 'Új jóváhagyási pont', stepType: 'APPROVAL', isApproval: true, estimatedActiveMinutes: 20, estimatedWaitingMinutes: 0 });
    const after = await captureProcessObservation(admin, {
      clientId: clientA,
      businessProcessId: processId,
      observedAt: '2026-07-01T09:00:00.000Z',
    });

    const outcome = await recordOutcomeMeasurement(admin, clientA, opportunityId, {
      businessProcessId: processId,
      beforeSnapshotId: before.id,
      afterSnapshotId: after.id,
      hourlyCostHuf: { low: 8000, base: 10000, high: 12000 },
      peopleAffected: 2,
    }, db);

    expect(outcome.basis).toBe('ESTIMATED');
    const roi = outcome.roi as any;
    expect(roi.timeSavedMinutesPerRun).toEqual({ low: 0, base: 0, high: 0 });
    expect(roi.cashSavedHufPerMonth).toBeNull();
  });
});
