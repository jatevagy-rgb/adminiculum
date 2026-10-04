/**
 * BE_COMP_006 — durable INTERNAL_ANALYSIS processing.
 *
 * The CDI ingestion trigger used to be a fire-and-forget in-process Promise:
 * upload/link success could outlive the process, so a restart lost PENDING work
 * and "upload success" was indistinguishable from "analysis success".
 *
 * This module adds the smallest additive persistence for that gap:
 * - One ComplianceAnalysisJob row per EXACT DocumentVersion that was eligible
 *   for INTERNAL_ANALYSIS extraction. Upload/link state stays separate: the
 *   DocumentVersion + ComplianceDocument rows are the upload/link truth, and
 *   this job row is the ANALYSIS truth.
 * - Durable PENDING -> RUNNING -> SUCCEEDED/FAILED state machine. Enqueue never
 *   fails an upload or a linkage (same non-fatal contract as before).
 * - Restart recovery: PENDING jobs and stale RUNNING jobs (expired lease) are
 *   reclaimed by the startup sweep, which re-loads the DOCX from the version's
 *   SharePoint reference — the source file is never re-uploaded.
 * - Retry idempotency: a retry re-runs the SAME version through the existing
 *   digest-idempotent ingest ((documentVersionId, rowDigest) unique), so no
 *   duplicate anchors/facts are produced.
 * - One effective processor: the PENDING -> RUNNING transition is an atomic
 *   conditional updateMany; exactly one caller sees count 1.
 * - Mandatory scan gate: a version whose securityScanStatus is not CLEAN fails
 *   with SCAN_GATE_BLOCKED and is re-enqueued when the scan later clears.
 * - No automatic legal acceptance, finding resolution, publication or customer
 *   disclosure: this pipeline only writes the existing derived
 *   ComplianceDocumentClauseAnchor rows.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { driveService } from '../sharepoint';
import { InteractionError } from '../client-interaction/base';
import {
  ingestClauseAnchorsForVersion,
  isInternalAnalysisDocument,
  type IngestDeps,
  type VersionContentSubject,
} from './service';
import type { IngestStatus } from './types';

type Prisma = typeof defaultPrisma;

export type ComplianceAnalysisJobStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

/** How long a RUNNING claim stays exclusive before another processor may reclaim it. */
export const DEFAULT_ANALYSIS_LEASE_MS = 15 * 60 * 1000;

/** Bounded startup sweep: never processes more than this many jobs per boot. */
export const RECOVERY_SWEEP_LIMIT = 20;

export const SCAN_GATE_BLOCKED_CODE = 'SCAN_GATE_BLOCKED';
export const VERSION_GONE_CODE = 'VERSION_GONE';
export const CONTENT_UNAVAILABLE_CODE = 'CONTENT_UNAVAILABLE';
export const INGEST_DRIFT_CODE = 'INGEST_DRIFT';
export const INTERNAL_PROCESSING_ERROR_CODE = 'INTERNAL_PROCESSING_ERROR';

const MAX_ERROR_DETAIL_LENGTH = 300;

export interface AnalysisJobDeps {
  prisma?: Prisma;
  /** Resolve the DOCX bytes of a version. Defaults to the SharePoint storage. */
  loadVersionContent?: (version: VersionContentSubject) => Promise<Buffer | null>;
  log?: (message: string, detail?: Record<string, unknown>) => void;
  leaseMs?: number;
}

export interface AnalysisJobView {
  id: string;
  documentId: string;
  documentVersionId: string;
  status: ComplianceAnalysisJobStatus;
  attemptCount: number;
  lastIngestStatus: string | null;
  lastErrorCode: string | null;
  lastErrorDetail: string | null;
  enqueuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  leaseExpiresAt: string | null;
}

