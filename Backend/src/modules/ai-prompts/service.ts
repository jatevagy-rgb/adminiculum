import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { detectCandidates, runAnonymization, type SanitizedExternalPackage } from '../anonymization';
import { rehydrateDocument, type RehydrationItem, type RehydrationWarning } from '../anonymize/rehydration';
import { userCanManageCase, userCanReadCase } from '../cases/authorization';
import { resolveVersionText, type VersionMeta } from '../documents/comparison/versionText';
import { securityScanBlock } from '../documents/securityScan.service';
import documentsService from '../documents/services';

export const AI_PROMPT_DRAFT_STATUS = [
  'PREPARED',
  'AI_DRAFT',
  'JUNIOR_VERIFIED',
  'LAWYER_APPROVED',
  'RETURNED_FOR_CORRECTION',
  'REJECTED',
] as const;

export type AiPromptDraftStatus = (typeof AI_PROMPT_DRAFT_STATUS)[number];

export const LEGAL_WORK_CATEGORIES = [
  'CONTRACT_REVIEW',
  'CONTRACT_DRAFTING',
  'LEGAL_RESEARCH',
  'CASE_SUMMARY',
  'DUE_DILIGENCE',
  'COMPLIANCE_REVIEW',
  'CLIENT_EXPLANATION',
  'CLAUSE_ANALYSIS',
  'GENERAL_LEGAL_ANALYSIS',
] as const;

export type LegalWorkCategory = (typeof LEGAL_WORK_CATEGORIES)[number];

export type PromptBlock = {
  key: string;
  label: string;
  content: string;
};

export type PromptTemplateSnapshot = {
  stableKey: string;
  version: number;
  title: string;
  description: string | null;
  legalWorkCategory: LegalWorkCategory | string;
  caseTypeKeys: string[];
  workPackageModuleKeys: string[];
  taskTypes: string[];
  blocks: PromptBlock[];
  requiredContext: string[];
  optionalContext: string[];
  outputInstructions: string;
  verificationChecklist: string[];
  isActive: boolean;
};

export type PromptTemplateRecord = {
  id: string;
  stableKey: string;
  version: number;
  title: string;
  description: string | null;
  legalWorkCategory: string;
  caseTypeKeys: Prisma.JsonValue;
  workPackageModuleKeys: Prisma.JsonValue;
  taskTypes: Prisma.JsonValue;
  blocks: Prisma.JsonValue;
  requiredContext: Prisma.JsonValue;
  optionalContext: Prisma.JsonValue;
  outputInstructions: string;
  verificationChecklist: Prisma.JsonValue;
  isActive: boolean;
  createdById: string | null;
  createdAt: Date;
};

export type PreparedSourceDocument = {
  documentId: string;
  versionId?: string | null;
  versionNumber?: number | null;
  label: string;
  title: string;
  selectedText: string;
  originalFileName?: string | null;
  mimeType?: string | null;
  size?: number | null;
};

export type PromptPrepareInput = {
  caseId: string;
  promptTemplateId: string;
  sourceDocumentIds?: string[];
  sourceDocumentVersionIds?: string[];
  sourceTaskId?: string | null;
  sourceWorkPackageItemId?: string | null;
  lawyerInstruction?: string | null;
  startingSituation?: string | null;
  selectedAnnotations?: string[] | null;
  selectedCommunications?: string[] | null;
  additionalContext?: string | null;
  selectedDocumentTexts?: Array<{ documentId: string; versionId?: string | null; text: string; title?: string | null }>;
  knownEntities?: {
    persons?: string[];
    organizations?: string[];
    emails?: string[];
    phones?: string[];
    identifiers?: string[];
    addresses?: string[];
  };
};

export type PromptDraftRecord = {
  id: string;
  caseId: string;
  promptTemplateId: string;
  promptTemplateStableKey: string;
  promptTemplateVersion: number;
  promptTemplateSnapshot: PromptTemplateSnapshot;
  sourceDocumentIds: string[];
  sourceDocumentVersionIds: string[];
  sourceTaskId: string | null;
  sourceWorkPackageItemId: string | null;
  selectedContext: Record<string, unknown>;
  anonymizedPreview: string;
  externalPromptText: string;
  rehydrationMap: Array<{ category: string; original: string; replacement: string }>;
  anonymizationSnapshot: SanitizedExternalPackage;
  importedResponse: string | null;
  rehydratedResponse: string | null;
  rehydrationWarnings: string[];
  status: AiPromptDraftStatus;
  reviewerNotes: string | null;
  preparedById: string;
  importedById: string | null;
  verifiedById: string | null;
  verifiedAt: Date | null;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicPromptDraftRecord = Omit<PromptDraftRecord, 'rehydrationMap'>;

export function toPublicPromptDraft(draft: PromptDraftRecord): PublicPromptDraftRecord {
  const { rehydrationMap: _rehydrationMap, ...publicDraft } = draft;
  return publicDraft;
}

type PrismaLike = typeof defaultPrisma | Prisma.TransactionClient;

const DEFAULT_PROMPT_CHECKLIST = [
  'Sources checked',
  'Facts checked',
  'Legal references checked',
  'Names/entities rehydrated correctly',
  'No unsupported conclusion',
  'Output matches requested format',
  'Sensitive information handled correctly',
];

function jsonArrayOfStrings(value: Prisma.JsonValue, fallback: string[] = []): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : fallback;
}

