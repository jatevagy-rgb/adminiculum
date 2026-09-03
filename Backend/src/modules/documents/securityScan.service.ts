import { prisma } from '../../prisma/prisma.service';
import { getScanner } from '../upload-security/scannerAdapter';

export type DocumentSecurityScanStatus = 'PENDING_SCAN' | 'CLEAN' | 'SCAN_FAILED' | 'INFECTED';

export function securityScanBlock(status: DocumentSecurityScanStatus) {
  return status === 'CLEAN' ? null : {
    error: 'A dokumentum biztonsági ellenőrzése még nem engedélyezi a tartalom megnyitását.',
    code: 'DOCUMENT_SECURITY_SCAN_BLOCKED',
    status: 409,
  };
}

export async function scanDocumentVersionInBackground(versionId: string, buffer: Buffer): Promise<void> {
  let status: DocumentSecurityScanStatus = 'SCAN_FAILED';
  try {
    const result = await getScanner().scan({
      buffer,
      detectedMimeType: null,
      sizeBytes: buffer.length,
      fileName: 'document',
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
