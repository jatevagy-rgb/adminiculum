import { prisma } from '../../prisma/prisma.service';
import { getScanner } from '../upload-security/scannerAdapter';
import { validateWorkforceUpload } from '../upload-security/uploadValidationCore';

export type DocumentSecurityScanStatus = 'PENDING_SCAN' | 'CLEAN' | 'SCAN_FAILED' | 'INFECTED';

export function securityScanBlock(status: DocumentSecurityScanStatus) {
  return status === 'CLEAN' ? null : {
    error: 'A dokumentum biztonsági ellenőrzése még nem engedélyezi a tartalom megnyitását.',
    code: 'DOCUMENT_SECURITY_SCAN_BLOCKED',
    status: 409,
  };
}

export async function scanDocumentVersionInBackground(versionId: string, buffer: Buffer, fileName = 'document', mimeType: string | null = null): Promise<void> {
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
  await prisma.documentVersion.update({ where: { id: versionId }, data: { securityScanStatus: status } });
}

export function queueDocumentVersionScan(versionId: string, buffer: Buffer): void {
  void scanDocumentVersionInBackground(versionId, buffer).catch(() => undefined);
}

export async function retryDocumentVersionScan(versionId: string): Promise<boolean> {
  const version = await prisma.documentVersion.findUnique({
    where: { id: versionId },
    select: { id: true, originalFileName: true, mimeType: true, storageReference: true, securityScanStatus: true },
  });
  if (!version || version.securityScanStatus !== 'SCAN_FAILED' || !version.storageReference) return false;

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

  await prisma.documentVersion.update({ where: { id: versionId }, data: { securityScanStatus: 'PENDING_SCAN' } });
  void scanDocumentVersionInBackground(versionId, content, version.originalFileName || 'document', version.mimeType).catch(() => undefined);
  return true;
}
