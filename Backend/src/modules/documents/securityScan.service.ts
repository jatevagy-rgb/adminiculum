import { prisma } from '../../prisma/prisma.service';
import { getScanner } from '../upload-security/scannerAdapter';
import { validateWorkforceUpload } from '../upload-security/uploadValidationCore';
import { resumeAnalysisJobsBlockedByScan } from '../compliance-doc-intelligence/analysisJobService';
import { withScanClaim } from './scanClaim';

export type DocumentSecurityScanStatus = 'PENDING_SCAN' | 'CLEAN' | 'SCAN_FAILED' | 'INFECTED';

/**
 * Canonical fail-closed security gate. Only an explicit 'CLEAN' verdict may
 * pass; every other value — including PENDING_SCAN, SCAN_FAILED, INFECTED, or
 * a missing/unknown status (null/undefined) — is blocked. Callers MUST NOT
 * coerce a missing status to 'CLEAN' before calling this primitive.
 */
export function securityScanBlock(status: DocumentSecurityScanStatus | string | null | undefined) {
  return status === 'CLEAN' ? null : {
    error: 'A dokumentum biztonsági ellenőrzése még nem engedélyezi a tartalom megnyitását.',
    code: 'DOCUMENT_SECURITY_SCAN_BLOCKED',
    status: 409,
  };
}

export function scanDocumentVersionInBackground(versionId: string, buffer: Buffer, fileName = 'document', mimeType: string | null = null): Promise<void> {
  return runScan(versionId, buffer, fileName, mimeType);
}

async function runScan(versionId: string, buffer: Buffer, fileName: string, mimeType: string | null): Promise<void> {
  // Cross-process claim: only one effective scan may run per version at a time
  // across all backend processes. A concurrent worker (another process, or a
  // same-process retry) that cannot acquire the claim MUST NOT run a competing
  // scanner call or mutate durable state — this removes the "temporary CLEAN
  // then later INFECTED" exposure window.
  const claimed = await withScanClaim(versionId, async () => {
    let status: DocumentSecurityScanStatus = 'SCAN_FAILED';
    try {
      const result = await getScanner().scan({
        buffer,
        detectedMimeType: mimeType,
        sizeBytes: buffer.length,
        fileName,
      });
      status = result.outcome === 'CLEAN' ? 'CLEAN' : result.outcome === 'INFECTED' ? 'INFECTED' : 'SCAN_FAILED';
    } catch {
      status = 'SCAN_FAILED';
    }
    // Monotonic verdict: INFECTED > CLEAN > SCAN_FAILED > PENDING_SCAN. A scan
    // may only move the stored status FORWARD, never backward. INFECTED is the
    // strongest and may overwrite PENDING, SCAN_FAILED, or even a CLEAN that a
    // concurrent scan committed first — so INFECTED can never lose to CLEAN.
    // CLEAN and SCAN_FAILED may only be established FROM PENDING_SCAN.
    const transitioned = await prisma.documentVersion.updateMany({
      where: {
        id: versionId,
        securityScanStatus: status === 'INFECTED'
          ? { in: ['PENDING_SCAN', 'CLEAN', 'SCAN_FAILED'] }
          : 'PENDING_SCAN',
      },
      data: { securityScanStatus: status },
    });
    // BE_COMP_006: a CLEAN verdict unblocks durable INTERNAL_ANALYSIS jobs that
    // failed on the mandatory scan gate. Only resume when this run actually
    // established CLEAN (transitioned from PENDING), never on a no-op.
    if (status === 'CLEAN' && transitioned.count > 0) {
      try {
        const resumed = await resumeAnalysisJobsBlockedByScan(versionId);
        if (resumed > 0) console.log(`[Scan] resumed ${resumed} internal analysis job(s) for version ${versionId}`);
      } catch (error) {
        console.error(`[Scan] internal analysis resume failed for version ${versionId}:`, error);
      }
    }
  });

  if (!claimed.acquired) {
    // Another process already owns this exact version's scan. Never run a
    // competing scanner call, never reset status, never launch competing work.
    // The durable row stays PENDING_SCAN (blocked) or its prior terminal state.
    console.warn('[upload-security/scan] scan skipped (claim already held)', { code: 'SCAN_ALREADY_IN_PROGRESS' });
  }
}

export function queueDocumentVersionScan(versionId: string, buffer: Buffer): void {
  void scanDocumentVersionInBackground(versionId, buffer).catch((error) => {
    // Fire-and-forget failure leaves the row PENDING_SCAN (fail-closed) and now
    // recoverable via the explicit retry path. Log only a stable, non-sensitive
    // code — never file name/content, scanner URL, key, or response body.
    console.warn('[upload-security/scan] background scan did not persist a terminal verdict', {
      code: error instanceof Error ? error.name : 'UNKNOWN',
    });
  });
}

export async function retryDocumentVersionScan(versionId: string): Promise<boolean> {
  const version = await prisma.documentVersion.findUnique({
    where: { id: versionId },
    select: { id: true, originalFileName: true, mimeType: true, storageReference: true, securityScanStatus: true },
  });
  if (!version || !version.storageReference) return false;
  // Recovery is valid for both SCAN_FAILED (existing retry) and a stale
  // PENDING_SCAN (a process died after durable persistence but before the queued
  // scan produced/persisted a verdict). A trustworthy terminal CLEAN/INFECTED is
  // never resettable.
  if (version.securityScanStatus !== 'SCAN_FAILED' && version.securityScanStatus !== 'PENDING_SCAN') {
    return false;
  }

  // Rescan the EXACT stored bytes — never another version, never latest.
  const content = await (await import('../sharepoint/driveService.js')).default.downloadDocument(version.storageReference);
  if (!content) return false;
  const local = await validateWorkforceUpload({
    buffer: content,
    originalFileName: version.originalFileName || 'document',
    declaredMimeType: version.mimeType,
    inspectArchiveContent: true,
    scan: false,
  });
  if (!local.ok) return false;

  // Reset to PENDING only if the row is still in a recoverable state. A
  // concurrent scan that already established a terminal verdict (INFECTED/CLEAN)
  // must never be weakened by this recovery attempt.
  const reset = await prisma.documentVersion.updateMany({
    where: { id: versionId, securityScanStatus: { in: ['SCAN_FAILED', 'PENDING_SCAN'] } },
    data: { securityScanStatus: 'PENDING_SCAN' },
  });
  if (reset.count === 0) return false;

  void scanDocumentVersionInBackground(versionId, content, version.originalFileName || 'document', version.mimeType).catch((error) => {
    console.warn('[upload-security/scan] recovery scan did not persist a terminal verdict', {
      code: error instanceof Error ? error.name : 'UNKNOWN',
    });
  });
  return true;
}
