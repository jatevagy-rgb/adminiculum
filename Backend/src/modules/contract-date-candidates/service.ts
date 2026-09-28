/**
 * CONTRACT DATE EXTRACTION — candidate lifecycle service.
 *
 * HARD INVARIANT: extraction NEVER writes canonical ContractRecord dates,
 * obligation occurrences or entitlements. Extraction only creates PENDING
 * candidates bound to one immutable DocumentVersion. Only confirmCandidate
 * writes canonical data, and it does so exclusively through the existing
 * canonical contract service (updateContract / createObligationOccurrence)
 * after lawyer confirmation and staleness/authorization validation.
 */
import type { Request } from 'express';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import {
  InteractionError,
  InternalActor,
  assertClientReadAccess,
} from '../client-interaction/base';
import { userCanManageCase, userCanReadCase } from '../cases/authorization';
import {
  resolveVersionText,
  type VersionMeta,
} from '../documents/comparison/versionText';
import documentsService from '../documents/services';
import {
  createObligationOccurrence,
  updateContract,
} from '../client-contracts/service';
import {
  extractContractDateCandidates,
  normalizeExcerptText,
} from './extractor';
import {
  CONTRACT_DATE_TYPE_LABELS,
  CONTRACT_FIELD_BY_TYPE,
  CONTRACT_LEVEL_TYPES,
  OCCURRENCE_TYPE_BY_DATE_TYPE,
  isCandidateProvenance,
  isContractDateType,
  type ContractDateType,
} from './registry';

type PrismaLike = typeof defaultPrisma;

export interface CandidateDeps {
  prisma?: PrismaLike;
  downloadVersion?: (documentId: string, versionId: string) => Promise<Buffer | null>;
}

const MANAGER_ROLES = new Set(['ADMIN', 'PARTNER']);

function requireManager(actor: InternalActor): void {
  if (!actor?.userId || !MANAGER_ROLES.has(String(actor.role || ''))) {
    throw new InteractionError(403, 'CONTRACT_MANAGE_FORBIDDEN', 'Only client managers may confirm contract date candidates.');
  }
}

function asRequest(actor: InternalActor): Request {
  return { user: actor } as unknown as Request;
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function toCandidateDTO(row: any): any {
  return {
    id: row.id,
    documentId: row.documentId,
    documentVersionId: row.documentVersionId,
    dateType: row.dateType,
    proposedDate: iso(row.proposedDate),
    sourceExcerpt: row.sourceExcerpt,
    excerptStartOffset: row.excerptStartOffset ?? null,
    excerptEndOffset: row.excerptEndOffset ?? null,
    excerptHash: row.excerptHash ?? null,
    provenance: row.provenance,
    aiPromptDraftId: row.aiPromptDraftId ?? null,
    status: row.status,
    targetContractId: row.targetContractId ?? null,
    targetOccurrenceId: row.targetOccurrenceId ?? null,
    decisionReason: row.decisionReason ?? null,
    decidedById: row.decidedById ?? null,
    decidedAt: iso(row.decidedAt),
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function resolveDeps(deps: CandidateDeps = {}) {
  return {
    prisma: deps.prisma ?? defaultPrisma,
    downloadVersion:
      deps.downloadVersion ??
      (async (documentId: string, versionId: string): Promise<Buffer | null> => {
        const result = await documentsService.downloadDocumentVersion(documentId, versionId);
        if (!result || 'error' in result) return null;
        return result.content;
      }),
  };
}

async function requireCaseAccess(actor: InternalActor, caseId: string, level: 'read' | 'manage'): Promise<void> {
  const access = level === 'read'
    ? await userCanReadCase(asRequest(actor), caseId)
    : await userCanManageCase(asRequest(actor), caseId);
  if (access === null) throw new InteractionError(404, 'CASE_NOT_FOUND', 'Case not found.');
  if (!access) throw new InteractionError(403, 'CASE_ACCESS_FORBIDDEN', 'You do not have access to this case.');
}

/** Resolve the exact-version text via the canonical version-content pipeline. */
async function resolveCandidateVersionText(
  version: { id: string; documentId: string; mimeType: string | null; originalFileName: string | null; size: number | null },
  deps: { downloadVersion: (documentId: string, versionId: string) => Promise<Buffer | null> },
): Promise<{ supported: boolean; text: string | null; reasonCode: string | null }> {
  const meta: VersionMeta = {
    id: version.id,
    documentId: version.documentId,
    mimeType: version.mimeType,
    originalFileName: version.originalFileName,
    size: version.size,
  };
  const result = await resolveVersionText(meta, deps.downloadVersion);
  return { supported: result.supported, text: result.text, reasonCode: result.reasonCode };
}

/* -------------------------------------------------------------------------- */
/* Listing                                                                    */
/* -------------------------------------------------------------------------- */

export async function listCandidatesForDocument(
  actor: InternalActor,
  documentId: string,
  opts: { status?: string } = {},
  deps: CandidateDeps = {},
) {
  const { prisma } = resolveDeps(deps);
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, caseId: true },
  });
  if (!document) throw new InteractionError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
  await requireCaseAccess(actor, document.caseId, 'read');
  const rows = await prisma.contractDateCandidate.findMany({
    where: { documentId, ...(opts.status ? { status: opts.status as any } : {}) },
    orderBy: [{ createdAt: 'asc' }],
  });
  return { items: rows.map(toCandidateDTO) };
}