export type EnqueueAnalysisOutcome =
  | { jobId: string; created: boolean; status: 'ENQUEUED' | 'ALREADY_EXISTS' }
  | { jobId: null; status: 'SKIPPED_NOT_INTERNAL_ANALYSIS' | 'NO_CURRENT_VERSION' };

export interface ProcessAnalysisOutcome {
  jobId: string;
  /** False when another processor owns the job (or it is already terminal). */
  claimed: boolean;
  jobStatus?: ComplianceAnalysisJobStatus;
  ingestStatus?: IngestStatus;
  code?: string;
}

export interface RecoveryResult {
  recovered: number;
  pending: number;
  staleRunning: number;
}

export type RetryAnalysisOutcome =
  | { status: 'ENQUEUED'; job: AnalysisJobView }
  | { status: 'ALREADY_SUCCEEDED'; job: AnalysisJobView }
  | { status: 'ALREADY_PENDING' | 'ALREADY_RUNNING'; job: AnalysisJobView }
  | { status: 'SKIPPED_NOT_INTERNAL_ANALYSIS' }
  | { status: 'NO_CURRENT_VERSION' };

const JOB_VIEW_SELECT = {
  id: true,
  documentId: true,
  documentVersionId: true,
  status: true,
  attemptCount: true,
  lastIngestStatus: true,
  lastErrorCode: true,
  lastErrorDetail: true,
  enqueuedAt: true,
  startedAt: true,
  finishedAt: true,
  leaseExpiresAt: true,
} as const;

function logInternal(deps: AnalysisJobDeps, message: string, detail?: Record<string, unknown>): void {
  if (deps.log) {
    deps.log(message, detail);
    return;
  }
  console.warn(`[cdi-analysis-job] ${message}`, detail ? JSON.stringify(detail) : '');
}

/** Bounded, content-free failure detail. Never library text beyond the cap. */
function boundedErrorDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const compact = message.replace(/\s+/g, ' ').trim();
  return compact.slice(0, MAX_ERROR_DETAIL_LENGTH);
}

async function defaultLoadVersionContent(version: VersionContentSubject): Promise<Buffer | null> {
  if (!version.spItemId) return null;
  return driveService.downloadDocument(version.spItemId);
}

type JobRow = {
  id: string;
  documentId: string;
  documentVersionId: string;
  status: ComplianceAnalysisJobStatus;
  attemptCount: number;
  lastIngestStatus: string | null;
  lastErrorCode: string | null;
  lastErrorDetail: string | null;
  enqueuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  leaseExpiresAt: Date | null;
};

function toView(row: JobRow): AnalysisJobView {
  return {
    id: row.id,
    documentId: row.documentId,
    documentVersionId: row.documentVersionId,
    status: row.status,
    attemptCount: row.attemptCount,
    lastIngestStatus: row.lastIngestStatus,
    lastErrorCode: row.lastErrorCode,
    lastErrorDetail: row.lastErrorDetail,
    enqueuedAt: row.enqueuedAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    leaseExpiresAt: row.leaseExpiresAt ? row.leaseExpiresAt.toISOString() : null,
  };
}

/**
 * Create a PENDING job for one exact DocumentVersion, or return the existing
 * job when one already exists. The unique index on documentVersionId makes a
 * duplicate enqueue impossible even under a concurrent race (P2002 → read).
 */
export async function ensureAnalysisJobForVersion(
  documentVersionId: string,
  documentId: string,
  deps: AnalysisJobDeps = {},
): Promise<{ id: string; created: boolean }> {
  const prisma = deps.prisma ?? defaultPrisma;
  const existing = await prisma.complianceAnalysisJob.findUnique({
    where: { documentVersionId },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };
  try {
    const created = await prisma.complianceAnalysisJob.create({
      data: { documentId, documentVersionId },
      select: { id: true },
    });
    return { id: created.id, created: true };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'P2002') {
      const raced = await prisma.complianceAnalysisJob.findUnique({
        where: { documentVersionId },
        select: { id: true },
      });
      if (raced) return { id: raced.id, created: false };
    }
    throw error;
  }
}

