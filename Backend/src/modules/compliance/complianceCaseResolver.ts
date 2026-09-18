/**
 * COMPLIANCE DOCUMENT CASE RESOLVER — canonical compliance Case identity.
 *
 * Compliance documents must live on a REAL canonical Case (no client-scoped
 * document container, no pseudo-case). This resolver answers exactly one
 * question: which canonical compliance Case should a compliance document attach
 * to?
 *
 * Resolution uses CANONICAL FACTS ONLY — never a fuzzy title match:
 *   - same client
 *   - the Case Type resolved by `resolveComplianceCaseType` (active compliance
 *     Case TypeDefinition + active WorkPackageTemplate); when no such type is
 *     usable the resolver degrades to the canonical `matterType` fact
 *   - a non-terminal Case status
 *
 * 0 eligible cases  → create one through the canonical `casesService.createCase`
 * 1 eligible case   → require canonical internal Case access, then reuse it
 * >1 eligible cases → 409 COMPLIANCE_CASE_AMBIGUOUS with NO side effect
 *
 * AUTHORIZATION: client read access does NOT imply Case access. Before reusing an
 * eligible Case the actor must pass the canonical `assertInternalCaseAccess`
 * guard, otherwise the resolution fails boundedly — it never creates a second
 * compliance Case to work around an inaccessible one.
 *
 * CONCURRENCY: the resolve-or-create step runs in a SERIALIZABLE transaction and
 * is retried at most MAX_RETRIES times. Only serialization failures (P2034 /
 * SQLSTATE 40001) and a proven `Case.caseNumber` unique collision (P2002 on
 * caseNumber) are retried; every unrelated P2002 propagates untouched. Each
 * retry RE-QUERIES eligible cases before attempting another create, so a Case
 * created by a concurrent request is reused instead of duplicated.
 *
 * SIDE-EFFECT BOUNDARY: this module performs NO external effect (no SharePoint
 * upload, no document storage, no publication). Callers must resolve a stable
 * caseId here first and upload exactly once afterwards.
 */
import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import {
  InternalActor,
  InteractionError,
  assertClientReadAccess,
  assertInternalCaseAccess,
  internalCaseScope,
} from '../client-interaction/base';
import casesService from '../cases/services';
import { resolveComplianceCaseType } from './complianceCaseTypeResolver';

type PrismaLike = typeof defaultPrisma;

export const COMPLIANCE_CASE_MAX_RETRIES = 3;

/** Canonical compliance proposal kind used for generic compliance work. */
const COMPLIANCE_DOCUMENT_KIND = 'DOCUMENT_UPDATE';

/**
 * Canonical closed/non-reusable Case statuses. This is the SAME set the rest of
 * the repository uses for closed cases (cases/attention.service.ts and
 * cases/dashboardOperational.ts) — a CANCELLED or ARCHIVED compliance case must
 * never be reused for a new upload.
 */
export const TERMINAL_CASE_STATUSES = ['FINAL', 'CANCELLED', 'ARCHIVED'] as const;

/**
 * Serialization failure: Prisma P2034 or the underlying PostgreSQL SQLSTATE 40001.
 * Mirrors the canonical predicate used by compliance proposal confirmation.
 */
export function isCaseResolutionSerializationFailure(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2034' || String((error.meta as { code?: unknown } | undefined)?.code || '') === '40001';
  }
  const candidate = error as { code?: unknown; message?: unknown } | null;
  return String(candidate?.code || '') === '40001' || String(candidate?.message || '').includes('could not serialize access');
}

/** P2002 is retryable ONLY when the unique violation is provably on Case.caseNumber. */
export function isCaseNumberUniqueCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  const serialized = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return serialized.includes('caseNumber');
}

export interface ComplianceCaseOption {
  id: string;
  caseNumber: string;
  title: string;
  status: string;
}

interface ComplianceCaseResolution {
  caseId: string;
  caseCreated: boolean;
  caseReused: boolean;
}

/**
 * The SINGLE canonical eligibility scope, shared by automatic resolution, the
 * safe option list and explicit-case validation, so the three can never drift.
 */
function complianceCaseScope(recommended: { caseTypeDefinitionId: string | null; matterType: string }) {
  return recommended.caseTypeDefinitionId
    ? { caseTypeDefinitionId: recommended.caseTypeDefinitionId }
    : { matterType: recommended.matterType as never };
}

/**
 * Eligible = same client + canonical compliance scope + non-terminal status.
 * Caller-agnostic: access filtering happens separately (see listComplianceCaseOptions).
 */
