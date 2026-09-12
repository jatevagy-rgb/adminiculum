/**
 * GROW WITH US V2 — T2B Process Observation Snapshot Service.
 *
 * Implements atomic, reproducible observation snapshot capture and history retrieval
 * for canonical BusinessProcess instances.
 *
 * GUARANTEES:
 * 1. Calls existing T2A deterministic metric calculator (zero formula duplication).
 * 2. Uses same deterministic step ordering as T2A (position asc, id asc tie-breaker).
 * 3. Enforces tenant safety via composite foreign keys and service-layer validation.
 * 4. Content digest (snapshotDigest) identifies measurement content (inputDigest + version + metrics),
 *    excluding observedAt.
 * 5. Database-enforced idempotency on exact identity:
 *    [clientId, businessProcessId, metricVersion, inputDigest, observedAt].
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../prisma/prisma.service';
import { canonicalDigest } from '../../compliance/canonicalDigest';
import { InteractionError, InternalActor, assertClientReadAccess } from '../../client-interaction/base';
import { calculateProcessMetrics, sortStepsDeterministically } from '../metrics/calculateProcessMetrics';
import { GROW_PROCESS_METRICS_V1, ProcessMetricInput, ProcessMetricStepInput, ProcessMetricValue } from '../metrics/metricTypes';
import {
  CanonicalMeasuredProcessInput,
  CaptureProcessObservationInput,
  ProcessObservationProvenance,
  ProcessObservationSnapshotDTO,
} from './processObservationTypes';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Builds the minimal canonical measured process representation for computing inputDigest.
 */
export function buildCanonicalProcessInput(
  process: { id: string; ownerPersonId?: string | null },
  steps: readonly ProcessMetricStepInput[],
): CanonicalMeasuredProcessInput {
  const sorted = sortStepsDeterministically(steps);

  return {
    processId: process.id,
    ownerPersonId: process.ownerPersonId != null && process.ownerPersonId !== '' ? process.ownerPersonId : null,
    steps: sorted.map((s) => ({
      id: s.id != null && s.id !== '' ? s.id : null,
      position: s.position,
      name: s.name != null && s.name !== '' ? s.name : null,
      stepType: s.stepType != null && s.stepType !== '' ? s.stepType : null,
      responsiblePersonId: s.responsiblePersonId != null && s.responsiblePersonId !== '' ? s.responsiblePersonId : null,
      systemId: s.systemId != null && s.systemId !== '' ? s.systemId : null,
      estimatedActiveMinutes: s.estimatedActiveMinutes != null && Number.isFinite(s.estimatedActiveMinutes) ? s.estimatedActiveMinutes : null,
      estimatedWaitingMinutes: s.estimatedWaitingMinutes != null && Number.isFinite(s.estimatedWaitingMinutes) ? s.estimatedWaitingMinutes : null,
      isApproval: Boolean(s.isApproval),
    })),
  };
}

/**
 * Computes deterministic SHA-256 digest of the canonical process input.
 */
export function computeProcessInputDigest(input: CanonicalMeasuredProcessInput): string {
  return canonicalDigest(input);
}

/**
 * Computes deterministic SHA-256 digest of the observation measurement payload.
 * Intentionally excludes observedAt so that identical measurements over the same state
 * have identical snapshotDigest.
 */
export function computeSnapshotDigest(
  inputDigest: string,
  metricVersion: string,
  metrics: readonly ProcessMetricValue[],
): string {
  return canonicalDigest({
    inputDigest,
    metricVersion,
    metrics,
  });
}

