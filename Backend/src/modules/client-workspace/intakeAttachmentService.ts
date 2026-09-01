import crypto from 'crypto';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InteractionError, safeText } from '../client-interaction/base';
import { requireCapability } from '../client-interaction/gates';
import { DEFAULT_MAX_FILE_BYTES, validateUploadFile } from '../client-interaction/fileValidation';
import { getQuarantineStore, QuarantineError } from '../client-interaction/quarantineAdapter';
import { getScanner } from '../upload-security/scannerAdapter';
import { loadOwnedIntake } from './intakePolicy';

type Prisma = typeof defaultPrisma;

function customerState(status: string): string {
  if (status === 'CLEAN') return 'ready-for-review';
  if (status === 'INFECTED' || status === 'UNSUPPORTED' || status === 'REJECTED') return 'not-accepted';
  return 'processing-unavailable';
}

export async function addIntakeAttachment(
  identityId: string,
  workspaceId: string,
  intakeId: string,
  input: { originalFileName?: unknown; declaredMimeType?: unknown; base64?: unknown },
  prisma: Prisma = defaultPrisma,
) {
  requireCapability('DOCUMENT_UPLOADS');
  const owned = await loadOwnedIntake(identityId, workspaceId, intakeId, prisma);
  if (String(owned.intake.status) !== 'DRAFT') throw new InteractionError(409, 'INTAKE_ATTACHMENT_NOT_EDITABLE', 'Attachments can only be added to a draft intake.');
  const originalFileName = safeText(input.originalFileName, 'originalFileName', 260, true)!;
  const buffer = Buffer.from(String(input.base64 || ''), 'base64');
  const validation = validateUploadFile({ buffer, declaredMimeType: input.declaredMimeType ? String(input.declaredMimeType) : null, originalFileName, maxFileBytes: DEFAULT_MAX_FILE_BYTES });
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

  if (!validation.ok) {
    const row = await prisma.clientPortalIntakeAttachment.create({ data: {
      intakeRequestId: intakeId,
      originalFileNameSafe: originalFileName,
      declaredMimeType: input.declaredMimeType ? String(input.declaredMimeType).slice(0, 120) : null,
      detectedMimeType: validation.detectedMimeType,
      sizeBytes: validation.sizeBytes,
      checksum,
      status: validation.codeSafe === 'UNSAFE_CONTENT' || validation.codeSafe === 'UNSUPPORTED_TYPE' || validation.codeSafe === 'EXTENSION_MISMATCH' ? 'UNSUPPORTED' : 'REJECTED',
      scanCodeSafe: validation.codeSafe,
      uploadedAt: new Date(),
    } });
    return { reference: row.id, fileName: row.originalFileNameSafe, state: customerState(String(row.status)) };
  }

  let quarantineReference: string | null = null;
  let quarantineProvider: string | null = null;
  try {
    const stored = await getQuarantineStore().put({ submissionId: intakeId, buffer, checksum, detectedMimeType: validation.detectedMimeType! });
    quarantineReference = stored.reference;
    quarantineProvider = stored.provider;
  } catch (error) {
    const code = error instanceof QuarantineError ? error.codeSafe : 'QUARANTINE_FAILED';
    const row = await prisma.clientPortalIntakeAttachment.create({ data: {
      intakeRequestId: intakeId,
      originalFileNameSafe: originalFileName,
      declaredMimeType: input.declaredMimeType ? String(input.declaredMimeType).slice(0, 120) : null,
      detectedMimeType: validation.detectedMimeType,
      sizeBytes: validation.sizeBytes,
      checksum,
      status: 'SCAN_FAILED',
      scanCodeSafe: code,
      uploadedAt: new Date(),
    } });
    return { reference: row.id, fileName: row.originalFileNameSafe, state: customerState(String(row.status)) };
  }

  const scan = await getScanner().scan({ buffer, sizeBytes: validation.sizeBytes, detectedMimeType: validation.detectedMimeType, fileName: originalFileName });
  const row = await prisma.clientPortalIntakeAttachment.create({ data: {
    intakeRequestId: intakeId,
    originalFileNameSafe: originalFileName,
    declaredMimeType: input.declaredMimeType ? String(input.declaredMimeType).slice(0, 120) : null,
    detectedMimeType: validation.detectedMimeType,
    sizeBytes: validation.sizeBytes,
    checksum,
    storageProvider: quarantineProvider,
    quarantineStorageReference: quarantineReference,
    status: scan.outcome as never,
    scanProvider: scan.provider,
    scanCodeSafe: scan.codeSafe,
    uploadedAt: new Date(),
    scannedAt: new Date(),
  } });
  return { reference: row.id, fileName: row.originalFileNameSafe, state: customerState(String(row.status)) };
}


