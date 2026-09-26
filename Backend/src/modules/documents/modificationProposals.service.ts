/**
 * Document Modification Proposals (DOCUMENT-WORKSPACE-PHASE-2 backend foundation).
 *
 * A proposal is a version-scoped TEXT_RANGE-only decision item. It is NOT a
 * DocumentAnnotation, NOT a comparison segment, NOT a ReviewPoint and NOT a
 * formal DocumentReview approval.
 *
 * Concurrency contract: every lifecycle operation (CREATE / ACCEPT / REJECT /
 * WITHDRAW) serializes on the SAME DocumentVersion row via `SELECT ... FOR
 * UPDATE` inside a Serializable transaction, so the completion projection
 * (`proposalDecisionComplete`) is always computed from a consistent set.
 */
import {
  DocumentModificationProposal,
  DocumentModificationProposalEventType,
  DocumentModificationProposalStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { AnchorValidationError, normalizeProposalText, requireTextRange, trimToNull } from './anchorValidation';
import { resolveProposalDecisionAuthority } from './proposalAuthorization';

const MAX_TEXT_LENGTH = 4000;
const MAX_KEY_LENGTH = 120;

export class DocumentModificationProposalError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = 'DocumentModificationProposalError';
  }
}

export interface ModificationProposalActor {
  id: string;
  role: string | null | undefined;
}

export interface CreateModificationProposalInput {
  selectedText?: unknown;
  startOffset?: unknown;
  endOffset?: unknown;
  textPrefix?: unknown;
  textSuffix?: unknown;
  contentFingerprint?: unknown;
  proposedText?: unknown;
  rationale?: unknown;
  idempotencyKey?: unknown;
}

export interface ProposalCompletionCounts {
  activeTotal: number;
  activePending: number;
  activeAccepted: number;
  activeRejected: number;
  proposalDecisionComplete: boolean;
}

type ProposalUser = { id: string; name: string | null; email?: string };

type ProposalRow = DocumentModificationProposal & {
  createdBy?: ProposalUser | null;
  decidedBy?: ProposalUser | null;
};

function isSerializationConflict(error: unknown): boolean {
  const metaCode = error instanceof Prisma.PrismaClientKnownRequestError
    ? String((error.meta as { code?: unknown } | undefined)?.code || '')
    : '';
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2034' || error.code === 'P2028' || error.code === 'P2010' || metaCode === '40001')
  );
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Smallest local serializable-retry helper, consistent with the repository's
 * existing bounded pattern (attempt 0..2, retry P2034 only).
 */
async function withSerializableRetry<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (attempt < 2 && isSerializationConflict(error)) continue;
      throw error;
    }
  }
  throw new DocumentModificationProposalError(
    'PROPOSAL_CONCURRENT_UPDATE',
    'The proposal set changed concurrently. Reload and retry.',
    409
  );
}

function mapUser(user?: ProposalUser | null) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email ?? null };
}