/* -------------------------------------------------------------------------- */
/* Extraction                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Scan ONE exact immutable DocumentVersion for keyword-supported contract
 * dates. Output is PENDING candidates only — nothing canonical is touched.
 * Deterministic dedupe: a candidate identical in (version, type, date,
 * excerpt-hash) is never created twice, so a REJECTED candidate does not
 * reappear unless the version text or extraction output actually changes.
 */
export async function extractCandidatesForVersion(
  actor: InternalActor,
  input: { documentVersionId: string },
  deps: CandidateDeps = {},
) {
  if (!actor?.userId) throw new InteractionError(401, 'AUTH_REQUIRED', 'Authentication required.');
  const { prisma, downloadVersion } = resolveDeps(deps);
  const documentVersionId = String(input.documentVersionId || '').trim();
  if (!documentVersionId) throw new InteractionError(400, 'DOCUMENT_VERSION_ID_REQUIRED', 'documentVersionId is required.');

  const version = await prisma.documentVersion.findUnique({
    where: { id: documentVersionId },
    select: {
      id: true,
      documentId: true,
      mimeType: true,
      originalFileName: true,
      size: true,
      document: { select: { id: true, caseId: true } },
    },
  });
  if (!version) throw new InteractionError(404, 'DOCUMENT_VERSION_NOT_FOUND', 'Document version not found.');
  await requireCaseAccess(actor, version.document.caseId, 'manage');

  const textResult = await resolveCandidateVersionText(
    { id: version.id, documentId: version.documentId, mimeType: version.mimeType, originalFileName: version.originalFileName, size: version.size },
    { downloadVersion },
  );
  if (!textResult.supported || !textResult.text) {
    throw new InteractionError(400, 'CANDIDATE_SOURCE_TEXT_UNAVAILABLE', 'A verzió szövege nem nyerhető ki, ezért dátumjelölt nem hozható létre.');
  }

  const detected = extractContractDateCandidates(textResult.text);
  const createdRows: any[] = [];
  let skippedExisting = 0;

  for (const fact of detected) {
    const existing = await prisma.contractDateCandidate.findUnique({
      where: {
        documentVersionId_dateType_proposedDate_excerptHash: {
          documentVersionId: version.id,
          dateType: fact.dateType,
          proposedDate: fact.proposedDate,
          excerptHash: fact.excerptHash,
        },
      },
      select: { id: true },
    });
    if (existing) {
      // Any status (PENDING/CONFIRMED/REJECTED) suppresses recreation.
      skippedExisting += 1;
      continue;
    }
    try {
      const row = await prisma.contractDateCandidate.create({
        data: {
          documentId: version.documentId,
          documentVersionId: version.id,
          dateType: fact.dateType,
          proposedDate: fact.proposedDate,
          sourceExcerpt: fact.sourceExcerpt,
          excerptStartOffset: fact.excerptStartOffset,
          excerptEndOffset: fact.excerptEndOffset,
          excerptHash: fact.excerptHash,
          provenance: 'RULE_BASED_EXTRACTION',
          status: 'PENDING',
          createdById: actor.userId,
        },
      });
      createdRows.push(row);
    } catch (error) {
      // Unique-violation race: another extraction created the same identity.
      if ((error as { code?: string } | null)?.code === 'P2002') {
        skippedExisting += 1;
        continue;
      }
      throw error;
    }
  }

  return {
    items: createdRows.map(toCandidateDTO),
    detectedCount: detected.length,
    createdCount: createdRows.length,
    skippedExisting,
  };
}

