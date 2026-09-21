/**
 * Document Review Read Model Projection Service
 *
 * Connects canonical DocumentVersion lineage, DocumentComparison + DocumentChangeSegment,
 * DocumentReview + ReviewPoint, and AiPromptDraft into a safe, coherent, bounded read-model
 * projection for the Document Workspace review rail and Case Workspace summary tiles.
 *
 * ZERO SCHEMA CHANGES - ZERO SECOND ENGINES - STRICT PRIVACY / LEAK PROTECTION
 * BATCHED CASE PROJECTION - NO SERIAL N+1 - EXACT PREVIOUS->CURRENT COMPARISON ONLY
 */
import { DocumentAnnotationStatus, DocumentAnnotationType } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';

export type AiSourceMode = 'EXACT_VERSION_PAIR' | 'CURRENT_VERSION' | 'MIXED_VERSION_CONTEXT' | 'LEGACY_DOCUMENT';

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
  aiSourceMode?: AiSourceMode | null;
  nextAction: {
    code: string;
    label: string;
    rationale: string;
  };
}

export interface DocumentAnnotationSummaryDto {
  documentVersionId: string | null;
  totalCount: number;
  openCount: number;
  resolvedCount: number;
  byType: {
    INTERNAL_NOTE?: number;
    REVIEW_COMMENT?: number;
    MODIFICATION_REASON?: number;
    CLIENT_EXPLANATION_DRAFT?: number;
    QUESTION?: number;
    DECISION?: number;
    TASK_NOTE?: number;
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
    sourceMode: AiSourceMode;
    approved: boolean;
    artifactAvailability: {
      hasImportedResponse: boolean;
      hasRehydratedResponse: boolean;
    };
    attentionSuggested?: boolean;
    verifiedAt: string | null;
    approvedAt: string | null;
    updatedAt: string;
  } | null;

  nextAction: {
    code: string;
    label: string;
    rationale: string;
  };

  annotationSummary: DocumentAnnotationSummaryDto;

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

export function parseBoundedInt(val: unknown, min: number, max: number, defaultVal: number): number {
  if (val === undefined || val === null || val === '') return defaultVal;
  const num = Number(val);
  if (!Number.isFinite(num) || Number.isNaN(num)) return defaultVal;
  return Math.max(min, Math.min(Math.floor(num), max));
}

export interface RankedAiDraft {
  draft: any;
  sourceMode: AiSourceMode;
  relevanceScore: number;
  sourceDocumentVersionIds: string[];
}

/**
 * Matches and ranks AI prompt drafts for a document/version-pair in a version-truthful manner.
 *
 * Rules:
 * 1. A version-specific AI projection MUST contain currentVersionId.
 * 2. A draft matching only previousVersionId MUST NOT represent current-version AI state.
 * 3. A generic sourceDocumentIds-only legacy draft MUST NOT override an exact immutable current-version draft.
 * 4. For version-pair analysis, prefer a draft whose sourceDocumentVersionIds contain the exact canonical base + target pair.
 * 5. If no exact pair exists, a current-version-only immutable draft may be exposed truthfully as current-version analysis, but do not call it a version-pair result.
 * 6. Status priority (e.g. LAWYER_APPROVED over AI_DRAFT) must only be applied AFTER source-version relevance is established.
 */
export function matchAndRankAiDrafts(params: {
  drafts: any[];
  documentId: string;
  currentVersionId?: string | null;
  previousVersionId?: string | null;
}): RankedAiDraft | null {
  const { drafts, documentId, currentVersionId, previousVersionId } = params;

  const candidates: RankedAiDraft[] = [];

  for (const d of drafts) {
    const rawVIds = parseJsonArray(d.sourceDocumentVersionIds);
    const vIds = Array.from(new Set(rawVIds.map((s: string) => String(s).trim()).filter(Boolean)));
    const docIds = parseJsonArray(d.sourceDocumentIds);

    const hasCurrent = Boolean(currentVersionId && vIds.includes(currentVersionId));
    const hasPrevious = Boolean(previousVersionId && vIds.includes(previousVersionId));
    const onlyPrevious = hasPrevious && !hasCurrent;

    // Rule 2: A draft matching only previousVersionId MUST NOT represent current-version AI state.
    if (onlyPrevious) {
      continue;
    }

    if (hasCurrent) {
      // Rule 4: EXACT_VERSION_PAIR means the immutable version source set is strictly and exactly {previousVersionId, currentVersionId}.
      const isExactPair = Boolean(
        previousVersionId &&
        hasPrevious &&
        vIds.length === 2 &&
        vIds.includes(previousVersionId) &&
        vIds.includes(currentVersionId!)
      );

      if (isExactPair) {
        candidates.push({
          draft: d,
          sourceMode: 'EXACT_VERSION_PAIR',
          relevanceScore: 30,
          sourceDocumentVersionIds: vIds,
        });
      } else if (vIds.length === 1 && vIds[0] === currentVersionId) {
        // Rule 5: Current-version-only immutable draft.
        candidates.push({
          draft: d,
          sourceMode: 'CURRENT_VERSION',
          relevanceScore: 20,
          sourceDocumentVersionIds: vIds,
        });
      } else {
        // Current version is present, but alongside additional version IDs (e.g. [v0, v1, v2] or [v2, otherDocVersion]).
        candidates.push({
          draft: d,
          sourceMode: 'MIXED_VERSION_CONTEXT',
          relevanceScore: 15,
          sourceDocumentVersionIds: vIds,
        });
      }
      continue;
    }

    // Rule 3: Generic sourceDocumentIds-only legacy draft (applies ONLY if no version IDs attached).
    if (docIds.includes(documentId) && vIds.length === 0) {
      candidates.push({
        draft: d,
        sourceMode: 'LEGACY_DOCUMENT',
        relevanceScore: 10,
        sourceDocumentVersionIds: [],
      });
    }
  }

  if (candidates.length === 0) return null;

  // Rule 6: Status priority applied AFTER source-version relevance is established.
  candidates.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }

    const isLawyerApproved = (s: string) => s === 'LAWYER_APPROVED';
    const isJuniorVerified = (s: string) => s === 'JUNIOR_VERIFIED';

    const aApproved = isLawyerApproved(a.draft.status);
    const bApproved = isLawyerApproved(b.draft.status);
    if (aApproved && !bApproved) return -1;
    if (bApproved && !aApproved) return 1;

    const aVerified = isJuniorVerified(a.draft.status);
    const bVerified = isJuniorVerified(b.draft.status);
    if (aVerified && !bVerified) return -1;
    if (bVerified && !aVerified) return 1;

    return new Date(b.draft.updatedAt).getTime() - new Date(a.draft.updatedAt).getTime();
  });

  return candidates[0];
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

  // Review states permitting approval (AI is advisory context only and never gates canonical approval)
  if (review.status === 'IN_REVIEW' || review.status === 'RESUBMITTED' || review.status === 'READY_FOR_REVIEW') {
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
  // CANONICAL EXACT PREVIOUS->CURRENT ONLY! (Zero arbitrary base fallback!)
  let comparisonProjection: DocumentReviewProjectionDto['comparison'] = null;
  let rawSegments: any[] = [];

  if (currentVerRow && previousVerRow) {
    const comparison = await db.documentComparison.findFirst({
      where: {
        documentId,
        targetVersionId: currentVerRow.id,
        baseVersionId: previousVerRow.id, // EXACT PAIR ONLY!
      },
      orderBy: [{ createdAt: 'desc' }],
    });

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
        const segLimit = parseBoundedInt(options.segmentLimit, 1, 100, 50);
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

  // 4. AiPromptDraft: version-truthful matching and ranking (ISSUE 1 FIX)
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
    take: 50,
  });

  const matched = matchAndRankAiDrafts({
    drafts: recentDrafts,
    documentId: doc.id,
    currentVersionId: currentVerRow?.id,
    previousVersionId: previousVerRow?.id,
  });

  if (matched) {
    const chosen = matched.draft;
    aiProjection = {
      promptDraftId: chosen.id,
      status: chosen.status,
      templateKey: chosen.promptTemplateStableKey,
      templateVersion: chosen.promptTemplateVersion,
      sourceDocumentVersionIds: matched.sourceDocumentVersionIds,
      sourceMode: matched.sourceMode,
      approved: matched.sourceMode !== 'LEGACY_DOCUMENT' && chosen.status === 'LAWYER_APPROVED',
      artifactAvailability: {
        hasImportedResponse: Boolean(chosen.importedResponse),
        hasRehydratedResponse: Boolean(chosen.rehydratedResponse),
      },
      attentionSuggested: chosen.status === 'AI_DRAFT' || chosen.status === 'JUNIOR_VERIFIED',
      verifiedAt: iso(chosen.verifiedAt),
      approvedAt: iso(chosen.approvedAt),
      updatedAt: iso(chosen.updatedAt) || new Date().toISOString(),
    };
  }

  // 5. Current-version Annotation Summary (additive read-model signal for the four-mode UI)
  let annotationSummary: DocumentAnnotationSummaryDto = {
    documentVersionId: currentVerRow ? currentVerRow.id : null,
    totalCount: 0,
    openCount: 0,
    resolvedCount: 0,
    byType: {},
  };

  if (currentVerRow && db.documentAnnotation?.groupBy) {
    const annotationGroups = await db.documentAnnotation.groupBy({
      by: ['status', 'annotationType'],
      where: {
        documentId: doc.id,
        documentVersionId: currentVerRow.id,
        deletedAt: null,
      },
      _count: { _all: true },
    });

    let total = 0;
    let open = 0;
    let resolved = 0;
    const byType: DocumentAnnotationSummaryDto['byType'] = {};

    for (const group of annotationGroups as Array<{
      status: DocumentAnnotationStatus;
      annotationType: DocumentAnnotationType;
      _count?: { _all?: number };
    }>) {
      const count = group._count?._all || 0;
      total += count;
      if (group.status === DocumentAnnotationStatus.RESOLVED) {
        resolved += count;
      } else {
        open += count;
      }
      const type = group.annotationType as keyof DocumentAnnotationSummaryDto['byType'];
      byType[type] = (byType[type] || 0) + count;
    }

    annotationSummary = {
      documentVersionId: currentVerRow.id,
      totalCount: total,
      openCount: open,
      resolvedCount: resolved,
      byType,
    };
  }

  // 6. Deterministic Next Action
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
    annotationSummary,
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
 * Returns compact review summaries for documents in a case using a fully batched, bounded pipeline.
 * Designed for Case Workspace summary tiles and fast overview loading.
 *
 * NO SERIAL N+1 QUERY LOOP:
 * Fetches versions, reviews, comparisons, and AI drafts in bounded batch queries and maps in memory.
 */