function templateSnapshot(record: PromptTemplateRecord): PromptTemplateSnapshot {
  return {
    stableKey: record.stableKey,
    version: record.version,
    title: record.title,
    description: record.description,
    legalWorkCategory: record.legalWorkCategory,
    caseTypeKeys: jsonArrayOfStrings(record.caseTypeKeys),
    workPackageModuleKeys: jsonArrayOfStrings(record.workPackageModuleKeys),
    taskTypes: jsonArrayOfStrings(record.taskTypes),
    blocks: Array.isArray(record.blocks)
      ? record.blocks.map((block) => ({
        key: String((block as Record<string, unknown>).key ?? ''),
        label: String((block as Record<string, unknown>).label ?? ''),
        content: String((block as Record<string, unknown>).content ?? ''),
      }))
      : [],
    requiredContext: jsonArrayOfStrings(record.requiredContext),
    optionalContext: jsonArrayOfStrings(record.optionalContext),
    outputInstructions: record.outputInstructions,
    verificationChecklist: jsonArrayOfStrings(record.verificationChecklist, [...DEFAULT_PROMPT_CHECKLIST]),
    isActive: record.isActive,
  };
}

function buildPromptText(snapshot: PromptTemplateSnapshot, sections: Array<{ label: string; content: string }>): string {
  const blocks = snapshot.blocks.map((block) => `${block.label}\n${block.content.trim()}`.trim());
  const selectedSections = sections
    .filter((section) => section.content.trim().length > 0)
    .map((section) => `${section.label}\n${section.content.trim()}`.trim());
  return [
    `Prompt: ${snapshot.title}`,
    `Prompt ID: ${snapshot.stableKey}`,
    `Prompt Version: ${snapshot.version}`,
    `Legal Work Category: ${snapshot.legalWorkCategory}`,
    '',
    ...blocks,
    ...selectedSections,
    '',
    'Output instructions',
    snapshot.outputInstructions.trim(),
    '',
    'Verification checklist',
    ...snapshot.verificationChecklist.map((item) => `- ${item}`),
  ].join('\n');
}

function buildCaseContext(c: {
  id: string;
  caseTypeDefinitionId: string | null;
  caseTypeDefinition?: { slug: string | null; name: string | null } | null;
  client?: { name: string } | null;
  title?: string | null;
  description?: string | null;
  assignedLawyer?: { name: string | null } | null;
}): string {
  return [
    c.caseTypeDefinition?.name ? `Case type: ${c.caseTypeDefinition.name}` : null,
    c.caseTypeDefinition?.slug ? `Case type key: ${c.caseTypeDefinition.slug}` : null,
    c.client?.name ? `Client: ${c.client.name}` : null,
    c.title ? `Case title: ${c.title}` : null,
    c.description ? `Case description: ${c.description}` : null,
    c.assignedLawyer?.name ? `Assigned lawyer: ${c.assignedLawyer.name}` : null,
  ].filter(Boolean).join('\n');
}

function buildDocumentSection(doc: PreparedSourceDocument): string {
  return [
    `${doc.label}`,
    `Title: ${doc.title}`,
    doc.versionNumber != null ? `Version: v${doc.versionNumber}` : null,
    doc.selectedText ? `Text:\n${doc.selectedText}` : 'Text: [no selected text]',
  ].filter(Boolean).join('\n');
}

function normalizeKnownTerms(known: PromptPrepareInput['knownEntities'], sourceContext: string): Array<{ term: string; category: 'PERSON' | 'ORGANIZATION' | 'EMAIL' | 'PHONE' | 'IDENTIFIER' | 'ADDRESS' }> {
  const terms: Array<{ term: string; category: 'PERSON' | 'ORGANIZATION' | 'EMAIL' | 'PHONE' | 'IDENTIFIER' | 'ADDRESS' }> = [];
  for (const term of known?.persons ?? []) terms.push({ term, category: 'PERSON' });
  for (const term of known?.organizations ?? []) terms.push({ term, category: 'ORGANIZATION' });
  for (const term of known?.emails ?? []) terms.push({ term, category: 'EMAIL' });
  for (const term of known?.phones ?? []) terms.push({ term, category: 'PHONE' });
  for (const term of known?.identifiers ?? []) terms.push({ term, category: 'IDENTIFIER' });
  for (const term of known?.addresses ?? []) terms.push({ term, category: 'ADDRESS' });
  if (sourceContext.includes('@')) {
    // sourceContext itself is already selected data; no implicit broadening beyond exact terms.
  }
  return terms.filter((item) => item.term.trim().length > 1);
}

async function requireCaseAccess(req: Request, caseId: string, level: 'read' | 'manage'): Promise<void> {
  const access = level === 'read' ? await userCanReadCase(req, caseId) : await userCanManageCase(req, caseId);
  if (access === null) throw Object.assign(new Error('CASE_NOT_FOUND'), { status: 404, code: 'CASE_NOT_FOUND' });
  if (!access) throw Object.assign(new Error('CASE_ACCESS_FORBIDDEN'), { status: 403, code: 'CASE_ACCESS_FORBIDDEN' });
}

