/**
 * Client submissions + files + structured answers (Phase 6-11).
 *
 * Customer drafts a submission for a granted request, provides structured
 * answers and/or uploads files (validated, quarantined, scanned — never CLEAN
 * without a real scanner). Internal users review, request correction, reject, or
 * explicitly accept a CLEAN file into the matter (creating a canonical immutable
 * DocumentVersion with provenance). Customers never set internal statuses,
 * never choose the acceptance target, and never create a DocumentVersion.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import crypto from 'crypto';
import {
  InteractionError, InternalActor, Prisma, CustomerContext,
  requireInternal, requireExpected, assertInternalCaseAccess, applyInternalQueueCaseScope, safeText, assertClientSafe,
} from './base';
import { requireCapability, isCapabilityEnabled } from './gates';
import { validateUploadFile, DEFAULT_MAX_FILE_BYTES } from './fileValidation';
import { getScanner, isAcceptableFileStatus } from '../upload-security/scannerAdapter';
import { getQuarantineStore, QuarantineError } from './quarantineAdapter';

function toClientSafeSubmission(row: any) {
  const dto = {
    id: row.id,
    requestId: row.clientRequestId,
    status: row.status,
    customerNote: row.customerNote,
    submittedAt: row.submittedAt,
    correctionReason: row.correctionReasonSafe,
    files: (row.files || []).map((f: any) => ({
      id: f.id,
      fileName: f.originalFileNameSafe,
      sizeBytes: f.sizeBytes,
      pageOrSideLabel: f.pageOrSideLabel,
      // Client-safe processing state only — never scan codes, provider or storage refs.
      state: clientFileState(f.status),
    })),
    fields: (row.fields || []).map((v: any) => ({ label: v.labelSnapshot, value: v.valueSafe })),
  };
  assertClientSafe(dto);
  return dto;
}

/** Map internal file status to a truthful client-safe processing state. */
function clientFileState(status: string): string {
  switch (status) {
    case 'CLEAN':
    case 'ACCEPTED': return 'RECEIVED';
    case 'INFECTED':
    case 'UNSUPPORTED':
    case 'REJECTED': return 'REJECTED';
    case 'UPLOADING':
    case 'UPLOADED':
    case 'SCANNING':
    case 'SCAN_FAILED':
    default: return 'PROCESSING';
  }
}

async function loadOwnedSubmission(ctx: CustomerContext, submissionId: string, prisma: Prisma) {
  const row = await prisma.clientSubmission.findFirst({ where: { id: submissionId, clientPortalIdentityId: ctx.clientPortalIdentityId, caseId: ctx.caseId } });
  if (!row) throw new InteractionError(404, 'SUBMISSION_NOT_FOUND', 'Submission is not available.');
  return row;
}

async function loadPublishedRequest(ctx: CustomerContext, requestId: string, prisma: Prisma) {
  const req = await prisma.clientRequest.findFirst({ where: { id: requestId, caseId: ctx.caseId, clientId: ctx.clientId }, include: { fields: { orderBy: { displayOrder: 'asc' } } } });
  if (!req) throw new InteractionError(404, 'REQUEST_NOT_FOUND', 'Request is not available.');
  if (!['PUBLISHED', 'PARTIALLY_SUBMITTED', 'CORRECTION_REQUESTED'].includes(req.status)) throw new InteractionError(409, 'REQUEST_NOT_OPEN', 'Request is not open for submission.');
  return req;
}

function fieldOptions(field: any): string[] {
  return Array.isArray(field?.options) ? field.options.map((option: unknown) => String(option)).filter(Boolean) : [];
}

