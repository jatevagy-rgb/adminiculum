import {
  DocumentAnnotation,
  DocumentAnnotationAnchorType,
  DocumentAnnotationEventType,
  DocumentAnnotationStatus,
  DocumentAnnotationType,
  DocumentAnnotationVisibility,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';

const ANNOTATION_TYPES = new Set(Object.values(DocumentAnnotationType));
const ANCHOR_TYPES = new Set(Object.values(DocumentAnnotationAnchorType));
const STATUSES = new Set(Object.values(DocumentAnnotationStatus));
const VISIBILITIES = new Set(Object.values(DocumentAnnotationVisibility));

const MAX_LIMIT = 50;
const MAX_HEADLINE_LENGTH = 180;
const MAX_TEXT_LENGTH = 4000;
const MAX_CONTEXT_LENGTH = 500;
const MAX_COMMENT_LENGTH = 3000;
const MAX_KEY_LENGTH = 120;

export class DocumentAnnotationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = 'DocumentAnnotationError';
  }
}

type AnnotationWithUsers = DocumentAnnotation & {
  createdBy?: { id: string; name: string | null; email: string };
  assignedTo?: { id: string; name: string | null; email: string } | null;
  resolvedBy?: { id: string; name: string | null; email: string } | null;
};

export interface AnnotationCreateInput {
  annotationType?: unknown;
  anchorType?: unknown;
  visibility?: unknown;
  headline?: unknown;
  internalNote?: unknown;
  reviewComment?: unknown;
  modificationReason?: unknown;
  clientExplanationDraft?: unknown;
  legalRisk?: unknown;
  openQuestion?: unknown;
  decisionText?: unknown;
  selectedText?: unknown;
  textPrefix?: unknown;
  textSuffix?: unknown;
  startOffset?: unknown;
  endOffset?: unknown;
  pageIndex?: unknown;
  pageNumber?: unknown;
  rect?: unknown;
  point?: unknown;
  pageRotation?: unknown;
  structuralPath?: unknown;
  rendererVersion?: unknown;
  contentFingerprint?: unknown;
  assignedToId?: unknown;
  idempotencyKey?: unknown;
}

export interface AnnotationUpdateInput {
  annotationType?: unknown;
  visibility?: unknown;
  headline?: unknown;
  internalNote?: unknown;
  reviewComment?: unknown;
  modificationReason?: unknown;
  clientExplanationDraft?: unknown;
  legalRisk?: unknown;
  openQuestion?: unknown;
  decisionText?: unknown;
  assignedToId?: unknown;
}