/* -------------------------------------------------------------------------- */
/* Confirmation                                                               */
/* -------------------------------------------------------------------------- */

export interface ConfirmCandidateInput {
  targetContractId: string;
  obligationId?: string | null;
}

/**
 * Lawyer confirmation. Validates: candidate still PENDING, the exact source
 * version is still identifiable AND still contains the supporting excerpt
 * (stale candidates fail closed), the target contract belongs to the same
 * client as the candidate's document, and the caller holds canonical contract
 * mutation permission. Then writes through the EXISTING canonical
 * updateContract / createObligationOccurrence services — no contract write
 * logic is duplicated here.
 */
export async function confirmCandidate(
  actor: InternalActor,
  candidateId: string,
  input: ConfirmCandidateInput,
  deps: CandidateDeps = {},
) {
  requireManager(actor);
  const { prisma, downloadVersion } = resolveDeps(deps);
  const candidate = await prisma.contractDateCandidate.findUnique({
    where: { id: candidateId },
    include: {
      document: { select: { id: true, clientId: true, caseId: true } },
      documentVersion: { select: { id: true, mimeType: true, originalFileName: true, size: true } },
    },
  });
  if (!candidate) throw new InteractionError(404, 'CANDIDATE_NOT_FOUND', 'Date candidate not found.');
  if (candidate.status !== 'PENDING') {
    throw new InteractionError(409, 'CANDIDATE_NOT_PENDING', 'Only pending candidates can be confirmed.');
  }
  await assertClientReadAccess(actor, candidate.document.clientId, prisma);

  // --- Staleness guard: the exact source version must still exist... ---
  if (!candidate.documentVersion) {
    throw new InteractionError(409, 'STALE_CANDIDATE_VERSION_MISSING', 'A jelölt forrásverziója már nem azonosítható.');
  }
  // --- ...and its current text must still contain the supporting excerpt. ---
  const textResult = await resolveCandidateVersionText(
    {
      id: candidate.documentVersion.id,
      documentId: candidate.documentId,
      mimeType: candidate.documentVersion.mimeType,
      originalFileName: candidate.documentVersion.originalFileName,
      size: candidate.documentVersion.size,
    },
    { downloadVersion },
  );
  if (!textResult.supported || !textResult.text) {
    throw new InteractionError(409, 'STALE_CANDIDATE_SOURCE_UNAVAILABLE', 'A jelölt forrásverziójának szövege már nem érhető el, ezért a megerősítés meghiúsult.');
  }
  const normalizedText = normalizeExcerptText(textResult.text);
  const normalizedExcerpt = normalizeExcerptText(candidate.sourceExcerpt);
  if (!normalizedExcerpt || !normalizedText.includes(normalizedExcerpt)) {
    throw new InteractionError(409, 'STALE_CANDIDATE_EXCERPT_MISSING', 'A jelölt alátámasztó szövegrészlet már nem található a forrásverzióban.');
  }

  // --- Cross-contract/cross-case guard: the target contract must belong to
  // --- the same client as the candidate's source document.
  const targetContractId = String(input.targetContractId || '').trim();
  if (!targetContractId) throw new InteractionError(400, 'TARGET_CONTRACT_REQUIRED', 'targetContractId is required.');
  const targetContract = await prisma.contractRecord.findUnique({
    where: { id: targetContractId },
    select: { id: true, clientId: true },
  });
  if (!targetContract) throw new InteractionError(404, 'CONTRACT_NOT_FOUND', 'Target contract not found.');
  if (targetContract.clientId !== candidate.document.clientId) {
    throw new InteractionError(403, 'CROSS_CLIENT_CONTRACT', 'The target contract belongs to a different client than the candidate source document.');
  }

  // --- Canonical write through the EXISTING canonical contract service. ---
  const dateType = candidate.dateType as ContractDateType;
  let targetOccurrenceId: string | null = null;
  let canonicalResult: any = null;

  if (CONTRACT_LEVEL_TYPES.has(dateType)) {
    const field = CONTRACT_FIELD_BY_TYPE[dateType as 'EFFECTIVE' | 'EXPIRY' | 'NEXT_CRITICAL'];
    canonicalResult = await updateContract(actor, targetContractId, { [field]: candidate.proposedDate }, prisma);
  } else {
    const occurrenceType = OCCURRENCE_TYPE_BY_DATE_TYPE[dateType];
    if (!occurrenceType) {
      throw new InteractionError(400, 'CANDIDATE_DATE_TYPE_UNSUPPORTED', 'A jelölt dátumtípus nem erősíthető meg.');
    }
    const obligationId = String(input.obligationId || '').trim();
    if (!obligationId) throw new InteractionError(400, 'OBLIGATION_REQUIRED', 'A kötelezettség-típusú dátum megerősítéséhez kötelezettséget (obligationId) kell kiválasztani.');
    const obligation = await prisma.clientObligation.findUnique({
      where: { id: obligationId },
      select: { id: true, sourceContractId: true, clientId: true },
    });
    if (!obligation) throw new InteractionError(404, 'OBLIGATION_NOT_FOUND', 'Obligation not found.');
    if (obligation.sourceContractId !== targetContractId) {
      throw new InteractionError(400, 'OBLIGATION_CONTRACT_MISMATCH', 'The selected obligation does not belong to the target contract.');
    }
    const created = await createObligationOccurrence(actor, obligationId, {
      occurrenceType,
      // Idempotent key derived from the candidate id: a repeated confirm
      // replays the same occurrence instead of duplicating canonical data.
      occurrenceKey: `contract-date-candidate:${candidate.id}`,
      title: `${CONTRACT_DATE_TYPE_LABELS[dateType]}`,
      dueDate: candidate.proposedDate.toISOString(),
      sourceReference: candidate.sourceExcerpt.slice(0, 240),
      evidenceDocumentVersionId: candidate.documentVersionId,
    }, prisma);
    targetOccurrenceId = created.occurrence.id;
    canonicalResult = created.occurrence;
  }

  // Atomic status flip: a raced second confirm loses and reports the conflict.
  const flipped = await prisma.contractDateCandidate.updateMany({
    where: { id: candidateId, status: 'PENDING' },
    data: {
      status: 'CONFIRMED',
      targetContractId,
      targetOccurrenceId,
      decidedById: actor.userId,
      decidedAt: new Date(),
    },
  });
  if (flipped.count === 0) {
    throw new InteractionError(409, 'CANDIDATE_NOT_PENDING', 'Only pending candidates can be confirmed.');
  }

  const updated = await prisma.contractDateCandidate.findUnique({ where: { id: candidateId } });
  return { candidate: toCandidateDTO(updated), canonical: canonicalResult };
}