export async function findEligibleComplianceCases(
  tx: Prisma.TransactionClient,
  clientId: string,
  recommended: { caseTypeDefinitionId: string | null; matterType: string },
): Promise<Array<{ id: string; caseNumber: string; title: string; status: string }>> {
  return tx.case.findMany({
    where: {
      clientId,
      status: { notIn: TERMINAL_CASE_STATUSES as never },
      ...complianceCaseScope(recommended),
    },
    select: { id: true, caseNumber: true, title: true, status: true },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Safe read model for the exceptional ambiguity chooser. Global ambiguity is
 * unchanged; this list exposes ONLY cases the actor may actually access, and
 * only the four safe fields (no work package, tasks, notes or metadata).
 */
export async function listComplianceCaseOptions(
  actor: InternalActor,
  clientId: string,
  db: PrismaLike = defaultPrisma,
): Promise<ComplianceCaseOption[]> {
  await assertClientReadAccess(actor, clientId, db);

  const rows = await db.$transaction(
    async (tx) => {
      const recommended = await resolveComplianceCaseType(tx, COMPLIANCE_DOCUMENT_KIND as never);
      return findEligibleComplianceCases(tx, clientId, recommended);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  // ADMIN/PARTNER receive every eligible case; lawyers only what they may access.
  const scope = await internalCaseScope(actor, db);
  if (scope === null) return rows;

  const allowed = new Set(scope);
  return rows.filter((row) => allowed.has(row.id));
}

/**
 * Explicit-case path for the exceptional ambiguity retry. Validates the
 * user-selected Case BEFORE any external effect and NEVER creates or auto-resolves
 * another Case. Never trust a frontend caseId.
 */
export async function resolveExplicitComplianceCase(
  actor: InternalActor,
  clientId: string,
  caseId: string,
  db: PrismaLike = defaultPrisma,
): Promise<{ caseId: string }> {
  await assertClientReadAccess(actor, clientId, db);
  const requested = String(caseId || '').trim();
  if (!requested) {
    throw new InteractionError(400, 'COMPLIANCE_UPLOAD_CASE_REQUIRED', 'A compliance case must be selected.');
  }

  return db.$transaction(
    async (tx) => {
      // 1 + 2 + 3 + 5: existence, canonical internal Case access, client binding, status.
      await assertInternalCaseAccess(actor, requested, tx as never);
      const row = await tx.case.findUnique({
        where: { id: requested },
        select: { id: true, clientId: true, status: true, matterType: true, caseTypeDefinitionId: true },
      });
      if (!row) {
        throw new InteractionError(404, 'COMPLIANCE_UPLOAD_CASE_NOT_FOUND', 'Case not found.');
      }
      if (row.clientId !== clientId) {
        throw new InteractionError(400, 'COMPLIANCE_UPLOAD_CASE_CLIENT_MISMATCH', 'The selected case belongs to another client.');
      }
      if ((TERMINAL_CASE_STATUSES as readonly string[]).includes(String(row.status))) {
        throw new InteractionError(409, 'COMPLIANCE_UPLOAD_CASE_NOT_REUSABLE', 'The selected case is closed and cannot receive new documents.');
      }

      // 4: the case must still match the canonical compliance eligibility scope.
      const recommended = await resolveComplianceCaseType(tx, COMPLIANCE_DOCUMENT_KIND as never);
      const eligible = await findEligibleComplianceCases(tx, clientId, recommended);
      if (!eligible.some((candidate) => candidate.id === row.id)) {
        throw new InteractionError(409, 'COMPLIANCE_UPLOAD_CASE_NOT_ELIGIBLE', 'The selected case is not an eligible compliance case.');
      }
      return { caseId: row.id };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/**
 * Resolve an existing eligible compliance Case or create one canonical Case.
 * The caller then performs exactly ONE external upload with the returned id.
 */
export async function resolveOrCreateComplianceCase(
  actor: InternalActor,
  clientId: string,
  db: PrismaLike = defaultPrisma,
): Promise<ComplianceCaseResolution> {
  await assertClientReadAccess(actor, clientId, db);
  if (!actor?.userId) {
    throw new InteractionError(403, 'INTERACTION_NOT_AUTHORIZED', 'Actor is not authorized for client-portal administration.');
  }

  for (let attempt = 1; attempt <= COMPLIANCE_CASE_MAX_RETRIES; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const recommended = await resolveComplianceCaseType(tx, COMPLIANCE_DOCUMENT_KIND as never);
          const eligible = await findEligibleComplianceCases(tx, clientId, recommended);
          if (eligible.length > 1) {
            throw new InteractionError(
              409,
              'COMPLIANCE_CASE_AMBIGUOUS',
              'More than one eligible compliance case exists for this client; choose one explicitly.',
            );
          }
          if (eligible.length === 1) {
            // Canonical Case access is REQUIRED before reuse: client read access
            // does not imply access to this Case. An inaccessible eligible case
            // fails boundedly instead of creating a duplicate compliance Case.
            await assertInternalCaseAccess(actor, eligible[0].id, tx as never);
            return { caseId: eligible[0].id, caseCreated: false, caseReused: true };
          }

          const client = await tx.client.findUnique({ where: { id: clientId }, select: { name: true } });
          if (!client) {
            throw new InteractionError(404, 'COMPLIANCE_CASE_CLIENT_NOT_FOUND', 'Client not found.');
          }
          const created = await casesService.createCase(
            {
              clientId,
              matterType: recommended.matterType,
              caseTypeDefinitionId: recommended.caseTypeDefinitionId,
              title: `Compliance – ${client.name}`.slice(0, 300),
              createdById: actor.userId,
            } as never,
            tx as never,
            { withinTransaction: true, provisionCaseFolders: false },
          );
          return { caseId: created.id, caseCreated: true, caseReused: false };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      // A caller-visible bounded conflict is never retried.
      if (error instanceof InteractionError) throw error;

      const retryable = isCaseResolutionSerializationFailure(error) || isCaseNumberUniqueCollision(error);
      // Unrelated P2002 (or any other error) must NOT be retried.
      if (!retryable) throw error;
      if (attempt < COMPLIANCE_CASE_MAX_RETRIES) continue; // next attempt RE-QUERIES eligible cases first
      throw new InteractionError(
        409,
        'COMPLIANCE_CASE_RESOLUTION_RETRY_EXHAUSTED',
        'Compliance case resolution could not be serialized; retry the upload.',
      );
    }
  }

  throw new InteractionError(
    409,
    'COMPLIANCE_CASE_RESOLUTION_RETRY_EXHAUSTED',
    'Compliance case resolution could not be serialized; retry the upload.',
  );
}
