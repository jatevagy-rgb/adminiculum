/**
 * Document Review Read Model Projection Service
 *
 * Connects canonical DocumentVersion lineage, DocumentComparison + DocumentChangeSegment,
 * DocumentReview + ReviewPoint, and AiPromptDraft into a safe, coherent, bounded read-model
 * projection for the Document Workspace review rail and Case Workspace summary tiles.
 *
 * ZERO SCHEMA CHANGES - ZERO SECOND ENGINES - STRICT PRIVACY / LEAK PROTECTION
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';

export interface DocumentReviewVersionDto {
  id: string;
  version: number;
  fileName: string | null;
  mimeType: string | null;
  size: number | null;
  securityScanStatus: string;
  createdAt: string;
}

export interface DocumentReviewSummaryDto {
  documentId: string;
  caseId: string;
  documentTitle: string;
  category: string | null;
  workStatus: string | null;
  currentVersionNumber: number | null;
  currentVersionId: string | null;
  previousVersionNumber: number | null;
  previousVersionId: string | null;
  reviewId: string | null;
  reviewVersionId: string | null;
  reviewStatus: string | null;
  openPointCount: number;
  blockingPointCount: number;
  comparisonId: string | null;
  comparisonStatus: string | null;
  totalSegments: number;
  reviewedSegments: number;
  unresolvedSegments: number;
  aiPromptDraftId: string | null;
  aiDraftStatus: string | null;
  aiApproved: boolean;
  nextAction: {
    code: string;
    label: string;
    rationale: string;
  };
}

export interface DocumentReviewProjectionDto {
  documentId: string;
  caseId: string;
  documentTitle: string;
  category: string | null;
  workStatus: string | null;

  currentVersion: DocumentReviewVersionDto | null;
  previousVersion: DocumentReviewVersionDto | null;

  review: {
    reviewId: string;
    documentVersionId: string;
    reviewVersionId: string;
    status: string;
    reviewer: { id: string; name: string; email: string | null } | null;
    openPointCount: number;
    blockingPointCount: number;
    pointsLinkedToSegmentsCount: number;
    openPointsLinkedToSegmentsCount: number;
    dueAt: string | null;
    currentRoundNumber: number;
    updatedAt: string;
  } | null;

  reviewContext: {
    boundToCurrentVersion: boolean;
    hasReviewForOtherVersion: boolean;
    otherVersionReview: {
      reviewId: string;
      documentVersionId: string;
      versionNumber: number | null;
      status: string;
    } | null;
  };

  comparison: {
    comparisonId: string;
    status: string;
    baseVersionId: string;
    targetVersionId: string;
    totalSegments: number;
    reviewedSegments: number;
    unresolvedSegments: number;
    segmentStates: {
      unreviewed: number;
      accepted: number;
      rejected: number;
      needsDiscussion: number;
      notRelevant: number;
    };
    counts: {
      insertCount: number;
      deleteCount: number;
      replaceCount: number;
      formatOnlyCount: number;
      moveCandidateCount: number;
    };
    categories: Record<string, number>;
  } | null;

  ai: {
    promptDraftId: string;
    status: string;
    templateKey: string;
    templateVersion: number;
    sourceDocumentVersionIds: string[];
    approved: boolean;
    artifactAvailability: {
      hasImportedResponse: boolean;
      hasRehydratedResponse: boolean;
    };
    verifiedAt: string | null;
    approvedAt: string | null;
    updatedAt: string;
  } | null;

  nextAction: {
    code: string;
    label: string;
    rationale: string;
  };

  segments?: Array<{
    sequence: number;
    changeType: string;
    category: string;
    reviewState: string;
    baseExcerpt: string | null;
    targetExcerpt: string | null;
    internalRationale: string | null;
    revision: number;
  }>;
}

function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return new Date(d).toISOString();
}

function parseJsonArray(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.map((x) => String(x)).filter(Boolean);
  }
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

export interface ProjectionOptions {
  includeSegments?: boolean;
  segmentLimit?: number;
  prisma?: any;
}

/**
 * Derives the deterministic next action according to explicit business rules and precedence.
 * Does NOT use heuristic guessing or external AI.
 * Keeps segment-level review status strictly separate from document-level review workflow transitions.
 */
