/**
 * Version-scoped review-rail read model.
 *
 * One bounded DTO that lets a future Document Reader render reader comments and
 * modification proposals for exact immutable version. `readyForCorrection` is
 * ONLY an alias for `proposalDecisionComplete` — it does NOT mean the formal
 * DocumentReview is approved, nor that comments/ReviewPoints are resolved.
 *
 * Comments and proposals are independent collections: comment resolution never
 * affects `proposalDecisionComplete`, and proposal status never affects
 * DocumentAnnotationStatus.
 */
import { DocumentModificationProposalStatus, Prisma } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

export class DocumentReviewRailError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = 'DocumentReviewRailError';
  }
}

function parseLimit(value: unknown): number {
  if (value === undefined || value === null || value === '') return DEFAULT_LIMIT;
  const num = Number(value);
  if (!Number.isFinite(num) || Number.isNaN(num)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.floor(num), MAX_LIMIT));
}

function mapUser(user?: { id: string; name: string | null } | null) {
  if (!user) return null;
  return { id: user.id, name: user.name };
}

export async function getDocumentReviewRail(
  documentId: string,
  versionId: string,
  query: Record<string, unknown> = {}
) {
  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, documentId },
    select: { id: true, version: true },
  });
  if (!version) {
    throw new DocumentReviewRailError('DOCUMENT_VERSION_NOT_FOUND', 'Document version not found.', 404);
  }

  const limit = parseLimit(query.limit);

  const commentWhere: Prisma.DocumentAnnotationWhereInput = {
    documentId,
    documentVersionId: versionId,
    annotationType: 'REVIEW_COMMENT',
    deletedAt: null,
  };
  const proposalWhere: Prisma.DocumentModificationProposalWhereInput = {
    documentId,
    documentVersionId: versionId,
    deletedAt: null,
  };

  const [comments, proposals, commentCount, proposalStatusGroups] = await Promise.all([
    prisma.documentAnnotation.findMany({
      where: commentWhere,
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { comments: { where: { deletedAt: null } } } },
      },
      orderBy: [{ createdAt: 'asc' }],
      take: limit,
    }),
    prisma.documentModificationProposal.findMany({
      where: proposalWhere,
      include: {
        createdBy: { select: { id: true, name: true } },
        decidedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'asc' }],
      take: limit,
    }),
    prisma.documentAnnotation.count({ where: commentWhere }),
    prisma.documentModificationProposal.groupBy({
      by: ['status'],
      where: proposalWhere,
      _count: { _all: true },
    }),
  ]);

  const statusCount = (status: DocumentModificationProposalStatus): number => {
    const group = proposalStatusGroups.find((g) => g.status === status);
    return group?._count?._all ?? 0;
  };

  const pendingProposalCount = statusCount(DocumentModificationProposalStatus.PENDING);
  const acceptedProposalCount = statusCount(DocumentModificationProposalStatus.ACCEPTED);
  const rejectedProposalCount = statusCount(DocumentModificationProposalStatus.REJECTED);
  const modificationProposalCount =
    pendingProposalCount + acceptedProposalCount + rejectedProposalCount;
  const proposalDecisionComplete = modificationProposalCount > 0 && pendingProposalCount === 0;

  return {
    documentId,
    documentVersionId: versionId,
    versionNumber: version.version,
    counts: {
      commentCount,
      modificationProposalCount,
      pendingProposalCount,
      acceptedProposalCount,
      rejectedProposalCount,
      proposalDecisionComplete,
    },
    readyForCorrection: proposalDecisionComplete,
    comments: comments.map((comment) => ({
      id: comment.id,
      reviewComment: comment.reviewComment,
      selectedText: comment.selectedText,
      startOffset: comment.startOffset,
      endOffset: comment.endOffset,
      textPrefix: comment.textPrefix,
      textSuffix: comment.textSuffix,
      contentFingerprint: comment.contentFingerprint,
      createdBy: mapUser(comment.createdBy),
      createdAt: comment.createdAt.toISOString(),
      resolvedAt: comment.resolvedAt?.toISOString() ?? null,
      replyCount: comment._count?.comments ?? 0,
    })),
    proposals: proposals.map((proposal) => ({
      id: proposal.id,
      selectedText: proposal.selectedText,
      proposedText: proposal.proposedText,
      rationale: proposal.rationale,
      status: proposal.status,
      decisionReason: proposal.decisionReason,
      decidedBy: mapUser(proposal.decidedBy),
      decidedAt: proposal.decidedAt?.toISOString() ?? null,
      createdBy: mapUser(proposal.createdBy),
      createdAt: proposal.createdAt.toISOString(),
      startOffset: proposal.startOffset,
      endOffset: proposal.endOffset,
      contentFingerprint: proposal.contentFingerprint,
    })),
  };
}