function toSnapshotDTO(row: any): ProcessObservationSnapshotDTO {
  return {
    id: row.id,
    clientId: row.clientId,
    businessProcessId: row.businessProcessId,
    metricVersion: row.metricVersion,
    observedAt: row.observedAt instanceof Date ? row.observedAt.toISOString() : String(row.observedAt),
    inputDigest: row.inputDigest,
    snapshotDigest: row.snapshotDigest,
    metrics: row.metrics as ProcessMetricValue[],
    provenance: (row.provenance as ProcessObservationProvenance) ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

/**
 * Captures and persists an observation snapshot for a canonical BusinessProcess.
 * Enforces tenant safety and database-level idempotency on exact identity.
 */
export async function captureProcessObservation(
  actor: InternalActor,
  input: CaptureProcessObservationInput,
  prisma: Db = defaultPrisma,
): Promise<ProcessObservationSnapshotDTO> {
  await assertClientReadAccess(actor, input.clientId, prisma as any);

  // Resolve observation timestamp ONCE at entry
  const resolvedObservedAt = input.observedAt ? new Date(input.observedAt) : new Date();

  // Load process and steps within same tenant scope
  const process = await prisma.businessProcess.findFirst({
    where: {
      id: input.businessProcessId,
      clientId: input.clientId,
    },
    include: {
      steps: {
        orderBy: { position: 'asc' },
      },
    },
  });

  if (!process) {
    throw new InteractionError(404, 'BUSINESS_PROCESS_NOT_FOUND', 'Business process not found for this client.');
  }

  // Map to T2A metric input format
  const stepInputs: ProcessMetricStepInput[] = process.steps.map((s) => ({
    id: s.id,
    position: s.position,
    name: s.name,
    stepType: s.stepType,
    responsiblePersonId: s.responsiblePersonId,
    systemId: s.systemId,
    estimatedActiveMinutes: s.estimatedActiveMinutes,
    estimatedWaitingMinutes: s.estimatedWaitingMinutes,
    isApproval: s.isApproval,
  }));

  const metricInput: ProcessMetricInput = {
    id: process.id,
    ownerPersonId: process.ownerPersonId,
    steps: stepInputs,
  };

  // 1. Calculate deterministic T2A metrics
  const metrics = calculateProcessMetrics(metricInput);

  // 2. Build canonical input and calculate digests
  const canonicalInput = buildCanonicalProcessInput(process, stepInputs);
  const inputDigest = computeProcessInputDigest(canonicalInput);
  const snapshotDigest = computeSnapshotDigest(inputDigest, GROW_PROCESS_METRICS_V1, metrics);

  const provenance: ProcessObservationProvenance = {
    source: input.provenanceSource || 'CANONICAL_BUSINESS_PROCESS',
    calculatedBy: GROW_PROCESS_METRICS_V1,
    stepCount: stepInputs.length,
    inputFieldInventory: [
      'processId',
      'ownerPersonId',
      'steps.id',
      'steps.position',
      'steps.name',
      'steps.stepType',
      'steps.responsiblePersonId',
      'steps.systemId',
      'steps.estimatedActiveMinutes',
      'steps.estimatedWaitingMinutes',
      'steps.isApproval',
    ],
  };

  // 3. Atomically upsert snapshot with database-enforced idempotency on exact identity
  const record = await prisma.processObservationSnapshot.upsert({
    where: {
      clientId_businessProcessId_metricVersion_inputDigest_observedAt: {
        clientId: input.clientId,
        businessProcessId: input.businessProcessId,
        metricVersion: GROW_PROCESS_METRICS_V1,
        inputDigest,
        observedAt: resolvedObservedAt,
      },
    },
    create: {
      clientId: input.clientId,
      businessProcessId: input.businessProcessId,
      metricVersion: GROW_PROCESS_METRICS_V1,
      observedAt: resolvedObservedAt,
      inputDigest,
      snapshotDigest,
      metrics: metrics as unknown as Prisma.InputJsonValue,
      provenance: provenance as unknown as Prisma.InputJsonValue,
    },
    update: {}, // Idempotent no-op if identical observation already captured
  });

  return toSnapshotDTO(record);
}

/**
 * Retrieves the latest observation snapshot for a process.
 */
export async function getLatestProcessObservation(
  actor: InternalActor,
  clientId: string,
  businessProcessId: string,
  prisma: Db = defaultPrisma,
): Promise<ProcessObservationSnapshotDTO | null> {
  await assertClientReadAccess(actor, clientId, prisma as any);

  const record = await prisma.processObservationSnapshot.findFirst({
    where: {
      clientId,
      businessProcessId,
    },
    orderBy: [{ observedAt: 'desc' }, { createdAt: 'desc' }],
  });

  return record ? toSnapshotDTO(record) : null;
}

/**
 * Retrieves the chronological observation snapshot history for a process.
 */
export async function getProcessObservationHistory(
  actor: InternalActor,
  clientId: string,
  businessProcessId: string,
  prisma: Db = defaultPrisma,
): Promise<ProcessObservationSnapshotDTO[]> {
  await assertClientReadAccess(actor, clientId, prisma as any);

  const records = await prisma.processObservationSnapshot.findMany({
    where: {
      clientId,
      businessProcessId,
    },
    orderBy: [{ observedAt: 'desc' }, { createdAt: 'desc' }],
  });

  return records.map(toSnapshotDTO);
}
