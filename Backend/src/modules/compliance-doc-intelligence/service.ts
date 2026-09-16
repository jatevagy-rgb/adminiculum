/**
 * CDI-1 — compliance document intelligence ingestion + internal query service.
 *
 * Ingestion is DERIVED, INTERNAL processing. It must be non-destructive and
 * strictly non-fatal: a document upload, a version creation or an
 * INTERNAL_ANALYSIS linkage must stay successful even when metadata extraction
 * fails. Nothing here ever throws at a caller that uses the `schedule*` helpers.
 *
 * Provenance: rows are written for ONE immutable DocumentVersion.
 * - re-ingesting the same version is a no-op (row digest identity)
 * - a changed digest set for an existing version is INGEST_DRIFT: nothing is
 *   deleted, replaced or updated, and the caller is told to upload a new version
 * - a new DocumentVersion produces its own independent row set
 *
 * CLIENT BOUNDARY: CLIENT_POLICY documents never trigger ingestion, and no
 * function here is used by any customer-safe read path.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { driveService } from '../sharepoint';
import { parseComplianceMasterDocx } from './extractClauseAnchors';
import { computeRowDigest, normalizeExtractedRow, type NormalizedClauseAnchorRow } from './normalize';
import { MAX_WARNINGS_PER_RESULT, type IngestResult } from './types';

type Prisma = typeof defaultPrisma;

export const INTERNAL_ANALYSIS_AUDIENCE = 'INTERNAL_ANALYSIS';

/** Internal storage subject for one concrete version. */
export interface VersionContentSubject {
  id: string;
  documentId: string;
  spItemId: string | null;
}

export interface IngestDeps {
  prisma?: Prisma;
  /** Resolve the DOCX bytes of a version. Defaults to the SharePoint storage. */
  loadVersionContent?: (version: VersionContentSubject) => Promise<Buffer | null>;
  /**
   * Optional exact binding to the canonical legal-source registry. Ingestion
   * NEVER creates LegalSource / LegalSourceVersion rows, and no resolver exists
   * yet, so the default returns null instead of guessing a binding.
   */
  resolveLegalSourceVersionId?: (row: NormalizedClauseAnchorRow) => string | null;
  log?: (message: string, detail?: Record<string, unknown>) => void;
}

function logInternal(deps: IngestDeps, message: string, detail?: Record<string, unknown>): void {
  if (deps.log) {
    deps.log(message, detail);
    return;
  }
  // Bounded internal diagnostics only: counts and codes, never document content.
  console.warn(`[cdi-ingest] ${message}`, detail ? JSON.stringify(detail) : '');
}

async function defaultLoadVersionContent(version: VersionContentSubject): Promise<Buffer | null> {
  if (!version.spItemId) return null;
  return driveService.downloadDocument(version.spItemId);
}

function boundedWarnings(warnings: string[]): string[] {
  return warnings.slice(0, MAX_WARNINGS_PER_RESULT);
}

function baseResult(
  version: VersionContentSubject | null,
  partial: Partial<IngestResult> & Pick<IngestResult, 'status'>,
): IngestResult {
  return {
    documentVersionId: version ? version.id : null,
    documentId: version ? version.documentId : null,
    parsedRows: 0,
    insertedRows: 0,
    existingRows: 0,
    warnings: [],
    ...partial,
  };
}

/**
 * Persist the extracted rows for one DocumentVersion.
 *
 * Idempotency is enforced by the (documentVersionId, rowDigest) unique index plus
 * an explicit digest comparison, so a repeated identical ingest is a no-op and a
 * differing digest set never silently rewrites history.
 */
