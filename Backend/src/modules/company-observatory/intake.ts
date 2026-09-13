/**
 * OBSERVATORY — structured survey intake (Grow pain intake).
 *
 * Contract:
 * - Creates DECLARED_SURVEY observations only.
 * - Runs through the canonical OBS-1 foundation: a dedicated
 *   ExternalSourceConnection (sourceType SURVEY) and a DiscoveryRun per
 *   submission, so provenance is identical to every other intake path.
 * - Retry-safe via caller-supplied idempotencyKey — a retried submission
 *   produces ONE Observation (digest-checked by ingestObservation).
 * - Never writes findings, recommendations, tasks, or initiatives.
 */

import { ObservationType } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { canonicalDigest } from '../compliance/canonicalDigest';
import { InternalActor, InteractionError, safeText } from '../client-interaction/base';
import { ObservatoryIngestionService } from './ingestion/service';

const SURVEY_SOURCE_NAME = 'Grow strukturált intake';
const SURVEY_SOURCE_TYPE = 'SURVEY';

/**
 * Canonical Hungarian pain categories offered by the intake form. The UI must
 * submit these keys; free text lands in `freeText`, not in categories.
 */
export const SURVEY_CATEGORIES = [
  'MANUAL_ADMIN',
  'SLOW_APPROVAL',
  'DUPLICATE_DATA',
  'TOO_MANY_SYSTEMS',
  'UNCLEAR_OWNERSHIP',
  'REWORK',
  'UNMEASURED_COST',
  'GENERAL_CONCERN',
] as const;
export type SurveyCategory = (typeof SURVEY_CATEGORIES)[number];

export const SURVEY_CATEGORY_LABELS_HU: Record<SurveyCategory, string> = {
  MANUAL_ADMIN: 'Túl sok kézi adminisztráció',
  SLOW_APPROVAL: 'Lassú jóváhagyások / várakozás',
  DUPLICATE_DATA: 'Ugyanazokat az adatokat többször rögzítjük',
  TOO_MANY_SYSTEMS: 'Túl sok rendszer között kell váltani',
  UNCLEAR_OWNERSHIP: 'Nem egyértelmű, ki miért felel',
  REWORK: 'Sok a javítás / újramunka',
  UNMEASURED_COST: 'Nehéz mérni, mi mennyi idő és pénz',
  GENERAL_CONCERN: 'Nem tudom pontosan, csak azt érzem, hogy valami nem működik jól',
};

const CATEGORY_SET = new Set<string>(SURVEY_CATEGORIES);

const ingestion = new ObservatoryIngestionService();

export interface SubmitSurveyIntakeInput {
  categories: string[];
  freeText?: string;
  processId?: string;
  idempotencyKey: string;
}

export interface SubmitSurveyIntakeResult {
  observationId: string;
  runId: string;
  connectionId: string;
  replayed: boolean;
}

async function findOrCreateSurveyConnection(actor: InternalActor, clientId: string) {
  const existing = await defaultPrisma.externalSourceConnection.findFirst({
    where: { clientId, sourceType: SURVEY_SOURCE_TYPE },
  });
  if (existing) return existing;
  return ingestion.registerExternalSource(actor, {
    clientId,
    sourceType: SURVEY_SOURCE_TYPE,
    name: SURVEY_SOURCE_NAME,
    config: { kind: 'structured-survey', version: 1 },
  });
}

/**
 * Submits the structured pain intake for a client. Produces exactly one
 * DECLARED_SURVEY observation per idempotencyKey; a second call with the same
 * key and identical payload replays (replayed: true) without duplicating.
 */
export async function submitSurveyIntake(
  actor: InternalActor,
  clientId: string,
  input: SubmitSurveyIntakeInput,
): Promise<SubmitSurveyIntakeResult> {
  const idempotencyKey = safeText(input.idempotencyKey, 'idempotencyKey', 200, true)!;
  const categories = (input.categories ?? [])
    .map((c) => String(c))
    .filter((c) => CATEGORY_SET.has(c));
  if (!categories.length && !input.freeText) {
    throw new InteractionError(400, 'INTAKE_EMPTY', 'At least one category or a free-text answer is required.');
  }
  const freeText = safeText(input.freeText, 'freeText', 4000, false) ?? null;

  const connection = await findOrCreateSurveyConnection(actor, clientId);

  const rawPayload = {
    kind: 'GROW_PAIN_INTAKE',
    categories,
    categoryLabelsHu: categories.map((c) => SURVEY_CATEGORY_LABELS_HU[c as SurveyCategory] ?? c),
    freeText,
    processId: input.processId ? String(input.processId) : null,
  };

  // Exact replay: same key + same payload returns the existing observation
  // without creating a duplicate run.
  const existing = await defaultPrisma.observation.findUnique({
    where: { clientId_connectionId_idempotencyKey: { clientId, connectionId: connection.id, idempotencyKey } },
  });
  if (existing) {
    if (existing.inputDigest === canonicalDigest(rawPayload)) {
      return { observationId: existing.id, runId: existing.discoveryRunId, connectionId: connection.id, replayed: true };
    }
    throw new InteractionError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was already used with a different payload.');
  }

  const run = await ingestion.startDiscoveryRun(actor, { clientId, connectionId: connection.id });
  try {
    const observation = await ingestion.ingestObservation(actor, {
      clientId,
      connectionId: connection.id,
      discoveryRunId: run.id,
      observationType: ObservationType.DECLARED_SURVEY,
      idempotencyKey,
      sourceRecordId: `survey:${idempotencyKey}`,
      rawPayload,
    });
    await ingestion.completeDiscoveryRun(actor, { clientId, runId: run.id });
    return { observationId: observation.id, runId: run.id, connectionId: connection.id, replayed: false };
  } catch (err) {
    await ingestion.failDiscoveryRun(actor, { clientId, runId: run.id });
    if (err instanceof Error && err.message === 'IDEMPOTENCY_CONFLICT') {
      throw new InteractionError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was already used with a different payload.');
    }
    throw err;
  }
}

/** Lists the declared survey observations for a client (provenance visible). */
export async function listSurveyIntakes(actor: InternalActor, clientId: string) {
  const connection = await defaultPrisma.externalSourceConnection.findFirst({
    where: { clientId, sourceType: SURVEY_SOURCE_TYPE },
  });
  if (!connection) return [];
  const rows = await defaultPrisma.observation.findMany({
    where: { clientId, connectionId: connection.id, observationType: 'DECLARED_SURVEY' },
    orderBy: { observedAt: 'desc' },
    take: 100,
  });
  return rows.map((o) => ({
    id: o.id,
    runId: o.discoveryRunId,
    connectionId: o.connectionId,
    idempotencyKey: o.idempotencyKey,
    observedAt: o.observedAt.toISOString(),
    payload: o.rawPayload,
  }));
}
