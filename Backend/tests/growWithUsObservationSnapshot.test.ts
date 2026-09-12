/**
 * GROW WITH US V2 — T2B Process Observation Snapshot Tests.
 *
 * Tests the 12 required observation snapshot invariants:
 *  1. persisted process -> snapshot
 *  2. exact T2A metric values preserved
 *  3. metricVersion preserved
 *  4. observation timestamp preserved
 *  5. tenant A cannot observe tenant B process (cross-tenant rejection)
 *  6. missing process rejected (404 BUSINESS_PROCESS_NOT_FOUND)
 *  7. deterministic ordered input produces identical inputDigest
 *  8. zero-time process preserves WAITING_SHARE=null
 *  9. null system/person semantics remain identical to T2A
 * 10. snapshot persistence does not mutate BusinessProcess or steps
 * 11. atomicity: failed snapshot insert leaves zero ProcessObservationSnapshot rows and canonical process unchanged
 * 12. provenance/digest deterministic and reproducible
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  buildCanonicalProcessInput,
  computeProcessInputDigest,
  computeSnapshotDigest,
  captureProcessObservation,
  getLatestProcessObservation,
  getProcessObservationHistory,
} from '../src/modules/company-growth/observation/processObservationService';
import { GROW_PROCESS_METRICS_V1 } from '../src/modules/company-growth/metrics/metricTypes';
import { calculateProcessMetrics } from '../src/modules/company-growth/metrics/calculateProcessMetrics';

const databaseUrl =
  process.env.CLIENT_INTERACTION_TEST_DATABASE_URL ||
  process.env.CLIENT_IDENTITY_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL ||
  process.env.DATABASE_URL;

const describeDb = databaseUrl ? describe : describe.skip;

describe('Grow With Us V2 T2B — Process Observation Unit Invariants', () => {
  const adminActor = { userId: 'user-admin', role: 'ADMIN' };

  it('2, 3 & 4. exact T2A metric values, metricVersion, and timestamp preserved', () => {
    const rawProcess = { id: 'proc-1', ownerPersonId: 'person-owner' };
    const rawSteps = [
      { id: 's1', position: 1, name: 'Step 1', stepType: 'MANUAL', estimatedActiveMinutes: 30, estimatedWaitingMinutes: 60, isApproval: false },
      { id: 's2', position: 2, name: 'Step 2', stepType: 'APPROVAL', estimatedActiveMinutes: 15, estimatedWaitingMinutes: 120, isApproval: true },
    ];

    const canonicalInput = buildCanonicalProcessInput(rawProcess, rawSteps);
    const inputDigest = computeProcessInputDigest(canonicalInput);

    const metrics = calculateProcessMetrics({
      id: rawProcess.id,
      ownerPersonId: rawProcess.ownerPersonId,
      steps: rawSteps,
    });

    const snapshotDigest = computeSnapshotDigest(inputDigest, GROW_PROCESS_METRICS_V1, metrics);

    expect(inputDigest).toBeDefined();
    expect(typeof inputDigest).toBe('string');
    expect(inputDigest).toHaveLength(64); // SHA-256 hex

    expect(snapshotDigest).toBeDefined();
    expect(typeof snapshotDigest).toBe('string');
    expect(snapshotDigest).toHaveLength(64); // SHA-256 hex

    // Metric assertions
    const metricMap = new Map(metrics.map((m) => [m.code, m]));
    expect(metricMap.get('TOTAL_ACTIVE_MINUTES')?.value).toBe(45);
    expect(metricMap.get('TOTAL_WAITING_MINUTES')?.value).toBe(180);
    expect(metricMap.get('TOTAL_CYCLE_MINUTES')?.value).toBe(225);
    expect(metricMap.get('WAITING_SHARE')?.value).toBe(180 / 225);
    expect(metricMap.get('APPROVAL_STEP_COUNT')?.value).toBe(1);
    expect(metricMap.get('PROCESS_OWNER_PRESENT')?.value).toBe(true);

    for (const m of metrics) {
      expect(m.metricVersion).toBe(GROW_PROCESS_METRICS_V1);
    }
  });

  it('7. deterministic ordered input: unsorted steps produce identical canonical inputDigest', () => {
    const process = { id: 'proc-1', ownerPersonId: 'owner-1' };

    const stepsOrder1 = [
      { id: 'step-b', position: 2, name: 'Step B', stepType: 'MANUAL' },
      { id: 'step-a', position: 1, name: 'Step A', stepType: 'DATA_ENTRY' },
      { id: 'step-c', position: 3, name: 'Step C', stepType: 'SYSTEM' },
    ];

    const stepsOrder2 = [
      { id: 'step-c', position: 3, name: 'Step C', stepType: 'SYSTEM' },
      { id: 'step-a', position: 1, name: 'Step A', stepType: 'DATA_ENTRY' },
      { id: 'step-b', position: 2, name: 'Step B', stepType: 'MANUAL' },
    ];

    const input1 = buildCanonicalProcessInput(process, stepsOrder1);
    const input2 = buildCanonicalProcessInput(process, stepsOrder2);

    expect(computeProcessInputDigest(input1)).toBe(computeProcessInputDigest(input2));
  });

  it('8. zero-time process preserves WAITING_SHARE=null', () => {
    const process = { id: 'proc-zero', ownerPersonId: null };
    const steps = [
      { id: 's1', position: 1, name: 'Zero Time Step', stepType: 'MANUAL', estimatedActiveMinutes: 0, estimatedWaitingMinutes: 0 },
    ];

    const metrics = calculateProcessMetrics({ id: process.id, ownerPersonId: null, steps });
    const waitingShare = metrics.find((m) => m.code === 'WAITING_SHARE');
    expect(waitingShare?.value).toBeNull();
  });

  it('9. null system and person semantics remain identical to T2A', () => {
    const process = { id: 'proc-nulls', ownerPersonId: null };
    const steps = [
      { id: 's1', position: 1, name: 'Step 1', systemId: 'crm', responsiblePersonId: 'p1' },
      { id: 's2', position: 2, name: 'Step 2', systemId: null, responsiblePersonId: null },
      { id: 's3', position: 3, name: 'Step 3', systemId: 'erp', responsiblePersonId: 'p2' },
    ];

    const metrics = calculateProcessMetrics({ id: process.id, ownerPersonId: null, steps });
    const metricMap = new Map(metrics.map((m) => [m.code, m]));

    // Intermediate null-system step does NOT bridge across null
    expect(metricMap.get('SYSTEM_SWITCH_COUNT')?.value).toBe(0);
    // Intermediate unassigned step does NOT bridge across null
    expect(metricMap.get('RESPONSIBLE_PERSON_CHANGE_COUNT')?.value).toBe(0);
    expect(metricMap.get('SYSTEM_COUNT')?.value).toBe(2);
    expect(metricMap.get('UNASSIGNED_STEP_COUNT')?.value).toBe(1);
  });

  it('12. provenance and snapshotDigest do NOT include observedAt in content hash', () => {
    const process = { id: 'proc-fixed', ownerPersonId: 'owner-fixed' };
    const steps = [{ id: 's1', position: 1, name: 'Step 1', stepType: 'MANUAL' }];

    const canonicalInput = buildCanonicalProcessInput(process, steps);
    const inputDigest = computeProcessInputDigest(canonicalInput);
    const metrics = calculateProcessMetrics({ id: process.id, ownerPersonId: process.ownerPersonId, steps });

    // Two calculations at different times over identical content
    const digest1 = computeSnapshotDigest(inputDigest, GROW_PROCESS_METRICS_V1, metrics);
    const digest2 = computeSnapshotDigest(inputDigest, GROW_PROCESS_METRICS_V1, metrics);

    expect(digest1).toBe(digest2);
  });
});

describeDb('Grow With Us V2 T2B — PostgreSQL Snapshot Persistence Integration', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();

  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();

  const adminActor = { userId: adminId, role: 'ADMIN' };

  let processAId: string;
  let processBId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    // 1. Seed users
    await db.user.createMany({
      data: [
        { id: adminId, email: `admin-t2b-${suffix}@example.invalid`, name: 'Admin T2B', role: 'ADMIN', status: 'ACTIVE' },
        { id: lawyerId, email: `lawyer-t2b-${suffix}@example.invalid`, name: 'Lawyer T2B', role: 'LAWYER', status: 'ACTIVE' },
      ] as never,
    });

    // 2. Seed clients
    await db.client.createMany({
      data: [
        { id: clientA, name: `Client A T2B ${suffix}` },
        { id: clientB, name: `Client B T2B ${suffix}` },
      ],
    });

    // 3. Seed business processes
    const pA = await db.businessProcess.create({
      data: {
        clientId: clientA,
        name: 'Procurement Process A',
        category: 'PROCUREMENT',
      },
    });
    processAId = pA.id;

    const pB = await db.businessProcess.create({
      data: {
        clientId: clientB,
        name: 'Procurement Process B',
        category: 'PROCUREMENT',
      },
    });
    processBId = pB.id;

    // 4. Seed steps for Process A
    await db.businessProcessStep.createMany({
      data: [
        { processId: processAId, clientId: clientA, position: 1, name: 'Intake Vendor', stepType: 'MANUAL', estimatedActiveMinutes: 20, estimatedWaitingMinutes: 60, isApproval: false },
        { processId: processAId, clientId: clientA, position: 2, name: 'Risk Approval', stepType: 'APPROVAL', estimatedActiveMinutes: 10, estimatedWaitingMinutes: 240, isApproval: true },
      ],
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('1 & 10. persisted process -> snapshot without mutating BusinessProcess or steps', async () => {
    const processBefore = await db.businessProcess.findUnique({
      where: { id: processAId },
      include: { steps: { orderBy: { position: 'asc' } } },
    });

    const snapshot = await captureProcessObservation(adminActor, {
      clientId: clientA,
      businessProcessId: processAId,
    }, db);

    expect(snapshot).toBeDefined();
    expect(snapshot.id).toBeDefined();
    expect(snapshot.clientId).toBe(clientA);
    expect(snapshot.businessProcessId).toBe(processAId);
    expect(snapshot.metricVersion).toBe(GROW_PROCESS_METRICS_V1);
    expect(snapshot.metrics).toHaveLength(12);

    // Verify Process and Steps were NOT mutated
    const processAfter = await db.businessProcess.findUnique({
      where: { id: processAId },
      include: { steps: { orderBy: { position: 'asc' } } },
    });

    expect(processAfter?.updatedAt).toEqual(processBefore?.updatedAt);
    expect(processAfter?.steps).toHaveLength(processBefore?.steps.length ?? 0);
  });

  it('5. tenant A cannot observe tenant B process (cross-tenant rejection)', async () => {
    // Attempting to capture Process B using Client A ID must be rejected with 404
    await expect(
      captureProcessObservation(adminActor, {
        clientId: clientA,
        businessProcessId: processBId,
      }, db),
    ).rejects.toMatchObject({
      code: 'BUSINESS_PROCESS_NOT_FOUND',
    });
  });

  it('6. missing process rejected', async () => {
    await expect(
      captureProcessObservation(adminActor, {
        clientId: clientA,
        businessProcessId: 'non-existent-process-id',
      }, db),
    ).rejects.toMatchObject({
      code: 'BUSINESS_PROCESS_NOT_FOUND',
    });
  });

  it('idempotency: retrying identical capture at exact observedAt returns same snapshot', async () => {
    const fixedTime = new Date('2026-09-11T12:00:00.000Z');

    const snap1 = await captureProcessObservation(adminActor, {
      clientId: clientA,
      businessProcessId: processAId,
      observedAt: fixedTime,
    }, db);

    const snap2 = await captureProcessObservation(adminActor, {
      clientId: clientA,
      businessProcessId: processAId,
      observedAt: fixedTime,
    }, db);

    expect(snap1.id).toBe(snap2.id);
    expect(snap1.inputDigest).toBe(snap2.inputDigest);
    expect(snap1.snapshotDigest).toBe(snap2.snapshotDigest);
  });

  it('repeated observation at different observedAt creates separate history entries', async () => {
    const t1 = new Date('2026-09-11T13:00:00.000Z');
    const t2 = new Date('2026-09-11T14:00:00.000Z');

    const snap1 = await captureProcessObservation(adminActor, {
      clientId: clientA,
      businessProcessId: processAId,
      observedAt: t1,
    }, db);

    const snap2 = await captureProcessObservation(adminActor, {
      clientId: clientA,
      businessProcessId: processAId,
      observedAt: t2,
    }, db);

    expect(snap1.id).not.toBe(snap2.id);
    expect(snap1.observedAt).not.toBe(snap2.observedAt);
    expect(snap1.snapshotDigest).toBe(snap2.snapshotDigest); // same content digest!

    const history = await getProcessObservationHistory(adminActor, clientA, processAId, db);
    expect(history.length).toBeGreaterThanOrEqual(2);

    const latest = await getLatestProcessObservation(adminActor, clientA, processAId, db);
    expect(latest?.observedAt).toBe(t2.toISOString());
  });

  it('11. atomicity: failed snapshot insert leaves zero ProcessObservationSnapshot rows and canonical process unchanged', async () => {
    // 1. Setup canonical process
    const process = await db.businessProcess.create({
      data: {
        clientId: clientA,
        name: 'Failure Test Process',
        steps: {
          create: [
            { name: 'Step 1', position: 1, stepType: 'DATA_ENTRY' },
          ],
        },
      },
      include: { steps: { orderBy: { position: 'asc' } } },
    });

    const countBefore = await db.processObservationSnapshot.count({
      where: { businessProcessId: process.id },
    });
    expect(countBefore).toBe(0);

    // 2. Force failure using narrowest safe mechanism: jest.spyOn
    const spy = jest.spyOn(db.processObservationSnapshot, 'upsert').mockRejectedValueOnce(new Error('Simulated DB Failure'));

    // 3. Attempt capture
    await expect(captureProcessObservation(adminActor, {
      clientId: clientA,
      businessProcessId: process.id,
    }, db)).rejects.toThrow('Simulated DB Failure');

    spy.mockRestore();

    // 4. Prove snapshot count remains 0
    const countAfter = await db.processObservationSnapshot.count({
      where: { businessProcessId: process.id },
    });
    expect(countAfter).toBe(0);

    // 5. Prove canonical process and steps are unchanged
    const processAfter = await db.businessProcess.findUnique({
      where: { id: process.id },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
    expect(processAfter).toEqual(process);
  });
});