function trimString(value: unknown, maxLength: number, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new DocumentAnnotationError('INVALID_FIELD', `${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new DocumentAnnotationError('FIELD_TOO_LONG', `${field} is too long.`);
  }
  return trimmed;
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, field: string, fallback?: T): T {
  if (value === undefined || value === null || value === '') {
    if (fallback) return fallback;
    throw new DocumentAnnotationError('INVALID_FIELD', `${field} is required.`);
  }
  const normalized = String(value).trim().toUpperCase() as T;
  if (!allowed.has(normalized)) {
    throw new DocumentAnnotationError('INVALID_FIELD', `${field} is unsupported.`);
  }
  return normalized;
}

function optionalInteger(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue)) {
    throw new DocumentAnnotationError('INVALID_FIELD', `${field} must be an integer.`);
  }
  return numberValue;
}

function normalizedNumber(value: unknown, field: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 1) {
    throw new DocumentAnnotationError('INVALID_ANCHOR', `${field} must be between 0 and 1.`);
  }
  return numberValue;
}

function readGeometry(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DocumentAnnotationError('INVALID_ANCHOR', `${field} is required.`);
  }
  return value as Record<string, unknown>;
}

function normalizeSelectedText(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function userSelect() {
  return { id: true, name: true, email: true };
}

function mapUser(user?: { id: string; name: string | null; email: string } | null) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

function numberOrNull(value: Prisma.Decimal | number | null): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function mapAnnotation(annotation: AnnotationWithUsers) {
  return {
    id: annotation.id,
    documentId: annotation.documentId,
    documentVersionId: annotation.documentVersionId,
    annotationType: annotation.annotationType,
    anchorType: annotation.anchorType,
    status: annotation.status,
    visibility: annotation.visibility,
    headline: annotation.headline,
    internalNote: annotation.internalNote,
    reviewComment: annotation.reviewComment,
    modificationReason: annotation.modificationReason,
    clientExplanationDraft: annotation.clientExplanationDraft,
    legalRisk: annotation.legalRisk,
    openQuestion: annotation.openQuestion,
    decisionText: annotation.decisionText,
    resolutionNote: annotation.resolutionNote,
    selectedText: annotation.selectedText,
    normalizedSelectedText: annotation.normalizedSelectedText,
    textPrefix: annotation.textPrefix,
    textSuffix: annotation.textSuffix,
    startOffset: annotation.startOffset,
    endOffset: annotation.endOffset,
    pageNumber: annotation.pageNumber,
    pageIndex: annotation.pageIndex,
    rect: annotation.rectX === null ? null : {
      x: numberOrNull(annotation.rectX),
      y: numberOrNull(annotation.rectY),
      width: numberOrNull(annotation.rectWidth),
      height: numberOrNull(annotation.rectHeight),
    },
    point: annotation.pointX === null ? null : {
      x: numberOrNull(annotation.pointX),
      y: numberOrNull(annotation.pointY),
    },
    pageRotation: annotation.pageRotation,
    structuralPath: annotation.structuralPath,
    rendererVersion: annotation.rendererVersion,
    contentFingerprint: annotation.contentFingerprint,
    createdBy: mapUser(annotation.createdBy),
    assignedTo: mapUser(annotation.assignedTo),
    resolvedBy: mapUser(annotation.resolvedBy),
    createdAt: annotation.createdAt.toISOString(),
    updatedAt: annotation.updatedAt.toISOString(),
    resolvedAt: annotation.resolvedAt?.toISOString() || null,
  };
}

function includeUsers() {
  return {
    createdBy: { select: userSelect() },
    assignedTo: { select: userSelect() },
    resolvedBy: { select: userSelect() },
  };
}

const ALLOWED_PAGE_ROTATIONS = new Set([0, 90, 180, 270]);

/**
 * An assignee must be a real user who can already read the owning case — an
 * annotation assignment must never become a back-door that surfaces internal
 * review metadata to someone without case access. Returns a controlled 400/403
 * instead of letting a bad id fall through to a raw foreign-key 500.
 */
async function ensureAssigneeAllowed(assignedToId: string | null | undefined, documentId: string): Promise<void> {
  if (!assignedToId) return;
  const user = await prisma.user.findUnique({
    where: { id: assignedToId },
    select: { id: true, role: true },
  });
  if (!user) {
    throw new DocumentAnnotationError('ASSIGNEE_NOT_FOUND', 'Assigned user does not exist.', 400);
  }
  if (['ADMIN', 'PARTNER'].includes(String(user.role))) return;

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { case: { select: { assignedLawyerId: true, createdById: true } }, caseId: true },
  });
  if (!document?.case) {
    throw new DocumentAnnotationError('DOCUMENT_NOT_FOUND', 'Document not found.', 404);
  }
  if (document.case.assignedLawyerId === assignedToId || document.case.createdById === assignedToId) return;

  const collaborator = await prisma.caseCollaborator.findFirst({
    where: { caseId: document.caseId, userId: assignedToId },
    select: { id: true },
  });
  if (!collaborator) {
    throw new DocumentAnnotationError('ASSIGNEE_NOT_ALLOWED', 'Assigned user has no access to this case.', 403);
  }
}

async function ensureVersionBelongsToDocument(documentId: string, documentVersionId: string) {
  const version = await prisma.documentVersion.findFirst({
    where: { id: documentVersionId, documentId },
    select: { id: true },
  });
  if (!version) {
    throw new DocumentAnnotationError('DOCUMENT_VERSION_NOT_FOUND', 'Document version not found.', 404);
  }
}

function buildCreateData(documentId: string, documentVersionId: string, actorId: string, input: AnnotationCreateInput) {
  const annotationType = enumValue(input.annotationType, ANNOTATION_TYPES, 'annotationType', DocumentAnnotationType.INTERNAL_NOTE);
  const anchorType = enumValue(input.anchorType, ANCHOR_TYPES, 'anchorType');
  const visibility = enumValue(input.visibility, VISIBILITIES, 'visibility', DocumentAnnotationVisibility.INTERNAL);
  const selectedText = trimString(input.selectedText, MAX_TEXT_LENGTH, 'selectedText');
  const startOffset = optionalInteger(input.startOffset, 'startOffset');
  const endOffset = optionalInteger(input.endOffset, 'endOffset');
  const pageIndex = optionalInteger(input.pageIndex, 'pageIndex');
  const pageNumber = optionalInteger(input.pageNumber, 'pageNumber');
  const pageRotation = optionalInteger(input.pageRotation, 'pageRotation');

  if (startOffset !== null || endOffset !== null) {
    if (startOffset === null || endOffset === null || startOffset < 0 || endOffset <= startOffset) {
      throw new DocumentAnnotationError('INVALID_TEXT_RANGE', 'Text range offsets are invalid.');
    }
  }

  if (pageRotation !== null && !ALLOWED_PAGE_ROTATIONS.has(pageRotation)) {
    throw new DocumentAnnotationError('INVALID_PAGE_ROTATION', 'pageRotation must be 0, 90, 180 or 270.');
  }
  if (pageIndex !== null && pageIndex < 0) {
    throw new DocumentAnnotationError('INVALID_PAGE_ANCHOR', 'pageIndex must be zero or greater.');
  }

  const data: Prisma.DocumentAnnotationUncheckedCreateInput = {
    documentId,
    documentVersionId,
    annotationType,
    anchorType,
    visibility,
    headline: trimString(input.headline, MAX_HEADLINE_LENGTH, 'headline'),
    internalNote: trimString(input.internalNote, MAX_TEXT_LENGTH, 'internalNote'),
    reviewComment: trimString(input.reviewComment, MAX_TEXT_LENGTH, 'reviewComment'),
    modificationReason: trimString(input.modificationReason, MAX_TEXT_LENGTH, 'modificationReason'),
    clientExplanationDraft: trimString(input.clientExplanationDraft, MAX_TEXT_LENGTH, 'clientExplanationDraft'),
    legalRisk: trimString(input.legalRisk, MAX_TEXT_LENGTH, 'legalRisk'),
    openQuestion: trimString(input.openQuestion, MAX_TEXT_LENGTH, 'openQuestion'),
    decisionText: trimString(input.decisionText, MAX_TEXT_LENGTH, 'decisionText'),
    selectedText,
    normalizedSelectedText: normalizeSelectedText(selectedText),
    textPrefix: trimString(input.textPrefix, MAX_CONTEXT_LENGTH, 'textPrefix'),
    textSuffix: trimString(input.textSuffix, MAX_CONTEXT_LENGTH, 'textSuffix'),
    startOffset,
    endOffset,
    pageIndex,
    pageNumber,
    pageRotation,
    structuralPath: trimString(input.structuralPath, MAX_TEXT_LENGTH, 'structuralPath'),
    rendererVersion: trimString(input.rendererVersion, MAX_KEY_LENGTH, 'rendererVersion'),
    contentFingerprint: trimString(input.contentFingerprint, MAX_KEY_LENGTH, 'contentFingerprint'),
    idempotencyKey: trimString(input.idempotencyKey, MAX_KEY_LENGTH, 'idempotencyKey'),
    assignedToId: trimString(input.assignedToId, MAX_KEY_LENGTH, 'assignedToId'),
    createdById: actorId,
  };

  if (anchorType === DocumentAnnotationAnchorType.TEXT_RANGE) {
    if (!selectedText) {
      throw new DocumentAnnotationError('INVALID_TEXT_ANCHOR', 'selectedText is required for text annotations.');
    }
  }

  if (anchorType === DocumentAnnotationAnchorType.PAGE_RECTANGLE || anchorType === DocumentAnnotationAnchorType.PAGE_ELLIPSE) {
    if (pageIndex === null || pageIndex < 0) {
      throw new DocumentAnnotationError('INVALID_PAGE_ANCHOR', 'pageIndex is required for visual annotations.');
    }
    const rect = readGeometry(input.rect, 'rect');
    const x = normalizedNumber(rect.x, 'rect.x');
    const y = normalizedNumber(rect.y, 'rect.y');
    const width = normalizedNumber(rect.width, 'rect.width');
    const height = normalizedNumber(rect.height, 'rect.height');
    if (width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
      throw new DocumentAnnotationError('INVALID_RECT_ANCHOR', 'Rectangle anchor bounds are invalid.');
    }
    data.rectX = new Prisma.Decimal(x);
    data.rectY = new Prisma.Decimal(y);
    data.rectWidth = new Prisma.Decimal(width);
    data.rectHeight = new Prisma.Decimal(height);
  }

  if (anchorType === DocumentAnnotationAnchorType.PAGE_POINT) {
    if (pageIndex === null || pageIndex < 0) {
      throw new DocumentAnnotationError('INVALID_PAGE_ANCHOR', 'pageIndex is required for point annotations.');
    }
    const point = readGeometry(input.point, 'point');
    data.pointX = new Prisma.Decimal(normalizedNumber(point.x, 'point.x'));
    data.pointY = new Prisma.Decimal(normalizedNumber(point.y, 'point.y'));
  }

  return data;
}

/**
 * Fields that must never change through an ordinary PATCH. Re-anchoring is NOT
 * implemented in this slice, so an attempt to mutate the anchor (or identity /
 * provenance / deletion audit) is rejected explicitly rather than silently
 * ignored — a silent no-op would let a caller believe an annotation moved.
 */
const IMMUTABLE_UPDATE_FIELDS = [
  'id',
  'documentId',
  'documentVersionId',
  'anchorType',
  'selectedText',
  'normalizedSelectedText',
  'textPrefix',
  'textSuffix',
  'startOffset',
  'endOffset',
  'pageIndex',
  'pageNumber',
  'pageRotation',
  'rect',
  'point',
  'rectX',
  'rectY',
  'rectWidth',
  'rectHeight',
  'pointX',
  'pointY',
  'structuralPath',
  'rendererVersion',
  'contentFingerprint',
  'createdById',
  'createdAt',
  'status',
  'resolvedAt',
  'resolvedById',
  'deletedAt',
  'deletedById',
  'idempotencyKey',
] as const;

function rejectImmutableFields(input: Record<string, unknown>): void {
  for (const field of IMMUTABLE_UPDATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      throw new DocumentAnnotationError(
        'IMMUTABLE_FIELD',
        `${field} cannot be modified. Anchor and provenance are immutable; status changes use the resolve/reopen endpoints.`
      );
    }
  }
}

function buildUpdateData(input: AnnotationUpdateInput): Prisma.DocumentAnnotationUncheckedUpdateInput {
  rejectImmutableFields(input as Record<string, unknown>);
  const data: Prisma.DocumentAnnotationUncheckedUpdateInput = {};
  if (input.annotationType !== undefined) {
    data.annotationType = enumValue(input.annotationType, ANNOTATION_TYPES, 'annotationType');
  }
  if (input.visibility !== undefined) {
    data.visibility = enumValue(input.visibility, VISIBILITIES, 'visibility');
  }
  for (const [field, max] of [
    ['headline', MAX_HEADLINE_LENGTH],
    ['internalNote', MAX_TEXT_LENGTH],
    ['reviewComment', MAX_TEXT_LENGTH],
    ['modificationReason', MAX_TEXT_LENGTH],
    ['clientExplanationDraft', MAX_TEXT_LENGTH],
    ['legalRisk', MAX_TEXT_LENGTH],
    ['openQuestion', MAX_TEXT_LENGTH],
    ['decisionText', MAX_TEXT_LENGTH],
  ] as const) {
    if (input[field] !== undefined) {
      data[field] = trimString(input[field], max, field);
    }
  }
  if (input.assignedToId !== undefined) {
    data.assignedToId = trimString(input.assignedToId, MAX_KEY_LENGTH, 'assignedToId');
  }
  return data;
}

export async function listDocumentAnnotations(documentId: string, documentVersionId: string, query: Record<string, unknown>) {
  await ensureVersionBelongsToDocument(documentId, documentVersionId);
  const limitParam = Number(query.limit || 25);
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, MAX_LIMIT)) : 25;
  const offsetParam = Number(query.offset || 0);
  const offset = Number.isFinite(offsetParam) ? Math.max(0, offsetParam) : 0;
  const where: Prisma.DocumentAnnotationWhereInput = {
    documentId,
    documentVersionId,
    deletedAt: null,
  };
  if (query.status) where.status = enumValue(query.status, STATUSES, 'status');
  if (query.annotationType) where.annotationType = enumValue(query.annotationType, ANNOTATION_TYPES, 'annotationType');
  if (query.anchorType) where.anchorType = enumValue(query.anchorType, ANCHOR_TYPES, 'anchorType');

  const [items, total] = await prisma.$transaction([
    prisma.documentAnnotation.findMany({
      where,
      include: includeUsers(),
      orderBy: [{ createdAt: 'desc' }],
      skip: offset,
      take: limit,
    }),
    prisma.documentAnnotation.count({ where }),
  ]);

  return {
    documentId,
    documentVersionId,
    items: items.map(mapAnnotation),
    pagination: { total, limit, offset },
  };
}

export async function createDocumentAnnotation(documentId: string, documentVersionId: string, actorId: string, input: AnnotationCreateInput) {
  await ensureVersionBelongsToDocument(documentId, documentVersionId);
  const data = buildCreateData(documentId, documentVersionId, actorId, input);
  await ensureAssigneeAllowed(data.assignedToId as string | null | undefined, documentId);

  if (data.idempotencyKey) {
    const existing = await prisma.documentAnnotation.findFirst({
      where: { documentVersionId, idempotencyKey: String(data.idempotencyKey), deletedAt: null },
      include: includeUsers(),
    });
    if (existing) return mapAnnotation(existing);
  }

  const annotation = await prisma.$transaction(async (tx) => {
    const created = await tx.documentAnnotation.create({
      data,
      include: includeUsers(),
    });
    await tx.documentAnnotationEvent.create({
      data: {
        annotationId: created.id,
        eventType: DocumentAnnotationEventType.CREATED,
        actorId,
        toStatus: created.status,
        assignedToId: created.assignedToId,
      },
    });
    return created;
  });
  return mapAnnotation(annotation);
}

export async function getDocumentAnnotation(documentId: string, documentVersionId: string, annotationId: string) {
  const annotation = await prisma.documentAnnotation.findFirst({
    where: { id: annotationId, documentId, documentVersionId, deletedAt: null },
    include: includeUsers(),
  });
  return annotation ? mapAnnotation(annotation) : null;
}

export async function updateDocumentAnnotation(documentId: string, documentVersionId: string, annotationId: string, actorId: string, input: AnnotationUpdateInput) {
  const existing = await prisma.documentAnnotation.findFirst({
    where: { id: annotationId, documentId, documentVersionId, deletedAt: null },
    select: { id: true, status: true, assignedToId: true },
  });
  if (!existing) return null;
  const data = buildUpdateData(input);
  if (!Object.keys(data).length) {
    return getDocumentAnnotation(documentId, documentVersionId, annotationId);
  }
  if (data.assignedToId !== undefined) {
    await ensureAssigneeAllowed(data.assignedToId as string | null | undefined, documentId);
  }

  const annotation = await prisma.$transaction(async (tx) => {
    const updated = await tx.documentAnnotation.update({
      where: { id: annotationId },
      data,
      include: includeUsers(),
    });
    await tx.documentAnnotationEvent.create({
      data: {
        annotationId,
        eventType: existing.assignedToId !== updated.assignedToId ? DocumentAnnotationEventType.ASSIGNED : DocumentAnnotationEventType.CONTENT_UPDATED,
        actorId,
        assignedToId: updated.assignedToId,
      },
    });
    return updated;
  });
  return mapAnnotation(annotation);
}

export async function transitionDocumentAnnotation(
  documentId: string,
  documentVersionId: string,
  annotationId: string,
  actorId: string,
  nextStatus: DocumentAnnotationStatus,
  resolutionNote?: unknown
) {
  const existing = await prisma.documentAnnotation.findFirst({
    where: { id: annotationId, documentId, documentVersionId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!existing) return null;
  const resolved = nextStatus === DocumentAnnotationStatus.RESOLVED;
  const annotation = await prisma.$transaction(async (tx) => {
    const updated = await tx.documentAnnotation.update({
      where: { id: annotationId },
      data: {
        status: nextStatus,
        resolutionNote: resolved ? trimString(resolutionNote, MAX_TEXT_LENGTH, 'resolutionNote') : null,
        resolvedAt: resolved ? new Date() : null,
        resolvedById: resolved ? actorId : null,
      },
      include: includeUsers(),
    });
    await tx.documentAnnotationEvent.create({
      data: {
        annotationId,
        eventType: resolved ? DocumentAnnotationEventType.RESOLVED : DocumentAnnotationEventType.REOPENED,
        actorId,
        fromStatus: existing.status,
        toStatus: nextStatus,
      },
    });
    return updated;
  });
  return mapAnnotation(annotation);
}

export async function deleteDocumentAnnotation(documentId: string, documentVersionId: string, annotationId: string, actorId: string) {
  const existing = await prisma.documentAnnotation.findFirst({
    where: { id: annotationId, documentId, documentVersionId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return false;
  await prisma.$transaction([
    prisma.documentAnnotation.update({
      where: { id: annotationId },
      data: { deletedAt: new Date(), deletedById: actorId },
    }),
    prisma.documentAnnotationEvent.create({
      data: {
        annotationId,
        eventType: DocumentAnnotationEventType.SOFT_DELETED,
        actorId,
      },
    }),
  ]);
  return true;
}

export async function listDocumentAnnotationComments(documentId: string, documentVersionId: string, annotationId: string) {
  const annotation = await prisma.documentAnnotation.findFirst({
    where: { id: annotationId, documentId, documentVersionId, deletedAt: null },
    select: { id: true },
  });
  if (!annotation) return null;
  const comments = await prisma.documentAnnotationComment.findMany({
    where: { annotationId, deletedAt: null },
    include: { createdBy: { select: userSelect() } },
    orderBy: { createdAt: 'asc' },
  });
  return comments.map((comment) => ({
    id: comment.id,
    annotationId: comment.annotationId,
    body: comment.body,
    createdBy: mapUser(comment.createdBy),
    createdAt: comment.createdAt.toISOString(),
    editedAt: comment.editedAt?.toISOString() || null,
  }));
}

export async function createDocumentAnnotationComment(documentId: string, documentVersionId: string, annotationId: string, actorId: string, body: unknown) {
  const normalizedBody = trimString(body, MAX_COMMENT_LENGTH, 'body');
  if (!normalizedBody) {
    throw new DocumentAnnotationError('COMMENT_REQUIRED', 'Comment body is required.');
  }
  const annotation = await prisma.documentAnnotation.findFirst({
    where: { id: annotationId, documentId, documentVersionId, deletedAt: null },
    select: { id: true },
  });
  if (!annotation) return null;

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.documentAnnotationComment.create({
      data: { annotationId, body: normalizedBody, createdById: actorId },
      include: { createdBy: { select: userSelect() } },
    });
    await tx.documentAnnotationEvent.create({
      data: {
        annotationId,
        eventType: DocumentAnnotationEventType.COMMENT_ADDED,
        actorId,
      },
    });
    return created;
  });

  return {
    id: comment.id,
    annotationId: comment.annotationId,
    body: comment.body,
    createdBy: mapUser(comment.createdBy),
    createdAt: comment.createdAt.toISOString(),
    editedAt: comment.editedAt?.toISOString() || null,
  };
}