export function validateStructuredAnswer(field: any, rawValue: unknown): string {
  const value = String(rawValue ?? '').trim();
  if (!value) return value;
  if (field.maxLength && value.length > field.maxLength) throw new InteractionError(400, 'INVALID_FIELD_VALUE', 'Az adatmező értéke túl hosszú.');
  if (field.type === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new InteractionError(400, 'INVALID_FIELD_VALUE', 'Érvényes e-mail-cím szükséges.');
  if (field.type === 'NUMBER' && !Number.isFinite(Number(value))) throw new InteractionError(400, 'INVALID_FIELD_VALUE', 'Érvényes szám szükséges.');
  if (field.type === 'DATE' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)))) throw new InteractionError(400, 'INVALID_FIELD_VALUE', 'Érvényes dátum szükséges.');
  if (field.type === 'PHONE' && !/^[+\d][\d\s().-]{5,79}$/.test(value)) throw new InteractionError(400, 'INVALID_FIELD_VALUE', 'Érvényes telefonszám szükséges.');
  const options = fieldOptions(field);
  if (field.type === 'SINGLE_CHOICE' && !options.includes(value)) throw new InteractionError(400, 'INVALID_FIELD_VALUE', 'Érvényes választási lehetőség szükséges.');
  if (field.type === 'MULTIPLE_CHOICE') {
    const selected = value.split('|').map((item) => item.trim()).filter(Boolean);
    if (new Set(selected).size !== selected.length || selected.some((item) => !options.includes(item))) throw new InteractionError(400, 'INVALID_FIELD_VALUE', 'Érvényes választási lehetőségek szükségesek.');
  }
  if (field.type === 'YES_NO' && !['igen', 'nem'].includes(value.toLowerCase())) throw new InteractionError(400, 'INVALID_FIELD_VALUE', 'Igen vagy nem válasz szükséges.');
  return value;
}

export async function submitIntakeInformationResponseInTransaction(
  input: {
    clientPortalIdentityId: string;
    membershipId: string;
    workspaceId: string;
    intakeId: string;
    requestId: string;
    answers: Array<Record<string, unknown>>;
  },
  tx: any,
) {
  const intake = await tx.clientPortalIntakeRequest.findFirst({
    where: { id: input.intakeId, workspaceId: input.workspaceId, requesterMembershipId: input.membershipId, status: 'MORE_INFORMATION_REQUIRED' },
    select: { id: true },
  });
  if (!intake) throw new InteractionError(404, 'INTAKE_NOT_FOUND', 'Intake is not available.');
  const request = await tx.clientRequest.findFirst({
    where: { id: input.requestId, intakeRequestId: input.intakeId, status: 'PUBLISHED' },
    include: { fields: { orderBy: { displayOrder: 'asc' } } },
  });
  if (!request) throw new InteractionError(404, 'REQUEST_NOT_FOUND', 'Information request is not available.');
  const byField = new Map(input.answers.map((answer) => [String(answer.fieldId || ''), answer.value]));
  const rows = request.fields.map((field: any) => {
    const raw = byField.get(field.id);
    if (field.required && (raw == null || String(raw).trim() === '')) throw new InteractionError(400, 'REQUIRED_FIELD_MISSING', `${field.clientSafeLabel} is required.`);
    return {
      fieldId: field.id,
      labelSnapshot: field.clientSafeLabel,
      valueSafe: raw == null ? null : validateStructuredAnswer(field, raw),
      dataCategory: null,
    };
  });
  const workspace = await tx.clientPortalWorkspace.findUnique({ where: { id: input.workspaceId }, select: { clientId: true } });
  if (!workspace) throw new InteractionError(404, 'INTAKE_NOT_FOUND', 'Intake is not available.');
  const submission = await tx.clientSubmission.create({
    data: {
      clientRequestId: request.id,
      clientId: workspace.clientId,
      caseId: null,
      clientPortalIdentityId: input.clientPortalIdentityId,
      status: 'SUBMITTED',
      submittedAt: new Date(),
      fields: rows.length ? { create: rows } : undefined,
    },
    include: { fields: true, files: true },
  });
  await tx.clientRequest.update({ where: { id: request.id }, data: { status: 'SUBMITTED', revision: { increment: 1 } } });
  return toClientSafeSubmission(submission);
}