export function deriveNextAction(params: {
  currentVersion: DocumentReviewVersionDto | null;
  previousVersion: DocumentReviewVersionDto | null;
  review: DocumentReviewProjectionDto['review'];
  comparison: DocumentReviewProjectionDto['comparison'];
  ai: DocumentReviewProjectionDto['ai'];
}): { code: string; label: string; rationale: string } {
  const { currentVersion, previousVersion, review, comparison, ai } = params;

  // 1. No version uploaded
  if (!currentVersion) {
    return {
      code: 'UPLOAD_VERSION',
      label: 'Verzió feltöltése szükséges',
      rationale: 'A dokumentumhoz még nem töltöttek fel egyetlen verziót sem.',
    };
  }

  // 2. Security scan issues on current version
  if (currentVersion.securityScanStatus === 'INFECTED') {
    return {
      code: 'SECURITY_THREAT',
      label: 'Biztonsági kockázat',
      rationale: 'A feltöltött verzió vírusellenőrzése fertőzést jelzett.',
    };
  }
  if (currentVersion.securityScanStatus === 'PENDING_SCAN') {
    return {
      code: 'AWAITING_SECURITY_SCAN',
      label: 'Biztonsági ellenőrzés folyamatban',
      rationale: 'A feltöltött verzió automatikus biztonsági vizsgálata még nem fejeződött be.',
    };
  }

  // 3. Comparison state (when previous version exists)
  if (previousVersion) {
    if (!comparison) {
      return {
        code: 'RUN_COMPARISON',
        label: 'Összehasonlítás indítása',
        rationale: 'A jelenlegi és az előző verzió közötti összehasonlítás még nem készült el.',
      };
    }
    if (comparison.status === 'PENDING' || comparison.status === 'PROCESSING') {
      return {
        code: 'COMPARISON_PROCESSING',
        label: 'Összehasonlítás folyamatban',
        rationale: 'A verziók összehasonlításának feldolgozása folyamatban van.',
      };
    }
    if (comparison.status === 'FAILED') {
      return {
        code: 'COMPARISON_FAILED',
        label: 'Összehasonlítás sikertelen',
        rationale: 'A két verzió összehasonlítása meghiúsult, újrapróbálás szükséges.',
      };
    }
    if (comparison.status === 'UNSUPPORTED') {
      return {
        code: 'COMPARISON_UNSUPPORTED',
        label: 'Nem támogatott összehasonlítás',
        rationale: 'A dokumentumformátum automatikus szöveges összehasonlítása nem támogatott.',
      };
    }
  }

  // 4. Exact-version review state binding
  if (!review) {
    return {
      code: 'START_REVIEW',
      label: 'Véleményezés indítása',
      rationale: 'A jelenlegi verzióhoz még nem indult el a szakmai véleményezési folyamat.',
    };
  }

  // Explicit document-level review transition to CHANGES_REQUESTED
  if (review.status === 'CHANGES_REQUESTED') {
    return {
      code: 'CHANGES_REQUESTED',
      label: 'Módosítások szükségesek',
      rationale: 'A dokumentum szintű véleményezés módosítás kérése állapotban van, új verzió vagy javítás szükséges.',
    };
  }

  if (review.status === 'DRAFT') {
    return {
      code: 'SUBMIT_FOR_REVIEW',
      label: 'Véleményezésre küldés',
      rationale: 'A véleményezés tervezet állapotban van, beküldésre vár.',
    };
  }

  if (review.blockingPointCount > 0) {
    return {
      code: 'RESOLVE_BLOCKING_POINTS',
      label: 'Blokkoló észrevételek feloldása',
      rationale: `A véleményezésben ${review.blockingPointCount} nyitott blokkoló észrevétel található.`,
    };
  }

  if (review.openPointCount > 0) {
    return {
      code: 'RESOLVE_REVIEW_POINTS',
      label: 'Nyitott észrevételek megválaszolása',
      rationale: `A véleményezésben ${review.openPointCount} még megválaszolatlan észrevétel van.`,
    };
  }

  // Segment-level unresolved state (distinct from overall review.status!)
  if (comparison && comparison.unresolvedSegments > 0) {
    return {
      code: 'REVIEW_CHANGE_SEGMENTS',
      label: 'Változtatási szakaszok elbírálása',
      rationale: `A verziók közötti eltérések közül ${comparison.unresolvedSegments} szakasz még elbírálásra vár.`,
    };
  }

  // AI draft pending approval check
  if (review.status === 'IN_REVIEW' || review.status === 'RESUBMITTED' || review.status === 'READY_FOR_REVIEW') {
    if (ai && !ai.approved && (ai.status === 'AI_DRAFT' || ai.status === 'JUNIOR_VERIFIED')) {
      return {
        code: 'VERIFY_AI_EXPLANATION',
        label: 'AI elemzés ellenőrzése',
        rationale: 'Az AI által előkészített kockázatelemzés vagy magyarázat még ügyvédi jóváhagyásra vár.',
      };
    }
    return {
      code: 'APPROVE_REVIEW',
      label: 'Véleményezés jóváhagyása',
      rationale: 'Minden észrevétel és változtatási szakasz rendezve, a véleményezés jóváhagyható.',
    };
  }

  if (review.status === 'APPROVED') {
    return {
      code: 'READY_FOR_CLIENT',
      label: 'Kész ügyfél átadásra',
      rationale: 'A dokumentum jelenlegi verziójának véleményezése jóváhagyva.',
    };
  }

  if (review.status === 'CLOSED' || review.status === 'CANCELLED') {
    return {
      code: 'REVIEW_CLOSED',
      label: 'Véleményezés lezárva',
      rationale: 'A dokumentum felülvizsgálati folyamata lezárult.',
    };
  }

  return {
    code: 'NO_ACTION_REQUIRED',
    label: 'Nincs teendő',
    rationale: 'Nincs folyamatban lévő nyitott véleményezési vagy összehasonlítási feladat.',
  };
}

