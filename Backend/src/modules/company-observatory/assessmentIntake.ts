/**
 * OBSERVATORY â€” customer Grow assessment intake (GROW_ASSESSMENT_V1).
 *
 * Contract:
 * - Persists customer self-assessments as DECLARED_SURVEY observations through
 *   the canonical OBS-1 foundation: a dedicated ExternalSourceConnection
 *   (sourceType SURVEY) and a DiscoveryRun per submission. There is NO second
 *   questionnaire store.
 * - Retry-safe via caller-supplied idempotencyKey with the same replay semantics
 *   as the structured survey path: same key + same canonical payload replays the
 *   existing observation; same key + different payload is IDEMPOTENCY_CONFLICT.
 *   Replay identity is deliberately independent of mutable process status.
 * - Declared evidence only: never writes findings, recommendations,
 *   opportunities, initiatives, tasks or cases.
 * - Exact schema validation: unknown pack/version/question, duplicate question,
 *   invalid answer, extra arbitrary question and oversized payload are rejected.
 */

import { ObservationType, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { canonicalDigest } from '../compliance/canonicalDigest';
import { InteractionError, InternalActor, safeText } from '../client-interaction/base';
import { requireOrganizationWorkspace } from '../client-workspace/organizationalAccessPolicy';
import {
  AssessmentValidationError,
  GROW_ASSESSMENT_KIND,
  GROW_ASSESSMENT_SCHEMA,
  getAssessmentPack,
  validateAssessmentSubmission,
} from '../company-growth/assessments/registry';
import { ObservatoryIngestionService, type ObservatoryAccessGuard } from './ingestion/service';

const ingestion = new ObservatoryIngestionService();

type Db = typeof defaultPrisma;

const SURVEY_SOURCE_NAME = 'Grow strukturĂˇlt intake';
const SURVEY_SOURCE_TYPE = 'SURVEY';

/** Defense-in-depth: the canonical payload is server-constructed and can never
 * legitimately contain secret-like material. Reject before persisting. */
const SECRET_LIKE = /(secret|password|passwd|token|api[-_ ]?key|authorization|bearer)/i;

export interface AssessmentAnswerRecord {
  questionKey: string;
  answer: string;
}

export interface SubmitPortalAssessmentInput {
  answers: unknown;
  idempotencyKey: string;
  processId?: string;
}

export interface PortalAssessmentSubmissionResult {
  packKey: string;
  packVersion: number;
  replayed: boolean;
  completedAt: string;
}

/** Customer-safe readback record. No observation/run/connection ids, no raw payload. */
export interface SafePortalAssessmentSubmission {
  packKey: string;
  packVersion: number;
  answers: AssessmentAnswerRecord[];
  processId: string | null;
  completedAt: string;
}

interface AuthorizedOrgContext {
  clientId: string;
  workspaceId: string;
  portalActor: InternalActor;
  portalAccessGuard: ObservatoryAccessGuard;
}

/**
 * Server-side authorization equivalent to the canonical survey portal path.
 * clientId is ALWAYS derived from the resolved workspace, never from the browser.
 */
async function resolveAuthorizedOrgContext(
  identityId: string,
  workspaceId: string,
  db: Db,
): Promise<AuthorizedOrgContext> {
  if (!identityId) {
    throw new InteractionError(401, 'CLIENT_PORTAL_AUTH_REQUIRED', 'Client portal authentication is required.');
  }
  if (!workspaceId) {
    throw new InteractionError(409, 'CLIENT_WORKSPACE_SELECTION_REQUIRED', 'Select an authorized workspace.');
  }

  const identity = await db.clientPortalIdentity.findUnique({
    where: { id: identityId },
    select: { status: true },
  });
  if (!identity || String(identity.status) !== 'ACTIVE') {
    throw new InteractionError(403, 'CLIENT_IDENTITY_NOT_ACTIVE', 'Client identity is not active.');
  }

  const workspace = await requireOrganizationWorkspace(workspaceId, db);

  const membership = await db.clientPortalWorkspaceMembership.findFirst({
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

  const authorizedClientId = workspace.clientId;
  const portalAccessGuard: ObservatoryAccessGuard = async (_actor, requestedClientId) => {
    if (requestedClientId !== authorizedClientId) {
      throw new InteractionError(403, 'CLIENT_WORKSPACE_FORBIDDEN', 'Workspace does not authorize this client.');
    }
  };
  return {
    clientId: authorizedClientId,
    workspaceId: workspace.id,
    portalActor: { userId: identityId, role: 'CLIENT_PORTAL' },
    portalAccessGuard,
  };
}

async function findOrCreateSurveyConnection(
  actor: InternalActor,
  clientId: string,
  accessGuard: ObservatoryAccessGuard,
) {
  const existing = await defaultPrisma.externalSourceConnection.findFirst({
    where: { clientId, sourceType: SURVEY_SOURCE_TYPE },
  });
  if (existing) return existing;
  // Creation goes through the canonical ingestion service so validateNoSecrets
  // and canonical connection semantics remain active.
  return ingestion.registerExternalSource(
    actor,
    {
      clientId,
      sourceType: SURVEY_SOURCE_TYPE,
      name: SURVEY_SOURCE_NAME,
      config: { kind: 'structured-survey', version: 1 },
    },
    accessGuard,
  );
}

interface CanonicalAssessmentPayloadInput {
  packKey: string;
  packVersion: number;
  answers: AssessmentAnswerRecord[];
  processId: string | null;
  workspaceId: string;
  identityId: string;
}

/** Deterministic canonical payload. Contains no mutable status and no timestamp
 * (the completion time is carried by observation.observedAt), so identical
 * requests always produce an identical digest. */
function buildCanonicalAssessmentPayload(input: CanonicalAssessmentPayloadInput): Record<string, unknown> {
  return {
    schema: GROW_ASSESSMENT_SCHEMA,
    kind: GROW_ASSESSMENT_KIND,
    packKey: input.packKey,
    packVersion: input.packVersion,
    answers: input.answers.map((a) => ({ questionKey: a.questionKey, answer: a.answer })),
    processId: input.processId,
    provenance: {
      channel: 'CLIENT_PORTAL',
      workspaceId: input.workspaceId,
      identityId: input.identityId,
    },
  };
}

/**
 * Validates + persists a customer self-assessment as declared evidence.
 * Returns the canonical pack identity and completion timestamp.
 */
export async function submitPortalGrowAssessment(
  identityId: string,
  workspaceId: string,
  packKey: string,
  input: SubmitPortalAssessmentInput,
  db: Db = defaultPrisma,
): Promise<PortalAssessmentSubmissionResult> {
  const ctx = await resolveAuthorizedOrgContext(identityId, workspaceId, db);

  const idempotencyKey = safeText(input.idempotencyKey, 'idempotencyKey', 200, true)!;

  let validated;
  try {
    validated = validateAssessmentSubmission(packKey, 1, input.answers);
  } catch (error) {
    if (error instanceof AssessmentValidationError) {
      throw new InteractionError(error.status, error.code, error.message);
    }
    throw error;
  }
  const pack = validated.pack;

  const requestedProcessId =
    pack.allowsProcessReference && input.processId ? String(input.processId) : null;

  const canonical = (processId: string | null) =>
    buildCanonicalAssessmentPayload({
      packKey: pack.packKey,
      packVersion: pack.version,
      answers: validated.answers,
      processId,
      workspaceId: ctx.workspaceId,
      identityId,
    });

  const guardSecretLike = (payload: Record<string, unknown>) => {
    if (SECRET_LIKE.test(JSON.stringify(payload))) {
      throw new InteractionError(400, 'ASSESSMENT_FORBIDDEN_CONTENT', 'A bekĂĽldĂ¶tt tartalom nem megengedett.');
    }
  };

  const resolveActiveProcessId = async (processId: string | null): Promise<string | null> => {
    if (!processId) return null;
    const process = await defaultPrisma.businessProcess.findFirst({
      where: { id: processId, clientId: ctx.clientId, status: 'ACTIVE' },
      select: { id: true },
    });
    return process?.id ?? null;
  };

  const connection = await findOrCreateSurveyConnection(ctx.portalActor, ctx.clientId, ctx.portalAccessGuard);

  // Exact replay must not depend on mutable current process status: compare the
  // persisted digest against both the raw requested reference and the
  // currently-validated reference, exactly like the survey boundary.
  const existing = await defaultPrisma.observation.findUnique({
    where: { clientId_connectionId_idempotencyKey: { clientId: ctx.clientId, connectionId: connection.id, idempotencyKey } },
  });
  if (existing) {
    if (existing.inputDigest === canonicalDigest(canonical(requestedProcessId))) {
      return {
        packKey: pack.packKey,
        packVersion: pack.version,
        replayed: true,
        completedAt: existing.observedAt.toISOString(),
      };
    }
    if (existing.inputDigest === canonicalDigest(canonical(await resolveActiveProcessId(requestedProcessId)))) {
      return {
        packKey: pack.packKey,
        packVersion: pack.version,
        replayed: true,
        completedAt: existing.observedAt.toISOString(),
      };
    }
    throw new InteractionError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was already used with a different payload.');
  }

  const rawPayload = canonical(await resolveActiveProcessId(requestedProcessId));
  guardSecretLike(rawPayload);
  if (JSON.stringify(rawPayload).length > 20000) {
    throw new InteractionError(400, 'ASSESSMENT_PAYLOAD_TOO_LARGE', 'A bekĂĽldĂ¶tt felmĂ©rĂ©s tĂşl nagy.');
  }

  const completedAt = new Date();
  const run = await ingestion.startDiscoveryRun(
    ctx.portalActor,
    { clientId: ctx.clientId, connectionId: connection.id },
    ctx.portalAccessGuard,
  );

  try {
    await ingestion.ingestObservation(
      ctx.portalActor,
      {
        clientId: ctx.clientId,
        connectionId: connection.id,
        discoveryRunId: run.id,
        observationType: ObservationType.DECLARED_SURVEY,
        idempotencyKey,
        sourceRecordId: `grow-assessment:${pack.packKey}:${idempotencyKey}`,
        rawPayload: rawPayload as never,
        observedAt: completedAt,
      },
      ctx.portalAccessGuard,
    );
    await ingestion.completeDiscoveryRun(
      ctx.portalActor,
      { clientId: ctx.clientId, runId: run.id },
      ctx.portalAccessGuard,
    );
    return {
      packKey: pack.packKey,
      packVersion: pack.version,
      replayed: false,
      completedAt: completedAt.toISOString(),
    };
  } catch (err: any) {
    await ingestion.failDiscoveryRun(ctx.portalActor, { clientId: ctx.clientId, runId: run.id }, ctx.portalAccessGuard).catch(() => undefined);
    if (err?.message === 'IDEMPOTENCY_CONFLICT') {
      throw new InteractionError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was already used with a different payload.');
    }
    throw err;
  }
}

function toSafeSubmission(row: {
  observedAt: Date;
  rawPayload: Prisma.JsonValue;
}): SafePortalAssessmentSubmission | null {
  const payload = row.rawPayload as Record<string, any> | null;
  if (!payload || payload.schema !== GROW_ASSESSMENT_SCHEMA) return null;
  const packKey = typeof payload.packKey === 'string' ? payload.packKey : '';
  const pack = getAssessmentPack(packKey);
  if (!pack) return null;
  const answers = Array.isArray(payload.answers)
    ? payload.answers
        .filter((a: unknown): a is Record<string, unknown> => a !== null && typeof a === 'object')
        .map((a: Record<string, unknown>) => ({
          questionKey: String(a.questionKey ?? ''),
          answer: String(a.answer ?? ''),
        }))
    : [];
  return {
    packKey: pack.packKey,
    packVersion: pack.version,
    answers,
    processId: typeof payload.processId === 'string' && payload.processId ? payload.processId : null,
    completedAt: row.observedAt.toISOString(),
  };
}

/**
 * Customer-safe, workspace-scoped readback of assessment submissions.
 * Only THIS authorized portal workspace's submissions on the workspace's client
 * are returned; internal-workforce rows and other workspaces are excluded.
 * Returns newest-first; no internal ids, no raw payload.
 */
export async function listPortalGrowAssessments(
  identityId: string,
  workspaceId: string,
  db: Db = defaultPrisma,
): Promise<{ items: SafePortalAssessmentSubmission[] }> {
  const ctx = await resolveAuthorizedOrgContext(identityId, workspaceId, db);

  const connection = await db.externalSourceConnection.findFirst({
    where: { clientId: ctx.clientId, sourceType: SURVEY_SOURCE_TYPE },
  });
  if (!connection) return { items: [] };

  const rows = await db.observation.findMany({
    where: {
      clientId: ctx.clientId,
      connectionId: connection.id,
      observationType: 'DECLARED_SURVEY',
      AND: [
        { rawPayload: { path: ['schema'], equals: GROW_ASSESSMENT_SCHEMA } },
        { rawPayload: { path: ['provenance', 'channel'], equals: 'CLIENT_PORTAL' } },
        { rawPayload: { path: ['provenance', 'workspaceId'], equals: ctx.workspaceId } },
      ],
    },
    orderBy: { observedAt: 'desc' },
    take: 50,
    select: { observedAt: true, rawPayload: true },
  });

  const items: SafePortalAssessmentSubmission[] = [];
  for (const row of rows) {
    const safe = toSafeSubmission(row as { observedAt: Date; rawPayload: Prisma.JsonValue });
    if (safe) items.push(safe);
  }
  return { items };
}