export async function listPromptTemplates(params: {
  caseTypeKey?: string | null;
  workPackageModuleKey?: string | null;
  taskType?: string | null;
}, prismaClient: PrismaLike = defaultPrisma): Promise<PromptTemplateRecord[]> {
  const records = await prismaClient.aiPromptTemplateVersion.findMany({
    where: { isActive: true },
    orderBy: [{ stableKey: 'asc' }, { version: 'desc' }],
  }) as PromptTemplateRecord[];
  return records.filter((record) => {
    const caseTypeMatch = !params.caseTypeKey || jsonArrayOfStrings(record.caseTypeKeys).includes(params.caseTypeKey);
    const moduleMatch = !params.workPackageModuleKey || jsonArrayOfStrings(record.workPackageModuleKeys).includes(params.workPackageModuleKey);
    const taskMatch = !params.taskType || jsonArrayOfStrings(record.taskTypes).includes(params.taskType);
    return caseTypeMatch && moduleMatch && taskMatch;
  });
}

export async function createPromptTemplateVersion(input: {
  stableKey: string;
  title: string;
  description?: string | null;
  legalWorkCategory: LegalWorkCategory | string;
  caseTypeKeys?: string[];
  workPackageModuleKeys?: string[];
  taskTypes?: string[];
  blocks: PromptBlock[];
  requiredContext?: string[];
  optionalContext?: string[];
  outputInstructions: string;
  verificationChecklist?: string[];
  isActive?: boolean;
  createdById?: string | null;
}, prismaClient: PrismaLike = defaultPrisma): Promise<PromptTemplateRecord> {
  const latest = await prismaClient.aiPromptTemplateVersion.findFirst({
    where: { stableKey: input.stableKey },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const version = (latest?.version ?? 0) + 1;
  return prismaClient.aiPromptTemplateVersion.create({
    data: {
      stableKey: input.stableKey,
      version,
      title: input.title,
      description: input.description ?? null,
      legalWorkCategory: input.legalWorkCategory,
      caseTypeKeys: input.caseTypeKeys ?? [],
      workPackageModuleKeys: input.workPackageModuleKeys ?? [],
      taskTypes: input.taskTypes ?? [],
      blocks: input.blocks,
      requiredContext: input.requiredContext ?? [],
      optionalContext: input.optionalContext ?? [],
      outputInstructions: input.outputInstructions,
      verificationChecklist: input.verificationChecklist ?? DEFAULT_PROMPT_CHECKLIST,
      isActive: input.isActive ?? true,
      createdById: input.createdById ?? null,
    },
  }) as Promise<PromptTemplateRecord>;
}

async function loadCaseContext(caseId: string, prismaClient: PrismaLike) {
  const caseRecord = await prismaClient.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      title: true,
      description: true,
      caseTypeDefinitionId: true,
      assignedLawyer: { select: { name: true } },
      client: { select: { name: true } },
      caseTypeDefinition: { select: { slug: true, name: true } },
      workPackage: {
        select: {
          id: true,
          workPackageTemplateId: true,
          workPackageTemplateVersion: true,
          workPackageTemplate: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });
  return caseRecord as unknown as {
    id: string;
    title: string;
    description: string | null;
    caseTypeDefinitionId: string | null;
    assignedLawyer: { name: string | null } | null;
    client: { name: string } | null;
    caseTypeDefinition: { slug: string | null; name: string | null } | null;
    workPackage: {
      id: string;
      workPackageTemplateId: string | null;
      workPackageTemplateVersion: number | null;
      workPackageTemplate: { id: string; name: string } | null;
    } | null;
  } | null;
}

export class AiPromptVersionExtractionError extends Error {
  status: number;
  code: string;
  reasonCode: string;
  versionId: string;

  constructor(code: string, message: string, status = 400, reasonCode = code, versionId = '') {
    super(message);
    this.name = 'AiPromptVersionExtractionError';
    this.code = code;
    this.status = status;
    this.reasonCode = reasonCode;
    this.versionId = versionId;
  }
}

function mapVersionExtractionError(reasonCode: string | null, versionId = ''): never {
  switch (reasonCode) {
    case 'FORMAT_NOT_TEXT_EXTRACTABLE':
    case 'FORMAT_UNSUPPORTED':
      throw new AiPromptVersionExtractionError(
        'SOURCE_DOCUMENT_VERSION_UNSUPPORTED',
        'A dokumentum formátuma nem támogatja a szövegkinyerést.',
        400,
        'FORMAT_NOT_TEXT_EXTRACTABLE',
        versionId,
      );
    case 'CONTENT_TOO_LARGE':
    case 'INPUT_TOO_LARGE':
      throw new AiPromptVersionExtractionError(
        'SOURCE_DOCUMENT_VERSION_TOO_LARGE',
        'The document version exceeds the maximum allowed size.',
        400,
        'CONTENT_TOO_LARGE',
        versionId,
      );
    case 'NO_EXTRACTABLE_TEXT':
      throw new AiPromptVersionExtractionError(
        'SOURCE_DOCUMENT_VERSION_EMPTY',
        'A dokumentum nem tartalmaz géppel kinyerhető szöveget.',
        400,
        'NO_EXTRACTABLE_TEXT',
        versionId,
      );
    case 'CONTENT_UNAVAILABLE':
      throw new AiPromptVersionExtractionError(
        'SOURCE_DOCUMENT_VERSION_UNAVAILABLE',
        'A dokumentum verzió tartalma nem érhető el.',
        400,
        'CONTENT_UNAVAILABLE',
        versionId,
      );
    case 'EXTRACTION_FAILED':
    default:
      throw new AiPromptVersionExtractionError(
        'SOURCE_DOCUMENT_VERSION_EXTRACTION_FAILED',
        'A dokumentum szövegének kinyerése sikertelen volt.',
        400,
        reasonCode || 'EXTRACTION_FAILED',
        versionId,
      );
  }
}

export type PromptPrepareDeps = {
  prisma?: PrismaLike;
  downloadDocumentVersion?: (documentId: string, versionId: string) => Promise<{
    version: unknown;
    content: Buffer;
  } | { error: string; code: string; status: number } | null>;
  resolveVersionText?: (
    version: VersionMeta,
    download: (documentId: string, versionId: string) => Promise<Buffer | null>,
  ) => Promise<{
    supported: boolean;
    text: string | null;
    reasonCode: string | null;
    extractionRevision: number;
  }>;
};

function isPrismaClient(value: unknown): value is PrismaLike {
  return Boolean(
    value &&
    typeof value === 'object' &&
    ('$transaction' in value || 'aiPromptDraft' in value || 'case' in value),
  );
}

function resolvePrepareDeps(prismaOrDeps: PrismaLike | PromptPrepareDeps = defaultPrisma): {
  prisma: PrismaLike;
  downloadVersion: (documentId: string, versionId: string) => Promise<{
    version: unknown;
    content: Buffer;
  } | { error: string; code: string; status: number } | null>;
  resolveText: typeof resolveVersionText;
} {
  if (isPrismaClient(prismaOrDeps)) {
    return {
      prisma: prismaOrDeps,
      downloadVersion: (docId, verId) => documentsService.downloadDocumentVersion(docId, verId),
      resolveText: resolveVersionText,
    };
  }
  return {
    prisma: prismaOrDeps.prisma ?? defaultPrisma,
    downloadVersion: prismaOrDeps.downloadDocumentVersion ?? ((docId, verId) => documentsService.downloadDocumentVersion(docId, verId)),
    resolveText: prismaOrDeps.resolveVersionText ?? resolveVersionText,
  };
}

async function loadDocuments(
  caseId: string,
  params: Pick<PromptPrepareInput, 'sourceDocumentIds' | 'sourceDocumentVersionIds' | 'selectedDocumentTexts'>,
  deps: {
    prisma: PrismaLike;
    downloadVersion: (documentId: string, versionId: string) => Promise<{
      version: unknown;
      content: Buffer;
    } | { error: string; code: string; status: number } | null>;
    resolveText: typeof resolveVersionText;
  },
): Promise<PreparedSourceDocument[]> {
  const preparedDocs: PreparedSourceDocument[] = [];

  const rawVersionIds = params.sourceDocumentVersionIds ?? [];
  const uniqueVersionIds: string[] = [];
  for (const id of rawVersionIds) {
    if (!uniqueVersionIds.includes(id)) {
      uniqueVersionIds.push(id);
    }
  }

  let versionRecords: Array<{
    id: string;
    version: number;
    name: string;
    description: string | null;
    originalFileName: string | null;
    mimeType: string | null;
    size: number | null;
    securityScanStatus: string;
    document: { id: string; caseId: string; title: string | null; name: string };
  }> = [];

  if (uniqueVersionIds.length > 0) {
    versionRecords = await deps.prisma.documentVersion.findMany({
      where: { id: { in: uniqueVersionIds } },
      select: {
        id: true,
        version: true,
        name: true,
        description: true,
        originalFileName: true,
        mimeType: true,
        size: true,
        securityScanStatus: true,
        document: {
          select: {
            id: true,
            caseId: true,
            title: true,
            name: true,
          },
        },
      },
    }) as any;

    if (versionRecords.length !== uniqueVersionIds.length) {
      throw Object.assign(new Error('SOURCE_DOCUMENT_VERSION_CASE_MISMATCH'), {
        status: 400,
        code: 'SOURCE_DOCUMENT_VERSION_CASE_MISMATCH',
      });
    }
  }

  const versionCoveredDocIds = new Set(versionRecords.map((rec) => rec.document.id));

  const selectedDocIds = new Set([...(params.sourceDocumentIds ?? []), ...(params.selectedDocumentTexts ?? []).map((item) => item.documentId)]);
  if (selectedDocIds.size > 0) {
    const docs = await deps.prisma.document.findMany({
      where: { id: { in: [...selectedDocIds] }, caseId },
      select: { id: true, title: true, name: true, description: true, workspaceText: true },
    });
    if (docs.length !== selectedDocIds.size) {
      throw Object.assign(new Error('SOURCE_DOCUMENT_CASE_MISMATCH'), { status: 400, code: 'SOURCE_DOCUMENT_CASE_MISMATCH' });
    }
    for (const doc of docs) {
      if (versionCoveredDocIds.has(doc.id)) {
        continue;
      }
      const provided = params.selectedDocumentTexts?.find((item) => item.documentId === doc.id);
      const title = provided?.title || doc.title || doc.name || `Document ${preparedDocs.length + 1}`;
      const text = provided?.text ?? doc.workspaceText ?? doc.description ?? '';
      preparedDocs.push({
        documentId: doc.id,
        title,
        selectedText: text,
        label: `Document ${String.fromCharCode(65 + preparedDocs.length)}`,
      });
    }
  }

  if (uniqueVersionIds.length > 0) {
    const recordMap = new Map(versionRecords.map((rec) => [rec.id, rec]));

    for (const versionId of uniqueVersionIds) {
      const version = recordMap.get(versionId)!;
      if (version.document.caseId !== caseId) {
        throw Object.assign(new Error('SOURCE_DOCUMENT_VERSION_CASE_MISMATCH'), {
          status: 400,
          code: 'SOURCE_DOCUMENT_VERSION_CASE_MISMATCH',
        });
      }

      const scanBlocked = securityScanBlock(version.securityScanStatus as any || 'CLEAN');
      if (scanBlocked) {
        throw Object.assign(new Error(scanBlocked.error), {
          status: scanBlocked.status || 409,
          code: scanBlocked.code || 'DOCUMENT_SECURITY_SCAN_BLOCKED',
        });
      }

      let downloadFailure: { status: number; code: string; error: string } | null = null;
      const downloadFn = async (documentId: string, verId: string): Promise<Buffer | null> => {
        try {
          const dlRes = await deps.downloadVersion(documentId, verId);
          if (!dlRes) {
            downloadFailure = { status: 404, code: 'SOURCE_DOCUMENT_VERSION_NOT_FOUND', error: 'Document version not found' };
            return null;
          }
          if ('error' in dlRes) {
            downloadFailure = dlRes;
            return null;
          }
          return dlRes.content;
        } catch {
          downloadFailure = { status: 400, code: 'SOURCE_DOCUMENT_VERSION_DOWNLOAD_FAILED', error: 'Document version download failed' };
          return null;
        }
      };

      const versionMeta: VersionMeta = {
        id: version.id,
        documentId: version.document.id,
        mimeType: version.mimeType,
        originalFileName: version.originalFileName,
        size: version.size,
      };

      const textResult = await deps.resolveText(versionMeta, downloadFn);

      if (downloadFailure && (downloadFailure as any).code === 'DOCUMENT_SECURITY_SCAN_BLOCKED') {
        throw Object.assign(new Error((downloadFailure as any).error), {
          status: (downloadFailure as any).status || 409,
          code: (downloadFailure as any).code || 'DOCUMENT_SECURITY_SCAN_BLOCKED',
        });
      }

      if (!textResult.supported || !textResult.text || !textResult.text.trim()) {
        mapVersionExtractionError(textResult.reasonCode, version.id);
      }

      const title = version.originalFileName || version.document.title || version.document.name || version.name || `Document ${preparedDocs.length + 1}`;

      preparedDocs.push({
        documentId: version.document.id,
        versionId: version.id,
        versionNumber: version.version,
        title,
        selectedText: textResult.text!,
        label: `Document ${String.fromCharCode(65 + preparedDocs.length)}`,
        originalFileName: version.originalFileName,
        mimeType: version.mimeType,
        size: version.size,
      });
    }
  }

  return preparedDocs;
}

async function validateCaseProvenance(input: PromptPrepareInput, caseId: string, prismaClient: PrismaLike): Promise<void> {
  if (input.sourceTaskId) {
    const task = await prismaClient.task.findUnique({ where: { id: input.sourceTaskId }, select: { caseId: true } });
    if (!task || task.caseId !== caseId) {
      throw Object.assign(new Error('SOURCE_TASK_CASE_MISMATCH'), { status: 400, code: 'SOURCE_TASK_CASE_MISMATCH' });
    }
  }
  if (input.sourceWorkPackageItemId) {
    const item = await prismaClient.caseWorkPackageItem.findUnique({
      where: { id: input.sourceWorkPackageItemId },
      select: { caseWorkPackage: { select: { caseId: true } } },
    });
    if (!item || item.caseWorkPackage.caseId !== caseId) {
      throw Object.assign(new Error('SOURCE_WORK_PACKAGE_ITEM_CASE_MISMATCH'), { status: 400, code: 'SOURCE_WORK_PACKAGE_ITEM_CASE_MISMATCH' });
    }
  }
}

function buildSourceText(
  caseContext: string,
  documents: PreparedSourceDocument[],
  body: Omit<PromptPrepareInput, 'caseId' | 'sourceDocumentIds' | 'sourceDocumentVersionIds' | 'selectedDocumentTexts' | 'knownEntities'>,
): string {
  const sections = [
    { label: 'Case context', content: caseContext },
    { label: 'Lawyer instruction', content: body.lawyerInstruction ?? '' },
    { label: 'Starting situation', content: body.startingSituation ?? '' },
    { label: 'Selected annotations', content: (body.selectedAnnotations ?? []).join('\n') },
    { label: 'Selected communications', content: (body.selectedCommunications ?? []).join('\n') },
    { label: 'Additional context', content: body.additionalContext ?? '' },
    ...documents.map((doc) => ({ label: doc.label, content: buildDocumentSection(doc) })),
  ];
  return sections.map((section) => `${section.label}\n${section.content.trim()}`.trim()).join('\n\n');
}

export async function preparePromptDraft(
  actor: { userId: string; role?: string | null },
  input: PromptPrepareInput,
  prismaOrDeps: PrismaLike | PromptPrepareDeps = defaultPrisma,
): Promise<PromptDraftRecord> {
  if (!actor.userId) {
    throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401, code: 'AUTH_REQUIRED' });
  }
  const deps = resolvePrepareDeps(prismaOrDeps);
  await requireCaseAccess({ user: actor } as Request, input.caseId, 'manage');
  const template = await deps.prisma.aiPromptTemplateVersion.findUnique({ where: { id: input.promptTemplateId } }) as PromptTemplateRecord | null;
  if (!template || !template.isActive) throw Object.assign(new Error('PROMPT_TEMPLATE_NOT_FOUND'), { status: 404, code: 'PROMPT_TEMPLATE_NOT_FOUND' });
  const caseContextRecord = await loadCaseContext(input.caseId, deps.prisma);
  if (!caseContextRecord) throw Object.assign(new Error('CASE_NOT_FOUND'), { status: 404, code: 'CASE_NOT_FOUND' });
  await validateCaseProvenance(input, input.caseId, deps.prisma);
  const documents = await loadDocuments(input.caseId, input, deps);
  const caseContext = buildCaseContext(caseContextRecord);
  const sourceText = buildSourceText(caseContext, documents, input);
  const knownTerms = normalizeKnownTerms(input.knownEntities, sourceText);
  const anonymizationOptions = {
    manualTerms: [
      ...knownTerms.map((term) => ({ term: term.term, category: term.category })),
      ...(caseContextRecord.client?.name ? [{ term: caseContextRecord.client.name, category: 'ORGANIZATION' as const }] : []),
      ...(caseContextRecord.assignedLawyer?.name ? [{ term: caseContextRecord.assignedLawyer.name, category: 'PERSON' as const }] : []),
      ...(caseContextRecord.title ? [{ term: caseContextRecord.title, category: 'PROJECT' as const }] : []),
    ],
  };
  const detected = detectCandidates(sourceText, anonymizationOptions);
  const anonymization = runAnonymization(sourceText, anonymizationOptions, detected.candidates.map((candidate) => candidate.id));
  const snapshot = templateSnapshot(template);
  const externalPayload: SanitizedExternalPackage = {
    contentType: 'anonymized-work-package',
    schemaVersion: 1,
    algorithmRevision: anonymization.result.algorithmRevision,
    isPseudonymized: true,
    sanitizedText: anonymization.result.anonymizedText,
    appliedCount: anonymization.result.appliedCount,
    categoryCounts: anonymization.result.categoryCounts,
    sourceHash: anonymization.result.sourceHash,
    resultHash: anonymization.result.resultHash,
    warnings: anonymization.result.warnings,
  };
  const selectedContext = {
    caseId: input.caseId,
    promptTemplateId: input.promptTemplateId,
    sourceTaskId: input.sourceTaskId ?? null,
    sourceWorkPackageItemId: input.sourceWorkPackageItemId ?? null,
    sourceDocumentIds: input.sourceDocumentIds ?? [],
    sourceDocumentVersionIds: input.sourceDocumentVersionIds ?? [],
    lawyerInstruction: input.lawyerInstruction ?? null,
    startingSituation: input.startingSituation ?? null,
    selectedAnnotations: input.selectedAnnotations ?? [],
    selectedCommunications: input.selectedCommunications ?? [],
    additionalContext: input.additionalContext ?? null,
  };
  const draft = await deps.prisma.aiPromptDraft.create({
    data: {
      caseId: input.caseId,
      promptTemplateId: template.id,
      promptTemplateStableKey: template.stableKey,
      promptTemplateVersion: template.version,
      promptTemplateSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      sourceDocumentIds: input.sourceDocumentIds ?? [],
      sourceDocumentVersionIds: input.sourceDocumentVersionIds ?? [],
      sourceTaskId: input.sourceTaskId ?? null,
      sourceWorkPackageItemId: input.sourceWorkPackageItemId ?? null,
      selectedContext: selectedContext as unknown as Prisma.InputJsonValue,
      anonymizedPreview: anonymization.result.anonymizedText,
      externalPromptText: buildPromptText(snapshot, [
        { label: 'Prepared anonymized context', content: anonymization.result.anonymizedText },
      ]),
      rehydrationMap: anonymization.mapping.mapping as unknown as Prisma.InputJsonValue,
      anonymizationSnapshot: externalPayload as unknown as Prisma.InputJsonValue,
      importedResponse: null,
      rehydratedResponse: null,
      rehydrationWarnings: [],
      status: 'PREPARED',
      reviewerNotes: null,
      preparedById: actor.userId,
      importedById: null,
      verifiedById: null,
      verifiedAt: null,
      approvedById: null,
      approvedAt: null,
    },
  });
  return draft as unknown as PromptDraftRecord;
}