export async function ingestClauseAnchorsForVersion(
  version: VersionContentSubject,
  buffer: Buffer,
  deps: IngestDeps = {},
): Promise<IngestResult> {
  const prisma = deps.prisma ?? defaultPrisma;

  let normalizedRows: NormalizedClauseAnchorRow[];
  let parseWarnings: string[] = [];
  try {
    const parsed = await parseComplianceMasterDocx(buffer);
    parseWarnings = parsed.warnings;
    normalizedRows = parsed.rows.map(normalizeExtractedRow);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'DOCX_PARSE_FAILED';
    logInternal(deps, 'parse failed', { documentVersionId: version.id, code });
    return baseResult(version, { status: 'FAILED', code: code.slice(0, 64) });
  }

  const byDigest = new Map<string, NormalizedClauseAnchorRow>();
  for (const row of normalizedRows) {
    const digest = computeRowDigest(row);
    if (!byDigest.has(digest)) byDigest.set(digest, row);
  }

  const existing = await prisma.complianceDocumentClauseAnchor.findMany({
    where: { documentVersionId: version.id },
    select: { rowDigest: true },
  });
  const existingDigests = new Set(existing.map((row) => row.rowDigest));

  if (byDigest.size === 0) {
    if (existingDigests.size > 0) {
      logInternal(deps, 'ingest drift: parsed no rows for a version that has provenance', {
        documentVersionId: version.id,
        existingRows: existingDigests.size,
      });
      return baseResult(version, {
        status: 'INGEST_DRIFT',
        code: 'INGEST_DRIFT',
        existingRows: existingDigests.size,
        warnings: boundedWarnings(parseWarnings),
      });
    }
    return baseResult(version, { status: 'NO_ROWS', warnings: boundedWarnings(parseWarnings) });
  }

  const identical =
    existingDigests.size === byDigest.size &&
    [...byDigest.keys()].every((digest) => existingDigests.has(digest));

  if (existingDigests.size > 0 && !identical) {
    logInternal(deps, 'ingest drift: existing provenance differs from the parsed row set', {
      documentVersionId: version.id,
      existingRows: existingDigests.size,
      parsedRows: byDigest.size,
    });
    return baseResult(version, {
      status: 'INGEST_DRIFT',
      code: 'INGEST_DRIFT',
      parsedRows: byDigest.size,
      existingRows: existingDigests.size,
      warnings: boundedWarnings(parseWarnings),
    });
  }

  if (identical) {
    return baseResult(version, {
      status: 'UNCHANGED',
      parsedRows: byDigest.size,
      existingRows: existingDigests.size,
      warnings: boundedWarnings(parseWarnings),
    });
  }

  const resolveLegalSourceVersionId = deps.resolveLegalSourceVersionId ?? (() => null);
  const data = [...byDigest.entries()].map(([rowDigest, row]) => ({
    documentVersionId: version.id,
    clauseRef: row.clauseRef,
    clauseTitle: row.clauseTitle,
    clauseStableId: row.clauseStableId,
    relationType: row.relationType,
    anchorType: row.anchorType,
    anchorDisplay: row.anchorDisplay,
    anchorStableId: row.anchorStableId,
    anchorKey: row.anchorKey,
    eli: row.eli,
    celex: row.celex,
    locator: row.locator,
    ecli: row.ecli,
    caseId: row.caseId,
    caseLocator: row.caseLocator,
    decisionId: row.decisionId,
    authorityLocator: row.authorityLocator,
    sourceUrl: row.sourceUrl,
    rationale: row.rationale,
    legalSourceVersionId: resolveLegalSourceVersionId(row),
    ingestWarnings: row.warnings,
    rowDigest,
  }));

  await prisma.complianceDocumentClauseAnchor.createMany({ data, skipDuplicates: true });

  const written = await prisma.complianceDocumentClauseAnchor.count({
    where: { documentVersionId: version.id },
  });
  if (written !== byDigest.size) {
    // A concurrent ingest of the same version won the race and wrote the same
    // row identity. Re-verify the full digest set before reporting anything.
    const reread = await prisma.complianceDocumentClauseAnchor.findMany({
      where: { documentVersionId: version.id },
      select: { rowDigest: true },
    });
    const rereadDigests = new Set(reread.map((row) => row.rowDigest));
    const stillIdentical =
      rereadDigests.size === byDigest.size &&
      [...byDigest.keys()].every((digest) => rereadDigests.has(digest));
    if (!stillIdentical) {
      logInternal(deps, 'ingest drift after concurrent write', {
        documentVersionId: version.id,
        existingRows: rereadDigests.size,
        parsedRows: byDigest.size,
      });
      return baseResult(version, {
        status: 'INGEST_DRIFT',
        code: 'INGEST_DRIFT',
        parsedRows: byDigest.size,
        existingRows: rereadDigests.size,
        warnings: boundedWarnings(parseWarnings),
      });
    }
    return baseResult(version, {
      status: 'UNCHANGED',
      parsedRows: byDigest.size,
      existingRows: rereadDigests.size,
      warnings: boundedWarnings(parseWarnings),
    });
  }

  logInternal(deps, 'ingested clause anchors', {
    documentVersionId: version.id,
    rows: byDigest.size,
    warnings: parseWarnings.length,
  });
  return baseResult(version, {
    status: 'CREATED',
    parsedRows: byDigest.size,
    insertedRows: byDigest.size,
    warnings: boundedWarnings(parseWarnings),
  });
}