/**
 * Enqueue an analysis job for the CURRENT version of a document.
 *
 * - Never throws to the caller that uses it for upload/linkage scheduling.
 * - CLIENT_POLICY-only documents enqueue nothing (and never load content).
 * - The exact version identity is pinned here; a later upload of a new version
 *   produces its own job and can never redirect this one.
 */
export async function enqueueAnalysisJobForCurrentVersion(
  documentId: string,
  options: { audienceConfirmedInternal?: boolean } = {},
  deps: AnalysisJobDeps = {},
): Promise<EnqueueAnalysisOutcome> {
  const prisma = deps.prisma ?? defaultPrisma;
  if (!options.audienceConfirmedInternal && !(await isInternalAnalysisDocument(documentId, prisma))) {
    return { jobId: null, status: 'SKIPPED_NOT_INTERNAL_ANALYSIS' };
  }
  const version = await prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: [{ isCurrent: 'desc' }, { version: 'desc' }],
    select: { id: true },
  });
  if (!version) return { jobId: null, status: 'NO_CURRENT_VERSION' };
  const job = await ensureAnalysisJobForVersion(version.id, documentId, deps);
  return { jobId: job.id, created: job.created, status: job.created ? 'ENQUEUED' : 'ALREADY_EXISTS' };
}

/**
 * Atomic claim: PENDING -> RUNNING, or a stale RUNNING row whose lease expired.
 * Exactly one concurrent caller observes count 1 — that caller is the one
 * effective processor.
 */
export async function claimAnalysisJob(
  jobId: string,
  deps: AnalysisJobDeps = {},
): Promise<{ id: string; documentId: string; documentVersionId: string; attemptCount: number } | null> {
  const prisma = deps.prisma ?? defaultPrisma;
  const now = new Date();
  const leaseMs = deps.leaseMs ?? DEFAULT_ANALYSIS_LEASE_MS;
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const claimed = await prisma.complianceAnalysisJob.updateMany({
    where: {
      id: jobId,
      OR: [{ status: 'PENDING' }, { status: 'RUNNING', leaseExpiresAt: { lt: now } }],
    },
    data: {
      status: 'RUNNING',
      lockedAt: now,
      leaseExpiresAt,
      startedAt: now,
      attemptCount: { increment: 1 },
    },
  });
  if (claimed.count !== 1) return null;
  const row = await prisma.complianceAnalysisJob.findUnique({
    where: { id: jobId },
    select: { id: true, documentId: true, documentVersionId: true, attemptCount: true },
  });
  return row
    ? { id: row.id, documentId: row.documentId, documentVersionId: row.documentVersionId, attemptCount: row.attemptCount }
    : null;
}

/**
 * Process one claimed job to a terminal state. Never throws.
 *
 * Gates, in order:
 * 1. Exact version identity — the version recorded at enqueue, never "current".
 * 2. Audience — the document must still be INTERNAL_ANALYSIS linked.
 * 3. Scan gate — securityScanStatus must be CLEAN, otherwise FAILED
 *    SCAN_GATE_BLOCKED (resumable when the scan clears).
 * 4. Content — from the in-memory buffer of the triggering request when
 *    available (immediate processing), otherwise re-loaded from SharePoint so a
 *    restart recovery never needs a re-upload.
 * 5. Digest-idempotent ingest — duplicate protection is the existing
 *    (documentVersionId, rowDigest) identity.
 */