const UNKNOWN_PLACEHOLDER_WARNING_PREFIX = 'unknown placeholder retained';

/**
 * Adapter over the repaired canonical rehydrator
 * (`Backend/src/modules/anonymize/rehydration.ts`).
 *
 * The Prompt System stores its mapping as the anonymizer's
 * `{ category, original, replacement }` triplets, while the canonical
 * rehydrator consumes `{ replacement, original }` items. This adapter is the
 * ONLY conversion between the two shapes: matching, replacement, `$`-safety,
 * accented/space-bearing token handling, unresolved detection and the
 * COMPLETE / PARTIAL / FAILED result stay canonical and are not re-implemented
 * here.
 *
 * Persisted shape is intentionally unchanged (no schema change in this repair):
 * - `text` is always a string (canonical content, or '' when the canonical
 *   result carries no content);
 * - `warnings` stays a list of human-readable strings rendered by the review UI.
 * `rehydrationStatus` and the token counts are import-time semantics; they are
 * not persisted and are consumed by callers/tests directly.
 */
export function rehydratePromptResponse(
  aiResponseText: string,
  rehydrationMap: Array<{ category?: string | null; original: string; replacement: string }> | null | undefined,
): {
  text: string;
  warnings: string[];
  rehydrationStatus: 'COMPLETE' | 'PARTIAL' | 'FAILED';
  totalTokens: number;
  resolvedTokens: number;
  unresolvedTokens: number;
} {
  const items: RehydrationItem[] = [];
  for (const entry of rehydrationMap ?? []) {
    const replacement = typeof entry?.replacement === 'string' ? entry.replacement : '';
    const original = typeof entry?.original === 'string' ? entry.original : '';
    // A persisted mapping row without a usable token cannot match anything and
    // must not inflate the canonical token counts.
    if (!replacement.trim()) continue;
    items.push({ replacement, original });
  }
  const canonical = rehydrateDocument(aiResponseText, items);
  return {
    text: canonical.rehydratedContent ?? '',
    warnings: canonical.warnings.map(promptRehydrationWarning),
    rehydrationStatus: canonical.rehydrationStatus,
    totalTokens: canonical.totalTokens,
    resolvedTokens: canonical.resolvedTokens,
    unresolvedTokens: canonical.unresolvedTokens,
  };
}