/** True when the logical document is linked for internal analysis. */
export async function isInternalAnalysisDocument(
  documentId: string,
  prisma: Prisma = defaultPrisma,
): Promise<boolean> {
  const link = await prisma.complianceDocument.findFirst({
    where: { documentId, audience: INTERNAL_ANALYSIS_AUDIENCE },
    select: { id: true },
  });
  return Boolean(link);
}

async function loadCurrentVersion(
  documentId: string,
  prisma: Prisma,
): Promise<VersionContentSubject | null> {
  const version = await prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: [{ isCurrent: 'desc' }, { version: 'desc' }],
    select: { id: true, documentId: true, spItemId: true },
  });
  return version ?? null;
}

/**
 * Ingest the CURRENT version of an INTERNAL_ANALYSIS-linked document.
 *
 * Used both when a document becomes linked as INTERNAL_ANALYSIS and when a new
 * version is uploaded. A CLIENT_POLICY-only document is skipped: it never
 * triggers internal compliance metadata extraction.
 */
export async function ingestCurrentVersionForInternalAnalysisDocument(
  documentId: string,
  options: { buffer?: Buffer | null; deps?: IngestDeps; audienceConfirmedInternal?: boolean } = {},
): Promise<IngestResult> {
  const deps = options.deps ?? {};
  const prisma = deps.prisma ?? defaultPrisma;

  // The audience guard is the CLIENT_POLICY firewall: extraction runs only for a
  // document that is linked for internal analysis. Callers that have just created
  // that link may confirm the audience explicitly instead of re-reading it.
  if (!options.audienceConfirmedInternal && !(await isInternalAnalysisDocument(documentId, prisma))) {
    return baseResult(null, { status: 'SKIPPED_NOT_INTERNAL_ANALYSIS' });
  }

  const version = await loadCurrentVersion(documentId, prisma);
  if (!version) {
    return baseResult(null, { status: 'FAILED', code: 'NO_CURRENT_VERSION' });
  }

  const load = deps.loadVersionContent ?? defaultLoadVersionContent;
  let buffer = options.buffer ?? null;
  if (!buffer) {
    try {
      buffer = await load(version);
    } catch {
      buffer = null;
    }
  }
  if (!buffer) {
    logInternal(deps, 'version content unavailable', { documentVersionId: version.id });
    return baseResult(version, { status: 'FAILED', code: 'CONTENT_UNAVAILABLE' });
  }

  return ingestClauseAnchorsForVersion(version, buffer, deps);
}

/**
 * Fire-and-forget trigger used by the upload and linkage paths. It never throws
 * and never rejects, so it cannot fail an upload, a version creation or a
 * compliance linkage.
 */
export function scheduleInternalAnalysisIngestion(
  documentId: string,
  options: { buffer?: Buffer | null; deps?: IngestDeps; audienceConfirmedInternal?: boolean } = {},
): void {
  const deps = options.deps ?? {};
  Promise.resolve()
    .then(() => ingestCurrentVersionForInternalAnalysisDocument(documentId, options))
    .then((result) => {
      if (result.status !== 'CREATED' && result.status !== 'UNCHANGED' && result.status !== 'SKIPPED_NOT_INTERNAL_ANALYSIS') {
        logInternal(deps, 'ingestion finished without writes', {
          documentId,
          status: result.status,
          code: result.code ?? null,
        });
      }
      if (result.warnings.length) {
        logInternal(deps, 'ingestion warnings', { documentId, warnings: result.warnings.slice(0, 8) });
      }
    })
    .catch((error) => {
      logInternal(deps, 'ingestion crashed', {
        documentId,
        message: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
      });
    });
}

