/**
 * Structured comparison persistence lifecycle (STRUCTURED-DOC-COMPARISON-1, Phase 5).
 *
 * Transaction-safe orchestration around the deterministic engine: validate the
 * version pair, reuse an existing result idempotently, otherwise run the engine
 * and persist segments + summary counts atomically, always ending in an explicit
 * terminal status. Never mutates DocumentVersion; never leaves an orphan
 * PROCESSING row on failure.
 *
 * The engine and the text resolver are injected so the whole lifecycle is
 * unit-testable against a mocked Prisma client without storage or a database.
 */
import { prisma as defaultPrisma } from '../../../prisma/prisma.service';
import { compareVersions, COMPARISON_ALGORITHM_REVISION, type ComparisonResult } from './diffEngine';
import { EXTRACTION_REVISION, type VersionMeta, type VersionTextResult } from './versionText';

export class ComparisonError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = 'ComparisonError';
  }
}

export interface ComparisonDeps {
  prisma?: any;
  resolveText: (version: VersionMeta) => Promise<VersionTextResult>;
  /** Injectable for tests; defaults to the real deterministic engine. */
  engine?: (input: { baseText: string | null; targetText: string | null; baseSupported: boolean; targetSupported: boolean }) => ComparisonResult;
}

export interface CreateComparisonInput {
  actorId: string;
  documentId: string;
  baseVersionId: string;
  targetVersionId: string;
}

const ENGINE_TO_STATUS: Record<ComparisonResult['status'], string> = {
  READY: 'READY', IDENTICAL: 'IDENTICAL', UNSUPPORTED: 'UNSUPPORTED', FAILED: 'FAILED',
};

/** Reuse an existing comparison in one of these terminal/active states rather than duplicating work. */
const REUSABLE = new Set(['READY', 'IDENTICAL', 'UNSUPPORTED', 'PENDING', 'PROCESSING']);

export async function createOrGetComparison(input: CreateComparisonInput, deps: ComparisonDeps) {
  const prisma = deps.prisma ?? defaultPrisma;
  const engine = deps.engine ?? compareVersions;
  const { actorId, documentId, baseVersionId, targetVersionId } = input;

  if (!actorId) throw new ComparisonError('UNAUTHENTICATED', 'Authenticated user required.', 401);
  if (baseVersionId === targetVersionId) throw new ComparisonError('SAME_VERSION', 'Base and target versions must differ.');

  // Both versions must exist and belong to the same logical document.
  const versions = await prisma.documentVersion.findMany({
    where: { id: { in: [baseVersionId, targetVersionId] } },
    select: { id: true, documentId: true, version: true, mimeType: true, originalFileName: true, size: true },
  });
  const base = versions.find((v: any) => v.id === baseVersionId);
  const target = versions.find((v: any) => v.id === targetVersionId);
  if (!base || !target) throw new ComparisonError('VERSION_NOT_FOUND', 'Version not found.', 404);
  if (base.documentId !== documentId || target.documentId !== documentId) {
    throw new ComparisonError('CROSS_DOCUMENT_VERSIONS', 'Both versions must belong to the same document.');
  }

  const uniqueWhere = {
    documentId_baseVersionId_targetVersionId_algorithmRevision: {
      documentId, baseVersionId, targetVersionId, algorithmRevision: COMPARISON_ALGORITHM_REVISION,
    },
  };

  // Idempotent reuse: a prior READY/IDENTICAL/UNSUPPORTED (or in-flight
  // PENDING/PROCESSING) comparison for the same pair+revision is returned as-is.
  const existing = await prisma.documentComparison.findUnique({ where: uniqueWhere });
  if (existing && REUSABLE.has(existing.status)) {
    return existing;
  }

  // Create (or take over a prior FAILED/SUPERSEDED) as PENDING. A concurrent
  // creator racing on the unique key is caught and its row reused.
  let comparison;
  try {
    comparison = existing
      ? await prisma.documentComparison.update({
          where: { id: existing.id },
          data: { status: 'PENDING', failureCode: null, failureMessageSafe: null, startedAt: null, completedAt: null },
        })
      : await prisma.documentComparison.create({
          data: {
            documentId, baseVersionId, targetVersionId,
            algorithmRevision: COMPARISON_ALGORITHM_REVISION, extractionRevision: EXTRACTION_REVISION,
            createdById: actorId, status: 'PENDING',
          },
        });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      const raced = await prisma.documentComparison.findUnique({ where: uniqueWhere });
      if (raced) return raced;
    }
    throw e;
  }

  // PROCESSING.
  await prisma.documentComparison.update({ where: { id: comparison.id }, data: { status: 'PROCESSING', startedAt: new Date() } });

  try {
    const baseText = await deps.resolveText({ id: base.id, documentId, mimeType: base.mimeType, originalFileName: base.originalFileName, size: base.size });
    const targetText = await deps.resolveText({ id: target.id, documentId, mimeType: target.mimeType, originalFileName: target.originalFileName, size: target.size });

    const result = engine({
      baseText: baseText.text, targetText: targetText.text,
      baseSupported: baseText.supported, targetSupported: targetText.supported,
    });
    const status = ENGINE_TO_STATUS[result.status];

    // Persist segments + terminal status atomically. Any failure rolls the whole
    // batch back and the catch below records a safe FAILED instead of an orphan.
    const finalRow = await prisma.$transaction(async (tx: any) => {
      await tx.documentChangeSegment.deleteMany({ where: { comparisonId: comparison.id } });
      if (result.segments.length > 0) {
        await tx.documentChangeSegment.createMany({
          data: result.segments.map((s) => ({
            comparisonId: comparison.id,
            sequence: s.sequence,
            changeType: s.changeType,
            baseStart: s.baseStart, baseEnd: s.baseEnd, targetStart: s.targetStart, targetEnd: s.targetEnd,
            baseExcerpt: s.baseExcerpt, targetExcerpt: s.targetExcerpt,
            contextBefore: null, contextAfter: s.normalizedContext,
            confidence: s.confidence,
          })),
        });
      }
      return tx.documentComparison.update({
        where: { id: comparison.id },
        data: {
          status: status as any,
          completedAt: new Date(),
          failureCode: result.failureCode,
          failureMessageSafe: result.failureCode ? safeFailureMessage(result.failureCode) : null,
          insertCount: result.summary.inserts,
          deleteCount: result.summary.deletes,
          replaceCount: result.summary.replaces,
          formatOnlyCount: result.summary.formatOnly,
          moveCandidateCount: result.summary.moveCandidates,
          totalSegmentCount: result.summary.total,
        },
      });
    });
    return finalRow;
  } catch (err) {
    // Never leave PROCESSING dangling; record only a safe code.
    await prisma.documentComparison.update({
      where: { id: comparison.id },
      data: { status: 'FAILED', completedAt: new Date(), failureCode: 'PROCESSING_ERROR', failureMessageSafe: 'A comparison could not be generated.' },
    }).catch(() => undefined);
    throw new ComparisonError('COMPARISON_FAILED', 'Comparison generation failed.', 500);
  }
}

function safeFailureMessage(code: string): string {
  switch (code) {
    case 'INPUT_TOO_LARGE': return 'The documents are too large to compare.';
    case 'TOO_MANY_PARAGRAPHS': return 'The documents have too many paragraphs to compare.';
    case 'COMPARISON_TOO_COMPLEX': return 'The comparison is too complex to run.';
    case 'EXTRACTION_UNAVAILABLE': return 'No authoritative text is available for one of the versions.';
    default: return 'The comparison could not be completed.';
  }
}
