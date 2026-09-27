/**
 * GWO-3A — company-scoped external opportunity ingestion + internal reads.
 *
 * Flow: validate full request (zero writes on any structural issue) ->
 * authorize -> resolve/register the company source connection -> DiscoveryRun
 * -> per-record Observation ingestion (existing Observatory idempotency) ->
 * ExternalOpportunity current projection (create/update with an explicit
 * source-revision ordering guard) -> COMPLETED or PARTIAL run.
 *
 * ORDERING INVARIANT: arrival/observation order is NOT source revision order.
 * A different revision/content may replace the current projection only when
 * both records carry an authoritative source update timestamp and the incoming
 * one is strictly newer; otherwise the change is refused explicitly (the
 * immutable Observation is still preserved). observedAt is never used as
 * source ordering.
 *
 * No matching, no criteria, no review, no Grow side effects. Observation rows
 * are immutable history; only the projection row changes. Observation
 * inputDigest (canonical payload digest) and the watcher-provided contentHash
 * are distinct meanings and never conflated.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../prisma/prisma.service';
import { assertClientReadAccess, InteractionError } from '../../client-interaction/base';
import type { InternalActor } from '../../client-interaction/base';
import { ObservatoryIngestionService } from './service';
import type { GwoImportPayload, GwoOpportunityRecord } from './opportunityTypes';
import { classifyRevisionOrdering, deriveBusinessKey, deriveGwoIdempotencyKey, deriveScopeKey, validateGwoImportPayload } from './opportunityTypes';

function parseOptionalDate(value: string | null): Date | null {
  if (value === null) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The validated record's projection columns (identity fields added by callers). */
function buildGwoProjectionData(record: GwoOpportunityRecord) {
  return {
    kind: record.kind,
    title: record.title,
    sourceUrl: record.sourceUrl,
    status: record.status,
    publicationAt: parseOptionalDate(record.publicationAt),
    openingAt: parseOptionalDate(record.openingAt),
    deadlineAt: parseOptionalDate(record.deadlineAt),
    sourceMetadata: record.sourceSpecificMetadata as unknown as Prisma.InputJsonValue,
    lastRevisionIdentifier: record.sourceRevisionIdentifier,
    lastContentHash: record.contentHash,
    schemaVersion: record.schemaVersion,
  };
}

export type GwoRecordOutcome = 'CREATED' | 'UPDATED' | 'REPLAYED' | 'FAILED';

export interface GwoRecordResult {
  businessKey: string;
  scopeKey: string;
  outcome: GwoRecordOutcome;
  /** Failure/additional detail code (truthful, bounded). */
  code: string | null;
  opportunityId: string | null;
}

export interface GwoImportResult {
  runId: string;
  status: 'COMPLETED' | 'PARTIAL';
  counts: { created: number; updated: number; replayed: number; failed: number };
  results: GwoRecordResult[];
}

export interface GwoImportOptions {
  db?: PrismaClient;
  observatory?: ObservatoryIngestionService;
}

const sharedObservatory = new ObservatoryIngestionService();