/* ------------------------------------------------------------------ */
/*  Internal queries — the persisted relations must be queryable.      */
/* ------------------------------------------------------------------ */

export async function listClauseAnchorsForVersion(
  documentVersionId: string,
  prisma: Prisma = defaultPrisma,
) {
  return prisma.complianceDocumentClauseAnchor.findMany({
    where: { documentVersionId },
    orderBy: [{ clauseRef: 'asc' }, { anchorKey: 'asc' }, { id: 'asc' }],
  });
}

export async function listClauseAnchorsForDocument(
  documentId: string,
  prisma: Prisma = defaultPrisma,
) {
  const versions = await prisma.documentVersion.findMany({
    where: { documentId },
    orderBy: { version: 'desc' },
    select: { id: true, version: true, isCurrent: true },
  });
  const versionIds = versions.map((version) => version.id);
  const rows = versionIds.length
    ? await prisma.complianceDocumentClauseAnchor.findMany({
        where: { documentVersionId: { in: versionIds } },
        orderBy: [{ clauseRef: 'asc' }, { anchorKey: 'asc' }, { id: 'asc' }],
      })
    : [];
  return {
    documentId,
    versions: versions.map((version) => ({
      documentVersionId: version.id,
      version: version.version,
      isCurrent: version.isCurrent,
      rows: rows.filter((row) => row.documentVersionId === version.id),
    })),
  };
}

/**
 * Future monitoring hook: find every document version / clause affected by an
 * anchor key. No monitoring is implemented in this slice.
 */
export async function findClauseAnchorsByAnchorKey(
  anchorKey: string,
  prisma: Prisma = defaultPrisma,
) {
  return prisma.complianceDocumentClauseAnchor.findMany({
    where: { anchorKey },
    orderBy: [{ documentVersionId: 'asc' }, { clauseRef: 'asc' }],
  });
}

/**
 * Client-scoped variant used by the internal read surface: references are
 * restricted to documents of the given client before anything is returned.
 */
export async function findClauseAnchorReferencesByAnchorKey(
  anchorKey: string,
  clientId: string,
  prisma: Prisma = defaultPrisma,
) {
  const rows = await prisma.complianceDocumentClauseAnchor.findMany({
    where: { anchorKey, documentVersion: { document: { clientId } } },
    orderBy: [{ documentVersionId: 'asc' }, { clauseRef: 'asc' }],
    select: {
      documentVersionId: true,
      clauseRef: true,
      clauseTitle: true,
      anchorType: true,
      relationType: true,
      documentVersion: { select: { documentId: true } },
    },
  });
  return rows.map((row) => ({
    documentVersionId: row.documentVersionId,
    documentId: row.documentVersion.documentId,
    clauseRef: row.clauseRef,
    clauseTitle: row.clauseTitle,
    anchorType: row.anchorType,
    relationType: row.relationType,
  }));
}

export async function summarizeClauseAnchorsForDocument(
  documentId: string,
  prisma: Prisma = defaultPrisma,
) {
  const result = await listClauseAnchorsForDocument(documentId, prisma);
  const allRows = result.versions.flatMap((version) => version.rows);
  return {
    documentId,
    versions: result.versions.map((version) => ({
      documentVersionId: version.documentVersionId,
      version: version.version,
      isCurrent: version.isCurrent,
      rows: version.rows.length,
      unresolvedAnchorKeys: version.rows.filter((row) => !row.anchorKey).length,
      byAnchorType: {
        LEGAL: version.rows.filter((row) => row.anchorType === 'LEGAL').length,
        CASE: version.rows.filter((row) => row.anchorType === 'CASE').length,
        AUTHORITY: version.rows.filter((row) => row.anchorType === 'AUTHORITY').length,
      },
    })),
    totals: {
      rows: allRows.length,
      distinctAnchorKeys: new Set(allRows.map((row) => row.anchorKey).filter(Boolean)).size,
      unresolvedAnchorKeys: allRows.filter((row) => !row.anchorKey).length,
    },
  };
}