/**
 * Keeps the existing review-UI wording for the class of warning the Prompt
 * System already produced, and passes every other canonical reason through
 * verbatim rather than inventing a new meaning.
 */
function promptRehydrationWarning(warning: RehydrationWarning): string {
  if (warning.reason === 'Token not found in mapping') {
    return `${UNKNOWN_PLACEHOLDER_WARNING_PREFIX}: ${warning.token}`;
  }
  return warning.token ? `${warning.reason}: ${warning.token}` : warning.reason;
}

async function loadDraftOrFail(id: string, prismaClient: PrismaLike): Promise<PromptDraftRecord | null> {
  const draft = await prismaClient.aiPromptDraft.findUnique({ where: { id } });
  return draft as unknown as PromptDraftRecord | null;
}

function requireDraftStatus(draft: PromptDraftRecord, allowed: AiPromptDraftStatus[]): void {
  if (!allowed.includes(draft.status)) {
    throw Object.assign(new Error('INVALID_AI_DRAFT_TRANSITION'), { status: 409, code: 'INVALID_AI_DRAFT_TRANSITION' });
  }
}

export async function importPromptResponse(
  actor: { userId: string; role?: string | null },
  draftId: string,
  importedResponse: string,
  prismaClient: PrismaLike = defaultPrisma,
): Promise<PromptDraftRecord> {
  if (!actor.userId) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401, code: 'AUTH_REQUIRED' });
  const draft = await loadDraftOrFail(draftId, prismaClient);
  if (!draft) throw Object.assign(new Error('PROMPT_DRAFT_NOT_FOUND'), { status: 404, code: 'PROMPT_DRAFT_NOT_FOUND' });
  await requireCaseAccess({ user: actor } as Request, draft.caseId, 'manage');
  requireDraftStatus(draft, ['PREPARED', 'RETURNED_FOR_CORRECTION']);
  const rehydrated = rehydratePromptResponse(importedResponse, draft.rehydrationMap);
  const saved = await prismaClient.aiPromptDraft.update({
    where: { id: draftId },
    data: {
      importedResponse,
      rehydratedResponse: rehydrated.text,
      rehydrationWarnings: rehydrated.warnings,
      status: 'AI_DRAFT',
      importedById: actor.userId,
      reviewerNotes: draft.reviewerNotes,
    },
  });
  return saved as unknown as PromptDraftRecord;
}