/** Resolve or lazily register the company source connection for a sourceType. */
async function resolveConnection(
  actor: InternalActor,
  clientId: string,
  sourceType: string,
  db: PrismaClient,
  observatory: ObservatoryIngestionService,
): Promise<string> {
  const existing = await db.externalSourceConnection.findFirst({
    where: { clientId, sourceType },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await observatory.registerExternalSource(actor, {
    clientId,
    sourceType,
    name: `External opportunities — ${sourceType}`,
    config: {},
  });
  return created.id;
}

/**
 * The business record behind the current immutable Observation. The raw
 * payload carries { sourceType, schemaVersion, record }; the record's own
 * revision metadata is the source of truth for ordering comparisons.
 */
async function loadCurrentRecord(
  db: PrismaClient,
  clientId: string,
  observationId: string,
): Promise<GwoOpportunityRecord | null> {
  const observation = await db.observation.findUnique({
    where: { id_clientId: { id: observationId, clientId } },
    select: { rawPayload: true },
  });
  if (!observation || observation.rawPayload === null || typeof observation.rawPayload !== 'object' || Array.isArray(observation.rawPayload)) {
    return null;
  }
  const record = (observation.rawPayload as Record<string, unknown>)['record'];
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return null;
  }
  return record as GwoOpportunityRecord;
}

/**
 * Import one validated batch of normalized external opportunities.
 * Throws (400, zero writes) when the request itself is structurally invalid.
 * After validation, records persist independently; failures mark the run
 * PARTIAL without deleting already-valid prior records.
 */
export async function importExternalOpportunityBatch(
  actor: InternalActor,
  clientId: string,
  payload: unknown,
  options: GwoImportOptions = {},
): Promise<GwoImportResult> {
  const db = options.db ?? defaultPrisma;
  const observatory = options.observatory ?? sharedObservatory;

  // 1. authorize client/internal actor
  await assertClientReadAccess(actor, clientId, db);

  // 2. validate the FULL request before any write
  const validated: GwoImportPayload = validateGwoImportPayload(payload);

  // 3. resolve/register the company source connection
  const connectionId = await resolveConnection(actor, clientId, validated.sourceType, db, observatory);

  // 4. start the discovery run
  const run = await observatory.startDiscoveryRun(actor, { clientId, connectionId });

  const results: GwoRecordResult[] = [];
  const counts = { created: 0, updated: 0, replayed: 0, failed: 0 };

  for (const record of validated.records) {
    const businessKey = deriveBusinessKey(record);
    const scopeKey = deriveScopeKey(record);
    const idempotencyKey = deriveGwoIdempotencyKey(validated.sourceType, record);
    const observedAt = new Date(record.observedAt);
    try {
      const observation = await observatory.ingestObservation(actor, {
        clientId,
        connectionId,
        discoveryRunId: run.id,
        idempotencyKey,
        sourceRecordId: `${businessKey}::${scopeKey}`,
        rawPayload: { sourceType: validated.sourceType, schemaVersion: record.schemaVersion, record } as unknown as Prisma.InputJsonValue,
        observedAt,
      });

      const where = {
        clientId_sourceType_businessKey_scopeKey: {
          clientId,
          sourceType: validated.sourceType,
          businessKey,
          scopeKey,
        },
      };
      const existing = await db.externalOpportunity.findUnique({ where });

      if (!existing) {
        const created = await db.externalOpportunity.create({
          data: {
            clientId,
            sourceType: validated.sourceType,
            connectionId,
            businessKey,
            scopeKey,
            ...buildGwoProjectionData(record),
            currentObservationId: observation.id,
            lastSeenAt: observedAt,
            revision: 1,
          },
        });
        counts.created += 1;
        results.push({ businessKey, scopeKey, outcome: 'CREATED', code: null, opportunityId: created.id });
        continue;
      }

      if (existing.currentObservationId === observation.id) {
        counts.replayed += 1;
        results.push({ businessKey, scopeKey, outcome: 'REPLAYED', code: null, opportunityId: existing.id });
        continue;
      }

      if (existing.lastContentHash === record.contentHash && existing.lastRevisionIdentifier === record.sourceRevisionIdentifier) {
        // Identical business content observed through a different immutable
        // row: projection must not regress or increment on replay.
        counts.replayed += 1;
        results.push({ businessKey, scopeKey, outcome: 'REPLAYED', code: null, opportunityId: existing.id });
        continue;
      }

      // New source revision/content. PROJECTION REGRESSION GUARD:
      // arrival/observation order is NOT source revision order. Replacing the
      // current projection requires a trustworthy authoritative ordering
      // proof: the current and incoming records must both carry a source
      // update timestamp (revisionSource 'lastChangeDate') and the incoming
      // timestamp must be strictly newer. Checksum-based revisions, mixed or
      // missing ordering signals, unparseable timestamps and equal-timestamp
      // different-content arrivals are refused explicitly — the immutable
      // Observation is still preserved as history.
      const incomingOrdering = classifyRevisionOrdering(record);
      const previousRecord = await loadCurrentRecord(db, clientId, existing.currentObservationId);
      const previousOrdering = previousRecord !== null ? classifyRevisionOrdering(previousRecord) : ({ kind: 'unproven' } as const);
      let updateAllowed = false;
      let guardCode = 'GWO_REVISION_ORDER_UNPROVEN';
      if (incomingOrdering.kind === 'timestamp' && previousOrdering.kind === 'timestamp') {
        if (incomingOrdering.valueMs > previousOrdering.valueMs) {
          updateAllowed = true;
        } else if (incomingOrdering.valueMs < previousOrdering.valueMs) {
          guardCode = 'GWO_STALE_SOURCE_REVISION';
        }
      }
      if (!updateAllowed) {
        counts.failed += 1;
        results.push({ businessKey, scopeKey, outcome: 'FAILED', code: guardCode, opportunityId: existing.id });
        continue;
      }
      const updated = await db.externalOpportunity.update({
        where: { id_clientId: { id: existing.id, clientId } },
        data: {
          ...buildGwoProjectionData(record),
          connectionId,
          currentObservationId: observation.id,
          lastSeenAt: observedAt,
          revision: { increment: 1 },
        },
      });
      counts.updated += 1;
      results.push({ businessKey, scopeKey, outcome: 'UPDATED', code: null, opportunityId: updated.id });
    } catch (error: unknown) {
      counts.failed += 1;
      const message = error instanceof Error ? error.message : '';
      const code = message === 'IDEMPOTENCY_CONFLICT' ? 'IDEMPOTENCY_CONFLICT' : 'GWO_RECORD_PERSIST_FAILED';
      results.push({ businessKey, scopeKey, outcome: 'FAILED', code, opportunityId: null });
    }
  }

  // 5. complete or mark the run partial — a per-record conflict marks the run
  // PARTIAL without deleting already persisted valid records.
  if (counts.failed > 0) {
    await observatory.markDiscoveryRunPartial(actor, { clientId, runId: run.id });
  } else {
    await observatory.completeDiscoveryRun(actor, { clientId, runId: run.id });
  }

  return {
    runId: run.id,
    status: counts.failed > 0 ? 'PARTIAL' : 'COMPLETED',
    counts,
    results,
  };
}

// ---------------------------------------------------------------------------
// Internal reads (tenant-scoped; bounded list; no raw payload in list).
// ---------------------------------------------------------------------------

export interface GwoListOptions {
  status?: string;
  sourceType?: string;
  limit?: number;
  offset?: number;
}

const LIST_SELECT = {
  id: true,
  sourceType: true,
  businessKey: true,
  scopeKey: true,
  kind: true,
  title: true,
  status: true,
  sourceUrl: true,
  publicationAt: true,
  openingAt: true,
  deadlineAt: true,
  lastRevisionIdentifier: true,
  lastSeenAt: true,
  revision: true,
  createdAt: true,
  updatedAt: true,
} as const;

function isoOrNull(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function mapListRow(row: {
  id: string; sourceType: string; businessKey: string; scopeKey: string; kind: string; title: string; status: string;
  sourceUrl: string; publicationAt: Date | null; openingAt: Date | null; deadlineAt: Date | null;
  lastRevisionIdentifier: string | null; lastSeenAt: Date; revision: number; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: row.id,
    sourceType: row.sourceType,
    businessKey: row.businessKey,
    scopeKey: row.scopeKey,
    kind: row.kind,
    title: row.title,
    status: row.status,
    sourceUrl: row.sourceUrl,
    publicationAt: isoOrNull(row.publicationAt),
    openingAt: isoOrNull(row.openingAt),
    deadlineAt: isoOrNull(row.deadlineAt),
    lastRevisionIdentifier: row.lastRevisionIdentifier,
    lastSeenAt: row.lastSeenAt.toISOString(),
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Bounded, tenant-scoped list. Never returns raw observation payloads. */
export async function listExternalOpportunities(
  actor: InternalActor,
  clientId: string,
  options: GwoListOptions = {},
  db: PrismaClient = defaultPrisma,
): Promise<{ items: ReturnType<typeof mapListRow>[]; page: { limit: number; offset: number; count: number } }> {
  await assertClientReadAccess(actor, clientId, db);
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), 100);
  const offset = Math.max(Math.trunc(options.offset ?? 0), 0);
  const rows = await db.externalOpportunity.findMany({
    where: {
      clientId,
      ...(options.status ? { status: options.status } : {}),
      ...(options.sourceType ? { sourceType: options.sourceType } : {}),
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: limit,
    skip: offset,
    select: LIST_SELECT,
  });
  return { items: rows.map(mapListRow), page: { limit, offset, count: rows.length } };
}

/** Tenant-scoped detail with bounded current-source provenance. */
export async function getExternalOpportunity(
  actor: InternalActor,
  clientId: string,
  opportunityId: string,
  db: PrismaClient = defaultPrisma,
) {
  await assertClientReadAccess(actor, clientId, db);
  const row = await db.externalOpportunity.findUnique({
    where: { id_clientId: { id: opportunityId, clientId } },
    include: {
      currentObservation: { select: { id: true, observedAt: true, createdAt: true, inputDigest: true, observationType: true } },
    },
  });
  if (!row) throw new InteractionError(404, 'GWO_OPPORTUNITY_NOT_FOUND', 'External opportunity not found.');
  return {
    ...mapListRow(row),
    connectionId: row.connectionId,
    schemaVersion: row.schemaVersion,
    lastContentHash: row.lastContentHash,
    sourceMetadata: row.sourceMetadata,
    currentObservation: {
      id: row.currentObservation.id,
      observedAt: row.currentObservation.observedAt.toISOString(),
      createdAt: row.currentObservation.createdAt.toISOString(),
      inputDigest: row.currentObservation.inputDigest,
      observationType: row.currentObservation.observationType,
    },
  };
}