// ---- Customer side
export async function createDraftSubmission(ctx: CustomerContext, requestId: string, prisma: Prisma = defaultPrisma) {
  const req = await loadPublishedRequest(ctx, requestId, prisma);
  if (req.type === 'DOCUMENT_UPLOAD' || req.type === 'MISSING_DOCUMENT_REQUEST' || req.type === 'CORRECTION_REQUEST') requireCapability('DOCUMENT_UPLOADS');
  else requireCapability('DATA_REQUESTS');
  const existing = await prisma.clientSubmission.findFirst({ where: { clientRequestId: requestId, clientPortalIdentityId: ctx.clientPortalIdentityId, status: { in: ['DRAFT', 'UPLOADING', 'CORRECTION_REQUESTED'] } } });
  if (existing) return toClientSafeSubmission({ ...existing, files: [], fields: [] });
  const created = await prisma.clientSubmission.create({
    data: { clientRequestId: requestId, clientId: ctx.clientId, caseId: ctx.caseId, clientPortalIdentityId: ctx.clientPortalIdentityId, status: 'DRAFT' },
  });
  return toClientSafeSubmission({ ...created, files: [], fields: [] });
}

export async function addStructuredAnswers(ctx: CustomerContext, submissionId: string, answers: Array<{ label?: unknown; value?: unknown; dataCategory?: unknown }>, prisma: Prisma = defaultPrisma) {
  requireCapability('DATA_REQUESTS');
  const sub = await loadOwnedSubmission(ctx, submissionId, prisma);
  if (!['DRAFT', 'CORRECTION_REQUESTED'].includes(sub.status)) throw new InteractionError(409, 'SUBMISSION_NOT_EDITABLE', 'Submission is not editable.');
  const request = await loadPublishedRequest(ctx, sub.clientRequestId, prisma);
  const fieldsByLabel = new Map(request.fields.map((field: any) => [field.clientSafeLabel, field]));
  const rows = (Array.isArray(answers) ? answers : []).slice(0, 60).map((a) => {
    const label = safeText(a.label, 'answer.label', 160, true)!;
    const field = fieldsByLabel.get(label);
    if (!field) throw new InteractionError(400, 'INVALID_FIELD_VALUE', 'Ismeretlen adatmező.');
    return {
    submissionId,
    labelSnapshot: label,
    valueSafe: validateStructuredAnswer(field, safeText(a.value, 'answer.value', 4000)),
    dataCategory: a.dataCategory ? String(a.dataCategory).slice(0, 60) : null,
    };
  });
  await prisma.$transaction([
    prisma.clientSubmissionField.deleteMany({ where: { submissionId } }),
    prisma.clientSubmissionField.createMany({ data: rows }),
  ]);
  return { count: rows.length };
}

/**
 * Validate, quarantine and scan a customer-uploaded file. Never trusts the
 * declared MIME; never sets CLEAN without a real scanner.
 */
