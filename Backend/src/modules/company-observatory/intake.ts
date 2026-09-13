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
import { assertClientReadAccess, assertClientSafe, InternalActor, InteractionError, Prisma, safeText } from '../client-interaction/base';
import { requireOrganizationWorkspace } from '../client-workspace/organizationalAccessPolicy';
import { ObservatoryIngestionService, type ObservatoryAccessGuard } from './ingestion/service';

const ingestion = new ObservatoryIngestionService();

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

export interface SurveySubmissionProvenance {
  channel: 'INTERNAL_WORKFORCE' | 'CLIENT_PORTAL';
  submittedAt: string;
  workspaceId?: string;
  identityId?: string;
}

async function findOrCreateSurveyConnection(
  actor: InternalActor,
  clientId: string,
  accessGuard?: ObservatoryAccessGuard,
) {
  const existing = await defaultPrisma.externalSourceConnection.findFirst({
    where: { clientId, sourceType: SURVEY_SOURCE_TYPE },
  });
  if (existing) return existing;
  // Creation must go through the canonical ingestion service so validateNoSecrets
  // and canonical connection semantics remain active.
  return ingestion.registerExternalSource(actor, {
    clientId,
    sourceType: SURVEY_SOURCE_TYPE,
    name: SURVEY_SOURCE_NAME,
    config: { kind: 'structured-survey', version: 1 },
  }, accessGuard);
}

/**
 * Shared canonical survey persistence core.
 * Reusable by both internal workforce and customer portal callers after server-side authorization.
 * Produces exactly one DECLARED_SURVEY observation per idempotencyKey.
 */
async function persistCanonicalSurveySubmission(
  actor: InternalActor,
  provenance: SurveySubmissionProvenance,
  clientId: string,
  input: SubmitSurveyIntakeInput,
  accessGuard?: ObservatoryAccessGuard,
): Promise<SubmitSurveyIntakeResult> {
  const idempotencyKey = safeText(input.idempotencyKey, 'idempotencyKey', 200, true)!;
  const categories = (input.categories ?? [])
    .map((c) => String(c))
    .filter((c) => CATEGORY_SET.has(c));
  if (!categories.length && !input.freeText) {
    throw new InteractionError(400, 'INTAKE_EMPTY', 'At least one category or a free-text answer is required.');
  }
  const freeText = safeText(input.freeText, 'freeText', 4000, false) ?? null;

  const connection = await findOrCreateSurveyConnection(actor, clientId, accessGuard);

  const rawPayload: Record<string, unknown> = {
    kind: 'GROW_PAIN_INTAKE',
    categories,
    categoryLabelsHu: categories.map((c) => SURVEY_CATEGORY_LABELS_HU[c as SurveyCategory] ?? c),
    freeText,
    processId: input.processId ? String(input.processId) : null,
  };
  // Portal provenance only. The internal workforce payload must remain
  // byte-compatible with the historical shape so existing idempotency digests
  // are unchanged (no new `provenance` object on the internal path).
  if (provenance.channel === 'CLIENT_PORTAL') {
    rawPayload.provenance = {
      channel: 'CLIENT_PORTAL',
      ...(provenance.workspaceId ? { workspaceId: provenance.workspaceId } : {}),
      ...(provenance.identityId ? { identityId: provenance.identityId } : {}),
    };
  }

  const digest = canonicalDigest(rawPayload);

  // Exact replay: same key + same payload returns the existing observation
  // without creating a duplicate run.
  const existing = await defaultPrisma.observation.findUnique({
    where: { clientId_connectionId_idempotencyKey: { clientId, connectionId: connection.id, idempotencyKey } },
  });
  if (existing) {
    if (existing.inputDigest === digest) {
      return { observationId: existing.id, runId: existing.discoveryRunId, connectionId: connection.id, replayed: true };
    }
    throw new InteractionError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was already used with a different payload.');
  }

  const run = await ingestion.startDiscoveryRun(actor, { clientId, connectionId: connection.id }, accessGuard);

  try {
    const observation = await ingestion.ingestObservation(actor, {
      clientId,
      connectionId: connection.id,
      discoveryRunId: run.id,
      observationType: ObservationType.DECLARED_SURVEY,
      idempotencyKey,
      sourceRecordId: `survey:${idempotencyKey}`,
      rawPayload: rawPayload as never,
      // Internal workforce historically relied on the ingestion service's
      // internal new Date(); only the portal path pins observedAt explicitly.
      ...(provenance.channel === 'CLIENT_PORTAL' ? { observedAt: new Date(provenance.submittedAt) } : {}),
    }, accessGuard);
    await ingestion.completeDiscoveryRun(actor, { clientId, runId: run.id }, accessGuard);
    return { observationId: observation.id, runId: run.id, connectionId: connection.id, replayed: false };
  } catch (err: any) {
    await ingestion.failDiscoveryRun(actor, { clientId, runId: run.id }, accessGuard).catch(() => undefined);
    if (err?.message === 'IDEMPOTENCY_CONFLICT') {
      throw new InteractionError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was already used with a different payload.');
    }
    throw err;
  }
}