export async function processAnalysisJob(
  jobId: string,
  options: { buffer?: Buffer | null } = {},
  deps: AnalysisJobDeps = {},
): Promise<ProcessAnalysisOutcome> {
  const prisma = deps.prisma ?? defaultPrisma;
  const claimed = await claimAnalysisJob(jobId, deps);
  if (!claimed) return { jobId, claimed: false };

  const finish = async (
    status: 'SUCCEEDED' | 'FAILED',
    fields: { lastIngestStatus?: string | null; lastErrorCode?: string | null; lastErrorDetail?: string | null },
  ): Promise<ProcessAnalysisOutcome> => {
    const updated = await prisma.complianceAnalysisJob.update({
      where: { id: jobId },
      data: {
        status,
        finishedAt: new Date(),
        leaseExpiresAt: null,
        lastIngestStatus: fields.lastIngestStatus ?? null,
        lastErrorCode: fields.lastErrorCode ?? null,
        lastErrorDetail: fields.lastErrorDetail ?? null,
      },
      select: JOB_VIEW_SELECT,
    });
    logInternal(deps, 'analysis job finished', {
      jobId,
      status,
      lastIngestStatus: updated.lastIngestStatus,
      lastErrorCode: updated.lastErrorCode,
    });
    return {
      jobId,
      claimed: true,
      jobStatus: status,
      ingestStatus: (updated.lastIngestStatus as IngestStatus | undefined) ?? undefined,
      code: updated.lastErrorCode ?? undefined,
    };
  };

  try {
    const version = await prisma.documentVersion.findUnique({
      where: { id: claimed.documentVersionId },
      select: { id: true, documentId: true, spItemId: true, securityScanStatus: true },
    });
    if (!version) {
      return finish('FAILED', { lastErrorCode: VERSION_GONE_CODE, lastErrorDetail: 'The version recorded at enqueue no longer exists.' });
    }

    // The audience is re-verified at processing time (not trusted from the
    // enqueue): an unlinked document is no longer eligible for extraction.
    if (!(await isInternalAnalysisDocument(claimed.documentId, prisma))) {
      return finish('SUCCEEDED', { lastIngestStatus: 'SKIPPED_NOT_INTERNAL_ANALYSIS' });
    }

    // Mandatory scan/quarantine gate: only a CLEAN version is ever parsed.
    if (version.securityScanStatus !== 'CLEAN') {
      return finish('FAILED', {
        lastErrorCode: SCAN_GATE_BLOCKED_CODE,
        lastErrorDetail: `securityScanStatus=${version.securityScanStatus}`,
      });
    }

    const subject: VersionContentSubject = { id: version.id, documentId: version.documentId, spItemId: version.spItemId };
    const load = deps.loadVersionContent ?? defaultLoadVersionContent;
    let buffer = options.buffer ?? null;
    if (!buffer) {
      try {
        buffer = await load(subject);
      } catch {
        buffer = null;
      }
    }
    if (!buffer) {
      return finish('FAILED', { lastErrorCode: CONTENT_UNAVAILABLE_CODE, lastErrorDetail: 'Version content could not be loaded from storage.' });
    }

    const result = await ingestClauseAnchorsForVersion(subject, buffer, deps);

    if (
      result.status === 'CREATED' ||
      result.status === 'UNCHANGED' ||
      result.status === 'NO_ROWS' ||
      result.status === 'SKIPPED_NOT_INTERNAL_ANALYSIS'
    ) {
      return finish('SUCCEEDED', { lastIngestStatus: result.status, lastErrorCode: result.code ?? null });
    }

    // INGEST_DRIFT and FAILED are terminal failures that a human inspects: the
    // provenance row set disagrees with the parsed rows, or the parse failed.
    return finish('FAILED', {
      lastIngestStatus: result.status,
      lastErrorCode: result.code ?? INGEST_DRIFT_CODE,
    });
  } catch (error) {
    return finish('FAILED', {
      lastErrorCode: INTERNAL_PROCESSING_ERROR_CODE,
      lastErrorDetail: boundedErrorDetail(error),
    });
  }
}

/**
 * Fire-and-forget processing kick. Never throws, never rejects.
 */