export async function verifyPromptDraft(
  actor: { userId: string; role?: string | null },
  draftId: string,
  notes?: string | null,
  prismaClient: PrismaLike = defaultPrisma,
): Promise<PromptDraftRecord> {
  const draft = await loadDraftOrFail(draftId, prismaClient);
  if (!draft) throw Object.assign(new Error('PROMPT_DRAFT_NOT_FOUND'), { status: 404, code: 'PROMPT_DRAFT_NOT_FOUND' });
  await requireCaseAccess({ user: actor } as Request, draft.caseId, 'manage');
  requireDraftStatus(draft, ['AI_DRAFT']);
  if (draft.importedById === actor.userId || draft.preparedById === actor.userId) {
    throw Object.assign(new Error('AI_CANNOT_SELF_APPROVE'), { status: 400, code: 'AI_CANNOT_SELF_APPROVE' });
  }
  const saved = await prismaClient.aiPromptDraft.update({
    where: { id: draftId },
    data: {
      status: 'JUNIOR_VERIFIED',
      verifiedById: actor.userId,
      verifiedAt: new Date(),
      reviewerNotes: notes ?? draft.reviewerNotes,
    },
  });
  return saved as unknown as PromptDraftRecord;
}

export async function approvePromptDraft(
  actor: { userId: string; role?: string | null },
  draftId: string,
  notes?: string | null,
  prismaClient: PrismaLike = defaultPrisma,
): Promise<PromptDraftRecord> {
  const draft = await loadDraftOrFail(draftId, prismaClient);
  if (!draft) throw Object.assign(new Error('PROMPT_DRAFT_NOT_FOUND'), { status: 404, code: 'PROMPT_DRAFT_NOT_FOUND' });
  await requireCaseAccess({ user: actor } as Request, draft.caseId, 'manage');
  requireDraftStatus(draft, ['JUNIOR_VERIFIED']);
  if (!['LAWYER', 'ADMIN'].includes(String(actor.role || '').toUpperCase())) {
    throw Object.assign(new Error('LAWYER_APPROVAL_REQUIRED'), { status: 403, code: 'LAWYER_APPROVAL_REQUIRED' });
  }
  if (draft.preparedById === actor.userId || draft.importedById === actor.userId) {
    throw Object.assign(new Error('AI_CANNOT_SELF_APPROVE'), { status: 400, code: 'AI_CANNOT_SELF_APPROVE' });
  }
  const saved = await prismaClient.aiPromptDraft.update({
    where: { id: draftId },
    data: {
      status: 'LAWYER_APPROVED',
      approvedById: actor.userId,
      approvedAt: new Date(),
      reviewerNotes: notes ?? draft.reviewerNotes,
    },
  });
  return saved as unknown as PromptDraftRecord;
}