/**
 * Submits the structured pain intake for a client from an internal workforce actor.
 * Strict internal authorization via assertClientReadAccess.
 */
export async function submitSurveyIntake(
  actor: InternalActor,
  clientId: string,
  input: SubmitSurveyIntakeInput,
  prisma: Prisma = defaultPrisma,
): Promise<SubmitSurveyIntakeResult> {
  await assertClientReadAccess(actor, clientId, prisma);
  return persistCanonicalSurveySubmission(
    actor,
    { channel: 'INTERNAL_WORKFORCE', submittedAt: new Date().toISOString() },
    clientId,
    input,
  );
}

/** Lists the declared survey observations for a client (internal provenance visible). */
export async function listSurveyIntakes(actor: InternalActor, clientId: string, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);
  const connection = await prisma.externalSourceConnection.findFirst({
    where: { clientId, sourceType: SURVEY_SOURCE_TYPE },
  });
  if (!connection) return [];
  const rows = await prisma.observation.findMany({
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

export interface SubmitPortalSurveyInput {
  categories: string[];
  freeText?: string;
  processId?: string;
  idempotencyKey: string;
}

export interface PortalSurveySubmissionResult {
  success: boolean;
  replayed: boolean;
  message: string;
  submittedAt: string;
}

/**
 * Submits structured pain survey from an authenticated client portal session.
 * Enforces active identity, active workspace membership, organization workspace mode,
 * and derives clientId strictly server-side.
 */
export async function submitPortalSurveyIntake(
  identityId: string,
  workspaceId: string,
  input: SubmitPortalSurveyInput,
  prisma: Prisma = defaultPrisma,
): Promise<PortalSurveySubmissionResult> {
  if (!identityId) {
    throw new InteractionError(401, 'CLIENT_PORTAL_AUTH_REQUIRED', 'Client portal authentication is required.');
  }
  if (!workspaceId) {
    throw new InteractionError(409, 'CLIENT_WORKSPACE_SELECTION_REQUIRED', 'Select an authorized workspace.');
  }

  const identity = await prisma.clientPortalIdentity.findUnique({
    where: { id: identityId },
    select: { status: true },
  });
  if (!identity || String(identity.status) !== 'ACTIVE') {
    throw new InteractionError(403, 'CLIENT_IDENTITY_NOT_ACTIVE', 'Client identity is not active.');
  }

  const workspace = await requireOrganizationWorkspace(workspaceId, prisma);

  const membership = await prisma.clientPortalWorkspaceMembership.findFirst({
    where: {
      clientPortalIdentityId: identityId,
      workspaceId: workspace.id,
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  if (!membership) {
    throw new InteractionError(403, 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED', 'Active workspace membership is required.');
  }

  // Customer-safe process validation: ensure process belongs to this client if specified
  let validProcessId: string | undefined = undefined;
  if (input.processId) {
    const proc = await prisma.businessProcess.findFirst({
      where: { id: String(input.processId), clientId: workspace.clientId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (proc) validProcessId = proc.id;
  }

  const submittedAt = new Date().toISOString();

  // Server-bound capability: created only AFTER real portal session + workspace
  // authorization. The browser cannot construct this guard.
  const authorizedClientId = workspace.clientId;
  const portalAccessGuard: ObservatoryAccessGuard = async (_actor, requestedClientId) => {
    if (requestedClientId !== authorizedClientId) {
      throw new InteractionError(403, 'CLIENT_WORKSPACE_FORBIDDEN', 'Workspace does not authorize this client.');
    }
  };
  // Truthful portal actor carrier. Authorization is performed by the guard; this
  // role is never added to INTERNAL_ROLES.
  const portalActor: InternalActor = { userId: identityId, role: 'CLIENT_PORTAL' };

  const res = await persistCanonicalSurveySubmission(
    portalActor,
    {
      channel: 'CLIENT_PORTAL',
      submittedAt,
      workspaceId: workspace.id,
      identityId,
    },
    authorizedClientId,
    {
      categories: input.categories,
      freeText: input.freeText,
      processId: validProcessId,
      idempotencyKey: input.idempotencyKey,
    },
    portalAccessGuard,
  );

  return {
    success: true,
    replayed: res.replayed,
    message: 'Rögzítettük. A jelzést a működés áttekintésekor figyelembe vesszük.',
    submittedAt,
  };
}

export interface SafePortalSurveyReadback {
  submittedAt: string;
  categoryLabels: string[];
  freeText: string | null;
  processName: string | null;
}

/**
 * Customer-safe readback of submitted surveys.
 * Never exposes Observation IDs, run IDs, connection IDs, raw JSON, or internal diagnosis.
 */
export async function listPortalSurveyIntakes(
  identityId: string,
  workspaceId: string,
  prisma: Prisma = defaultPrisma,
): Promise<{ items: SafePortalSurveyReadback[] }> {
  if (!identityId) {
    throw new InteractionError(401, 'CLIENT_PORTAL_AUTH_REQUIRED', 'Client portal authentication is required.');
  }
  if (!workspaceId) {
    throw new InteractionError(409, 'CLIENT_WORKSPACE_SELECTION_REQUIRED', 'Select an authorized workspace.');
  }

  const identity = await prisma.clientPortalIdentity.findUnique({
    where: { id: identityId },
    select: { status: true },
  });
  if (!identity || String(identity.status) !== 'ACTIVE') {
    throw new InteractionError(403, 'CLIENT_IDENTITY_NOT_ACTIVE', 'Client identity is not active.');
  }

  const workspace = await requireOrganizationWorkspace(workspaceId, prisma);

  const membership = await prisma.clientPortalWorkspaceMembership.findFirst({
    where: {
      clientPortalIdentityId: identityId,
      workspaceId: workspace.id,
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  if (!membership) {
    throw new InteractionError(403, 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED', 'Active workspace membership is required.');
  }

  const connection = await prisma.externalSourceConnection.findFirst({
    where: { clientId: workspace.clientId, sourceType: SURVEY_SOURCE_TYPE },
  });
  if (!connection) return { items: [] };

  const rows = await prisma.observation.findMany({
    where: {
      clientId: workspace.clientId,
      connectionId: connection.id,
      observationType: 'DECLARED_SURVEY',
      // Customer-safe boundary: only surveys submitted through THIS authorized
      // portal workspace. Internal-workforce rows and rows from another
      // workspace on the same client must never appear. Fail closed.
      AND: [
        { rawPayload: { path: ['provenance', 'channel'], equals: 'CLIENT_PORTAL' } },
        { rawPayload: { path: ['provenance', 'workspaceId'], equals: workspace.id } },
      ],
    },
    orderBy: { observedAt: 'desc' },
    take: 50,
  });

  const processes = await prisma.businessProcess.findMany({
    where: { clientId: workspace.clientId },
    select: { id: true, name: true },
  });
  const processMap = new Map(processes.map((p) => [p.id, p.name]));

  const items: SafePortalSurveyReadback[] = rows.map((r) => {
    const payload = r.rawPayload as Record<string, any> | null;
    const labels = Array.isArray(payload?.categoryLabelsHu)
      ? (payload!.categoryLabelsHu as string[]).map(String)
      : Array.isArray(payload?.categories)
      ? (payload!.categories as string[]).map((c) => SURVEY_CATEGORY_LABELS_HU[c as SurveyCategory] ?? c)
      : [];
    const pId = payload?.processId ? String(payload.processId) : null;
    return {
      submittedAt: r.observedAt.toISOString(),
      categoryLabels: labels,
      freeText: payload?.freeText ? String(payload.freeText) : null,
      processName: pId ? processMap.get(pId) || null : null,
    };
  });

  assertClientSafe(items);
  return { items };
}