export function kickAnalysisJobProcessing(
  jobId: string,
  options: { buffer?: Buffer | null } = {},
  deps: AnalysisJobDeps = {},
): void {
  Promise.resolve()
    .then(() => processAnalysisJob(jobId, options, deps))
    .catch((error) => {
      logInternal(deps, 'analysis processing crashed', {
        jobId,
        message: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
      });
    });
}

/**
 * Startup recovery sweep: process PENDING jobs and reclaim stale RUNNING jobs
 * whose lease expired (a process died mid-processing). Bounded per sweep.
 */
export async function recoverPendingAnalysisJobs(
  deps: AnalysisJobDeps = {},
  limit: number = RECOVERY_SWEEP_LIMIT,
): Promise<RecoveryResult> {
  const prisma = deps.prisma ?? defaultPrisma;
  const now = new Date();
  const pending = await prisma.complianceAnalysisJob.findMany({
    where: { status: 'PENDING' },
    orderBy: { enqueuedAt: 'asc' },
    take: limit,
    select: { id: true },
  });
  const staleRunning = pending.length < limit
    ? await prisma.complianceAnalysisJob.findMany({
        where: { status: 'RUNNING', leaseExpiresAt: { lt: now } },
        orderBy: { enqueuedAt: 'asc' },
        take: limit - pending.length,
        select: { id: true },
      })
    : [];

  const seen = new Set<string>();
  const jobs: string[] = [];
  for (const row of [...pending, ...staleRunning]) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      jobs.push(row.id);
    }
  }

  let processed = 0;
  for (const jobId of jobs) {
    const outcome = await processAnalysisJob(jobId, {}, deps);
    if (outcome.claimed) processed += 1;
  }

  return { recovered: processed, pending: pending.length, staleRunning: staleRunning.length };
}

async function assertDocumentOwnedByClient(
  documentId: string,
  clientId: string,
  prisma: Prisma,
): Promise<void> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, clientId },
    select: { id: true },
  });
  if (!document) {
    throw new InteractionError(
      404,
      'COMPLIANCE_ANALYSIS_DOCUMENT_NOT_FOUND',
      'Document not found for this client.',
    );
  }
}

/**
 * Retry the analysis of a document's current-version job.
 *
 * - SUCCEEDED is idempotent: nothing is re-processed.
 * - PENDING/RUNNING return the current state (concurrent retries stay safe).
 * - FAILED is atomically flipped back to PENDING; the claim guarantees exactly
 *   one effective processor afterwards.
 * - Without any job, one is enqueued for the current version (covers documents
 *   whose original schedule predated durable jobs).
 */