export async function addFile(ctx: CustomerContext, submissionId: string, input: { originalFileName?: unknown; declaredMimeType?: unknown; base64?: unknown; pageOrSideLabel?: unknown }, prisma: Prisma = defaultPrisma) {
  requireCapability('DOCUMENT_UPLOADS');
  const sub = await loadOwnedSubmission(ctx, submissionId, prisma);
  if (!['DRAFT', 'UPLOADING', 'CORRECTION_REQUESTED'].includes(sub.status)) throw new InteractionError(409, 'SUBMISSION_NOT_EDITABLE', 'Submission is not editable.');
  const originalFileName = safeText(input.originalFileName, 'originalFileName', 260, true)!;
  const buffer = Buffer.from(String(input.base64 || ''), 'base64');
  const validation = validateUploadFile({ buffer, declaredMimeType: input.declaredMimeType ? String(input.declaredMimeType) : null, originalFileName, maxFileBytes: DEFAULT_MAX_FILE_BYTES });
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

  if (!validation.ok) {
    // Persist a truthful rejected/unsupported file record; do not store bytes.
    const rejected = await prisma.clientSubmissionFile.create({
      data: {
        submissionId, originalFileNameSafe: originalFileName,
        declaredMimeType: input.declaredMimeType ? String(input.declaredMimeType).slice(0, 120) : null,
        detectedMimeType: validation.detectedMimeType, sizeBytes: validation.sizeBytes, checksum,
        status: validation.codeSafe === 'UNSAFE_CONTENT' || validation.codeSafe === 'UNSUPPORTED_TYPE' || validation.codeSafe === 'EXTENSION_MISMATCH' ? 'UNSUPPORTED' : 'REJECTED',
        scanCodeSafe: validation.codeSafe,
        pageOrSideLabel: input.pageOrSideLabel ? String(input.pageOrSideLabel).slice(0, 40) : null,
        uploadedAt: new Date(),
      },
    });
    return { id: rejected.id, state: clientFileState(rejected.status), codeSafe: validation.codeSafe };
  }

  // Store to quarantine (truthful failure when unconfigured), then scan.
  let quarantineReference: string | null = null;
  let quarantineProvider: string | null = null;
  try {
    const stored = await getQuarantineStore().put({ submissionId, buffer, checksum, detectedMimeType: validation.detectedMimeType! });
    quarantineReference = stored.reference; quarantineProvider = stored.provider;
  } catch (e) {
    const code = e instanceof QuarantineError ? e.codeSafe : 'QUARANTINE_FAILED';
    const file = await prisma.clientSubmissionFile.create({
      data: {
        submissionId, originalFileNameSafe: originalFileName, detectedMimeType: validation.detectedMimeType,
        declaredMimeType: input.declaredMimeType ? String(input.declaredMimeType).slice(0, 120) : null,
        sizeBytes: validation.sizeBytes, checksum, status: 'SCAN_FAILED', scanCodeSafe: code,
        pageOrSideLabel: input.pageOrSideLabel ? String(input.pageOrSideLabel).slice(0, 40) : null, uploadedAt: new Date(),
      },
    });
    if (sub.status === 'DRAFT') await prisma.clientSubmission.update({ where: { id: submissionId }, data: { status: 'UPLOADING' } });
    return { id: file.id, state: 'PROCESSING', codeSafe: code };
  }

  const scan = await getScanner().scan({ buffer, sizeBytes: validation.sizeBytes, detectedMimeType: validation.detectedMimeType, fileName: originalFileName });
  const status = scan.outcome; // CLEAN | INFECTED | UNSUPPORTED | SCAN_FAILED
  if (status !== 'CLEAN' && quarantineReference) {
    try { await getQuarantineStore().remove(quarantineReference); } catch (e) { console.error('Failed to cleanup quarantine', e); }
    quarantineReference = null;
    quarantineProvider = null;
  }
  const file = await prisma.clientSubmissionFile.create({
    data: {
      submissionId, originalFileNameSafe: originalFileName, detectedMimeType: validation.detectedMimeType,
      declaredMimeType: input.declaredMimeType ? String(input.declaredMimeType).slice(0, 120) : null,
      sizeBytes: validation.sizeBytes, checksum,
      storageProvider: quarantineProvider, quarantineStorageReference: quarantineReference,
      status: status as any, scanProvider: scan.provider, scanCodeSafe: scan.codeSafe,
      pageOrSideLabel: input.pageOrSideLabel ? String(input.pageOrSideLabel).slice(0, 40) : null,
      uploadedAt: new Date(), scannedAt: new Date(),
    },
  });
  if (sub.status === 'DRAFT') await prisma.clientSubmission.update({ where: { id: submissionId }, data: { status: 'UPLOADING' } });
  return { id: file.id, state: clientFileState(status), codeSafe: scan.codeSafe };
}

export async function submitSubmission(ctx: CustomerContext, submissionId: string, input: { customerNote?: unknown }, prisma: Prisma = defaultPrisma) {
  const sub = await loadOwnedSubmission(ctx, submissionId, prisma);
  if (!['DRAFT', 'UPLOADING', 'CORRECTION_REQUESTED'].includes(sub.status)) throw new InteractionError(409, 'SUBMISSION_NOT_SUBMITTABLE', 'Submission cannot be submitted.');
  const [fileCount, fieldRows, request] = await Promise.all([
    prisma.clientSubmissionFile.count({ where: { submissionId, status: { notIn: ['REJECTED', 'UNSUPPORTED'] } } }),
    prisma.clientSubmissionField.findMany({ where: { submissionId } }),
    prisma.clientRequest.findUnique({ where: { id: sub.clientRequestId }, include: { fields: true } }),
  ]);
  const fieldCount = fieldRows.length;
  if (fileCount === 0 && fieldCount === 0) throw new InteractionError(400, 'SUBMISSION_EMPTY', 'Provide at least one file or answer before submitting.');
  if (request?.type === 'DATA_FORM') {
    const answersByLabel = new Map(fieldRows.map((row: any) => [row.labelSnapshot, row.valueSafe]));
    for (const field of (request.fields || [])) {
      const value = answersByLabel.get(field.clientSafeLabel);
      if (field.required && !String(value || '').trim()) throw new InteractionError(400, 'REQUIRED_FIELD_MISSING', 'Minden kötelező adatmezőt ki kell tölteni.');
      if (value) validateStructuredAnswer(field, value);
    }
  }
  return toClientSafeSubmission({ ...await prisma.clientSubmission.update({ where: { id: submissionId }, data: { status: 'SUBMITTED', submittedAt: new Date(), customerNote: safeText(input.customerNote, 'customerNote', 1000), revision: { increment: 1 } } }), files: [], fields: [] });
}