export async function getCaseDocumentReviewSummaries(
  caseId: string,
  options: {
    limit?: number;
    prisma?: any;
    documents?: Array<{
      id: string;
      caseId?: string;
      name?: string | null;
      fileName?: string | null;
      title?: string | null;
      category?: string | null;
      workStatus?: string | null;
    }>;
  } = {}
): Promise<{ caseId: string; documentCount: number; items: DocumentReviewSummaryDto[] }> {
  const db = options.prisma || defaultPrisma;
  const docLimit = parseBoundedInt(options.limit, 1, 50, 20);

  // 1. Resolve documents (either from preloaded options or bounded findMany)
  let documents: Array<{
    id: string;
    caseId: string;
    name: string;
    fileName: string | null;
    title: string | null;
    category: any;
    workStatus: any;
  }>;

  if (options.documents && options.documents.length > 0) {
    documents = options.documents.slice(0, docLimit).map((d) => ({
      id: d.id,
      caseId: d.caseId || caseId,
      name: d.name || d.fileName || 'Dokumentum',
      fileName: d.fileName || null,
      title: d.title || null,
      category: d.category || null,
      workStatus: d.workStatus || null,
    }));
  } else {
    documents = await db.document.findMany({
      where: { caseId },
      select: {
        id: true,
        caseId: true,
        name: true,
        fileName: true,
        title: true,
        category: true,
        workStatus: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: docLimit,
    });
  }

  if (documents.length === 0) {
    return { caseId, documentCount: 0, items: [] };
  }

  const docIds = documents.map((d) => d.id);

  // 2. BATCH QUERY: All versions for these documents
  const versions = await db.documentVersion.findMany({
    where: { documentId: { in: docIds } },
    select: {
      id: true,
      documentId: true,
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

  const versionsByDoc = new Map<string, any[]>();
  for (const v of versions) {
    const list = versionsByDoc.get(v.documentId) || [];
    list.push(v);
    versionsByDoc.set(v.documentId, list);
  }

  const currentVersionMap = new Map<string, DocumentReviewVersionDto | null>();
  const previousVersionMap = new Map<string, DocumentReviewVersionDto | null>();
  const currentVersionIds: string[] = [];
  const pairConditions: Array<{ documentId: string; targetVersionId: string; baseVersionId: string }> = [];

  for (const doc of documents) {
    const docVersions = versionsByDoc.get(doc.id) || [];
    let currentVerRow = docVersions.find((v: any) => v.isCurrent);
    if (!currentVerRow && docVersions.length > 0) {
      currentVerRow = docVersions[0];
    }

    const curVer: DocumentReviewVersionDto | null = currentVerRow
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
    currentVersionMap.set(doc.id, curVer);

    if (currentVerRow) {
      currentVersionIds.push(currentVerRow.id);
    }

    let prevVerRow: any = null;
    if (currentVerRow) {
      if (currentVerRow.previousVersionId) {
        prevVerRow = docVersions.find((v: any) => v.id === currentVerRow.previousVersionId) || null;
      }
      if (!prevVerRow) {
        prevVerRow = docVersions.find((v: any) => v.version < currentVerRow.version) || null;
      }
    }

    const prevVer: DocumentReviewVersionDto | null = prevVerRow
      ? {
          id: prevVerRow.id,
          version: prevVerRow.version,
          fileName: prevVerRow.originalFileName || prevVerRow.name || null,
          mimeType: prevVerRow.mimeType || null,
          size: prevVerRow.size ?? null,
          securityScanStatus: String(prevVerRow.securityScanStatus || 'CLEAN'),
          createdAt: new Date(prevVerRow.createdAt).toISOString(),
        }
      : null;
    previousVersionMap.set(doc.id, prevVer);

    if (currentVerRow && prevVerRow) {
      pairConditions.push({
        documentId: doc.id,
        targetVersionId: currentVerRow.id,
        baseVersionId: prevVerRow.id,
      });
    }
  }

  // 3. BATCH QUERY: Reviews for all current versions (exact version binding)
  const reviews = currentVersionIds.length > 0
    ? await db.documentReview.findMany({
        where: {
          documentId: { in: docIds },
          documentVersionId: { in: currentVersionIds },
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
      })
    : [];

  const reviewsByVersionId = new Map<string, any>();
  for (const r of reviews) {
    if (!reviewsByVersionId.has(r.documentVersionId)) {
      reviewsByVersionId.set(r.documentVersionId, r);
    }
  }

  // 4. BATCH QUERY: Comparisons for all exact (previous->current) version pairs
  const comparisons = pairConditions.length > 0
    ? await db.documentComparison.findMany({
        where: { OR: pairConditions },
        orderBy: [{ createdAt: 'desc' }],
      })
    : [];

  const comparisonByTargetId = new Map<string, any>();
  for (const c of comparisons) {
    const key = `${c.documentId}:${c.baseVersionId}:${c.targetVersionId}`;
    if (!comparisonByTargetId.has(key)) {
      comparisonByTargetId.set(key, c);
    }
  }

  // 5. BATCH QUERY: Change segment aggregates across all found comparisons
  const compIds = comparisons.map((c: any) => c.id);
  const stateGroups = compIds.length > 0
    ? await db.documentChangeSegment.groupBy({
        by: ['comparisonId', 'reviewState'],
        where: { comparisonId: { in: compIds } },
        _count: { _all: true },
      })
    : [];

  const compStateCounts = new Map<string, Record<string, number>>();
  for (const g of stateGroups as any[]) {
    const current = compStateCounts.get(g.comparisonId) || {};
    current[g.reviewState] = g._count?._all || 0;
    compStateCounts.set(g.comparisonId, current);
  }

  // 6. SINGLE CASE-WIDE QUERY: AI drafts for the entire case (loaded exactly ONCE!)
  const caseDrafts = await db.aiPromptDraft.findMany({
    where: { caseId },
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
    take: 50,
  });

  // 7. IN-MEMORY ASSEMBLY: Build summary DTOs with deterministic nextAction
  const items: DocumentReviewSummaryDto[] = [];

  for (const doc of documents) {
    const documentTitle = doc.title || doc.fileName || doc.name || 'Névtelen dokumentum';
    const currentVersion = currentVersionMap.get(doc.id) || null;
    const previousVersion = previousVersionMap.get(doc.id) || null;

    let reviewProjection: DocumentReviewProjectionDto['review'] = null;
    if (currentVersion) {
      const r = reviewsByVersionId.get(currentVersion.id);
      if (r) {
        const openPoints = r.points.filter((p: any) => p.status === 'OPEN' || p.status === 'ANSWERED');
        const blockingPoints = openPoints.filter((p: any) => p.severity === 'BLOCKING');
        const pointsLinkedToSegments = r.points.filter((p: any) => Boolean(p.comparisonSegmentId));
        const openPointsLinkedToSegments = openPoints.filter((p: any) => Boolean(p.comparisonSegmentId));

        reviewProjection = {
          reviewId: r.id,
          documentVersionId: r.documentVersionId,
          reviewVersionId: r.documentVersionId,
          status: r.status,
          reviewer: r.assignedReviewer
            ? {
                id: r.assignedReviewer.id,
                name: r.assignedReviewer.name,
                email: r.assignedReviewer.email,
              }
            : null,
          openPointCount: openPoints.length,
          blockingPointCount: blockingPoints.length,
          pointsLinkedToSegmentsCount: pointsLinkedToSegments.length,
          openPointsLinkedToSegmentsCount: openPointsLinkedToSegments.length,
          dueAt: iso(r.dueAt),
          currentRoundNumber: r.currentRoundNumber,
          updatedAt: iso(r.updatedAt) || new Date().toISOString(),
        };
      }
    }

    let comparisonProjection: DocumentReviewProjectionDto['comparison'] = null;
    if (currentVersion && previousVersion) {
      const compKey = `${doc.id}:${previousVersion.id}:${currentVersion.id}`;
      const comp = comparisonByTargetId.get(compKey);
      if (comp) {
        const states = compStateCounts.get(comp.id) || {};
        const unreviewed = states['UNREVIEWED'] || 0;
        const accepted = states['ACCEPTED'] || 0;
        const rejected = states['REJECTED'] || 0;
        const needsDiscussion = states['NEEDS_DISCUSSION'] || 0;
        const notRelevant = states['NOT_RELEVANT'] || 0;
        const unresolved = unreviewed + rejected + needsDiscussion;

        comparisonProjection = {
          comparisonId: comp.id,
          status: comp.status,
          baseVersionId: comp.baseVersionId,
          targetVersionId: comp.targetVersionId,
          totalSegments: comp.totalSegmentCount,
          reviewedSegments: comp.reviewedSegmentCount,
          unresolvedSegments: unresolved,
          segmentStates: { unreviewed, accepted, rejected, needsDiscussion, notRelevant },
          counts: {
            insertCount: comp.insertCount,
            deleteCount: comp.deleteCount,
            replaceCount: comp.replaceCount,
            formatOnlyCount: comp.formatOnlyCount,
            moveCandidateCount: comp.moveCandidateCount,
          },
          categories: {},
        };
      }
    }

    const matched = matchAndRankAiDrafts({
      drafts: caseDrafts,
      documentId: doc.id,
      currentVersionId: currentVersion?.id,
      previousVersionId: previousVersion?.id,
    });

    let aiProjection: DocumentReviewProjectionDto['ai'] = null;
    if (matched) {
      const chosen = matched.draft;
      aiProjection = {
        promptDraftId: chosen.id,
        status: chosen.status,
        templateKey: chosen.promptTemplateStableKey,
        templateVersion: chosen.promptTemplateVersion,
        sourceDocumentVersionIds: matched.sourceDocumentVersionIds,
        sourceMode: matched.sourceMode,
        approved: matched.sourceMode !== 'LEGACY_DOCUMENT' && chosen.status === 'LAWYER_APPROVED',
        artifactAvailability: {
          hasImportedResponse: Boolean(chosen.importedResponse),
          hasRehydratedResponse: Boolean(chosen.rehydratedResponse),
        },
        attentionSuggested: chosen.status === 'AI_DRAFT' || chosen.status === 'JUNIOR_VERIFIED',
        verifiedAt: iso(chosen.verifiedAt),
        approvedAt: iso(chosen.approvedAt),
        updatedAt: iso(chosen.updatedAt) || new Date().toISOString(),
      };
    }

    const nextAction = deriveNextAction({
      currentVersion,
      previousVersion,
      review: reviewProjection,
      comparison: comparisonProjection,
      ai: aiProjection,
    });

    items.push({
      documentId: doc.id,
      caseId: doc.caseId,
      documentTitle,
      category: doc.category ? String(doc.category) : null,
      workStatus: doc.workStatus ? String(doc.workStatus) : null,
      currentVersionNumber: currentVersion?.version ?? null,
      currentVersionId: currentVersion?.id ?? null,
      previousVersionNumber: previousVersion?.version ?? null,
      previousVersionId: previousVersion?.id ?? null,
      reviewId: reviewProjection?.reviewId ?? null,
      reviewVersionId: reviewProjection?.documentVersionId ?? null,
      reviewStatus: reviewProjection?.status ?? null,
      openPointCount: reviewProjection?.openPointCount ?? 0,
      blockingPointCount: reviewProjection?.blockingPointCount ?? 0,
      comparisonId: comparisonProjection?.comparisonId ?? null,
      comparisonStatus: comparisonProjection?.status ?? null,
      totalSegments: comparisonProjection?.totalSegments ?? 0,
      reviewedSegments: comparisonProjection?.reviewedSegments ?? 0,
      unresolvedSegments: comparisonProjection?.unresolvedSegments ?? 0,
      aiPromptDraftId: aiProjection?.promptDraftId ?? null,
      aiDraftStatus: aiProjection?.status ?? null,
      aiApproved: aiProjection?.approved ?? false,
      aiSourceMode: aiProjection?.sourceMode ?? null,
      nextAction,
    });
  }

  return {
    caseId,
    documentCount: items.length,
    items,
  };
}