export async function retryAnalysisForDocument(
  documentId: string,
  clientId: string,
  deps: AnalysisJobDeps = {},
): Promise<RetryAnalysisOutcome> {
  const prisma = deps.prisma ?? defaultPrisma;
  await assertDocumentOwnedByClient(documentId, clientId, prisma);

  const job = await prisma.complianceAnalysisJob.findFirst({
    where: { documentId },
    orderBy: { enqueuedAt: 'desc' },
    select: JOB_VIEW_SELECT,
  });
  if (!job) {
    const enqueued = await enqueueAnalysisJobForCurrentVersion(documentId, {}, deps);
    if (enqueued.status === 'SKIPPED_NOT_INTERNAL_ANALYSIS' || enqueued.status === 'NO_CURRENT_VERSION') {
      return { status: enqueued.status };
    }
    kickAnalysisJobProcessing(enqueued.jobId, {}, deps);
    const created = await prisma.complianceAnalysisJob.findUnique({ where: { id: enqueued.jobId }, select: JOB_VIEW_SELECT });
    if (!created) return { status: 'NO_CURRENT_VERSION' };
    return { status: 'ENQUEUED', job: toView(created as JobRow) };
  }

  if (job.status === 'SUCCEEDED') return { status: 'ALREADY_SUCCEEDED', job: toView(job) };
  if (job.status === 'RUNNING') return { status: 'ALREADY_RUNNING', job: toView(job) };
  if (job.status === 'PENDING') return { status: 'ALREADY_PENDING', job: toView(job) };

  // FAILED -> PENDING, atomically: a concurrent retry sees the flipped row and
  // returns ALREADY_PENDING instead of double-flipping.
  const flipped = await prisma.complianceAnalysisJob.updateMany({
    where: { id: job.id, status: 'FAILED' },
    data: { status: 'PENDING', lastErrorCode: null, lastErrorDetail: null, finishedAt: null, leaseExpiresAt: null },
  });
  if (flipped.count !== 1) {
    const current = await prisma.complianceAnalysisJob.findUnique({ where: { id: job.id }, select: JOB_VIEW_SELECT });
    if (!current) {
      const enqueued = await enqueueAnalysisJobForCurrentVersion(documentId, {}, deps);
      if (enqueued.status === 'SKIPPED_NOT_INTERNAL_ANALYSIS' || enqueued.status === 'NO_CURRENT_VERSION') {
        return { status: enqueued.status };
      }
      kickAnalysisJobProcessing(enqueued.jobId, {}, deps);
      const recreated = await prisma.complianceAnalysisJob.findUnique({ where: { id: enqueued.jobId }, select: JOB_VIEW_SELECT });
      if (!recreated) return { status: 'NO_CURRENT_VERSION' };
      return { status: 'ENQUEUED', job: toView(recreated as JobRow) };
    }
    if (current.status === 'SUCCEEDED') return { status: 'ALREADY_SUCCEEDED', job: toView(current) };
    if (current.status === 'RUNNING') return { status: 'ALREADY_RUNNING', job: toView(current) };
    if (current.status === 'PENDING') return { status: 'ALREADY_PENDING', job: toView(current) };
    return { status: 'ENQUEUED', job: toView(current as JobRow) };
  }

  kickAnalysisJobProcessing(job.id, {}, deps);
  const reverted = await prisma.complianceAnalysisJob.findUnique({ where: { id: job.id }, select: JOB_VIEW_SELECT });
  return { status: 'ENQUEUED', job: toView(reverted as JobRow) };
}

/**
 * List analysis jobs for one document (latest enqueue first). Read-only.
 */
export async function listAnalysisJobsForDocument(
  documentId: string,
  clientId: string,
  deps: AnalysisJobDeps = {},
): Promise<AnalysisJobView[]> {
  const prisma = deps.prisma ?? defaultPrisma;
  await assertDocumentOwnedByClient(documentId, clientId, prisma);
  const rows = await prisma.complianceAnalysisJob.findMany({
    where: { documentId },
    orderBy: { enqueuedAt: 'desc' },
    select: JOB_VIEW_SELECT,
  });
  return rows.map((row) => toView(row as JobRow));
}

/**
 * Resume jobs that failed on the mandatory scan gate once the version's scan
 * has reached CLEAN. Called from the canonical scan completion path.
 */
export async function resumeAnalysisJobsBlockedByScan(
  versionId: string,
  deps: AnalysisJobDeps = {},
): Promise<number> {
  const prisma = deps.prisma ?? defaultPrisma;
  const blocked = await prisma.complianceAnalysisJob.findMany({
    where: { documentVersionId: versionId, status: 'FAILED', lastErrorCode: SCAN_GATE_BLOCKED_CODE },
    select: { id: true },
  });
  let resumed = 0;
  for (const row of blocked) {
    const flipped = await prisma.complianceAnalysisJob.updateMany({
      where: { id: row.id, status: 'FAILED', lastErrorCode: SCAN_GATE_BLOCKED_CODE },
      data: { status: 'PENDING', lastErrorCode: null, lastErrorDetail: null, finishedAt: null, leaseExpiresAt: null },
    });
    if (flipped.count === 1) {
      resumed += 1;
      kickAnalysisJobProcessing(row.id, {}, deps);
    }
  }
  return resumed;
}