/**
 * Returns the full DocumentReviewProjectionDto for a single document.
 * Returns null if the document does not exist.
 */
export async function getDocumentReviewProjection(
  documentId: string,
  options: ProjectionOptions = {}
): Promise<DocumentReviewProjectionDto | null> {
  const db = options.prisma || defaultPrisma;

  const doc = await db.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      caseId: true,
      name: true,
      fileName: true,
      title: true,
      category: true,
      workStatus: true,
    },
  });
  if (!doc) return null;

  const documentTitle = doc.title || doc.fileName || doc.name || 'Névtelen dokumentum';

  // 1. Authoritative DocumentVersion lineage
  const versions = await db.documentVersion.findMany({
    where: { documentId },
    select: {
      id: true,
      version: true,
      originalFileName: true,
      name: true,
      mimeType: true,
      size: true,
      isCurrent: true,
      previousVersionId: true,
      securityScanStatus: true,
      createdAt: true,
    },
    orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
  });

  let currentVerRow = versions.find((v: any) => v.isCurrent);
  if (!currentVerRow && versions.length > 0) {
    currentVerRow = versions[0];
  }

  const currentVersion: DocumentReviewVersionDto | null = currentVerRow
    ? {
        id: currentVerRow.id,
        version: currentVerRow.version,
        fileName: currentVerRow.originalFileName || currentVerRow.name || null,
        mimeType: currentVerRow.mimeType || null,
        size: currentVerRow.size ?? null,
        securityScanStatus: String(currentVerRow.securityScanStatus || 'CLEAN'),
        createdAt: new Date(currentVerRow.createdAt).toISOString(),
      }
    : null;

  let previousVerRow: any = null;
  if (currentVerRow) {
    if (currentVerRow.previousVersionId) {
      previousVerRow = versions.find((v: any) => v.id === currentVerRow.previousVersionId) || null;
    }
    if (!previousVerRow) {
      previousVerRow = versions.find((v: any) => v.version < currentVerRow.version) || null;
    }
  }

  const previousVersion: DocumentReviewVersionDto | null = previousVerRow
    ? {
        id: previousVerRow.id,
        version: previousVerRow.version,
        fileName: previousVerRow.originalFileName || previousVerRow.name || null,
        mimeType: previousVerRow.mimeType || null,
        size: previousVerRow.size ?? null,
        securityScanStatus: String(previousVerRow.securityScanStatus || 'CLEAN'),
        createdAt: new Date(previousVerRow.createdAt).toISOString(),
      }
    : null;

  // 2. Exact Review-Version Binding
  let reviewProjection: DocumentReviewProjectionDto['review'] = null;
  let otherVersionReview: any = null;

  if (currentVerRow) {
    const currentReview = await db.documentReview.findFirst({
      where: {
        documentId,
        documentVersionId: currentVerRow.id, // EXACT BINDING: must belong to current version
      },
      include: {
        assignedReviewer: { select: { id: true, name: true, email: true } },
        points: {
          select: {
            id: true,
            status: true,
            severity: true,
            comparisonSegmentId: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (currentReview) {
      const openPoints = currentReview.points.filter((p: any) => p.status === 'OPEN' || p.status === 'ANSWERED');
      const blockingPoints = openPoints.filter((p: any) => p.severity === 'BLOCKING');
      const pointsLinkedToSegments = currentReview.points.filter((p: any) => Boolean(p.comparisonSegmentId));
      const openPointsLinkedToSegments = openPoints.filter((p: any) => Boolean(p.comparisonSegmentId));

      reviewProjection = {
        reviewId: currentReview.id,
        documentVersionId: currentReview.documentVersionId,
        reviewVersionId: currentReview.documentVersionId,
        status: currentReview.status,
        reviewer: currentReview.assignedReviewer
          ? {
              id: currentReview.assignedReviewer.id,
              name: currentReview.assignedReviewer.name,
              email: currentReview.assignedReviewer.email,
            }
          : null,
        openPointCount: openPoints.length,
        blockingPointCount: blockingPoints.length,
        pointsLinkedToSegmentsCount: pointsLinkedToSegments.length,
        openPointsLinkedToSegmentsCount: openPointsLinkedToSegments.length,
        dueAt: iso(currentReview.dueAt),
        currentRoundNumber: currentReview.currentRoundNumber,
        updatedAt: iso(currentReview.updatedAt) || new Date().toISOString(),
      };
    }

    // Check if another version has a review (to prevent cross-version misattribution while maintaining awareness)
    otherVersionReview = await db.documentReview.findFirst({
      where: {
        documentId,
        documentVersionId: { not: currentVerRow.id },
      },
      select: {
        id: true,
        documentVersionId: true,
        status: true,
        documentVersion: { select: { version: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  const reviewContext = {
    boundToCurrentVersion: Boolean(reviewProjection),
    hasReviewForOtherVersion: Boolean(otherVersionReview),
    otherVersionReview: otherVersionReview
      ? {
          reviewId: otherVersionReview.id,
          documentVersionId: otherVersionReview.documentVersionId,
          versionNumber: otherVersionReview.documentVersion?.version ?? null,
          status: otherVersionReview.status,
        }
      : null,
  };

  // 3. DocumentComparison & ChangeSegments
  let comparisonProjection: DocumentReviewProjectionDto['comparison'] = null;
  let rawSegments: any[] = [];

  if (currentVerRow && previousVerRow) {
    let comparison = await db.documentComparison.findFirst({
      where: {
        documentId,
        targetVersionId: currentVerRow.id,
        baseVersionId: previousVerRow.id,
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    if (!comparison) {
      comparison = await db.documentComparison.findFirst({
        where: {
          documentId,
          targetVersionId: currentVerRow.id,
        },
        orderBy: [{ createdAt: 'desc' }],
      });
    }

    if (comparison) {
      const [stateGroups, catGroups] = await Promise.all([
        db.documentChangeSegment.groupBy({
          by: ['reviewState'],
          where: { comparisonId: comparison.id },
          _count: { _all: true },
        }),
        db.documentChangeSegment.groupBy({
          by: ['category'],
          where: { comparisonId: comparison.id },
          _count: { _all: true },
        }),
      ]);

      const stateMap: Record<string, number> = {};
      for (const g of stateGroups as any[]) {
        stateMap[g.reviewState] = g._count?._all || 0;
      }
      const catMap: Record<string, number> = {};
      for (const g of catGroups as any[]) {
        catMap[g.category] = g._count?._all || 0;
      }

      const unreviewed = stateMap['UNREVIEWED'] || 0;
      const accepted = stateMap['ACCEPTED'] || 0;
      const rejected = stateMap['REJECTED'] || 0;
      const needsDiscussion = stateMap['NEEDS_DISCUSSION'] || 0;
      const notRelevant = stateMap['NOT_RELEVANT'] || 0;

      // An unresolved segment is one that is unreviewed, rejected, or needs discussion
      const totalSeg = comparison.totalSegmentCount;
      const reviewedSeg = comparison.reviewedSegmentCount;
      const unresolvedSeg = unreviewed + rejected + needsDiscussion;

      comparisonProjection = {
        comparisonId: comparison.id,
        status: comparison.status,
        baseVersionId: comparison.baseVersionId,
        targetVersionId: comparison.targetVersionId,
        totalSegments: totalSeg,
        reviewedSegments: reviewedSeg,
        unresolvedSegments: unresolvedSeg,
        segmentStates: {
          unreviewed,
          accepted,
          rejected,
          needsDiscussion,
          notRelevant,
        },
        counts: {
          insertCount: comparison.insertCount,
          deleteCount: comparison.deleteCount,
          replaceCount: comparison.replaceCount,
          formatOnlyCount: comparison.formatOnlyCount,
          moveCandidateCount: comparison.moveCandidateCount,
        },
        categories: catMap,
      };

      if (options.includeSegments) {
        const segLimit = Math.min(Math.max(1, options.segmentLimit || 50), 100);
        rawSegments = await db.documentChangeSegment.findMany({
          where: { comparisonId: comparison.id },
          select: {
            sequence: true,
            changeType: true,
            category: true,
            reviewState: true,
            baseExcerpt: true,
            targetExcerpt: true,
            internalRationale: true,
            revision: true,
          },
          orderBy: { sequence: 'asc' },
          take: segLimit,
        });
      }
    }
  }

  // 4. AiPromptDraft: bounded, safe, leak-proof
  let aiProjection: DocumentReviewProjectionDto['ai'] = null;
  const recentDrafts = await db.aiPromptDraft.findMany({
    where: { caseId: doc.caseId },
    select: {
      id: true,
      status: true,
      promptTemplateStableKey: true,
      promptTemplateVersion: true,
      sourceDocumentVersionIds: true,
      sourceDocumentIds: true,
      importedResponse: true,
      rehydratedResponse: true,
      verifiedAt: true,
      approvedAt: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: 40,
  });

  // Match draft to current version or document
  const currentVersionId = currentVerRow?.id;
  const previousVersionId = previousVerRow?.id;

  const matchedDrafts = recentDrafts.filter((d: any) => {
    const vIds = parseJsonArray(d.sourceDocumentVersionIds);
    if (currentVersionId && vIds.includes(currentVersionId)) return true;
    if (previousVersionId && vIds.includes(previousVersionId)) return true;
    const dIds = parseJsonArray(d.sourceDocumentIds);
    if (dIds.includes(doc.id)) return true;
    return false;
  });

  if (matchedDrafts.length > 0) {
    // Prefer LAWYER_APPROVED, then JUNIOR_VERIFIED, then most recent
    matchedDrafts.sort((a: any, b: any) => {
      if (a.status === 'LAWYER_APPROVED' && b.status !== 'LAWYER_APPROVED') return -1;
      if (b.status === 'LAWYER_APPROVED' && a.status !== 'LAWYER_APPROVED') return 1;
      if (a.status === 'JUNIOR_VERIFIED' && b.status !== 'JUNIOR_VERIFIED') return -1;
      if (b.status === 'JUNIOR_VERIFIED' && a.status !== 'JUNIOR_VERIFIED') return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    const chosen = matchedDrafts[0];
    aiProjection = {
      promptDraftId: chosen.id,
      status: chosen.status,
      templateKey: chosen.promptTemplateStableKey,
      templateVersion: chosen.promptTemplateVersion,
      sourceDocumentVersionIds: parseJsonArray(chosen.sourceDocumentVersionIds),
      approved: chosen.status === 'LAWYER_APPROVED',
      artifactAvailability: {
        hasImportedResponse: Boolean(chosen.importedResponse),
        hasRehydratedResponse: Boolean(chosen.rehydratedResponse),
      },
      verifiedAt: iso(chosen.verifiedAt),
      approvedAt: iso(chosen.approvedAt),
      updatedAt: iso(chosen.updatedAt) || new Date().toISOString(),
    };
  }

  // 5. Deterministic Next Action
  const nextAction = deriveNextAction({
    currentVersion,
    previousVersion,
    review: reviewProjection,
    comparison: comparisonProjection,
    ai: aiProjection,
  });

  const result: DocumentReviewProjectionDto = {
    documentId: doc.id,
    caseId: doc.caseId,
    documentTitle,
    category: doc.category ? String(doc.category) : null,
    workStatus: doc.workStatus ? String(doc.workStatus) : null,
    currentVersion,
    previousVersion,
    review: reviewProjection,
    reviewContext,
    comparison: comparisonProjection,
    ai: aiProjection,
    nextAction,
  };

  if (options.includeSegments && rawSegments.length > 0) {
    result.segments = rawSegments.map((s: any) => ({
      sequence: s.sequence,
      changeType: String(s.changeType),
      category: String(s.category),
      reviewState: String(s.reviewState),
      baseExcerpt: s.baseExcerpt,
      targetExcerpt: s.targetExcerpt,
      internalRationale: s.internalRationale,
      revision: s.revision,
    }));
  }

  return result;
}

/**
 * Returns compact review summaries for all documents in a case.
 * Designed for Case Workspace summary tiles and fast overview loading.
 */
export async function getCaseDocumentReviewSummaries(
  caseId: string,
  options: { limit?: number; prisma?: any } = {}
): Promise<{ caseId: string; documentCount: number; items: DocumentReviewSummaryDto[] }> {
  const db = options.prisma || defaultPrisma;
  const docLimit = Math.min(Math.max(1, options.limit || 20), 50);

  const documents = await db.document.findMany({
    where: { caseId },
    select: { id: true },
    orderBy: { updatedAt: 'desc' },
    take: docLimit,
  });

  const items: DocumentReviewSummaryDto[] = [];

  for (const doc of documents) {
    const projection = await getDocumentReviewProjection(doc.id, { prisma: db });
    if (!projection) continue;

    items.push({
      documentId: projection.documentId,
      caseId: projection.caseId,
      documentTitle: projection.documentTitle,
      category: projection.category,
      workStatus: projection.workStatus,
      currentVersionNumber: projection.currentVersion?.version ?? null,
      currentVersionId: projection.currentVersion?.id ?? null,
      previousVersionNumber: projection.previousVersion?.version ?? null,
      previousVersionId: projection.previousVersion?.id ?? null,
      reviewId: projection.review?.reviewId ?? null,
      reviewVersionId: projection.review?.documentVersionId ?? null,
      reviewStatus: projection.review?.status ?? null,
      openPointCount: projection.review?.openPointCount ?? 0,
      blockingPointCount: projection.review?.blockingPointCount ?? 0,
      comparisonId: projection.comparison?.comparisonId ?? null,
      comparisonStatus: projection.comparison?.status ?? null,
      totalSegments: projection.comparison?.totalSegments ?? 0,
      reviewedSegments: projection.comparison?.reviewedSegments ?? 0,
      unresolvedSegments: projection.comparison?.unresolvedSegments ?? 0,
      aiPromptDraftId: projection.ai?.promptDraftId ?? null,
      aiDraftStatus: projection.ai?.status ?? null,
      aiApproved: projection.ai?.approved ?? false,
      nextAction: projection.nextAction,
    });
  }

  return {
    caseId,
    documentCount: items.length,
    items,
  };
}