export async function returnPromptDraft(
  actor: { userId: string; role?: string | null },
  draftId: string,
  notes?: string | null,
  prismaClient: PrismaLike = defaultPrisma,
): Promise<PromptDraftRecord> {
  const draft = await loadDraftOrFail(draftId, prismaClient);
  if (!draft) throw Object.assign(new Error('PROMPT_DRAFT_NOT_FOUND'), { status: 404, code: 'PROMPT_DRAFT_NOT_FOUND' });
  await requireCaseAccess({ user: actor } as Request, draft.caseId, 'manage');
  requireDraftStatus(draft, ['AI_DRAFT', 'JUNIOR_VERIFIED']);
  const saved = await prismaClient.aiPromptDraft.update({
    where: { id: draftId },
    data: {
      status: 'RETURNED_FOR_CORRECTION',
      reviewerNotes: notes ?? draft.reviewerNotes,
    },
  });
  return saved as unknown as PromptDraftRecord;
}

export async function rejectPromptDraft(
  actor: { userId: string; role?: string | null },
  draftId: string,
  notes?: string | null,
  prismaClient: PrismaLike = defaultPrisma,
): Promise<PromptDraftRecord> {
  const draft = await loadDraftOrFail(draftId, prismaClient);
  if (!draft) throw Object.assign(new Error('PROMPT_DRAFT_NOT_FOUND'), { status: 404, code: 'PROMPT_DRAFT_NOT_FOUND' });
  await requireCaseAccess({ user: actor } as Request, draft.caseId, 'manage');
  requireDraftStatus(draft, ['AI_DRAFT', 'JUNIOR_VERIFIED', 'RETURNED_FOR_CORRECTION']);
  const saved = await prismaClient.aiPromptDraft.update({
    where: { id: draftId },
    data: {
      status: 'REJECTED',
      reviewerNotes: notes ?? draft.reviewerNotes,
    },
  });
  return saved as unknown as PromptDraftRecord;
}

export async function getPromptDraft(
  req: Request,
  draftId: string,
  prismaClient: PrismaLike = defaultPrisma,
): Promise<PromptDraftRecord> {
  const draft = await loadDraftOrFail(draftId, prismaClient);
  if (!draft) throw Object.assign(new Error('PROMPT_DRAFT_NOT_FOUND'), { status: 404, code: 'PROMPT_DRAFT_NOT_FOUND' });
  await requireCaseAccess(req, draft.caseId, 'read');
  return draft;
}

export async function listPromptDraftsForCase(
  req: Request,
  caseId: string,
  prismaClient: PrismaLike = defaultPrisma,
): Promise<PromptDraftRecord[]> {
  await requireCaseAccess(req, caseId, 'read');
  const drafts = await prismaClient.aiPromptDraft.findMany({
    where: { caseId },
    orderBy: { createdAt: 'desc' },
  });
  return drafts as unknown as PromptDraftRecord[];
}