export async function listCustomerSubmissions(ctx: CustomerContext, requestId: string | undefined, prisma: Prisma = defaultPrisma) {
  const where: any = { clientPortalIdentityId: ctx.clientPortalIdentityId, caseId: ctx.caseId };
  if (requestId) where.clientRequestId = requestId;
  const items = await prisma.clientSubmission.findMany({ where, orderBy: { createdAt: 'desc' }, include: { files: true, fields: true } });
  return { items: items.map(toClientSafeSubmission) };
}

export async function getCustomerSubmission(ctx: CustomerContext, submissionId: string, prisma: Prisma = defaultPrisma) {
  const row = await prisma.clientSubmission.findFirst({ where: { id: submissionId, clientPortalIdentityId: ctx.clientPortalIdentityId, caseId: ctx.caseId }, include: { files: true, fields: true } });
  if (!row) throw new InteractionError(404, 'SUBMISSION_NOT_FOUND', 'Submission is not available.');
  return toClientSafeSubmission(row);
}

// ---- Internal side
function requireCaseSubmission(row: { caseId: string | null }): string {
  if (!row.caseId) throw new InteractionError(409, 'SUBMISSION_IS_INTAKE_SCOPED', 'This submission is managed through intake triage.');
  return row.caseId;
}

export async function listSubmissionsInternal(actor: InternalActor, filter: { caseId?: string; requestId?: string; status?: string; limit?: number; offset?: number }, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const where: any = {};
  if (filter.caseId) where.caseId = filter.caseId;
  if (filter.requestId) where.clientRequestId = filter.requestId;
  if (filter.status) where.status = filter.status;
  await applyInternalQueueCaseScope(where, actor, prisma);
  const limit = Math.min(Math.max(1, filter.limit ?? 50), 200);
  const offset = Math.max(0, filter.offset ?? 0);
  const [items, total] = await Promise.all([
    prisma.clientSubmission.findMany({ where, orderBy: { createdAt: 'desc' }, skip: offset, take: limit, include: { files: true, fields: true } }),
    prisma.clientSubmission.count({ where }),
  ]);
  return { items, total, limit, offset };
}

export async function getSubmissionInternal(actor: InternalActor, submissionId: string, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const row = await prisma.clientSubmission.findUnique({ where: { id: submissionId }, include: { files: true, fields: true } });
  if (!row) throw new InteractionError(404, 'SUBMISSION_NOT_FOUND', 'Submission not found.');
  await assertInternalCaseAccess(actor, requireCaseSubmission(row), prisma);
  return row;
}

export async function requestCorrection(actor: InternalActor, submissionId: string, input: { reasonSafe?: unknown; expectedRevision?: unknown }, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const row = await prisma.clientSubmission.findUnique({ where: { id: submissionId } });
  if (!row) throw new InteractionError(404, 'SUBMISSION_NOT_FOUND', 'Submission not found.');
  await assertInternalCaseAccess(actor, requireCaseSubmission(row), prisma);
  requireExpected(row, input.expectedRevision);
  return prisma.clientSubmission.update({ where: { id: submissionId }, data: { status: 'CORRECTION_REQUESTED', reviewedById: actor.userId, reviewedAt: new Date(), correctionReasonSafe: safeText(input.reasonSafe, 'reasonSafe', 1000), revision: { increment: 1 } } });
}