/* -------------------------------------------------------------------------- */
/* Rejection                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Records a REJECTED decision. Writes NOTHING canonical. A rejected candidate
 * stays terminal for its (version, type, date, excerpt) identity, so it cannot
 * reappear unless the source version or the extraction output changes.
 */
export async function rejectCandidate(
  actor: InternalActor,
  candidateId: string,
  reason?: string | null,
  deps: CandidateDeps = {},
) {
  const { prisma } = resolveDeps(deps);
  const candidate = await prisma.contractDateCandidate.findUnique({
    where: { id: candidateId },
    select: { id: true, document: { select: { caseId: true } } },
  });
  if (!candidate) throw new InteractionError(404, 'CANDIDATE_NOT_FOUND', 'Date candidate not found.');
  await requireCaseAccess(actor, candidate.document.caseId, 'manage');

  const flipped = await prisma.contractDateCandidate.updateMany({
    where: { id: candidateId, status: 'PENDING' },
    data: {
      status: 'REJECTED',
      decisionReason: reason ? String(reason).slice(0, 2000) : null,
      decidedById: actor.userId,
      decidedAt: new Date(),
    },
  });
  if (flipped.count === 0) {
    throw new InteractionError(409, 'CANDIDATE_NOT_PENDING', 'Only pending candidates can be rejected.');
  }
  const updated = await prisma.contractDateCandidate.findUnique({ where: { id: candidateId } });
  return toCandidateDTO(updated);
}

/** Registry/type re-exports so routes and tests consume one module surface. */
export const candidateValidators = {
  isContractDateType,
  isCandidateProvenance,
};