function mapProposal(row: ProposalRow) {
  return {
    id: row.id,
    documentId: row.documentId,
    documentVersionId: row.documentVersionId,
    selectedText: row.selectedText,
    normalizedSelectedText: row.normalizedSelectedText,
    startOffset: row.startOffset,
    endOffset: row.endOffset,
    textPrefix: row.textPrefix,
    textSuffix: row.textSuffix,
    contentFingerprint: row.contentFingerprint,
    proposedText: row.proposedText,
    rationale: row.rationale,
    status: row.status,
    decisionReason: row.decisionReason,
    decidedBy: mapUser(row.decidedBy),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdBy: mapUser(row.createdBy),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

const includeUsers = {
  createdBy: { select: { id: true, name: true, email: true } },
  decidedBy: { select: { id: true, name: true, email: true } },
} as const;

interface LockedVersion {
  id: string;
  version: number;
  correctionNotifiedAt: Date | null;
  document: {
    id: string;
    caseId: string;
    responsibleId: string | null;
    reviewerId: string | null;
    title: string | null;
    name: string;
    fileName: string | null;
    case: { assignedLawyerId: string | null; createdById: string } | null;
  };
}

async function lockVersion(
  tx: Prisma.TransactionClient,
  documentId: string,
  versionId: string
): Promise<LockedVersion> {
  await tx.$queryRaw`SELECT "id" FROM "document_versions" WHERE "id" = ${versionId} FOR UPDATE`;
  const version = await tx.documentVersion.findFirst({
    where: { id: versionId, documentId },
    select: {
      id: true,
      version: true,
      correctionNotifiedAt: true,
      document: {
        select: {
          id: true,
          caseId: true,
          responsibleId: true,
          reviewerId: true,
          title: true,
          name: true,
          fileName: true,
          case: { select: { assignedLawyerId: true, createdById: true } },
        },
      },
    },
  });
  if (!version) {
    throw new DocumentModificationProposalError(
      'DOCUMENT_VERSION_NOT_FOUND',
      'Document version not found.',
      404
    );
  }
  return version as LockedVersion;
}

function assertDecisionAuthority(version: LockedVersion, actor: ModificationProposalActor): void {
  const result = resolveProposalDecisionAuthority({
    actorId: actor.id,
    actorRole: actor.role,
    documentReviewerId: version.document.reviewerId,
    caseAssignedLawyerId: version.document.case?.assignedLawyerId ?? null,
    caseCreatedById: version.document.case?.createdById ?? null,
  });
  if (!result.allowed) {
    throw new DocumentModificationProposalError(
      'PROPOSAL_DECISION_FORBIDDEN',
      'You are not authorized to decide this modification proposal.',
      403
    );
  }
}

async function loadProposal(
  tx: Prisma.TransactionClient,
  documentId: string,
  versionId: string,
  proposalId: string
): Promise<ProposalRow | null> {
  return tx.documentModificationProposal.findFirst({
    where: { id: proposalId, documentId, documentVersionId: versionId },
    include: includeUsers,
  }) as Promise<ProposalRow | null>;
}

async function countActiveProposals(
  tx: Prisma.TransactionClient,
  versionId: string
): Promise<ProposalCompletionCounts> {
  const rows = await tx.documentModificationProposal.findMany({
    where: { documentVersionId: versionId, deletedAt: null },
    select: { status: true },
  });
  const activeTotal = rows.length;
  const activePending = rows.filter((r) => r.status === DocumentModificationProposalStatus.PENDING).length;
  const activeAccepted = rows.filter((r) => r.status === DocumentModificationProposalStatus.ACCEPTED).length;
  const activeRejected = rows.filter((r) => r.status === DocumentModificationProposalStatus.REJECTED).length;
  return {
    activeTotal,
    activePending,
    activeAccepted,
    activeRejected,
    proposalDecisionComplete: activeTotal > 0 && activePending === 0,
  };
}

/**
 * Emits the correction-ready handoff: one CUSTOM timeline event always, and a
 * SYSTEM notification ONLY to document.responsibleId (never reviewerId).
 * Runs in the caller's serialized transaction.
 */
async function emitCorrectionReadyHandoff(
  tx: Prisma.TransactionClient,
  version: LockedVersion,
  actorId: string,
  counts: ProposalCompletionCounts
): Promise<void> {
  const document = version.document;
  const documentTitle = document.title || document.fileName || document.name || 'dokumentum';
  const responsibleId = document.responsibleId ?? null;

  await tx.timelineEvent.create({
    data: {
      caseId: document.caseId,
      documentId: document.id,
      userId: actorId,
      eventType: 'CUSTOM',
      type: 'DOCUMENT_READY_FOR_CORRECTION',
      metadata: {
        documentId: document.id,
        documentVersionId: version.id,
        acceptedProposalCount: counts.activeAccepted,
        rejectedProposalCount: counts.activeRejected,
        responsibleId,
        internalOnly: true,
      },
    },
  });

  if (responsibleId) {
    await tx.notification.create({
      data: {
        userId: responsibleId,
        type: 'SYSTEM',
        title: 'Dokumentum kész a javításra',
        message: `A(z) „${documentTitle}” dokumentum ${version.version}. verzióján minden módosítási javaslat elbírálásra került (${counts.activeAccepted} elfogadva, ${counts.activeRejected} elutasítva). A javítás elvégezhető.`,
        link: `/cases/${document.caseId}/documents?documentId=${document.id}&versionId=${version.id}`,
      },
    });
  }
}

/**
 * Recomputes completion for the exact version and, when the CURRENT cycle is
 * complete and has not yet notified, marks the version and emits the handoff.
 */
async function evaluateCompletionCycle(
  tx: Prisma.TransactionClient,
  version: LockedVersion,
  actorId: string
): Promise<ProposalCompletionCounts> {
  const counts = await countActiveProposals(tx, version.id);
  if (counts.proposalDecisionComplete && version.correctionNotifiedAt === null) {
    await tx.documentVersion.update({
      where: { id: version.id },
      data: { correctionNotifiedAt: new Date() },
    });
    await emitCorrectionReadyHandoff(tx, version, actorId, counts);
  }
  return counts;
}

export async function createModificationProposal(
  documentId: string,
  versionId: string,
  actorId: string,
  input: CreateModificationProposalInput
) {
  const idempotencyKey = trimToNull(input.idempotencyKey, MAX_KEY_LENGTH, 'idempotencyKey');

  return withSerializableRetry(async (tx) => {
    const version = await lockVersion(tx, documentId, versionId);

    if (idempotencyKey) {
      const existing = await tx.documentModificationProposal.findFirst({
        where: { documentVersionId: versionId, idempotencyKey },
        include: includeUsers,
      });
      if (existing) {
        if (existing.deletedAt) {
          throw new DocumentModificationProposalError(
            'PROPOSAL_IDEMPOTENCY_CONFLICT',
            'This idempotency key belongs to a withdrawn proposal.',
            409
          );
        }
        return mapProposal(existing as ProposalRow);
      }
    }

    let range;
    try {
      range = requireTextRange(input);
    } catch (error) {
      if (error instanceof AnchorValidationError) {
        throw new DocumentModificationProposalError(error.code, error.message, error.status);
      }
      throw error;
    }

    const proposedText = trimToNull(input.proposedText, MAX_TEXT_LENGTH, 'proposedText');
    if (!proposedText) {
      throw new DocumentModificationProposalError('PROPOSED_TEXT_REQUIRED', 'proposedText is required.');
    }
    if (normalizeProposalText(range.selectedText) === normalizeProposalText(proposedText)) {
      throw new DocumentModificationProposalError(
        'PROPOSED_TEXT_UNCHANGED',
        'The proposed text does not change the selected text.',
        400
      );
    }

    let created: ProposalRow;
    try {
      created = (await tx.documentModificationProposal.create({
        data: {
          documentId,
          documentVersionId: versionId,
          selectedText: range.selectedText,
          normalizedSelectedText: normalizeProposalText(range.selectedText),
          startOffset: range.startOffset,
          endOffset: range.endOffset,
          textPrefix: range.textPrefix,
          textSuffix: range.textSuffix,
          contentFingerprint: range.contentFingerprint,
          proposedText,
          rationale: trimToNull(input.rationale, MAX_TEXT_LENGTH, 'rationale'),
          createdById: actorId,
          idempotencyKey,
        },
        include: includeUsers,
      })) as ProposalRow;
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new DocumentModificationProposalError(
          'PROPOSAL_IDEMPOTENCY_CONFLICT',
          'A proposal with this idempotency key already exists.',
          409
        );
      }
      throw error;
    }

    await tx.documentModificationProposalEvent.create({
      data: {
        proposalId: created.id,
        eventType: DocumentModificationProposalEventType.PROPOSAL_CREATED,
        actorId,
      },
    });

    // A genuinely new PENDING proposal reopens the completion cycle for this
    // immutable version. Idempotent retries return above and never reach here.
    if (version.correctionNotifiedAt !== null) {
      await tx.documentVersion.update({
        where: { id: versionId },
        data: { correctionNotifiedAt: null },
      });
    }

    return mapProposal(created);
  });
}

export async function acceptModificationProposal(
  documentId: string,
  versionId: string,
  proposalId: string,
  actor: ModificationProposalActor
) {
  return withSerializableRetry(async (tx) => {
    const version = await lockVersion(tx, documentId, versionId);
    assertDecisionAuthority(version, actor);

    const proposal = await loadProposal(tx, documentId, versionId, proposalId);
    if (!proposal || proposal.deletedAt) {
      throw new DocumentModificationProposalError(
        'DOCUMENT_MODIFICATION_PROPOSAL_NOT_FOUND',
        'Modification proposal not found.',
        404
      );
    }
    if (proposal.status === DocumentModificationProposalStatus.ACCEPTED) {
      return mapProposal(proposal);
    }
    if (proposal.status === DocumentModificationProposalStatus.REJECTED) {
      throw new DocumentModificationProposalError(
        'PROPOSAL_ALREADY_DECIDED',
        'This proposal has already been rejected.',
        409
      );
    }

    const updated = (await tx.documentModificationProposal.update({
      where: { id: proposalId },
      data: {
        status: DocumentModificationProposalStatus.ACCEPTED,
        decidedById: actor.id,
        decidedAt: new Date(),
      },
      include: includeUsers,
    })) as ProposalRow;

    await tx.documentModificationProposalEvent.create({
      data: {
        proposalId,
        eventType: DocumentModificationProposalEventType.PROPOSAL_ACCEPTED,
        actorId: actor.id,
      },
    });

    await evaluateCompletionCycle(tx, version, actor.id);
    return mapProposal(updated);
  });
}

export async function rejectModificationProposal(
  documentId: string,
  versionId: string,
  proposalId: string,
  actor: ModificationProposalActor,
  reason: unknown
) {
  const decisionReason = trimToNull(reason, MAX_TEXT_LENGTH, 'reason');
  if (!decisionReason) {
    throw new DocumentModificationProposalError(
      'REJECTION_REASON_REQUIRED',
      'A rejection reason is required.',
      400
    );
  }

  return withSerializableRetry(async (tx) => {
    const version = await lockVersion(tx, documentId, versionId);
    assertDecisionAuthority(version, actor);

    const proposal = await loadProposal(tx, documentId, versionId, proposalId);
    if (!proposal || proposal.deletedAt) {
      throw new DocumentModificationProposalError(
        'DOCUMENT_MODIFICATION_PROPOSAL_NOT_FOUND',
        'Modification proposal not found.',
        404
      );
    }

    if (proposal.status === DocumentModificationProposalStatus.REJECTED) {
      const sameReason = normalizeProposalText(proposal.decisionReason || '') === normalizeProposalText(decisionReason);
      if (sameReason) {
        return mapProposal(proposal);
      }
      throw new DocumentModificationProposalError(
        'PROPOSAL_ALREADY_DECIDED',
        'This proposal has already been rejected with a different reason.',
        409
      );
    }
    if (proposal.status === DocumentModificationProposalStatus.ACCEPTED) {
      throw new DocumentModificationProposalError(
        'PROPOSAL_ALREADY_DECIDED',
        'This proposal has already been accepted.',
        409
      );
    }

    const updated = (await tx.documentModificationProposal.update({
      where: { id: proposalId },
      data: {
        status: DocumentModificationProposalStatus.REJECTED,
        decisionReason,
        decidedById: actor.id,
        decidedAt: new Date(),
      },
      include: includeUsers,
    })) as ProposalRow;

    await tx.documentModificationProposalEvent.create({
      data: {
        proposalId,
        eventType: DocumentModificationProposalEventType.PROPOSAL_REJECTED,
        actorId: actor.id,
      },
    });

    await evaluateCompletionCycle(tx, version, actor.id);
    return mapProposal(updated);
  });
}

export async function withdrawModificationProposal(
  documentId: string,
  versionId: string,
  proposalId: string,
  actor: ModificationProposalActor,
  options: { canManage?: boolean } = {}
) {
  return withSerializableRetry(async (tx) => {
    const version = await lockVersion(tx, documentId, versionId);

    const proposal = await loadProposal(tx, documentId, versionId, proposalId);
    if (!proposal || proposal.deletedAt) {
      throw new DocumentModificationProposalError(
        'DOCUMENT_MODIFICATION_PROPOSAL_NOT_FOUND',
        'Modification proposal not found.',
        404
      );
    }
    if (proposal.status !== DocumentModificationProposalStatus.PENDING) {
      throw new DocumentModificationProposalError(
        'PROPOSAL_ALREADY_DECIDED',
        'A decided proposal cannot be withdrawn.',
        409
      );
    }

    if (proposal.createdById !== actor.id && !options.canManage) {
      throw new DocumentModificationProposalError(
        'PROPOSAL_WITHDRAW_FORBIDDEN',
        'You are not authorized to withdraw this proposal.',
        403
      );
    }

    const updated = (await tx.documentModificationProposal.update({
      where: { id: proposalId },
      data: { deletedAt: new Date(), deletedById: actor.id },
      include: includeUsers,
    })) as ProposalRow;

    await tx.documentModificationProposalEvent.create({
      data: {
        proposalId,
        eventType: DocumentModificationProposalEventType.PROPOSAL_SOFT_DELETED,
        actorId: actor.id,
      },
    });

    await evaluateCompletionCycle(tx, version, actor.id);
    return mapProposal(updated);
  });
}

export { mapProposal as mapModificationProposal };