export async function rejectSubmission(actor: InternalActor, submissionId: string, input: { reasonSafe?: unknown; expectedRevision?: unknown }, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const row = await prisma.clientSubmission.findUnique({ where: { id: submissionId } });
  if (!row) throw new InteractionError(404, 'SUBMISSION_NOT_FOUND', 'Submission not found.');
  await assertInternalCaseAccess(actor, requireCaseSubmission(row), prisma);
  requireExpected(row, input.expectedRevision);
  return prisma.clientSubmission.update({ where: { id: submissionId }, data: { status: 'REJECTED', reviewedById: actor.userId, reviewedAt: new Date(), rejectionReasonSafe: safeText(input.reasonSafe, 'reasonSafe', 1000), revision: { increment: 1 } } });
}

/**
 * Accept a CLEAN file into the matter as a canonical immutable DocumentVersion.
 * Server-side blocked unless the file scan status is CLEAN (so with no scanner
 * configured this can never run in production). Customer can never invoke this.
 */
export async function acceptFileIntoMatter(actor: InternalActor, submissionId: string, fileId: string, input: { documentId?: string; documentName?: string; expectedRevision?: unknown }, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const submission = await prisma.clientSubmission.findUnique({ where: { id: submissionId } });
  if (!submission) throw new InteractionError(404, 'SUBMISSION_NOT_FOUND', 'Submission not found.');
  const caseId = requireCaseSubmission(submission);
  const { clientId } = await assertInternalCaseAccess(actor, caseId, prisma);
  requireExpected(submission, input.expectedRevision);
  const file = await prisma.clientSubmissionFile.findFirst({ where: { id: fileId, submissionId } });
  if (!file) throw new InteractionError(404, 'FILE_NOT_FOUND', 'File not found.');
  // The core safety gate: only a CLEAN file may enter the matter file.
  if (!isAcceptableFileStatus(file.status)) throw new InteractionError(409, 'FILE_NOT_CLEAN', 'Only a CLEAN, scanned file can be accepted into the matter.');

  const result = await prisma.$transaction(async (tx) => {
    let documentId = input.documentId || null;
    if (documentId) {
      const doc = await tx.document.findFirst({ where: { id: documentId, caseId } });
      if (!doc) throw new InteractionError(404, 'DOCUMENT_NOT_FOUND', 'Destination document not found.');
    } else {
      const doc = await tx.document.create({
        data: {
          caseId,
          clientId,
          name: safeText(input.documentName, 'documentName', 200) || file.originalFileNameSafe,
          fileName: file.originalFileNameSafe,
          mimeType: file.detectedMimeType || 'application/octet-stream',
          category: 'CLIENT_INPUT',
          size: file.sizeBytes || undefined,
        } as any,
      });
      documentId = doc.id;
    }
    const maxVersion = await tx.documentVersion.aggregate({ where: { documentId }, _max: { version: true } });
    const nextVersion = (maxVersion._max.version || 0) + 1;
    const version = await tx.documentVersion.create({
      data: {
        documentId: documentId!, version: nextVersion, name: file.originalFileNameSafe,
        originalFileName: file.originalFileNameSafe, mimeType: file.detectedMimeType, size: file.sizeBytes || undefined,
        storageReference: file.quarantineStorageReference || undefined, isCurrent: true,
        uploadedById: actor.userId, uploadSource: 'CLIENT_PORTAL', versionType: 'ORIGINAL',
      } as any,
    });
    await tx.documentVersion.updateMany({ where: { documentId, id: { not: version.id } }, data: { isCurrent: false } });
    await tx.clientSubmissionFile.update({ where: { id: fileId }, data: { status: 'ACCEPTED' } });
    await tx.clientSubmission.update({ where: { id: submissionId }, data: { status: 'ACCEPTED_INTO_MATTER', reviewedById: actor.userId, reviewedAt: new Date(), acceptedDocumentId: documentId, acceptedDocumentVersionId: version.id, revision: { increment: 1 } } });
    return { documentId, documentVersionId: version.id };
  });
  return result;
}


